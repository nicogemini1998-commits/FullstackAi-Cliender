from __future__ import annotations
import json, asyncio
from fastapi import APIRouter, Request
import httpx

router = APIRouter(prefix="/apollo", tags=["apollo"])

# Cache en memoria para teléfonos revelados via webhook
_phone_cache: dict[str, str] = {}

APOLLO_KEY = "PDFmEmLlq5tiVYwgd-289g"
APOLLO_BASE = "https://api.apollo.io/api/v1"


@router.post("/webhook/phone")
@router.get("/webhook/phone")
async def apollo_phone_webhook(request: Request):
    """Recibe teléfonos de Apollo vía webhook (async phone reveal)."""
    try:
        data = await request.json()
        person = data.get("person") or data
        pid    = person.get("id")
        phone  = (
            person.get("mobile_phone")
            or (person.get("phone_numbers") or [{}])[0].get("raw_number")
        )
        if pid and phone:
            _phone_cache[pid] = phone
    except Exception:
        pass
    return {"ok": True}


@router.get("/phones")
async def get_revealed_phones():
    """Ver teléfonos revelados hasta ahora."""
    return {"count": len(_phone_cache), "phones": _phone_cache}


@router.post("/search-cliender")
async def search_cliender_prospects(qty: int = 20):
    """
    Busca los mejores prospectos para CLIENDER en España via Apollo.
    Retorna: nombre completo, cargo, empresa, email, teléfono empresa, LinkedIn.
    Phone reveal asíncrono — los móviles llegan al /webhook/phone.
    """
    # ── 1. Buscar personas ────────────────────────────────────────────────
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{APOLLO_BASE}/mixed_people/api_search",
            headers={"x-api-key": APOLLO_KEY, "Content-Type": "application/json"},
            json={
                "person_titles": [
                    "CEO", "Fundador", "Director General",
                    "Director Comercial", "Gerente", "Owner",
                ],
                "person_locations": ["Spain"],
                "organization_num_employees_ranges": ["5,300"],
                "per_page": min(qty * 3, 100),
                "page": 1,
            },
        )
        search = resp.json()

    people_raw = search.get("people", [])
    total      = search.get("total_entries", 0)

    # Priorizar: tel:Yes + email:True
    priority = [p for p in people_raw if p.get("has_direct_phone") == "Yes" and p.get("has_email")]
    fallback  = [p for p in people_raw if p.get("has_direct_phone") == "Yes" and p not in priority]
    candidates = (priority + fallback)[:qty]
    ids = [p["id"] for p in candidates]

    # ── 2. Enriquecer (nombres completos + emails) ────────────────────────
    enriched = []
    if ids:
        async with httpx.AsyncClient(timeout=20) as client:
            er = await client.post(
                f"{APOLLO_BASE}/people/bulk_match",
                headers={"x-api-key": APOLLO_KEY, "Content-Type": "application/json"},
                json={
                    "details": [{"id": i} for i in ids],
                    "reveal_personal_emails": True,
                },
            )
            enriched = er.json().get("matches") or []

    # ── 3. Phone reveal asíncrono (fire-and-forget) ───────────────────────
    webhook = "https://leadup.cliender.com/api/apollo/webhook/phone"
    asyncio.create_task(_reveal_phones_bg(
        [p.get("id") for p in enriched if p and p.get("id")],
        webhook
    ))

    # ── 4. Construir respuesta ────────────────────────────────────────────
    results = []
    for p in enriched:
        if not p:
            continue
        pid  = p.get("id", "")
        org  = p.get("organization") or {}
        emp  = org.get("employee_count")
        org_phone = org.get("phone")
        phone = _phone_cache.get(pid) or org_phone  # móvil si ya llegó, si no el de empresa

        results.append({
            "nombre":    f"{p.get('first_name','')} {p.get('last_name','')}".strip(),
            "cargo":     p.get("title") or "",
            "empresa":   p.get("organization_name") or org.get("name") or "",
            "email":     p.get("email") or "",
            "telefono":  phone or "",
            "movil_verificado": bool(_phone_cache.get(pid)),
            "linkedin":  p.get("linkedin_url") or "",
            "empleados": emp,
            "web":       org.get("website_url") or org.get("primary_domain") or "",
            "apollo_id": pid,
        })

    return {
        "total_apollo_espana": total,
        "candidatos_con_telefono": len(candidates),
        "enriquecidos": len([r for r in results if r["email"]]),
        "moviles_revelados": len([r for r in results if r["movil_verificado"]]),
        "nota": "Los móviles personales llegarán al webhook en ~30s. Llama a GET /api/apollo/phones para verlos.",
        "prospectos": results,
    }


async def _reveal_phones_bg(person_ids: list[str], webhook_url: str):
    """Solicita phone reveal a Apollo en background (fire-and-forget)."""
    async with httpx.AsyncClient(timeout=15) as client:
        for pid in person_ids:
            try:
                await client.post(
                    f"{APOLLO_BASE}/people/match",
                    headers={"x-api-key": APOLLO_KEY, "Content-Type": "application/json"},
                    json={"id": pid, "reveal_phone_number": True, "webhook_url": webhook_url},
                )
                await asyncio.sleep(0.3)  # rate limit
            except Exception:
                pass
