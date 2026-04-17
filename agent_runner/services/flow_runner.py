from __future__ import annotations
import asyncio
import json
import uuid
from typing import Optional
from datetime import datetime, timezone
from ..database import db_conn
from ..websocket_manager import ws_manager
from ..services.agent_service import stream_agent, run_agent
from ..services.redis_queue import NodeQueue, publish_run_event
from ..services.apollo_service import search_leads
from ..services.scraping_service import analyze_website
from ..services.apify_service import enrich_companies_with_gmb, search_businesses_on_maps


def _strip_code_blocks(text: str) -> str:
    """Elimina markdown code blocks que Claude añade alrededor del JSON."""
    s = text.strip()
    if s.startswith("```"):
        lines = s.split("\n")
        # quitar primera línea (```json o ```) y última (```)
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        return "\n".join(inner).strip()
    return s


def _parse_json_safe(text: str) -> list:
    """Parsea JSON limpiando code blocks primero. Devuelve [] si falla."""
    try:
        return json.loads(_strip_code_blocks(text))
    except (json.JSONDecodeError, ValueError):
        return []


def _safe_uuid(v: Optional[str]):
    try:
        return uuid.UUID(v) if v else None
    except (ValueError, AttributeError):
        return None


def _parse_input_params(text: str) -> dict:
    """Parsea 'sector:restaurantes ciudad:Madrid cantidad:10' → dict."""
    result = {}
    for part in text.strip().split():
        if ":" in part:
            k, _, v = part.partition(":")
            result[k.lower()] = v
    return result


async def _get_ordered_nodes(flow_id: str) -> list[dict]:
    """Devuelve nodos activos ordenados (order_index < 90 = activos)."""
    async with db_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id, node_type, label, system_prompt, config, order_index
            FROM flow_nodes
            WHERE flow_id = $1 AND order_index < 90
            ORDER BY order_index ASC
            """,
            uuid.UUID(flow_id),
        )
    return [dict(r) for r in rows]


async def _create_run(flow_id: str, started_by: str, input_data: dict) -> str:
    async with db_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO flow_runs (flow_id, started_by, input_data, status)
            VALUES ($1, $2, $3, 'running')
            RETURNING id
            """,
            uuid.UUID(flow_id),
            _safe_uuid(started_by),
            json.dumps(input_data),
        )
    return str(row["id"])


async def _save_message(run_id: str, src_id: str, tgt_id: Optional[str], content: str):
    async with db_conn() as conn:
        await conn.execute(
            """
            INSERT INTO flow_messages (flow_run_id, source_node_id, target_node_id, content, status)
            VALUES ($1, $2, $3, $4, 'delivered')
            """,
            uuid.UUID(run_id),
            uuid.UUID(src_id),
            uuid.UUID(tgt_id) if tgt_id else None,
            content,
        )


async def _complete_run(run_id: str, output_data: dict, status: str = "completed"):
    async with db_conn() as conn:
        await conn.execute(
            """
            UPDATE flow_runs
            SET status = $1, completed_at = $2, output_data = $3
            WHERE id = $4
            """,
            status,
            datetime.utcnow(),
            json.dumps(output_data),
            uuid.UUID(run_id),
        )


async def run_flow(
    flow_id: str,
    initial_input: str,
    started_by: Optional[str] = None,
) -> dict:
    """
    Ejecuta un flujo nodo a nodo.
    - Cada nodo recibe el output del anterior como input.
    - Hace streaming token a token via WebSocket al nodo activo.
    - Guarda mensajes en DB y publica eventos Redis.
    Devuelve { run_id, output, status }.
    """
    nodes = await _get_ordered_nodes(flow_id)
    if not nodes:
        return {"error": "Flujo sin nodos"}

    run_id = await _create_run(flow_id, started_by or "", {"input": initial_input})
    ws_manager.register_run(run_id, [str(n["id"]) for n in nodes])

    await publish_run_event(run_id, {"event": "run_started", "run_id": run_id})

    current_input = initial_input
    final_output = ""

    try:
        for i, node in enumerate(nodes):
            node_id = str(node["id"])
            node_type = node["node_type"]
            system_prompt = node.get("system_prompt") or ""
            raw_config = node.get("config") or {}
            config = json.loads(raw_config) if isinstance(raw_config, str) else (raw_config or {})

            # Notificar nodo activo
            await ws_manager.send_to_node(node_id, {
                "type": "status",
                "status": "running",
                "run_id": run_id,
            })
            await publish_run_event(run_id, {
                "event": "node_started",
                "node_id": node_id,
                "label": node.get("label"),
            })

            next_node = nodes[i + 1] if i + 1 < len(nodes) else None
            next_id = str(next_node["id"]) if next_node else None

            if node_type == "trigger":
                # Trigger: pasa el input tal cual sin llamar a Claude
                output = current_input
                await ws_manager.send_to_node(node_id, {"type": "token", "data": f"▶ {current_input}"})
                await ws_manager.send_to_node(node_id, {"type": "done"})

            elif node_type == "apollo_agent":
                # Nodo especializado: llama Apollo API real
                params = _parse_input_params(current_input)
                leads = await search_leads(
                    sector=params.get("sector", config.get("sector", "empresas")),
                    city=params.get("ciudad", config.get("city", "Madrid")),
                    country=config.get("country", "ES"),
                    roles=config.get("roles"),
                    qty=int(params.get("cantidad", config.get("qty", 10))),
                )
                output = json.dumps(leads, ensure_ascii=False)
                preview = f"✅ Apollo: {len(leads)} empresas encontradas\n{output[:300]}..."
                await ws_manager.send_to_node(node_id, {"type": "token", "data": preview})
                await ws_manager.send_to_node(node_id, {"type": "done"})

            elif node_type == "apify_agent":
                # Si recibe string de parámetros (trigger) → fuente primaria de leads
                # Si recibe JSON array → enriquece GMB sobre empresas ya existentes
                prior = _parse_json_safe(current_input)
                params = _parse_input_params(current_input)
                if not prior and (params.get("sector") or params.get("ciudad")):
                    # MODO PRIMARIO: buscar negocios en Google Maps
                    sector = params.get("sector", config.get("sector", "restaurantes"))
                    city   = params.get("ciudad", config.get("city", "Madrid"))
                    qty    = int(params.get("cantidad", config.get("qty", 10)))
                    await ws_manager.send_to_node(node_id, {
                        "type": "token",
                        "data": f"📍 Buscando '{sector}' en {city} — {qty} negocios...",
                    })
                    companies = await search_businesses_on_maps(sector, city, qty)
                else:
                    # MODO ENRIQUECIMIENTO: añadir GMB a lista ya existente
                    companies = prior
                    await ws_manager.send_to_node(node_id, {
                        "type": "token",
                        "data": f"📍 Enriqueciendo {len(companies)} empresas con GMB...",
                    })
                    companies = await enrich_companies_with_gmb(companies)

                output = json.dumps(companies, ensure_ascii=False)
                await ws_manager.send_to_node(node_id, {
                    "type": "token",
                    "data": f"\n✅ Apify: {len(companies)} empresas obtenidas",
                })
                await ws_manager.send_to_node(node_id, {"type": "done"})

            elif node_type == "scraping_agent":
                # Nodo especializado: analiza webs con Scrapling real
                companies = _parse_json_safe(current_input)
                enriched = []
                for company in companies:
                    website = company.get("website") or ""
                    if website:
                        await ws_manager.send_to_node(node_id, {
                            "type": "token",
                            "data": f"\n🕷️  Analizando {website}...",
                        })
                        web_data = await asyncio.get_event_loop().run_in_executor(
                            None, analyze_website, website
                        )
                        company.update(web_data)
                    enriched.append(company)
                output = json.dumps(enriched, ensure_ascii=False)
                await ws_manager.send_to_node(node_id, {
                    "type": "token",
                    "data": f"\n✅ Scrapling: {len(enriched)} webs analizadas",
                })
                await ws_manager.send_to_node(node_id, {"type": "done"})

            elif node_type == "agent":
                # Nodo Claude genérico — streaming token a token
                prompt = system_prompt.format(**config) if config else system_prompt
                model = config.get("model", "claude-haiku-4-5-20251001")
                max_tokens = config.get("max_tokens", 4096)

                output_parts = []
                async for token in stream_agent(prompt, current_input, model, max_tokens):
                    output_parts.append(token)
                    await ws_manager.send_to_node(node_id, {"type": "token", "data": token})

                output = "".join(output_parts)
                await ws_manager.send_to_node(node_id, {"type": "done"})

            elif node_type == "text":
                # Nodo texto estático — inyecta contexto fijo
                output = f"{config.get('content', '')}\n\n{current_input}"

            elif node_type == "condition":
                # Rama simple: si contiene keyword → rama A, sino → rama B
                keyword = config.get("keyword", "")
                output = current_input
                branch = "A" if keyword.lower() in current_input.lower() else "B"
                await ws_manager.send_to_node(node_id, {
                    "type": "condition_result",
                    "branch": branch,
                })

            elif node_type == "output":
                # Nodo final — no llama a Claude, solo captura y guarda
                output = current_input
                await ws_manager.send_to_node(node_id, {
                    "type": "token",
                    "data": f"\n✅ Output guardado:\n{output[:500]}...",
                })
                await ws_manager.send_to_node(node_id, {"type": "done"})

            else:
                output = current_input

            await _save_message(run_id, node_id, next_id, output)
            await publish_run_event(run_id, {
                "event": "node_completed",
                "node_id": node_id,
                "output_preview": output[:200],
            })

            await ws_manager.send_to_node(node_id, {"type": "status", "status": "completed"})
            current_input = output
            final_output = output

        await _complete_run(run_id, {"output": final_output}, "completed")
        await publish_run_event(run_id, {"event": "run_completed", "run_id": run_id})
        ws_manager.unregister_run(run_id)

        return {"run_id": run_id, "output": final_output, "status": "completed"}

    except Exception as e:
        await _complete_run(run_id, {"error": str(e)}, "error")
        await publish_run_event(run_id, {"event": "run_error", "run_id": run_id, "error": str(e)})
        ws_manager.unregister_run(run_id)
        raise
