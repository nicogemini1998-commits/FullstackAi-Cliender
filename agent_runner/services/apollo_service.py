from __future__ import annotations
import httpx
from typing import Optional
from ..config import get_settings

APOLLO_BASE = "https://api.apollo.io/api/v1"


async def search_leads(
    sector: str,
    city: str = "Madrid",
    country: str = "ES",
    roles: Optional[list[str]] = None,
    qty: int = 10,
) -> list[dict]:
    """
    Busca empresas + decision makers en Apollo.
    Devuelve lista de empresas con sus contactos normalizados.
    """
    key = get_settings().apollo_api_key
    if not key:
        return _mock_leads(sector, city, qty)

    if roles is None:
        roles = ["CEO", "Director General", "Fundador", "Gerente", "Owner"]

    payload = {
        "api_key": key,
        "q_organization_industry_tag_ids": [],
        "q_keywords": sector,
        "person_titles": roles,
        "prospected_by_current_team": ["no"],
        "person_locations": [f"{city}, Spain"],
        "organization_locations": ["Spain"],
        "page": 1,
        "per_page": min(qty, 25),
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{APOLLO_BASE}/mixed_people/search",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        return _mock_leads(sector, city, qty, error=str(e))

    companies: dict[str, dict] = {}
    for person in data.get("people", []):
        org = person.get("organization") or {}
        org_name = org.get("name") or person.get("organization_name", "Desconocido")

        if org_name not in companies:
            companies[org_name] = {
                "name": org_name,
                "website": org.get("website_url") or org.get("primary_domain"),
                "sector": sector,
                "city": city,
                "employee_count": org.get("estimated_num_employees"),
                "contacts": [],
            }

        phone = (
            person.get("mobile_phone")
            or (person.get("phone_numbers") or [{}])[0].get("raw_number")
        )
        companies[org_name]["contacts"].append({
            "name": f"{person.get('first_name','')} {person.get('last_name','')}".strip(),
            "role": person.get("title"),
            "email": person.get("email"),
            "phone": phone,
            "phone_source": "apollo",
            "linkedin_url": person.get("linkedin_url"),
            "is_primary": len(companies[org_name]["contacts"]) == 0,
        })

    return list(companies.values())[:qty]


def _mock_leads(sector: str, city: str, qty: int, error: Optional[str] = None) -> list[dict]:
    """Datos de prueba cuando Apollo no está configurado."""
    mock = [
        {
            "name": f"Empresa Demo {i+1} SL",
            "website": f"https://empresa{i+1}demo.es",
            "sector": sector,
            "city": city,
            "employee_count": (i + 1) * 12,
            "contacts": [
                {
                    "name": f"Carlos Ejemplo {i+1}",
                    "role": "CEO",
                    "email": f"carlos{i+1}@empresa{i+1}demo.es",
                    "phone": f"+34 6{i+1}1 000 00{i}",
                    "phone_source": "mock",
                    "linkedin_url": None,
                    "is_primary": True,
                }
            ],
        }
        for i in range(qty)
    ]
    if error:
        for m in mock:
            m["_apollo_error"] = error
    return mock
