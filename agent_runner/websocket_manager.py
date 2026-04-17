import asyncio
from typing import AsyncIterator
from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        # node_id → lista de websockets (puede haber varios observadores)
        self._connections: dict[str, list[WebSocket]] = {}
        # run_id → set de node_ids activos
        self._runs: dict[str, set[str]] = {}

    async def connect(self, node_id: str, websocket: WebSocket):
        await websocket.accept()
        self._connections.setdefault(node_id, []).append(websocket)

    def disconnect(self, node_id: str, websocket: WebSocket):
        conns = self._connections.get(node_id, [])
        if websocket in conns:
            conns.remove(websocket)

    async def send_to_node(self, node_id: str, data: dict):
        dead = []
        for ws in self._connections.get(node_id, []):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(node_id, ws)

    async def stream_text_to_node(self, node_id: str, text_iter: AsyncIterator[str]):
        """Envía tokens de texto uno a uno para efecto terminal en tiempo real."""
        async for token in text_iter:
            await self.send_to_node(node_id, {"type": "token", "data": token})
        await self.send_to_node(node_id, {"type": "done"})

    async def broadcast_run(self, run_id: str, data: dict):
        """Broadcast a todos los nodos de un flow_run activo."""
        for node_id in self._runs.get(run_id, set()):
            await self.send_to_node(node_id, data)

    def register_run(self, run_id: str, node_ids: list[str]):
        self._runs[run_id] = set(node_ids)

    def unregister_run(self, run_id: str):
        self._runs.pop(run_id, None)


# Singleton global
ws_manager = WebSocketManager()
