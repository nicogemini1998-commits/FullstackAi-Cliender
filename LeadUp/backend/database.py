from __future__ import annotations
import asyncpg
from contextlib import asynccontextmanager
from typing import Optional
from .config import get_settings

_pool: Optional[asyncpg.Pool] = None


async def init_pool():
    global _pool
    s = get_settings()
    _pool = await asyncpg.create_pool(
        host=s.db_host, port=s.db_port, database=s.db_name,
        user=s.db_user, password=s.db_password,
        min_size=2, max_size=10,
    )


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool no inicializado")
    return _pool


@asynccontextmanager
async def db_conn():
    async with get_pool().acquire() as conn:
        yield conn


SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS lu_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  DEFAULT 'commercial',
    active        BOOLEAN      DEFAULT TRUE,
    created_at    TIMESTAMP    DEFAULT NOW(),
    last_login    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lu_companies (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(255) NOT NULL,
    website            VARCHAR(255),
    sector             VARCHAR(100),
    city               VARCHAR(100),
    employee_count     INTEGER,
    digital_score      INTEGER,
    gmb_rating         FLOAT,
    gmb_reviews        INTEGER,
    has_crm            VARCHAR(50),
    social_facebook    VARCHAR(255),
    social_linkedin    VARCHAR(255),
    social_instagram   VARCHAR(255),
    has_facebook_pixel BOOLEAN DEFAULT FALSE,
    has_google_ads     BOOLEAN DEFAULT FALSE,
    seo_score          INTEGER DEFAULT 0,
    opportunity_level  VARCHAR(10),
    opportunity_sales  TEXT,
    opportunity_tech   TEXT,
    opportunity_av     TEXT,
    summary            TEXT,
    redes_sociales     TEXT,
    captacion_leads    TEXT,
    email_marketing    TEXT,
    video_contenido    TEXT,
    seo_info           TEXT,
    oportunidad_hbd    TEXT,
    raw_data           JSONB,
    enriched_at        TIMESTAMP DEFAULT NOW(),
    created_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lu_contacts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID REFERENCES lu_companies(id) ON DELETE CASCADE,
    name           VARCHAR(255),
    role           VARCHAR(100),
    email          VARCHAR(255),
    phone          VARCHAR(50),
    phone_source   VARCHAR(50),
    linkedin_url   VARCHAR(255),
    is_primary     BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS lu_call_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID REFERENCES lu_companies(id) ON DELETE CASCADE,
    contact_id    UUID REFERENCES lu_contacts(id),
    commercial_id UUID REFERENCES lu_users(id),
    status        VARCHAR(20),   -- closed / rejected / no_answer
    notes         TEXT,
    called_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_enriched ON lu_companies(enriched_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_company   ON lu_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_logs_company       ON lu_call_logs(company_id);
"""


async def run_migrations():
    async with db_conn() as conn:
        await conn.execute(SCHEMA_SQL)
    print("✅ Migración LeadUp completada")
