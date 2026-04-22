from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import date, timedelta
from ..auth import require_admin, verify_token
from ..services.enrichment import run_enrichment
from ..services.scheduler import trigger_daily_assignment
from ..database import db_conn
from ..config import get_settings

router = APIRouter(prefix="/admin", tags=["admin"])


class EnrichmentRequest(BaseModel):
    sector: str = ""
    city: str = ""
    qty: int = 10


class LeadSearchToggleRequest(BaseModel):
    enabled: bool


@router.post("/trigger-enrichment")
async def trigger_enrichment(body: EnrichmentRequest, user: dict = Depends(require_admin)):
    s = get_settings()
    result = await run_enrichment(
        sector=body.sector or s.enrichment_sector,
        city=body.city or s.enrichment_city,
        qty=body.qty,
    )
    return result


@router.patch("/lead-search-toggle")
async def toggle_lead_search(body: LeadSearchToggleRequest, user: dict = Depends(verify_token)):
    """Activa/desactiva búsqueda de leads para el usuario actual."""
    uid = user.get("id")
    async with db_conn() as conn:
        await conn.execute(
            "UPDATE lu_users SET lead_search_enabled=$1 WHERE id=$2",
            body.enabled, uid
        )
    return {"ok": True, "lead_search_enabled": body.enabled}


@router.get("/analytics")
async def get_analytics(days: int = 7, user: dict = Depends(require_admin)):
    """Analytics completo: stats globales + rendimiento por comercial."""
    since = date.today() - timedelta(days=days-1)

    async with db_conn() as conn:
        # Stats globales del período
        global_stats = await conn.fetchrow("""
            SELECT
                COUNT(DISTINCT a.company_id)                           AS total_leads,
                COUNT(DISTINCT a.id)                                   AS total_asignaciones,
                COUNT(*) FILTER (WHERE a.status='closed')              AS cerrados,
                COUNT(*) FILTER (WHERE a.status='rejected')            AS no_coge,
                COUNT(*) FILTER (WHERE a.status='no_answer')           AS no_contesta,
                COUNT(*) FILTER (WHERE a.status='pending')             AS pendientes,
                COUNT(DISTINCT a.user_id)                              AS comerciales_activos
            FROM lu_daily_assignments a
            WHERE a.assigned_date >= $1
        """, since)

        # Rendimiento por usuario
        by_user = await conn.fetch("""
            SELECT
                u.name,
                u.role,
                u.email,
                COUNT(a.id)                                            AS total,
                COUNT(*) FILTER (WHERE a.status='closed')              AS cerrados,
                COUNT(*) FILTER (WHERE a.status='rejected')            AS no_coge,
                COUNT(*) FILTER (WHERE a.status='no_answer')           AS no_contesta,
                COUNT(*) FILTER (WHERE a.status='pending')             AS pendientes,
                COUNT(a.id) FILTER (WHERE a.assigned_date=CURRENT_DATE) AS hoy
            FROM lu_users u
            LEFT JOIN lu_daily_assignments a ON a.user_id=u.id AND a.assigned_date >= $1
            WHERE u.active=true
            GROUP BY u.id, u.name, u.role, u.email
            ORDER BY cerrados DESC NULLS LAST, total DESC
        """, since)

        # Sectores más frecuentes
        sectors = await conn.fetch("""
            SELECT c.sector_tag sector, COUNT(*) n
            FROM lu_companies c
            GROUP BY c.sector_tag
            ORDER BY n DESC LIMIT 6
        """)

        # Ciudades
        cities = await conn.fetch("""
            SELECT c.city, COUNT(*) n
            FROM lu_companies c
            WHERE c.city IS NOT NULL
            GROUP BY c.city ORDER BY n DESC LIMIT 6
        """)

        # Evolución diaria (últimos 7 días)
        daily = await conn.fetch("""
            SELECT
                a.assigned_date::text dia,
                COUNT(*) total,
                COUNT(*) FILTER (WHERE a.status='closed') cerrados
            FROM lu_daily_assignments a
            WHERE a.assigned_date >= $1
            GROUP BY a.assigned_date ORDER BY a.assigned_date
        """, since)

    def pct(a, b): return round(a/b*100) if b > 0 else 0

    users_data = []
    for u in by_user:
        llamadas = (u["cerrados"] or 0) + (u["no_coge"] or 0) + (u["no_contesta"] or 0)
        conv = pct(u["cerrados"] or 0, llamadas)
        users_data.append({
            "name":         u["name"],
            "role":         u["role"],
            "email":        u["email"],
            "total":        u["total"] or 0,
            "hoy":          u["hoy"] or 0,
            "cerrados":     u["cerrados"] or 0,
            "no_coge":      u["no_coge"] or 0,
            "no_contesta":  u["no_contesta"] or 0,
            "pendientes":   u["pendientes"] or 0,
            "llamadas":     llamadas,
            "conversion":   conv,
        })

    g = global_stats
    total_llamadas = (g["cerrados"] or 0) + (g["no_coge"] or 0) + (g["no_contesta"] or 0)
    return {
        "periodo_dias":     days,
        "global": {
            "total_leads":          g["total_leads"] or 0,
            "total_asignaciones":   g["total_asignaciones"] or 0,
            "cerrados":             g["cerrados"] or 0,
            "no_coge":              g["no_coge"] or 0,
            "no_contesta":          g["no_contesta"] or 0,
            "pendientes":           g["pendientes"] or 0,
            "llamadas_realizadas":  total_llamadas,
            "conversion_global":    pct(g["cerrados"] or 0, total_llamadas),
            "comerciales_activos":  g["comerciales_activos"] or 0,
        },
        "por_usuario":  users_data,
        "sectores":     [{"sector": r["sector"] or "otro", "n": r["n"]} for r in sectors],
        "ciudades":     [{"city": r["city"], "n": r["n"]} for r in cities],
        "diario":       [{"dia": r["dia"], "total": r["total"], "cerrados": r["cerrados"]} for r in daily],
    }
