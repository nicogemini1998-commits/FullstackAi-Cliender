from __future__ import annotations
import random
import uuid
from datetime import date, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..database import db_conn
from .apollo_leads import fetch_leads_for_user, save_lead_to_db, CLIENDER_SECTORS

_scheduler: AsyncIOScheduler | None = None

LEADS_PER_USER   = 15     # leads nuevos reales por usuario/día
MAX_PER_SESSION  = 150    # máximo acumulado por sesión
RETRY_AFTER_DAYS = 3
MAX_RETRIES      = 3


async def _get_active_commercials() -> list[dict]:
    async with db_conn() as conn:
        rows = await conn.fetch(
            "SELECT id, name, email FROM lu_users WHERE active=TRUE ORDER BY role, name"
        )
    return [dict(r) for r in rows]


async def _get_retry_leads(user_id: str, limit: int = 3) -> list[str]:
    today = date.today()
    async with db_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id FROM lu_companies c
            JOIN lu_daily_assignments a ON a.company_id=c.id
            WHERE a.user_id=$1
              AND a.status='no_answer'
              AND c.attempt_count < $2
              AND (c.next_attempt_date IS NULL OR c.next_attempt_date <= $3)
              AND c.id NOT IN (
                  SELECT company_id FROM lu_daily_assignments
                  WHERE user_id=$1 AND assigned_date=$3
              )
            ORDER BY c.next_attempt_date NULLS FIRST
            LIMIT $4
            """,
            user_id, MAX_RETRIES, today, limit
        )
    return [str(r["id"]) for r in rows]


async def _assign_to_user(user_id: str, company_id: str):
    async with db_conn() as conn:
        await conn.execute(
            """
            INSERT INTO lu_daily_assignments (user_id, company_id, assigned_date, status)
            VALUES ($1,$2,CURRENT_DATE,'pending')
            ON CONFLICT (user_id, company_id, assigned_date) DO NOTHING
            """,
            user_id, company_id
        )


async def _already_assigned_today(company_id: str) -> bool:
    async with db_conn() as conn:
        row = await conn.fetchrow(
            "SELECT 1 FROM lu_daily_assignments WHERE company_id=$1 AND assigned_date=CURRENT_DATE",
            company_id
        )
    return row is not None


async def _fetch_real_leads(slots: int, page_offset: int = 1) -> list[str]:
    """
    Pipeline completo: Apollo (paginado) → Scrapling → Claude → BD.
    page_offset permite que cada usuario obtenga resultados de páginas distintas.
    """
    saved_ids: list[str] = []
    sectors = CLIENDER_SECTORS[:]
    random.shuffle(sectors)

    for sector_cfg in sectors:
        if len(saved_ids) >= slots:
            break
        tag    = sector_cfg["tag"]
        cities = sector_cfg["cities"][:]
        random.shuffle(cities)

        for city in cities:
            if len(saved_ids) >= slots:
                break
            needed = slots - len(saved_ids)
            try:
                leads = await fetch_leads_for_user(
                    tag, city, qty=needed + 5, page=page_offset
                )
                for lead in leads:
                    if len(saved_ids) >= slots:
                        break
                    cid = await save_lead_to_db(lead)
                    if cid and not await _already_assigned_today(cid):
                        saved_ids.append(cid)
            except Exception as e:
                print(f"   [Pipeline] {tag}/{city}: {e}")

    return saved_ids


async def _daily_assignment():
    users = await _get_active_commercials()
    if not users:
        print("⏰ Scheduler: sin comerciales activos")
        return

    print(f"⏰ Scheduler diario: {len(users)} comerciales")

    for idx, user in enumerate(users):
        uid  = str(user["id"])
        name = user["name"]

        async with db_conn() as conn:
            existing_count = await conn.fetchval(
                "SELECT COUNT(*) FROM lu_daily_assignments WHERE user_id=$1 AND assigned_date=CURRENT_DATE",
                uid
            )
        already = int(existing_count or 0)
        can_add = max(0, MAX_PER_SESSION - already)
        if can_add == 0:
            print(f"   {name}: ya tiene {already} leads (máx {MAX_PER_SESSION})")
            continue

        # 1. Reintentos pendientes
        retries = await _get_retry_leads(uid, limit=3)
        for cid in retries:
            await _assign_to_user(uid, cid)
            async with db_conn() as conn:
                await conn.execute(
                    "UPDATE lu_companies SET attempt_count=attempt_count+1, next_attempt_date=NULL WHERE id=$1",
                    cid
                )

        # 2. Leads reales — cada usuario usa una página distinta de Apollo
        slots      = min(LEADS_PER_USER - len(retries), can_add - len(retries))
        page_off   = 1 + (idx * 2)   # usuario 0→p1, 1→p3, 2→p5, 3→p7, 4→p9
        company_ids = await _fetch_real_leads(slots, page_offset=page_off)

        for cid in company_ids:
            await _assign_to_user(uid, cid)

        total = len(retries) + len(company_ids)
        print(f"   {name}: {len(retries)} reintentos + {len(company_ids)} nuevos reales = {total} leads")

    print("✅ Asignación diaria completada")


async def assign_more_for_user(user_id: str, user_name: str) -> int:
    async with db_conn() as conn:
        existing = await conn.fetchval(
            "SELECT COUNT(*) FROM lu_daily_assignments WHERE user_id=$1 AND assigned_date=CURRENT_DATE",
            user_id
        )
    already  = int(existing or 0)
    can_add  = MAX_PER_SESSION - already
    if can_add <= 0:
        return 0

    slots      = min(can_add, LEADS_PER_USER)
    company_ids = await _fetch_real_leads(slots)
    assigned   = 0
    for cid in company_ids:
        if not await _already_assigned_today(cid):
            await _assign_to_user(user_id, cid)
            assigned += 1

    print(f"   Más leads para {user_name}: {assigned} asignados (real)")
    return assigned


# ── Retención 10 días ─────────────────────────────────────────────────────────
RETENTION_DAYS   = 10
AGENDADO_DAYS    = 60

async def _cleanup_old_leads():
    cutoff_normal   = date.today() - timedelta(days=RETENTION_DAYS)
    cutoff_agendado = date.today() - timedelta(days=AGENDADO_DAYS)
    async with db_conn() as conn:
        r1 = await conn.execute(
            "DELETE FROM lu_daily_assignments WHERE assigned_date < $1 AND status NOT IN ('agendado','pending')",
            cutoff_normal,
        )
        r2 = await conn.execute(
            "DELETE FROM lu_daily_assignments WHERE assigned_date < $1 AND status='agendado'",
            cutoff_agendado,
        )
        r3 = await conn.execute(
            """
            DELETE FROM lu_companies
            WHERE created_at::date < $1
              AND id NOT IN (
                SELECT DISTINCT company_id FROM lu_daily_assignments
                WHERE status IN ('agendado','pending','no_answer')
              )
            """,
            cutoff_normal,
        )
    print(f"🧹 Limpieza: {r1} asignaciones | {r2} agendados expirados | {r3} empresas antiguas")


async def trigger_daily_assignment():
    await _daily_assignment()


def start_scheduler():
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="Europe/Madrid")
    _scheduler.add_job(
        _daily_assignment,
        CronTrigger(hour=8, minute=0),
        id="daily_leads",
        replace_existing=True,
    )
    _scheduler.add_job(
        _cleanup_old_leads,
        CronTrigger(hour=2, minute=0),
        id="cleanup_leads",
        replace_existing=True,
    )
    _scheduler.start()
    print("⏰ Scheduler activo — asignación 08:00 · limpieza 02:00 (retención 10 días)")
