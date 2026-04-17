from __future__ import annotations
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from ..config import get_settings
from .enrichment import run_enrichment

_scheduler: AsyncIOScheduler | None = None


async def _daily_enrichment():
    s = get_settings()
    print(f"⏰ Scheduler 8am — Iniciando enriquecimiento LeadUp")
    result = await run_enrichment(
        sector=s.enrichment_sector,
        city=s.enrichment_city,
        qty=s.enrichment_qty,
    )
    print(f"✅ Enriquecimiento completado: {result}")


def start_scheduler():
    global _scheduler
    s = get_settings()
    _scheduler = AsyncIOScheduler(timezone="Europe/Madrid")
    _scheduler.add_job(
        _daily_enrichment,
        CronTrigger(hour=s.enrichment_cron_hour, minute=0),
        id="daily_enrichment",
        replace_existing=True,
    )
    _scheduler.start()
    print(f"⏰ Scheduler activo — enriquecimiento diario a las {s.enrichment_cron_hour}:00")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown()
