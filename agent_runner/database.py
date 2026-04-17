from __future__ import annotations
import asyncpg
from contextlib import asynccontextmanager
from typing import Optional
from .config import get_settings

_pool: Optional[asyncpg.Pool] = None


async def init_pool() -> asyncpg.Pool:
    global _pool
    s = get_settings()
    _pool = await asyncpg.create_pool(
        host=s.db_host,
        port=s.db_port,
        database=s.db_name,
        user=s.db_user,
        password=s.db_password,
        min_size=2,
        max_size=10,
    )
    return _pool


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
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn


# ── Migración: crea las tablas del agent runner si no existen ─────────────────
SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS flows (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    status      VARCHAR(20)  DEFAULT 'idle',
    created_by  UUID,
    created_at  TIMESTAMP    DEFAULT NOW(),
    updated_at  TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_nodes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id       UUID REFERENCES flows(id) ON DELETE CASCADE,
    node_type     VARCHAR(50)  NOT NULL,
    label         VARCHAR(100),
    system_prompt TEXT,
    position_x    FLOAT DEFAULT 0,
    position_y    FLOAT DEFAULT 0,
    config        JSONB DEFAULT '{}'::jsonb,
    order_index   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS flow_edges (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id        UUID REFERENCES flows(id) ON DELETE CASCADE,
    source_node_id UUID REFERENCES flow_nodes(id) ON DELETE CASCADE,
    target_node_id UUID REFERENCES flow_nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flow_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id      UUID REFERENCES flows(id),
    started_by   UUID,
    started_at   TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status       VARCHAR(20) DEFAULT 'running',
    input_data   JSONB DEFAULT '{}'::jsonb,
    output_data  JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS flow_messages (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_run_id    UUID REFERENCES flow_runs(id) ON DELETE CASCADE,
    source_node_id UUID REFERENCES flow_nodes(id),
    target_node_id UUID REFERENCES flow_nodes(id),
    content        TEXT,
    status         VARCHAR(20) DEFAULT 'pending',
    created_at     TIMESTAMP DEFAULT NOW()
);
"""


async def run_migrations():
    async with db_conn() as conn:
        await conn.execute(SCHEMA_SQL)
    print("✅ Migración agent_runner completada")
