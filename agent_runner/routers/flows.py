from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..database import db_conn
from ..auth import verify_token

router = APIRouter(prefix="/flows", tags=["flows"])


class FlowCreate(BaseModel):
    name: str
    description: str = ""


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


@router.get("/")
async def list_flows(user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        rows = await conn.fetch(
            "SELECT id, name, description, status, created_at FROM flows ORDER BY created_at DESC"
        )
    return [dict(r) for r in rows]


@router.get("/{flow_id}")
async def get_flow(flow_id: str, user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        flow = await conn.fetchrow(
            "SELECT * FROM flows WHERE id = $1", uuid.UUID(flow_id)
        )
        if not flow:
            raise HTTPException(status_code=404, detail="Flujo no encontrado")
        nodes = await conn.fetch(
            "SELECT * FROM flow_nodes WHERE flow_id = $1 ORDER BY order_index", uuid.UUID(flow_id)
        )
        edges = await conn.fetch(
            "SELECT * FROM flow_edges WHERE flow_id = $1", uuid.UUID(flow_id)
        )
    return {
        **dict(flow),
        "nodes": [dict(n) for n in nodes],
        "edges": [dict(e) for e in edges],
    }


@router.post("/")
async def create_flow(body: FlowCreate, user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        row = await conn.fetchrow(
            "INSERT INTO flows (name, description, created_by) VALUES ($1, $2, $3) RETURNING *",
            body.name,
            body.description,
            uuid.UUID(user["id"]) if user.get("id") and user["id"] != "local" else None,
        )
    return dict(row)


@router.put("/{flow_id}")
async def update_flow(flow_id: str, body: FlowUpdate, user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        row = await conn.fetchrow(
            """
            UPDATE flows
            SET name        = COALESCE($1, name),
                description = COALESCE($2, description),
                updated_at  = NOW()
            WHERE id = $3
            RETURNING *
            """,
            body.name, body.description, uuid.UUID(flow_id),
        )
        if not row:
            raise HTTPException(status_code=404, detail="Flujo no encontrado")
    return dict(row)


@router.delete("/{flow_id}")
async def delete_flow(flow_id: str, user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        result = await conn.execute(
            "DELETE FROM flows WHERE id = $1", uuid.UUID(flow_id)
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Flujo no encontrado")
    return {"ok": True}


@router.get("/{flow_id}/runs")
async def get_flow_runs(flow_id: str, user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id, status, started_at, completed_at, input_data, output_data
            FROM flow_runs WHERE flow_id = $1
            ORDER BY started_at DESC LIMIT 50
            """,
            uuid.UUID(flow_id),
        )
    return [dict(r) for r in rows]
