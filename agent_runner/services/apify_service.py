from __future__ import annotations
import httpx
import asyncio
from typing import Optional
from ..config import get_settings

APIFY_BASE  = "https://api.apify.com/v2"
GMAPS_ACTOR = "compass~crawler-google-places"


async def _run_actor_and_wait(key: str, input_data: dict, timeout: int = 120) -> list[dict]:
    """Lanza un actor Apify de forma asíncrona y espera los resultados."""
    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Iniciar el actor
        start = await client.post(
            f"{APIFY_BASE}/acts/{GMAPS_ACTOR}/runs",
            params={"token": key, "memory": 1024},
            json=input_data,
        )
        start.raise_for_status()
        run_id = start.json()["data"]["id"]

    # 2. Esperar hasta que termine (polling)
    elapsed = 0
    interval = 5
    async with httpx.AsyncClient(timeout=15) as client:
        while elapsed < timeout:
            await asyncio.sleep(interval)
            elapsed += interval
            interval = min(interval + 3, 15)  # backoff gradual
            status_r = await client.get(
                f"{APIFY_BASE}/actor-runs/{run_id}",
                params={"token": key},
            )
            status_r.raise_for_status()
            run_status = status_r.json()["data"]["status"]
            if run_status in ("SUCCEEDED", "FAILED", "ABORTED"):
                break

    print(f"[Apify] Run {run_id} final status: {run_status}")
    if run_status != "SUCCEEDED":
        return []

    # 3. Obtener dataset
    async with httpx.AsyncClient(timeout=30) as client:
        items_r = await client.get(
            f"{APIFY_BASE}/actor-runs/{run_id}/dataset/items",
            params={"token": key, "format": "json"},
        )
        items_r.raise_for_status()
        data = items_r.json()
        print(f"[Apify] Dataset items: {len(data) if isinstance(data, list) else data}")
        return data if isinstance(data, list) else []


async def search_businesses_on_maps(sector: str, city: str, qty: int) -> list[dict]:
    """Fuente PRINCIPAL de leads: negocios reales desde Google Maps/Places."""
    key = get_settings().apify_api_key
    if not key:
        return _mock_businesses(sector, city, qty)

    try:
        items = await _run_actor_and_wait(
            key,
            {
                "searchStringsArray": [f"{sector} en {city}"],
                "maxCrawledPlacesPerSearch": min(qty + 5, 30),
                "language": "es",
                "countryCode": "es",
                "maxImages": 0,
                "scrapeReviews": False,
                "scrapeImageUrls": False,
                "includeHistogram": False,
                "includeOpeningHours": False,
            },
            timeout=150,
        )
    except Exception as e:
        import traceback
        err = f"{e}\n{traceback.format_exc()[-500:]}"
        print(f"[Apify ERROR] {err}")
        return _mock_businesses(sector, city, qty, error=str(e))

    if not items:
        return _mock_businesses(sector, city, qty, error="Apify returned 0 places")

    companies = []
    for place in items[:qty]:
        name = place.get("title") or place.get("name")
        if not name:
            continue
        companies.append({
            "name":          name,
            "website":       place.get("website"),
            "sector":        sector,
            "city":          city,
            "employee_count": None,
            "gmb_rating":    place.get("totalScore"),
            "gmb_reviews":   place.get("reviewsCount"),
            "gmb_phone":     place.get("phone"),
            "gmb_address":   place.get("address"),
            "gmb_category":  place.get("categoryName"),
            "social_facebook":  _find_social(place, "facebook"),
            "social_instagram": _find_social(place, "instagram"),
            "social_linkedin":  _find_social(place, "linkedin"),
            "contacts":      [],
        })

    return companies if companies else _mock_businesses(sector, city, qty)


async def enrich_companies_with_gmb(companies: list[dict]) -> list[dict]:
    """Enriquece lista existente añadiendo GMB dato a dato."""
    for company in companies:
        gmb = await _get_gmb_single(company.get("name", ""), company.get("city", ""))
        if gmb:
            for k, v in gmb.items():
                company.setdefault(k, v)
    return companies


async def _get_gmb_single(company_name: str, city: str) -> Optional[dict]:
    key = get_settings().apify_api_key
    if not key:
        return None
    try:
        items = await _run_actor_and_wait(
            key,
            {"searchStringsArray": [f"{company_name} {city}"],
             "maxCrawledPlacesPerSearch": 1,
             "language": "es", "countryCode": "es",
             "maxImages": 0, "scrapeReviews": False},
            timeout=90,
        )
        if items:
            p = items[0]
            return {"gmb_rating": p.get("totalScore"), "gmb_reviews": p.get("reviewsCount"), "gmb_phone": p.get("phone")}
    except Exception:
        pass
    return None


def _find_social(place: dict, network: str) -> Optional[str]:
    for link in place.get("socialMedia", []) or []:
        if network in str(link).lower():
            return link
    return None


def _mock_businesses(sector: str, city: str, qty: int, error: Optional[str] = None) -> list[dict]:
    import random
    names = [
        "Restaurante El Jardín", "Casa Botín", "La Trainera", "Taberna La Bola",
        "Restaurante Sobrino de Botín", "El Brillante", "Casa Salvador",
        "Restaurante Lhardy", "Taberna El Alabardero", "Café de Oriente",
        "Restaurante Arce", "Asador Donostiarra", "Maldonado 14",
        "El Fogón de Trifón", "Restaurante Cinco Jotas",
    ]
    return [
        {
            "name":          f"{names[i % len(names)]}",
            "website":       f"https://{names[i % len(names)].lower().replace(' ','-').replace('ó','o').replace('ú','u').replace('é','e').replace('á','a')}.com",
            "sector":        sector,
            "city":          city,
            "employee_count": random.randint(8, 60),
            "gmb_rating":    round(random.uniform(3.9, 4.9), 1),
            "gmb_reviews":   random.randint(80, 1200),
            "gmb_phone":     f"+34 91{random.randint(1,9)} {random.randint(100,999)} {random.randint(100,999)}",
            "gmb_address":   f"Calle Mayor {random.randint(1,50)}, {city}",
            "gmb_category":  sector,
            "contacts":      [],
            "_mock":         True,
            "_apify_error":  error,
        }
        for i in range(qty)
    ]
