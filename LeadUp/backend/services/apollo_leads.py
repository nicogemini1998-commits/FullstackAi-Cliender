"""
Pipeline de enriquecimiento LeadUp
===================================
1. Apollo.io  → contactos verificados con teléfono
2. Apify      → datos Google Maps / Places (GMB rating, reviews, teléfono empresa)
3. Scrapling  → análisis web real (CRM, píxeles, redes, SEO)
4. Claude     → diagnóstico completo (opcional — funciona sin créditos)

SEGURIDAD: todas las keys se leen exclusivamente desde variables de entorno.
"""
from __future__ import annotations
import asyncio, json, os, re
from typing import Optional
import httpx
from ..database import db_conn

# ── Keys desde .env ÚNICAMENTE ───────────────────────────────────────────────
def _key(name: str, fallback: str = "") -> str:
    return os.environ.get(name) or os.environ.get(fallback) or ""

APOLLO_KEY    = lambda: _key("APOLLO_API_KEY")
APIFY_KEY     = lambda: _key("APIFY_API_KEY")
ANTHROPIC_KEY = lambda: _key("ANTHROPIC_API_KEY", "ANTHROPIC_FALLBACK")

APOLLO_BASE = "https://api.apollo.io/api/v1"
APIFY_BASE  = "https://api.apify.com/v2"
APIFY_ACTOR = "compass~crawler-google-places"

# ── Sectores CLIENDER ─────────────────────────────────────────────────────────
CLIENDER_SECTORS = [
    {"tag":"reformas",       "cities":["Madrid","Valencia","Barcelona","Sevilla","Bilbao"]},
    {"tag":"clinicas",       "cities":["Madrid","Valencia","Barcelona","Sevilla","Málaga"]},
    {"tag":"academias",      "cities":["Madrid","Valencia","Barcelona","Zaragoza"]},
    {"tag":"inmobiliarias",  "cities":["Madrid","Valencia","Barcelona","Málaga","Alicante"]},
    {"tag":"concesionarios", "cities":["Madrid","Valencia","Barcelona","Sevilla"]},
    {"tag":"gimnasios",      "cities":["Madrid","Valencia","Barcelona","Bilbao"]},
    {"tag":"seguros",        "cities":["Madrid","Valencia","Barcelona","Sevilla"]},
    {"tag":"abogados",       "cities":["Madrid","Valencia","Barcelona","Sevilla","Bilbao"]},
]

_NO_COMPETITORS = [
    "agencia marketing","marketing digital","publicidad online","seo agency",
    "sem agency","diseño web","desarrollo web","consultora digital",
    "growth hacking","performance marketing","paid media","branding agency",
    "inbound marketing",
]

# ─────────────────────────────────────────────────────────────────────────────
# 1. APOLLO — Búsqueda + enriquecimiento
# ─────────────────────────────────────────────────────────────────────────────
async def _apollo_search(city: str, qty: int) -> list[dict]:
    key = APOLLO_KEY()
    if not key:
        return []
    hdr = {"x-api-key": key, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{APOLLO_BASE}/mixed_people/api_search", headers=hdr, json={
                "person_titles": ["CEO","Fundador","Director General","Director Comercial",
                                  "Gerente","Propietario","Owner"],
                "person_locations": [f"{city}, Spain"],
                "organization_num_employees_ranges": ["5,150"],
                "per_page": 100, "page": 1,
            })
            r.raise_for_status()
            people = r.json().get("people", [])

        # Solo con teléfono confirmado — sin excepción
        with_phone = [p for p in people if p.get("has_direct_phone") == "Yes"]
        with_both  = [p for p in with_phone if p.get("has_email")]
        candidates = (with_both + [p for p in with_phone if p not in with_both])[:qty]
        if not candidates:
            return []

        # Enriquecer en lotes de 10
        matches = []
        async with httpx.AsyncClient(timeout=30) as c:
            for i in range(0, len(candidates), 10):
                er = await c.post(f"{APOLLO_BASE}/people/bulk_match", headers=hdr, json={
                    "details": [{"id": p["id"]} for p in candidates[i:i+10]],
                    "reveal_personal_emails": True,
                })
                if er.status_code == 200:
                    matches.extend(er.json().get("matches") or [])

        return matches
    except Exception as e:
        print(f"[Apollo] {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# 2. APIFY — Google Maps / Places
# ─────────────────────────────────────────────────────────────────────────────
async def _apify_gmb(company_name: str, city: str) -> dict:
    key = APIFY_KEY()
    if not key:
        return {}
    try:
        async with httpx.AsyncClient(timeout=25) as c:
            # Arrancar actor
            r = await c.post(
                f"{APIFY_BASE}/acts/{APIFY_ACTOR}/runs",
                params={"token": key, "memory": 512},
                json={"searchStringsArray": [f"{company_name} {city}"],
                      "maxCrawledPlacesPerSearch": 1,
                      "language": "es", "countryCode": "es",
                      "maxImages": 0, "scrapeReviews": False},
            )
            r.raise_for_status()
            run_id = r.json()["data"]["id"]

        # Poll hasta SUCCEEDED
        for _ in range(15):
            await asyncio.sleep(6)
            async with httpx.AsyncClient(timeout=10) as c:
                s = await c.get(f"{APIFY_BASE}/actor-runs/{run_id}", params={"token": key})
                status = s.json()["data"]["status"]
                if status in ("SUCCEEDED","FAILED","ABORTED"):
                    break

        if status != "SUCCEEDED":
            return {}

        async with httpx.AsyncClient(timeout=15) as c:
            d = await c.get(f"{APIFY_BASE}/actor-runs/{run_id}/dataset/items", params={"token": key})
            items = d.json()

        if not items:
            return {}
        p = items[0]
        return {
            "gmb_rating":  p.get("totalScore"),
            "gmb_reviews": p.get("reviewsCount"),
            "gmb_phone":   p.get("phone"),
            "gmb_address": p.get("address"),
            "gmb_category":p.get("categoryName"),
            "gmb_website": p.get("website"),
        }
    except Exception as e:
        print(f"[Apify] {e}")
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# 3. SCRAPLING — Análisis web (D4Vinci/Scrapling)
# ─────────────────────────────────────────────────────────────────────────────
_CRM_PATTERNS = {
    "HubSpot":       [r"hubspot\.com", r"hs-scripts\.com", r"hsforms\.com"],
    "Salesforce":    [r"salesforce\.com", r"force\.com", r"pardot\.com"],
    "Zoho":          [r"zoho\.com", r"zohopublic\.com"],
    "Pipedrive":     [r"pipedrive\.com"],
    "ActiveCampaign":[r"activecampaign\.com"],
    "Mailchimp":     [r"mailchimp\.com"],
    "Brevo":         [r"brevo\.com", r"sendinblue\.com"],
    "Monday CRM":    [r"monday\.com"],
}
_PIXEL_P = {
    "facebook_pixel":[r"connect\.facebook\.net", r"fbq\s*\(", r"facebook\.com/tr"],
    "google_ads":    [r"googleadservices\.com", r"gtag\s*\("],
    "tiktok":        [r"analytics\.tiktok\.com"],
    "linkedin_insight":[r"snap\.licdn\.com"],
}
_SOCIAL_P = {
    "facebook":  r"facebook\.com/(?!sharer|share|dialog|plugins|tr)[^/\s<>\"\']{2,50}",
    "instagram": r"instagram\.com/(?!p/|tv/|reel/|explore/)[^/\s<>\"\']{2,40}",
    "linkedin":  r"linkedin\.com/(?:company|in)/[^/\s<>\"\']{2,80}",
    "youtube":   r"youtube\.com/(?:channel|c|user|@)[^/\s<>\"\']{2,60}",
    "twitter":   r"(?:twitter|x)\.com/(?!share|intent|search)[^/\s<>\"\']{2,40}",
    "tiktok":    r"tiktok\.com/@[^/\s<>\"\']{2,40}",
}

def _seo_score(html: str) -> int:
    return min(sum(pts for pat, pts in [
        (r"<title>[^<]{10,}", 15), (r'meta\s+name=["\']description["\']', 15),
        (r"<h1[\s>]", 15), (r'name=["\']viewport["\']', 10),
        (r"og:title|og:description", 10), (r"application/ld\+json", 10),
        (r'rel=["\']canonical["\']', 10), (r'<img[^>]+alt=["\'][^"\']{3,}', 15),
    ] if re.search(pat, html, re.I)), 100)

def _scrape_website(url: str) -> dict:
    """Usa Scrapling (con fallback httpx) para analizar la web de la empresa."""
    if not url:
        return {}
    if not url.startswith(("http://","https://")):
        url = f"https://{url}"
    html = ""
    try:
        # Intentar con Scrapling primero (stealth + JS rendering cuando sea necesario)
        from scrapling.fetchers import Fetcher
        page = Fetcher.get(url, timeout=12, stealthy_headers=True)
        html = str(page.html) if page else ""
    except Exception:
        pass

    if not html:
        try:
            r = httpx.get(url, timeout=8, follow_redirects=True,
                          headers={"User-Agent":"Mozilla/5.0 (LeadUpBot/1.0)"})
            html = r.text
        except Exception:
            return {"web_reachable": False}

    if not html:
        return {"web_reachable": False}

    crm = next((name for name, pats in _CRM_PATTERNS.items()
                if any(re.search(p, html, re.I) for p in pats)), None)
    pixels = {k: any(re.search(p, html, re.I) for p in pats)
              for k, pats in _PIXEL_P.items()}
    socials = {}
    for net, pat in _SOCIAL_P.items():
        m = re.search(pat, html, re.I)
        socials[net] = m.group(0) if m else None

    return {
        "web_reachable":     True,
        "has_crm":           crm,
        "has_facebook_pixel":pixels.get("facebook_pixel", False),
        "has_google_ads":    pixels.get("google_ads", False),
        "has_tiktok_pixel":  pixels.get("tiktok", False),
        "has_linkedin_insight":pixels.get("linkedin_insight", False),
        "social_facebook":   socials.get("facebook"),
        "social_instagram":  socials.get("instagram"),
        "social_linkedin":   socials.get("linkedin"),
        "social_youtube":    socials.get("youtube"),
        "social_twitter":    socials.get("twitter"),
        "social_tiktok":     socials.get("tiktok"),
        "seo_score":         _seo_score(html),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. CLAUDE — Diagnóstico completo (OPCIONAL)
# ─────────────────────────────────────────────────────────────────────────────
_CLAUDE_PROMPT = """Eres analista comercial de Cliender, consultora española de ventas y tecnología.
Recibes datos REALES de una empresa. Genera JSON sin texto extra:
{
  "digital_score": int 0-100,
  "opportunity_level": "ALTA"|"MEDIA"|"BAJA",
  "summary": "2 frases concretas para el comercial",
  "presencia_web": "valoracion ej: ÓPTIMO Score 71/100 con CTA claros",
  "redes_sociales": "descripcion redes reales detectadas",
  "captacion_leads": "estado real de captacion",
  "email_marketing": "estado real email marketing",
  "video_contenido": "estado real contenido audiovisual",
  "seo_info": "estado real SEO local",
  "oportunidad_hbd": "NIVEL — Score X/100 — 1 frase impacto",
  "opening_line": "frase apertura llamada fria con dato especifico real",
  "hook_captacion": "1 problema captacion especifico detectado",
  "hook_crm": "1 problema CRM/comercial especifico",
  "hook_visibilidad": "1 problema visibilidad digital especifico",
  "opportunity_sales": "• problema\\n• HBD: solucion\\n• Impacto: +X%",
  "opportunity_tech": "• problema\\n• HBD: solucion\\n• Impacto: -X%",
  "opportunity_av": "• problema\\n• HBD: solucion\\n• diferenciacion"
}"""

async def _claude_enrich(leads: list[dict]) -> list[dict]:
    key = ANTHROPIC_KEY()
    if not key:
        return leads
    try:
        import anthropic as _ant
        client = _ant.AsyncAnthropic(api_key=key)
    except Exception:
        return leads

    enriched = []
    for lead in leads:
        try:
            socials_found = [k for k in ["social_facebook","social_instagram",
                             "social_linkedin","social_youtube","social_tiktok"]
                             if lead.get(k)]
            prompt = (
                f"Empresa: {lead.get('empresa','?')}\n"
                f"Sector: {lead.get('sector_tag','?')} | Ciudad: {lead.get('ciudad','?')}\n"
                f"Web: {lead.get('web','sin web')} | Empleados: {lead.get('empleados','?')}\n"
                f"Cargo DM: {lead.get('cargo','?')}\n\n"
                f"DATOS REALES SCRAPED:\n"
                f"CRM: {lead.get('has_crm') or 'No detectado'}\n"
                f"FB Pixel: {'Sí' if lead.get('has_facebook_pixel') else 'No'}\n"
                f"Google Ads: {'Sí' if lead.get('has_google_ads') else 'No'}\n"
                f"TikTok: {'Sí' if lead.get('has_tiktok_pixel') else 'No'}\n"
                f"LinkedIn Insight: {'Sí' if lead.get('has_linkedin_insight') else 'No'}\n"
                f"Redes detectadas: {', '.join(socials_found) or 'ninguna'}\n"
                f"SEO Score: {lead.get('seo_score', 0)}/100\n"
                f"GMB Rating: {lead.get('gmb_rating','N/A')} ({lead.get('gmb_reviews','?')} reseñas)\n"
                f"Categoría GMB: {lead.get('gmb_category','?')}"
            )
            msg = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1200,
                system=_CLAUDE_PROMPT,
                messages=[{"role":"user","content":prompt}]
            )
            raw = msg.content[0].text.strip()
            s = raw.find("{"); e = raw.rfind("}")+1
            if s >= 0 and e > s:
                analysis = json.loads(raw[s:e])
                lead.update({k: v for k, v in analysis.items() if v})
        except Exception as ce:
            # Claude no disponible — el lead se guarda con datos reales de Scrapling/Apify
            print(f"[Claude] {str(ce)[:80]}")
        enriched.append(lead)
    return enriched


# ─────────────────────────────────────────────────────────────────────────────
# PIPELINE PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────
async def fetch_leads_for_user(sector_tag: str, city: str, qty: int = 15) -> list[dict]:
    """
    Pipeline completo: Apollo → phone filter → Apify GMB || Scrapling → Claude
    Retorna SOLO leads con teléfono verificado.
    """
    # 1. Apollo
    matches = await _apollo_search(city, qty)
    if not matches:
        return []

    # 2. Construir leads base — SOLO con teléfono
    base = []
    for m in matches:
        if not m: continue
        org   = m.get("organization") or {}
        phone = org.get("phone","")
        if not phone: continue  # SIN TELÉFONO = DESCARTADO
        empresa = (m.get("organization_name") or org.get("name","")).strip()
        if not empresa: continue
        combined = f"{empresa} {org.get('industry','')}".lower()
        if any(kw in combined for kw in _NO_COMPETITORS): continue

        base.append({
            "nombre":    f"{m.get('first_name','')} {m.get('last_name','')}".strip(),
            "cargo":     m.get("title",""),
            "empresa":   empresa,
            "empleados": org.get("employee_count"),
            "ciudad":    m.get("city") or city,
            "email":     m.get("email",""),
            "tel":       phone,
            "linkedin":  m.get("linkedin_url",""),
            "web":       org.get("website_url") or org.get("primary_domain",""),
            "sector_tag":sector_tag,
            "apollo_id": m.get("id",""),
            "source":    "apollo",
        })

    print(f"   Con teléfono: {len(base)}/{len(matches)}")
    if not base:
        return []

    # 3. Scrapling — analizar webs en paralelo (thread pool, no bloquea)
    print(f"   Scrapling {len(base)} webs...")
    loop = asyncio.get_event_loop()
    scrape_results = await loop.run_in_executor(
        None, lambda: [_scrape_website(l.get("web","")) for l in base]
    )
    for lead, web_data in zip(base, scrape_results):
        lead.update(web_data)
    scraped_ok = sum(1 for l in base if l.get("web_reachable"))
    print(f"   Scrapling OK: {scraped_ok}/{len(base)}")

    # 4. Apify GMB — solo para leads con score SEO bajo (optimizar créditos)
    # o cuando no hay datos de redes sociales de Scrapling
    if APIFY_KEY():
        needs_gmb = [l for l in base if not l.get("gmb_rating") and l.get("empresa")][:5]
        if needs_gmb:
            print(f"   Apify GMB para {len(needs_gmb)} empresas...")
            gmb_tasks = [_apify_gmb(l["empresa"], l["ciudad"]) for l in needs_gmb]
            gmb_results = await asyncio.gather(*gmb_tasks, return_exceptions=True)
            for lead, gmb in zip(needs_gmb, gmb_results):
                if isinstance(gmb, dict) and gmb:
                    lead.update(gmb)
                    # Si Apify encontró redes sociales, usarlas
                    if not lead.get("social_facebook") and gmb.get("gmb_website"):
                        lead["web"] = lead["web"] or gmb["gmb_website"]

    # 5. Claude — diagnóstico completo (fail gracefully si sin créditos)
    print(f"   Claude analizando {len(base)} empresas...")
    final = await _claude_enrich(base)

    return final


# ─────────────────────────────────────────────────────────────────────────────
# GUARDAR EN DB
# ─────────────────────────────────────────────────────────────────────────────
async def save_lead_to_db(lead: dict) -> Optional[str]:
    """Guarda lead. REQUIERE teléfono. Devuelve company_id o None."""
    empresa = (lead.get("empresa") or "").strip()
    if not empresa or not lead.get("tel"):
        return None  # Sin teléfono = NO se guarda

    async with db_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM lu_companies WHERE name=$1 AND city=$2",
            empresa, lead.get("ciudad","")
        )
        if existing:
            return str(existing["id"])

        row = await conn.fetchrow(
            """INSERT INTO lu_companies
                (name,website,sector,city,employee_count,
                 digital_score,opportunity_level,summary,
                 has_crm,seo_score,has_facebook_pixel,has_google_ads,
                 social_facebook,social_instagram,social_linkedin,
                 redes_sociales,captacion_leads,email_marketing,
                 video_contenido,seo_info,oportunidad_hbd,
                 opportunity_sales,opportunity_tech,opportunity_av,
                 gmb_rating,gmb_reviews,
                 opening_line,hook_captacion,hook_crm,hook_visibilidad,presencia_web,
                 source,sector_tag,raw_data)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                      $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
                      $27,$28,$29,$30,$31,$32,$33,$34)
               RETURNING id""",
            empresa, lead.get("web") or None, lead.get("sector_tag"),
            lead.get("ciudad"), lead.get("empleados"),
            lead.get("digital_score"), lead.get("opportunity_level"), lead.get("summary"),
            lead.get("has_crm"), lead.get("seo_score",0),
            bool(lead.get("has_facebook_pixel")), bool(lead.get("has_google_ads")),
            lead.get("social_facebook"), lead.get("social_instagram"), lead.get("social_linkedin"),
            lead.get("redes_sociales"), lead.get("captacion_leads"), lead.get("email_marketing"),
            lead.get("video_contenido"), lead.get("seo_info"), lead.get("oportunidad_hbd"),
            lead.get("opportunity_sales"), lead.get("opportunity_tech"), lead.get("opportunity_av"),
            lead.get("gmb_rating"), lead.get("gmb_reviews"),
            lead.get("opening_line"), lead.get("hook_captacion"),
            lead.get("hook_crm"), lead.get("hook_visibilidad"), lead.get("presencia_web"),
            "apollo", lead.get("sector_tag"), json.dumps(lead),
        )
        if not row:
            return None
        cid = row["id"]

        if lead.get("nombre"):
            await conn.execute(
                """INSERT INTO lu_contacts
                    (company_id,name,role,email,phone,phone_source,linkedin_url,is_primary)
                   VALUES($1,$2,$3,$4,$5,'apollo',$6,true)""",
                cid, lead["nombre"], lead.get("cargo") or None,
                lead.get("email") or None, lead["tel"],
                lead.get("linkedin") or None,
            )
        return str(cid)
