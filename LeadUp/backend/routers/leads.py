from __future__ import annotations
import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..database import db_conn
from ..auth import verify_token, require_admin
from ..services.scheduler import trigger_daily_assignment

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("/today")
async def get_today_leads(user: dict = Depends(verify_token)):
    """Cola del día actual para el usuario logueado."""
    uid  = user.get("id")
    today = date.today()

    async with db_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT
                a.id           AS assignment_id,
                a.status       AS call_status,
                a.notes,
                a.called,
                c.id, c.name, c.website, c.sector, c.city, c.sector_tag,
                c.employee_count, c.digital_score, c.opportunity_level,
                c.summary, c.opportunity_sales, c.opportunity_tech, c.opportunity_av,
                c.redes_sociales, c.captacion_leads, c.email_marketing,
                c.video_contenido, c.seo_info, c.oportunidad_hbd,
                c.has_crm, c.seo_score, c.gmb_rating, c.gmb_reviews,
                c.has_facebook_pixel, c.has_google_ads,
                c.social_facebook, c.social_linkedin, c.social_instagram,
                c.attempt_count, c.source,
                (SELECT json_agg(ct ORDER BY ct.is_primary DESC)
                 FROM lu_contacts ct WHERE ct.company_id=c.id) AS contacts
            FROM lu_daily_assignments a
            JOIN lu_companies c ON c.id=a.company_id
            WHERE a.user_id=$1 AND a.assigned_date=$2
            ORDER BY
                CASE a.status WHEN 'pending' THEN 0 WHEN 'no_answer' THEN 1 ELSE 2 END,
                c.digital_score DESC NULLS LAST
            """,
            uid, today
        )

    import json as _json
    leads = []
    for r in rows:
        d = dict(r)
        # contacts viene como string JSON de json_agg — parsearlo
        raw_contacts = d.get("contacts")
        if isinstance(raw_contacts, str):
            try:
                d["contacts"] = _json.loads(raw_contacts)
            except Exception:
                d["contacts"] = []
        elif raw_contacts is None:
            d["contacts"] = []
        leads.append(d)

    return {
        "date":    str(today),
        "total":   len(leads),
        "pending": sum(1 for r in leads if r["call_status"] == "pending"),
        "leads":   leads,
    }


@router.get("/today/stats")
async def today_stats(user: dict = Depends(verify_token)):
    uid = user.get("id")
    async with db_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                COUNT(*)                                                                       AS total,
                COUNT(*) FILTER (WHERE status='pending')                                   AS pending,
                COUNT(*) FILTER (WHERE status IN ('agendado','closed'))                    AS closed,
                COUNT(*) FILTER (WHERE status IN ('no_interest','rejected'))               AS rejected,
                COUNT(*) FILTER (WHERE status='no_answer')                                 AS no_answer
            FROM lu_daily_assignments
            WHERE user_id=$1 AND assigned_date=CURRENT_DATE
            """,
            uid
        )
    return dict(row)


class StatusUpdate(BaseModel):
    status: str
    notes: str = ""


class NotesUpdate(BaseModel):
    notes: str = ""


@router.patch("/{assignment_id}/notes")
async def save_notes(
    assignment_id: str,
    body: NotesUpdate,
    user: dict = Depends(verify_token),
):
    """Guarda las notas sin cambiar el estado."""
    uid = user.get("id")
    async with db_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM lu_daily_assignments WHERE id=$1 AND user_id=$2",
            uuid.UUID(assignment_id), uid
        )
        if not row:
            raise HTTPException(404, "Asignación no encontrada")
        await conn.execute(
            "UPDATE lu_daily_assignments SET notes=$1 WHERE id=$2",
            body.notes, uuid.UUID(assignment_id)
        )
    return {"ok": True}


@router.patch("/{assignment_id}/status")
async def update_lead_status(
    assignment_id: str,
    body: StatusUpdate,
    user: dict = Depends(verify_token),
):
    # Nuevos status + los anteriores para compatibilidad
    valid = {"agendado", "no_interest", "no_answer", "pending", "closed", "rejected"}
    if body.status not in valid:
        raise HTTPException(400, f"status debe ser uno de: {valid}")

    uid = user.get("id")
    async with db_conn() as conn:
        # Verificar ownership
        row = await conn.fetchrow(
            "SELECT company_id FROM lu_daily_assignments WHERE id=$1 AND user_id=$2",
            uuid.UUID(assignment_id), uid
        )
        if not row:
            raise HTTPException(404, "Asignación no encontrada")

        await conn.execute(
            "UPDATE lu_daily_assignments SET status=$1, notes=$2, called=TRUE WHERE id=$3",
            body.status, body.notes, uuid.UUID(assignment_id)
        )

        # Si no contesta: programar reintento en RETRY_AFTER_DAYS días
        if body.status == "no_answer":
            retry_date = date.today() + timedelta(days=3)
            await conn.execute(
                "UPDATE lu_companies SET attempt_count=attempt_count+1, next_attempt_date=$1 WHERE id=$2",
                retry_date, row["company_id"]
            )

        # Log en call_logs también
        await conn.execute(
            """
            INSERT INTO lu_call_logs (company_id, commercial_id, status, notes)
            VALUES ($1, $2, $3, $4)
            """,
            row["company_id"], uid, body.status, body.notes
        )

    return {"ok": True, "status": body.status}


@router.post("/assign-now")
async def manual_assign(user: dict = Depends(require_admin)):
    """Admin: disparar asignación diaria manualmente."""
    try:
        await trigger_daily_assignment()
        return {"ok": True, "message": "Asignación completada"}
    except Exception as e:
        raise HTTPException(500, str(e))
