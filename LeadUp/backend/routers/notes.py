from __future__ import annotations
from fastapi import APIRouter, Depends
from ..database import db_conn
from ..auth import verify_token

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/")
async def get_my_notes(user: dict = Depends(verify_token)):
    """Notas del usuario actual, agrupadas por empresa."""
    uid = user.get("id")
    async with db_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT
                a.id            AS assignment_id,
                a.notes,
                a.status        AS call_status,
                a.assigned_date,
                a.called,
                c.id            AS company_id,
                c.name          AS company_name,
                c.city,
                c.sector_tag    AS sector,
                c.website,
                c.digital_score,
                c.opportunity_level,
                ct.name         AS dm_name,
                ct.role         AS dm_role,
                ct.phone        AS dm_phone,
                ct.email        AS dm_email
            FROM lu_daily_assignments a
            JOIN lu_companies c ON c.id = a.company_id
            LEFT JOIN lu_contacts ct ON ct.company_id = c.id AND ct.is_primary = true
            WHERE a.user_id = $1
              AND a.notes IS NOT NULL
              AND a.notes != ''
            ORDER BY a.assigned_date DESC, c.name ASC
            """,
            uid,
        )
    return [dict(r) for r in rows]
