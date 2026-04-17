from __future__ import annotations
import anthropic
from typing import AsyncIterator, Optional
from ..config import get_settings

_client: Optional[anthropic.AsyncAnthropic] = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=get_settings().anthropic_api_key)
    return _client


async def run_agent(
    system_prompt: str,
    user_message: str,
    model: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 4096,
) -> str:
    """Ejecuta un agente Claude y devuelve el output completo."""
    client = get_client()
    message = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    return message.content[0].text


async def stream_agent(
    system_prompt: str,
    user_message: str,
    model: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 4096,
) -> AsyncIterator[str]:
    """Ejecuta un agente Claude en streaming, yield token a token."""
    client = get_client()
    async with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
