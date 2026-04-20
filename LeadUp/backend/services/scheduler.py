from __future__ import annotations
import random
from datetime import date, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import get_settings
from ..database import db_conn
from .apollo_leads import fetch_leads_for_user, save_lead_to_db, CLIENDER_SECTORS

_scheduler: AsyncIOScheduler | None = None

LEADS_PER_USER  = 12   # leads nuevos por usuario/día
RETRY_AFTER_DAYS = 3   # reintentar no_answer tras X días
MAX_RETRIES     = 3    # máx intentos antes de descartar


async def _get_active_commercials() -> list[dict]:
    async with db_conn() as conn:
        rows = await conn.fetch(
            "SELECT id, name, email FROM lu_users WHERE active=TRUE ORDER BY role, name"
        )
    return [dict(r) for r in rows]


async def _get_retry_leads(user_id: str, limit: int = 3) -> list[str]:
    """Empresas con no_answer que toca reintentar hoy."""
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


async def _already_assigned(company_id: str) -> bool:
    """Evita duplicar empresas entre usuarios."""
    async with db_conn() as conn:
        row = await conn.fetchrow(
            "SELECT 1 FROM lu_daily_assignments WHERE company_id=$1 AND assigned_date=CURRENT_DATE",
            company_id
        )
    return row is not None


# Ciudades de España para rotación diaria
_SPAIN_CITIES = [
    "Madrid","Barcelona","Valencia","Sevilla","Zaragoza","Málaga",
    "Murcia","Palma","Las Palmas","Bilbao","Alicante","Córdoba",
    "Valladolid","Vigo","Gijón","Hospitalet","A Coruña","Vitoria",
    "Granada","Elche","Oviedo","Santa Cruz","Pamplona","Almería",
    "Fuenlabrada","Leganés","San Sebastián","Burgos","Santander","Albacete",
]

async def _daily_assignment():
    """
    Corre cada día a las 8am.
    Por cada comercial activo:
      1. Reintentos no_answer pendientes (hasta 3)
      2. Leads nuevos de Apollo (sectores rotativos CLIENDER)
    """
    s = get_settings()
    users = await _get_active_commercials()
    if not users:
        print("⏰ Scheduler: sin comerciales activos")
        return

    print(f"⏰ Scheduler diario: {len(users)} comerciales")

    # Rotación: cualquier nicho + cualquier ciudad de España
    day = date.today().toordinal()
    today_sector = CLIENDER_SECTORS[day % len(CLIENDER_SECTORS)]
    city         = _SPAIN_CITIES[day % len(_SPAIN_CITIES)]

    print(f"   Sector hoy: {today_sector['tag']} en {city} (España general)")

    # Obtener leads de Apollo para todos los usuarios
    leads_needed = LEADS_PER_USER * len(users)
    raw_leads = await fetch_leads_for_user(today_sector["tag"], city, qty=leads_needed + 10)
    print(f"   Leads obtenidos de Apollo: {len(raw_leads)}")

    # Guardar en DB y distribuir
    company_ids = []
    for lead in raw_leads:
        cid = await save_lead_to_db(lead)
        if cid and not await _already_assigned(cid):
            company_ids.append(cid)

    random.shuffle(company_ids)

    for i, user in enumerate(users):
        uid = str(user["id"])

        # 1. Reintentos
        retries = await _get_retry_leads(uid, limit=3)
        for cid in retries:
            await _assign_to_user(uid, cid)
            # Incrementar intento
            async with db_conn() as conn:
                await conn.execute(
                    "UPDATE lu_companies SET attempt_count=attempt_count+1, next_attempt_date=NULL WHERE id=$1",
                    cid
                )

        # 2. Leads nuevos
        batch_start = i * LEADS_PER_USER
        batch = company_ids[batch_start:batch_start + LEADS_PER_USER]
        for cid in batch:
            await _assign_to_user(uid, cid)

        total = len(retries) + len(batch)
        print(f"   {user['name']}: {len(retries)} reintentos + {len(batch)} nuevos = {total} leads")

    print("✅ Asignación diaria completada")


async def trigger_daily_assignment():
    """Disparar manualmente desde el endpoint admin."""
    await _daily_assignment()


def start_scheduler():
    global _scheduler
    s = get_settings()
    _scheduler = AsyncIOScheduler(timezone="Europe/Madrid")
    _scheduler.add_job(
        _daily_assignment,
        CronTrigger(hour=8, minute=0),
        id="daily_leads",
        replace_existing=True,
    )
    _scheduler.start()
    print(f"⏰ Scheduler activo — asignación diaria a las 08:00")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown()
