from __future__ import annotations
import random
import uuid
import httpx
from datetime import date, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..database import db_conn
from .dummy_leads import generate_leads_for_user

# Apollo API
APOLLO_KEY = "PDFmEmLlq5tiVYwgd-289g"
APOLLO_BASE = "https://api.apollo.io/api/v1"

_scheduler: AsyncIOScheduler | None = None

LEADS_PER_USER  = 100  # leads nuevos por usuario/día
MAX_PER_SESSION = 10000  # máximo leads por sesión
RETRY_AFTER_DAYS = 3   # reintentar no_answer tras X días
MAX_RETRIES     = 3    # máx intentos antes de descartar


async def _get_active_commercials() -> list[dict]:
    async with db_conn() as conn:
        rows = await conn.fetch(
            "SELECT id, name, email FROM lu_users WHERE active=TRUE ORDER BY role, name"
        )
    return [dict(r) for r in rows]


async def _fetch_apollo_leads(qty: int = 20) -> list[dict]:
    """Obtiene leads reales de Apollo API."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{APOLLO_BASE}/mixed_people/api_search",
                headers={"x-api-key": APOLLO_KEY, "Content-Type": "application/json"},
                json={
                    "person_titles": ["CEO", "Fundador", "Director General", "Director Comercial"],
                    "person_locations": ["Spain"],
                    "organization_num_employees_ranges": ["5,300"],
                    "per_page": min(qty * 2, 100),
                    "page": 1,
                },
            )
            search = resp.json()
            people = search.get("people", [])

            if not people:
                return []

            # Enriquecer con bulk_match
            ids = [p["id"] for p in people[:qty]]
            if ids:
                er = await client.post(
                    f"{APOLLO_BASE}/people/bulk_match",
                    headers={"x-api-key": APOLLO_KEY, "Content-Type": "application/json"},
                    json={"details": [{"id": i} for i in ids], "reveal_personal_emails": True},
                )
                enriched = er.json().get("matches", [])
            else:
                enriched = []

            # Convertir a formato de lead
            leads = []
            for p in enriched[:qty]:
                if not p:
                    continue
                org = p.get("organization") or {}
                leads.append({
                    "id": str(uuid.uuid4()),
                    "name": org.get("name") or p.get("organization_name") or "Unknown",
                    "website": org.get("website_url") or org.get("primary_domain") or f"https://{p.get('company_domain', 'example.com')}",
                    "sector": org.get("industry") or "Tecnología",
                    "city": org.get("city") or org.get("state") or "Madrid",
                    "digital_score": random.randint(40, 95),
                    "opportunity_level": random.choice(["ALTA", "MEDIA", "BAJA"]),
                    "summary": f"Empresa en {org.get('city', 'España')}. {org.get('employee_count', '50')} empleados.",
                    "contacts": [{
                        "name": f"{p.get('first_name', 'Contact')} {p.get('last_name', '')}".strip(),
                        "role": p.get("title") or "Director",
                        "email": p.get("email") or f"info@{org.get('primary_domain', 'example.com')}",
                        "phone": org.get("phone") or "",
                        "is_primary": True,
                    }],
                })
            return leads
    except Exception as e:
        print(f"Apollo fetch error: {e}")
        return []


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
      2. Leads nuevos (dummy para demo)
    """
    users = await _get_active_commercials()
    if not users:
        print("⏰ Scheduler: sin comerciales activos")
        return

    print(f"⏰ Scheduler diario: {len(users)} comerciales")

    # Cada usuario recibe leads
    for idx, user in enumerate(users):
        uid  = str(user["id"])
        name = user["name"]

        # Comprobar cuántos ya tiene hoy
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

        # Reintentos primero
        retries = await _get_retry_leads(uid, limit=3)
        for cid in retries:
            await _assign_to_user(uid, cid)
            async with db_conn() as conn:
                await conn.execute(
                    "UPDATE lu_companies SET attempt_count=attempt_count+1, next_attempt_date=NULL WHERE id=$1",
                    cid
                )

        # Intentar Apollo primero, fallback a dummy
        slots = min(LEADS_PER_USER - len(retries), can_add - len(retries))
        apollo_leads = await _fetch_apollo_leads(slots + 10)
        leads_to_assign = apollo_leads if apollo_leads else await generate_leads_for_user(slots + 5)

        batch = []
        async with db_conn() as conn:
            for lead in leads_to_assign:
                if len(batch) >= slots:
                    break

                # Inserta company
                cid = str(lead["id"])
                try:
                    await conn.execute(
                        """
                        INSERT INTO lu_companies (id, name, website, sector, city, digital_score, opportunity_level, summary)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        cid, lead["name"], lead["website"], lead["sector"], lead["city"],
                        lead["digital_score"], lead["opportunity_level"], lead["summary"]
                    )

                    # Inserta contact
                    if lead.get("contacts"):
                        contact = lead["contacts"][0]
                        await conn.execute(
                            """
                            INSERT INTO lu_contacts (id, company_id, name, role, email, phone, is_primary)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                            """,
                            str(uuid.uuid4()), cid, contact["name"], contact["role"],
                            contact["email"], contact["phone"], True
                        )

                    # Asigna al usuario
                    await _assign_to_user(uid, cid)
                    batch.append(cid)
                except Exception as e:
                    print(f"      Error insertando lead: {e}")

        total = len(retries) + len(batch)
        print(f"   {name}: {len(retries)} reintentos + {len(batch)} nuevos = {total} leads")

    print("✅ Asignación diaria completada")


async def assign_more_for_user(user_id: str, user_name: str) -> int:
    """
    Asigna más leads a un usuario específico cuando ya agotó su cola.
    Intenta Apollo primero, fallback a dummy leads.
    """
    async with db_conn() as conn:
        existing = await conn.fetchval(
            "SELECT COUNT(*) FROM lu_daily_assignments WHERE user_id=$1 AND assigned_date=CURRENT_DATE",
            user_id
        )
    already = int(existing or 0)
    can_add = MAX_PER_SESSION - already
    if can_add <= 0:
        return 0

    qty = min(can_add, LEADS_PER_USER)

    # Intentar Apollo primero
    raw_leads = await _fetch_apollo_leads(qty + 5)
    if not raw_leads:
        raw_leads = await generate_leads_for_user(qty + 5)

    assigned = 0
    async with db_conn() as conn:
        for lead in raw_leads:
            if assigned >= can_add:
                break

            cid = str(lead["id"])
            if await _already_assigned(cid):
                continue

            try:
                await conn.execute(
                    """
                    INSERT INTO lu_companies (id, name, website, sector, city, digital_score, opportunity_level, summary)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    cid, lead["name"], lead["website"], lead["sector"], lead["city"],
                    lead["digital_score"], lead["opportunity_level"], lead["summary"]
                )

                if lead.get("contacts"):
                    contact = lead["contacts"][0]
                    await conn.execute(
                        """
                        INSERT INTO lu_contacts (id, company_id, name, role, email, phone, is_primary)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        """,
                        str(uuid.uuid4()), cid, contact["name"], contact["role"],
                        contact["email"], contact["phone"], True
                    )

                await _assign_to_user(user_id, cid)
                assigned += 1
            except Exception as e:
                print(f"      Error: {e}")

    print(f"   Más leads para {user_name}: {assigned} asignados (Apollo+dummy)")
    return assigned


# ── Retención 10 días ─────────────────────────────────────────────────────────
RETENTION_DAYS  = 10   # días que se conserva un lead normal
AGENDADO_DAYS   = 60   # días que se conserva un lead agendado (negociación activa)

async def _cleanup_old_leads():
    """
    Limpieza nocturna:
    - Leads normales > 10 días: se borran (salvo agendados)
    - Leads agendados > 60 días: se borran
    - Se conservan TODAS las notas mientras el lead esté activo
    """
    cutoff_normal  = date.today() - timedelta(days=RETENTION_DAYS)
    cutoff_agendado = date.today() - timedelta(days=AGENDADO_DAYS)

    async with db_conn() as conn:
        # 1. Borrar asignaciones antiguas que NO son agendado
        r1 = await conn.execute(
            """
            DELETE FROM lu_daily_assignments
            WHERE assigned_date < $1
              AND status NOT IN ('agendado', 'pending')
            """,
            cutoff_normal,
        )

        # 2. Borrar asignaciones agendado muy antiguas (>60 días)
        r2 = await conn.execute(
            "DELETE FROM lu_daily_assignments WHERE assigned_date < $1 AND status='agendado'",
            cutoff_agendado,
        )

        # 3. Limpiar empresas huérfanas (sin asignaciones activas y sin leads agendados)
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
    """Disparar manualmente desde el endpoint admin."""
    await _daily_assignment()


def start_scheduler():
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="Europe/Madrid")

    # Asignación diaria 08:00
    _scheduler.add_job(
        _daily_assignment,
        CronTrigger(hour=8, minute=0),
        id="daily_leads",
        replace_existing=True,
    )

    # Limpieza nocturna 02:00 (retención 10 días)
    _scheduler.add_job(
        _cleanup_old_leads,
        CronTrigger(hour=2, minute=0),
        id="cleanup_leads",
        replace_existing=True,
    )

    _scheduler.start()
    print("⏰ Scheduler activo — asignación 08:00 · limpieza 02:00 (retención 10 días)")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown()
