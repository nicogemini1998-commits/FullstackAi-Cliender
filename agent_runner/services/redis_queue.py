from __future__ import annotations
import json
import asyncio
from typing import Optional
import redis.asyncio as aioredis
from ..config import get_settings

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(
            get_settings().redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis


async def close_redis():
    global _redis
    if _redis:
        await _redis.close()


class NodeQueue:
    """Cola de mensajes entre nodos de un flow_run."""

    def __init__(self, run_id: str, node_id: str):
        self._key = f"fai:run:{run_id}:node:{node_id}"

    async def push(self, message: dict):
        r = await get_redis()
        await r.rpush(self._key, json.dumps(message))
        await r.expire(self._key, 3600)  # TTL 1h

    async def pop(self, timeout: int = 60) -> Optional[dict]:
        r = await get_redis()
        result = await r.blpop(self._key, timeout=timeout)
        if result is None:
            return None
        _, raw = result
        return json.loads(raw)

    async def clear(self):
        r = await get_redis()
        await r.delete(self._key)


async def publish_run_event(run_id: str, event: dict):
    """Publica eventos de un run para observadores externos (LeadUp scheduler)."""
    r = await get_redis()
    channel = f"fai:events:{run_id}"
    await r.publish(channel, json.dumps(event))


async def subscribe_run_events(run_id: str):
    """Generator que escucha eventos de un run_id."""
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(f"fai:events:{run_id}")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                yield json.loads(message["data"])
    finally:
        await pubsub.unsubscribe()
        await pubsub.close()
