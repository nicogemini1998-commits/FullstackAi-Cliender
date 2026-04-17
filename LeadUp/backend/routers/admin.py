from __future__ import annotations
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..auth import require_admin
from ..services.enrichment import run_enrichment
from ..config import get_settings

router = APIRouter(prefix="/admin", tags=["admin"])


class EnrichmentRequest(BaseModel):
    sector: str = ""
    city: str = ""
    qty: int = 10


@router.post("/trigger-enrichment")
async def trigger_enrichment(body: EnrichmentRequest, user: dict = Depends(require_admin)):
    s = get_settings()
    result = await run_enrichment(
        sector=body.sector or s.enrichment_sector,
        city=body.city or s.enrichment_city,
        qty=body.qty,
    )
    return result
