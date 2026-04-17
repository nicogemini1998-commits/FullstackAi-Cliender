from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Optional
from ..database import db_conn
from ..auth import verify_token

router = APIRouter(prefix="/nodes", tags=["nodes"])


class NodeCreate(BaseModel):
    flow_id: str
    node_type: str  # agent | terminal | text | condition | output | trigger
    label: str = ""
    system_prompt: str = ""
    position_x: float = 0
    position_y: float = 0
    config: dict[str, Any] = {}
    order_index: int = 0


class NodeUpdate(BaseModel):
    label: Optional[str] = None
    system_prompt: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    config: Optional[dict] = None
    order_index: Optional[int] = None


@router.get("/flow/{flow_id}")
async def list_nodes(flow_id: str, user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        rows = await conn.fetch(
            "SELECT * FROM flow_nodes WHERE flow_id = $1 ORDER BY order_index",
            uuid.UUID(flow_id),
        )
    return [dict(r) for r in rows]


@router.post("/")
async def create_node(body: NodeCreate, user: dict = Depends(verify_token)):
    # Sanitizar system_prompt contra prompt injection básico
    safe_prompt = body.system_prompt.replace("Ignore previous instructions", "")
    async with db_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO flow_nodes
                (flow_id, node_type, label, system_prompt, position_x, position_y, config, order_index)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING *
            """,
            uuid.UUID(body.flow_id),
            body.node_type,
            body.label,
            safe_prompt,
            body.position_x,
            body.position_y,
            body.config,
            body.order_index,
        )
    return dict(row)


@router.put("/{node_id}")
async def update_node(node_id: str, body: NodeUpdate, user: dict = Depends(verify_token)):
    safe_prompt = None
    if body.system_prompt is not None:
        safe_prompt = body.system_prompt.replace("Ignore previous instructions", "")
    async with db_conn() as conn:
        row = await conn.fetchrow(
            """
            UPDATE flow_nodes SET
                label         = COALESCE($1, label),
                system_prompt = COALESCE($2, system_prompt),
                position_x    = COALESCE($3, position_x),
                position_y    = COALESCE($4, position_y),
                config        = COALESCE($5, config),
                order_index   = COALESCE($6, order_index)
            WHERE id = $7
            RETURNING *
            """,
            body.label, safe_prompt, body.position_x, body.position_y,
            body.config, body.order_index, uuid.UUID(node_id),
        )
        if not row:
            raise HTTPException(status_code=404, detail="Nodo no encontrado")
    return dict(row)


@router.delete("/{node_id}")
async def delete_node(node_id: str, user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        await conn.execute("DELETE FROM flow_nodes WHERE id = $1", uuid.UUID(node_id))
    return {"ok": True}


@router.post("/edges")
async def create_edge(
    flow_id: str,
    source_node_id: str,
    target_node_id: str,
    user: dict = Depends(verify_token),
):
    async with db_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO flow_edges (flow_id, source_node_id, target_node_id)
            VALUES ($1,$2,$3) RETURNING *
            """,
            uuid.UUID(flow_id),
            uuid.UUID(source_node_id),
            uuid.UUID(target_node_id),
        )
    return dict(row)


@router.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str, user: dict = Depends(verify_token)):
    async with db_conn() as conn:
        await conn.execute("DELETE FROM flow_edges WHERE id = $1", uuid.UUID(edge_id))
    return {"ok": True}
