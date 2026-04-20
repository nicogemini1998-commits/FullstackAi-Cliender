from __future__ import annotations
import httpx
from typing import Optional
from ..database import db_conn

APOLLO_KEY  = "PDFmEmLlq5tiVYwgd-289g"
APOLLO_BASE = "https://api.apollo.io/api/v1"
HDR = {"x-api-key": APOLLO_KEY, "Content-Type": "application/json"}

# Sectores CLIENDER con alto potencial de conversión
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


async def fetch_leads_for_user(sector_tag: str, city: str, qty: int = 15) -> list[dict]:
    """Busca + enriquece leads de Apollo. Retorna lista de dicts listos para guardar."""
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            # Búsqueda: decisores en España 5-150 empleados
            resp = await c.post(
                f"{APOLLO_BASE}/mixed_people/api_search",
                headers=HDR,
                json={
                    "person_titles": [
                        "CEO", "Fundador", "Director General",
                        "Director Comercial", "Gerente", "Propietario", "Owner",
                    ],
                    "person_locations": [f"{city}, Spain"],
                    "organization_num_employees_ranges": ["5,150"],
                    "per_page": 100,
                    "page": 1,
                },
            )
            resp.raise_for_status()
            data   = resp.json()
            people = data.get("people", [])
            print(f"   Apollo {city}: {data.get('total_entries',0)} totales, {len(people)} en página")

            if not people:
                return []

            # SOLO leads con teléfono — sin excepciones
            prio     = [p for p in people if p.get("has_direct_phone") == "Yes" and p.get("has_email")]
            fallback = [p for p in people if p.get("has_direct_phone") == "Yes" and p not in prio]
            candidates = (prio + fallback)[:qty]

            # Enriquecer en lotes de 10 (límite Apollo)
            print(f"   Enriqueciendo {len(candidates)} candidatos en lotes...")
            matches = []
            for i in range(0, len(candidates), 10):
                batch = candidates[i:i+10]
                er = await c.post(
                    f"{APOLLO_BASE}/people/bulk_match",
                    headers=HDR,
                    json={
                        "details": [{"id": p["id"]} for p in batch],
                        "reveal_personal_emails": True,
                    },
                )
                if er.status_code == 200:
                    batch_matches = er.json().get("matches") or []
                    matches.extend(batch_matches)
                else:
                    print(f"   Bulk match lote {i//10+1} HTTP:{er.status_code} {er.text[:100]}")
            print(f"   Total enriquecidos: {len(matches)}")

    except Exception as e:
        print(f"   Apollo ERROR en fetch_leads_for_user: {e}")
        return []

    # Sectores competidores a excluir
    _COMPETITOR_KEYWORDS = [
        "agencia", "marketing", "publicidad", "seo", "sem", "diseño web",
        "desarrollo web", "consultora digital", "growth", "performance",
        "paid media", "social media", "community manager", "branding",
        "inbound", "outbound", "crm consulting", "salesforce partner",
    ]

    def _is_competitor(m: dict) -> bool:
        org = m.get("organization") or {}
        name = (m.get("organization_name") or org.get("name") or "").lower()
        industry = (org.get("industry") or "").lower()
        combined = f"{name} {industry}"
        return any(kw in combined for kw in _COMPETITOR_KEYWORDS)

    results = []
    for m in matches:
        if not m:
            continue
        org = m.get("organization") or {}
        phone = org.get("phone", "")
        # Solo leads con teléfono real
        if not phone:
            continue
        # Excluir competidores
        if _is_competitor(m):
            continue
        results.append({
            "nombre":     f"{m.get('first_name','')} {m.get('last_name','')}".strip(),
            "cargo":      m.get("title", ""),
            "empresa":    m.get("organization_name") or org.get("name", ""),
            "empleados":  org.get("employee_count"),
            "ciudad":     m.get("city") or city,
            "email":      m.get("email", ""),
            "tel":        org.get("phone", ""),
            "linkedin":   m.get("linkedin_url", ""),
            "web":        org.get("website_url") or org.get("primary_domain", ""),
            "sector_tag": sector_tag,
            "apollo_id":  m.get("id", ""),
            "source":     "apollo",
        })
    return results


async def save_lead_to_db(lead: dict) -> Optional[str]:
    """Guarda un lead en lu_companies + lu_contacts. Devuelve company_id o None si ya existe."""
    import json as _j
    empresa = (lead.get("empresa") or "").strip()
    if not empresa:
        return None

    async with db_conn() as conn:
        # No duplicar por nombre + ciudad
        existing = await conn.fetchrow(
            "SELECT id FROM lu_companies WHERE name=$1 AND city=$2",
            empresa, lead.get("ciudad", "")
        )
        if existing:
            return str(existing["id"])

        row = await conn.fetchrow(
            """
            INSERT INTO lu_companies
                (name, website, sector, city, employee_count,
                 summary, source, sector_tag, raw_data)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING id
            """,
            empresa,
            lead.get("web") or None,
            lead.get("sector_tag"),
            lead.get("ciudad"),
            lead.get("empleados"),
            f"{lead.get('cargo','')} en {empresa}.",
            lead.get("source", "apollo"),
            lead.get("sector_tag"),
            _j.dumps(lead),
        )
        if not row:
            return None
        company_id = row["id"]

        if lead.get("nombre"):
            await conn.execute(
                """
                INSERT INTO lu_contacts
                    (company_id, name, role, email, phone, phone_source, linkedin_url, is_primary)
                VALUES ($1,$2,$3,$4,$5,'apollo',$6,true)
                """,
                company_id,
                lead["nombre"],
                lead.get("cargo") or None,
                lead.get("email") or None,
                lead.get("tel") or None,
                lead.get("linkedin") or None,
            )
        return str(company_id)
