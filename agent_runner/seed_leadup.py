"""
Ejecutar una vez para crear la plantilla LeadUp en la DB.
Uso: python -m agent_runner.seed_leadup
"""
import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from agent_runner.database import init_pool, close_pool, run_migrations, db_conn


LEADUP_NODES = [
    {
        "node_type": "trigger",
        "label": "🕗 Trigger 8am",
        "system_prompt": "",
        "position_x": 50,
        "position_y": 300,
        "order_index": 0,
        "config": {
            "cron": "0 8 * * *",
            "default_input": "sector:restaurantes ciudad:Madrid cantidad:10",
        },
    },
    {
        "node_type": "apollo_agent",
        "label": "🔍 Apollo — Búsqueda Leads",
        "system_prompt": (
            "Eres un agente de prospección B2B. Recibes un input con sector, ciudad y cantidad. "
            "Llamas a la Apollo API para buscar empresas y decision makers (CEO, Director, Fundador). "
            "Devuelve SOLO un JSON array con objetos: "
            "{{name, website, sector, city, employee_count, contacts: [{{name, role, email, phone, linkedin_url}}]}}. "
            "Máximo {qty} empresas. Sin texto extra, solo JSON válido."
        ),
        "position_x": 300,
        "position_y": 300,
        "order_index": 1,
        "config": {
            "model": "claude-sonnet-4-6",
            "qty": 10,
            "country": "ES",
            "roles": ["CEO", "Director General", "Fundador", "Gerente"],
        },
    },
    {
        "node_type": "agent",
        "label": "📍 Apify — Google Maps",
        "system_prompt": (
            "Eres un agente de scraping. Recibes un JSON array de empresas. "
            "Para cada empresa, simulas una búsqueda en Google Maps y añades: "
            "gmb_rating (float 1-5), gmb_reviews (int), gmb_phone (string). "
            "Si no hay datos disponibles, usa null. "
            "Devuelve el mismo array enriquecido. Solo JSON válido."
        ),
        "position_x": 580,
        "position_y": 300,
        "order_index": 2,
        "config": {
            "model": "claude-sonnet-4-6",
            "actor": "compass/google-maps-scraper",
        },
    },
    {
        "node_type": "scraping_agent",
        "label": "🕷️ Scrapling — Análisis Web",
        "system_prompt": (
            "Eres un agente de análisis web. Recibes el JSON array de empresas con su website. "
            "Para cada empresa, añade: "
            "has_crm (bool — detecta scripts HubSpot/Salesforce/Zoho), "
            "has_facebook_pixel (bool), "
            "has_google_ads (bool), "
            "social_facebook (url o null), "
            "social_linkedin (url o null), "
            "social_instagram (url o null), "
            "seo_score (int 0-100 estimado). "
            "Devuelve el array enriquecido. Solo JSON válido."
        ),
        "position_x": 860,
        "position_y": 300,
        "order_index": 3,
        "config": {
            "model": "claude-sonnet-4-6",
        },
    },
    {
        "node_type": "agent",
        "label": "🧠 Claude Analista — Diagnóstico",
        "system_prompt": (
            "Eres un analista de negocio digital experto. Recibes un JSON array de empresas enriquecidas. "
            "Para cada empresa, añade: "
            "digital_score (int 0-100), "
            "opportunity_level ('ALTA'|'MEDIA'|'BAJA'), "
            "opportunity_sales (string con 2-3 bullets de oportunidad comercial), "
            "opportunity_tech (string con 2-3 bullets de oportunidad tecnológica), "
            "opportunity_av (string con 2-3 bullets de oportunidad audiovisual), "
            "summary (string de 2 frases para el comercial). "
            "Devuelve el array enriquecido. Solo JSON válido."
        ),
        "position_x": 1140,
        "position_y": 300,
        "order_index": 4,
        "config": {
            "model": "claude-sonnet-4-6",
            "max_tokens": 8192,
        },
    },
    {
        "node_type": "output",
        "label": "💾 Output — Guardar en LeadUp DB",
        "system_prompt": (
            "Eres el nodo final del pipeline LeadUp. "
            "Recibes el JSON array de fichas completas. "
            "Tu tarea es devolver el JSON limpio y validado, listo para ser guardado por LeadUp backend. "
            "Verifica que cada ficha tenga: name, website, sector, city, digital_score, opportunity_level, "
            "contacts con al menos 1 entrada. Rellena con null los campos faltantes. "
            "Solo JSON válido."
        ),
        "position_x": 1420,
        "position_y": 300,
        "order_index": 5,
        "config": {
            "model": "claude-haiku-4-5-20251001",
            "destination": "leadup_db",
        },
    },
]


async def seed():
    await init_pool()
    await run_migrations()

    async with db_conn() as conn:
        # Verificar si ya existe
        existing = await conn.fetchrow(
            "SELECT id FROM flows WHERE LOWER(name) = 'leadup' LIMIT 1"
        )
        if existing:
            print(f"⚠️  Plantilla LeadUp ya existe (id: {existing['id']}). Nada que hacer.")
            return

        # Crear el flujo
        flow = await conn.fetchrow(
            "INSERT INTO flows (name, description, status) VALUES ($1,$2,$3) RETURNING id",
            "LeadUp",
            "Pipeline de enriquecimiento para CRM de cold call — Apollo → Apify → Scrapling → Claude → DB",
            "idle",
        )
        flow_id = flow["id"]
        print(f"✅ Flujo LeadUp creado: {flow_id}")

        # Crear nodos y guardar sus IDs en orden
        node_ids = []
        for n in LEADUP_NODES:
            row = await conn.fetchrow(
                """
                INSERT INTO flow_nodes
                    (flow_id, node_type, label, system_prompt, position_x, position_y, config, order_index)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING id
                """,
                flow_id,
                n["node_type"],
                n["label"],
                n["system_prompt"],
                n["position_x"],
                n["position_y"],
                json.dumps(n["config"]),
                n["order_index"],
            )
            node_ids.append(row["id"])
            print(f"   📌 Nodo {n['order_index']}: {n['label']}")

        # Crear edges (cadena lineal: 0→1→2→3→4→5)
        for i in range(len(node_ids) - 1):
            await conn.execute(
                "INSERT INTO flow_edges (flow_id, source_node_id, target_node_id) VALUES ($1,$2,$3)",
                flow_id,
                node_ids[i],
                node_ids[i + 1],
            )

        print(f"\n🎉 Plantilla LeadUp lista — {len(LEADUP_NODES)} nodos, {len(node_ids)-1} edges")
        print(f"   Ejecutar con: POST /api/execute/by-name/LeadUp")

    await close_pool()


if __name__ == "__main__":
    asyncio.run(seed())
