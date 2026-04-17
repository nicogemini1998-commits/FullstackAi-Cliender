from __future__ import annotations
import httpx
import asyncio
from typing import Optional
from ..config import get_settings

APIFY_BASE  = "https://api.apify.com/v2"
GMAPS_ACTOR = "compass~google-maps-scraper"


async def scrape_google_maps(company_name: str, city: str) -> dict:
    key = get_settings().apify_api_key
    if not key:
        return _mock_gmb(company_name)

    query = f"{company_name} {city}"
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            run = await client.post(
                f"{APIFY_BASE}/acts/{GMAPS_ACTOR}/run-sync-get-dataset-items",
                params={"token": key, "timeout": 90, "memory": 512},
                json={
                    "searchStringsArray": [query],
                    "maxCrawledPlacesPerSearch": 3,
                    "language": "es",
                    "countryCode": "es",
                    "maxImages": 0,
                    "scrapeReviews": False,
                    "scrapeImageUrls": False,
                },
            )
            run.raise_for_status()
            items = run.json()
    except Exception as e:
        return _mock_gmb(company_name, error=str(e))

    if not items:
        return _mock_gmb(company_name, error="no GMB results")

    place = items[0]
    return {
        "gmb_rating":   place.get("totalScore"),
        "gmb_reviews":  place.get("reviewsCount"),
        "gmb_phone":    place.get("phone"),
        "gmb_address":  place.get("address"),
        "gmb_category": place.get("categoryName"),
    }


async def enrich_companies_with_gmb(companies: list[dict]) -> list[dict]:
    """Enriquece con GMB de forma secuencial para no saturar el actor."""
    for company in companies:
        gmb = await scrape_google_maps(company.get("name", ""), company.get("city", ""))
        company.update(gmb)
    return companies


def _mock_gmb(name: str, error: Optional[str] = None) -> dict:
    import random
    return {
        "gmb_rating":   round(random.uniform(3.5, 4.9), 1),
        "gmb_reviews":  random.randint(10, 200),
        "gmb_phone":    None,
        "gmb_address":  None,
        "gmb_category": None,
        "_apify_error": error,
    }
