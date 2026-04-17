from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from ..database import db_conn
from ..auth import verify_token

router = APIRouter(prefix="/companies", tags=["companies"])


class CallStatusUpdate(BaseModel):
    status: str          # closed / rejected / no_answer
    notes: str = ""
    contact_id: Optional[str] = None


@router.get("/")
async def list_companies(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    opportunity: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(verify_token),
):
    offset = (page - 1) * limit
    conditions = []
    params: list = []

    if opportunity:
        params.append(opportunity.upper())
        conditions.append(f"c.opportunity_level = ${len(params)}")

    if search:
        params.append(f"%{search}%")
        conditions.append(f"(c.name ILIKE ${len(params)} OR c.city ILIKE ${len(params)})")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params += [limit, offset]

    async with db_conn() as conn:
        rows = await conn.fetch(
            f"""
            SELECT c.id, c.name, c.website, c.sector, c.city, c.employee_count,
                   c.digital_score, c.gmb_rating, c.gmb_reviews, c.has_crm,
                   c.opportunity_level, c.summary, c.enriched_at,
                   cl.status AS last_call_status,
                   cl.called_at AS last_called_at,
                   (SELECT COUNT(*) FROM lu_contacts WHERE company_id=c.id) AS contact_count
            FROM lu_companies c
            LEFT JOIN LATERAL (
                SELECT status, called_at FROM lu_call_logs
                WHERE company_id=c.id ORDER BY called_at DESC LIMIT 1
            ) cl ON TRUE
            {where}
            ORDER BY c.enriched_at DESC
            LIMIT ${len(params)-1} OFFSET ${len(params)}
            """,
            *params,
        )
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM lu_companies c {where}",
            *params[:-2],
        )
    return {"data": [dict(r) for r in rows], "total": total, "page": page, "limit": limit}


@router.get("/stats")
async def stats(user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM lu_companies")
        closed = await conn.fetchval(
            "SELECT COUNT(DISTINCT company_id) FROM lu_call_logs WHERE status='closed'"
        )
        rejected = await conn.fetchval(
            "SELECT COUNT(DISTINCT company_id) FROM lu_call_logs WHERE status='rejected'"
        )
        no_answer = await conn.fetchval(
            "SELECT COUNT(DISTINCT company_id) FROM lu_call_logs WHERE status='no_answer'"
        )
        pending = total - closed - rejected - no_answer
    return {
        "total": total,
        "closed": closed,
        "rejected": rejected,
        "no_answer": no_answer,
        "pending": max(pending, 0),
    }


@router.get("/{company_id}")
async def get_company(company_id: str, user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        company = await conn.fetchrow(
            "SELECT * FROM lu_companies WHERE id=$1", uuid.UUID(company_id)
        )
        if not company:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")
        contacts = await conn.fetch(
            "SELECT * FROM lu_contacts WHERE company_id=$1 ORDER BY is_primary DESC",
            uuid.UUID(company_id),
        )
        logs = await conn.fetch(
            """
            SELECT cl.*, u.name AS commercial_name
            FROM lu_call_logs cl
            LEFT JOIN lu_users u ON u.id=cl.commercial_id
            WHERE cl.company_id=$1
            ORDER BY cl.called_at DESC LIMIT 20
            """,
            uuid.UUID(company_id),
        )
    return {
        **dict(company),
        "contacts": [dict(c) for c in contacts],
        "call_logs": [dict(l) for l in logs],
    }


@router.patch("/{company_id}/status")
async def update_call_status(
    company_id: str,
    body: CallStatusUpdate,
    user: dict = Depends(verify_token),
):
    valid = {"closed", "rejected", "no_answer"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"Status debe ser: {valid}")

    async with db_conn() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM lu_companies WHERE id=$1", uuid.UUID(company_id)
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")

        await conn.execute(
            """
            INSERT INTO lu_call_logs (company_id, contact_id, commercial_id, status, notes)
            VALUES ($1, $2, $3, $4, $5)
            """,
            uuid.UUID(company_id),
            uuid.UUID(body.contact_id) if body.contact_id else None,
            uuid.UUID(user["id"]) if user.get("id") and user["id"] != "local" else None,
            body.status,
            body.notes,
        )
    return {"ok": True, "status": body.status}
