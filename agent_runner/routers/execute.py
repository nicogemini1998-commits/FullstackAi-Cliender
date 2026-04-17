from __future__ import annotations
import asyncio
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from ..auth import verify_token
from ..websocket_manager import ws_manager
from ..services.flow_runner import run_flow
from ..services.redis_queue import subscribe_run_events

router = APIRouter(prefix="/execute", tags=["execute"])
limiter = Limiter(key_func=get_remote_address)


class ExecuteRequest(BaseModel):
    flow_id: str
    input: str = ""
    background: bool = False  # True = dispara y devuelve run_id inmediatamente


@router.post("/")
async def execute_flow(body: ExecuteRequest, user: dict = Depends(verify_token)):
    """
    Ejecuta un flujo.
    - background=False (default): espera resultado completo (útil para LeadUp scheduler)
    - background=True: devuelve run_id inmediatamente, sigue via WebSocket
    """
    if body.background:
        loop = asyncio.get_event_loop()
        task = loop.create_task(
            run_flow(body.flow_id, body.input, user.get("id"))
        )
        # No esperamos — devolvemos run_id cuando esté disponible
        # El cliente sigue el progreso via /execute/ws/{run_id}
        return {"status": "started", "message": "Flujo iniciado en background"}

    try:
        result = await run_flow(body.flow_id, body.input, user.get("id"))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/by-name/{flow_name}")
async def execute_flow_by_name(
    flow_name: str,
    body: dict,
    user: dict = Depends(verify_token),
):
    """
    Ejecuta un flujo por nombre (útil para LeadUp: POST /execute/by-name/LeadUp).
    Body: { "input": "...", "background": false }
    """
    from ..database import db_conn
    async with db_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM flows WHERE LOWER(name) = LOWER($1) LIMIT 1", flow_name
        )
    if not row:
        raise HTTPException(status_code=404, detail=f"Flujo '{flow_name}' no encontrado")

    input_text = body.get("input", "")
    background = body.get("background", False)

    if background:
        asyncio.get_event_loop().create_task(
            run_flow(str(row["id"]), input_text, user.get("id"))
        )
        return {"status": "started", "flow_id": str(row["id"])}

    try:
        result = await run_flow(str(row["id"]), input_text, user.get("id"))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/{node_id}")
async def node_websocket(node_id: str, websocket: WebSocket):
    """WebSocket por nodo — el frontend se conecta aquí para ver streaming en tiempo real."""
    await ws_manager.connect(node_id, websocket)
    try:
        while True:
            # Mantiene conexión viva — solo recibe pings del cliente
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(node_id, websocket)


@router.get("/events/{run_id}")
async def stream_run_events(run_id: str, user: dict = Depends(verify_token)):
    """SSE stream de eventos de un run_id (alternativa a WebSocket para clientes HTTP)."""
    async def event_generator():
        async for event in subscribe_run_events(run_id):
            import json
            yield f"data: {json.dumps(event)}\n\n"
            if event.get("event") in ("run_completed", "run_error"):
                break

    return StreamingResponse(event_generator(), media_type="text/event-stream")
