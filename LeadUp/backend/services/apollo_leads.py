from __future__ import annotations
import httpx, json
from typing import Optional
from ..database import db_conn

import os as _os
APOLLO_KEY    = _os.getenv("APOLLO_API_KEY", "")
APOLLO_BASE   = "https://api.apollo.io/api/v1"
HDR           = {"x-api-key": APOLLO_KEY, "Content-Type": "application/json"}
ANTHROPIC_KEY = _os.getenv("ANTHROPIC_API_KEY", "")

CLIENDER_SECTORS = [
    {"tag": "reformas",       "cities": ["Madrid","Valencia","Barcelona","Sevilla","Bilbao"]},
    {"tag": "clinicas",       "cities": ["Madrid","Valencia","Barcelona","Sevilla","Málaga"]},
    {"tag": "academias",      "cities": ["Madrid","Valencia","Barcelona","Zaragoza"]},
    {"tag": "inmobiliarias",  "cities": ["Madrid","Valencia","Barcelona","Málaga","Alicante"]},
    {"tag": "concesionarios", "cities": ["Madrid","Valencia","Barcelona","Sevilla"]},
    {"tag": "gimnasios",      "cities": ["Madrid","Valencia","Barcelona","Bilbao"]},
    {"tag": "seguros",        "cities": ["Madrid","Valencia","Barcelona","Sevilla"]},
    {"tag": "abogados",       "cities": ["Madrid","Valencia","Barcelona","Sevilla","Bilbao"]},
]

_COMPETITOR_KW = [
    "agencia", "marketing", "publicidad", "seo", "sem", "diseño web",
    "desarrollo web", "consultora digital", "growth", "performance",
    "paid media", "social media", "community manager", "branding",
    "inbound", "outbound", "crm consulting",
]

CLAUDE_PROMPT = """Eres analista comercial de Cliender, consultora de ventas tech.
Recibes datos de una empresa española. Genera en JSON COMPACTO (sin texto extra):
{
  "digital_score": int 0-100,
  "opportunity_level": "ALTA"|"MEDIA"|"BAJA",
  "summary": "2 frases directas sobre el negocio para un comercial",
  "presencia_web": "valoracion breve ej: ÓPTIMO Score 71/100",
  "redes_sociales": "descripcion breve de redes activas",
  "has_crm": "nombre CRM o No detectado",
  "captacion_leads": "descripcion breve",
  "email_marketing": "descripcion breve",
  "video_contenido": "descripcion breve",
  "seo_info": "descripcion breve SEO local",
  "oportunidad_hbd": "NIVEL - Score X/100 - 1 frase",
  "opening_line": "frase de apertura llamada fria especifica para esta empresa",
  "hook_captacion": "1 problema especifico de captacion de esta empresa",
  "hook_crm": "1 problema especifico CRM/comercial",
  "hook_visibilidad": "1 problema especifico visibilidad digital",
  "opportunity_sales": "- bullet1\\n- bullet2\\n- Impacto: +X%",
  "opportunity_tech": "- bullet1\\n- bullet2\\n- Impacto: -X%",
  "opportunity_av": "- bullet1\\n- bullet2\\n- Impacto: diferenciacion"
}
Solo JSON valido."""


async def _claude_enrich(leads: list[dict]) -> list[dict]:
    """Claude Haiku genera diagnóstico completo para cada lead."""
    if not leads:
        return leads
    try:
        import anthropic as _ant
        client = _ant.AsyncAnthropic(api_key=ANTHROPIC_KEY)
        enriched = []
        for lead in leads:
            prompt = (
                f"Empresa: {lead.get('empresa','?')}\n"
                f"Sector: {lead.get('sector_tag','?')}\n"
                f"Ciudad: {lead.get('ciudad','?')}\n"
                f"Web: {lead.get('web','sin web')}\n"
                f"Empleados: {lead.get('empleados','desconocido')}\n"
                f"Cargo DM: {lead.get('cargo','?')}"
            )
            msg = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                system=CLAUDE_PROMPT,
                messages=[{"role":"user","content":prompt}]
            )
            raw = msg.content[0].text.strip()
            # Extraer JSON
            start = raw.find("{"); end = raw.rfind("}")+1
            if start >= 0 and end > start:
                try:
                    analysis = json.loads(raw[start:end])
                    lead.update(analysis)
                except Exception:
                    pass
            enriched.append(lead)
        return enriched
    except Exception as e:
        print(f"[Claude enrich] {e}")
        return leads


async def fetch_leads_for_user(sector_tag: str, city: str, qty: int = 15) -> list[dict]:
    """Apollo search + enrich + Claude analysis. SOLO leads con teléfono."""
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.post(
                f"{APOLLO_BASE}/mixed_people/api_search", headers=HDR,
                json={
                    "person_titles": ["CEO","Fundador","Director General","Director Comercial","Gerente","Propietario","Owner"],
                    "person_locations": [f"{city}, Spain"],
                    "organization_num_employees_ranges": ["5,150"],
                    "per_page": 100, "page": 1,
                }
            )
            resp.raise_for_status()
            people = resp.json().get("people", [])
            print(f"   Apollo {city}: {len(people)} personas")

            # SOLO con teléfono confirmado
            with_phone = [p for p in people if p.get("has_direct_phone") == "Yes"]
            with_both  = [p for p in with_phone if p.get("has_email")]
            candidates = (with_both + [p for p in with_phone if p not in with_both])[:qty]

            if not candidates:
                print(f"   Sin candidatos con telefono en {city}")
                return []

            # Enriquecer en lotes de 10
            matches = []
            for i in range(0, len(candidates), 10):
                er = await c.post(
                    f"{APOLLO_BASE}/people/bulk_match", headers=HDR,
                    json={"details":[{"id":p["id"]} for p in candidates[i:i+10]],
                          "reveal_personal_emails":True}
                )
                if er.status_code == 200:
                    matches.extend(er.json().get("matches") or [])
    except Exception as e:
        print(f"   Apollo ERROR: {e}")
        return []

    results = []
    for m in matches:
        if not m: continue
        org   = m.get("organization") or {}
        phone = org.get("phone","")
        # ESTRICTO: sin teléfono = descartado
        if not phone:
            continue
        empresa = m.get("organization_name") or org.get("name","")
        if not empresa:
            continue
        # Excluir competidores
        combined = f"{empresa} {org.get('industry','')}".lower()
        if any(kw in combined for kw in _COMPETITOR_KW):
            continue

        results.append({
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

    print(f"   Con telefono: {len(results)}/{len(matches)}")

    # Claude enriquece todos los campos de la ficha
    if results:
        results = await _claude_enrich(results)

    return results


async def save_lead_to_db(lead: dict) -> Optional[str]:
    empresa = (lead.get("empresa") or "").strip()
    if not empresa or not lead.get("tel"):
        return None  # Sin teléfono = NO guardar

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
                 has_crm,seo_score,
                 redes_sociales,captacion_leads,email_marketing,
                 video_contenido,seo_info,oportunidad_hbd,
                 opportunity_sales,opportunity_tech,opportunity_av,
                 source,sector_tag,raw_data)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
               RETURNING id""",
            empresa,
            lead.get("web") or None,
            lead.get("sector_tag"),
            lead.get("ciudad"),
            lead.get("empleados"),
            lead.get("digital_score"),
            lead.get("opportunity_level"),
            lead.get("summary"),
            lead.get("has_crm"),
            lead.get("digital_score",0),
            lead.get("redes_sociales"),
            lead.get("captacion_leads"),
            lead.get("email_marketing"),
            lead.get("video_contenido"),
            lead.get("seo_info"),
            lead.get("oportunidad_hbd"),
            lead.get("opportunity_sales"),
            lead.get("opportunity_tech"),
            lead.get("opportunity_av"),
            "apollo",
            lead.get("sector_tag"),
            json.dumps(lead),
        )
        if not row: return None
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
