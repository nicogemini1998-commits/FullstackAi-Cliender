from __future__ import annotations
import httpx
import jwt
from datetime import datetime, timedelta, timezone
from ..config import get_settings


def _get_service_token() -> str:
    """Genera un token de servicio interno para llamar al agent runner."""
    s = get_settings()
    if s.fullstackai_token:
        return s.fullstackai_token
    # Token de servicio auto-generado (rol admin, larga duración)
    return jwt.encode(
        {"id": "leadup-service", "username": "leadup", "role": "admin",
         "exp": datetime.now(timezone.utc) + timedelta(days=365)},
        "fullstackai_secret_key",   # JWT secret del agent_runner
        algorithm="HS256",
    )


async def trigger_enrichment(sector: str, city: str, qty: int) -> dict:
    """
    Llama a FullStackAI agent runner para ejecutar el flujo LeadUp.
    Devuelve el array de fichas enriquecidas como dict.
    """
    s = get_settings()
    token = _get_service_token()
    input_text = f"sector:{sector} ciudad:{city} cantidad:{qty}"

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(
                f"{s.fullstackai_url}/api/execute/by-name/LeadUp",
                json={"input": input_text, "background": False},
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException:
        return {"error": "Timeout — el flujo tardó más de 5 minutos"}
    except Exception as e:
        return {"error": str(e)}
