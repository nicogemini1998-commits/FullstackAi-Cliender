#!/usr/bin/env python3
"""Actualiza los nodos del flujo LeadUp: Apify como fuente primaria."""
import asyncio, sys
sys.path.insert(0, '/var/www/fullstackai')
from agent_runner.database import init_pool, db_conn, run_migrations

ANALISTA_PROMPT = (
    "Eres un analista de negocio digital experto para un equipo comercial. "
    "Recibes un JSON array de empresas con datos de Google Maps y web scraping. "
    "Para CADA empresa genera estos campos adicionales: "
    "digital_score (int 0-100 basado en presencia digital real), "
    "opportunity_level (ALTA o MEDIA o BAJA), "
    "summary (2 frases sobre el negocio para el comercial), "
    "redes_sociales (describe que redes tiene y como las usa), "
    "captacion_leads (describe su sistema de captacion de clientes), "
    "email_marketing (describe si tiene email marketing y como), "
    "video_contenido (describe su produccion audiovisual), "
    "seo_info (describe su SEO y posicionamiento), "
    "oportunidad_hbd (texto: ALTA Score X/100 descripcion breve), "
    "opportunity_sales (3 bullets oportunidades Sales/CRM con impacto estimado), "
    "opportunity_tech (3 bullets oportunidades Tech/IA con impacto estimado), "
    "opportunity_av (3 bullets oportunidades Contenido AV con impacto). "
    "Devuelve el JSON array enriquecido. Solo JSON valido sin texto extra."
)


async def fix():
    await init_pool()
    await run_migrations()
    async with db_conn() as conn:
        flow = await conn.fetchrow(
            "SELECT id FROM flows WHERE LOWER(name)='leadup' LIMIT 1"
        )
        if not flow:
            print("Flujo LeadUp no encontrado")
            return
        fid = flow['id']

        await conn.execute(
            "UPDATE flow_nodes SET order_index=99 WHERE flow_id=$1 AND node_type='apollo_agent'",
            fid
        )
        print("Apollo desactivado (order_index=99)")

        await conn.execute(
            "UPDATE flow_nodes SET node_type='apify_agent', order_index=1, system_prompt='' "
            "WHERE flow_id=$1 AND label LIKE '%Apify%'",
            fid
        )
        print("Apify -> apify_agent, order_index=1")

        await conn.execute(
            "UPDATE flow_nodes SET order_index=2 WHERE flow_id=$1 AND node_type='scraping_agent'",
            fid
        )
        print("Scrapling -> order_index=2")

        await conn.execute(
            "UPDATE flow_nodes SET order_index=3, system_prompt=$2 "
            "WHERE flow_id=$1 AND label LIKE '%Analista%'",
            fid, ANALISTA_PROMPT
        )
        # Actualizar max_tokens separado
        await conn.execute(
            "UPDATE flow_nodes SET config = config::jsonb || $2::jsonb "
            "WHERE flow_id=$1 AND label LIKE '%Analista%'",
            fid, '{"max_tokens": 8192}'
        )
        print("Analista -> order_index=3, prompt actualizado, max_tokens=8192")

        await conn.execute(
            "UPDATE flow_nodes SET order_index=4 WHERE flow_id=$1 AND node_type='output'",
            fid
        )
        print("Output -> order_index=4")

        # Reconstruir edges
        await conn.execute("DELETE FROM flow_edges WHERE flow_id=$1", fid)
        for src, tgt in [(0,1),(1,2),(2,3),(3,4)]:
            await conn.execute(
                """INSERT INTO flow_edges (flow_id, source_node_id, target_node_id)
                   SELECT $1, a.id, b.id FROM flow_nodes a, flow_nodes b
                   WHERE a.flow_id=$1 AND b.flow_id=$1 AND a.order_index=$2 AND b.order_index=$3""",
                fid, src, tgt
            )
        print("Edges reconstruidos: 0->1->2->3->4")

        rows = await conn.fetch(
            "SELECT order_index, node_type, label FROM flow_nodes "
            "WHERE flow_id=$1 ORDER BY order_index",
            fid
        )
        print("\nFlujo final:")
        for r in rows:
            print(f"  [{r['order_index']}] {r['node_type']:15} {r['label']}")


asyncio.run(fix())
