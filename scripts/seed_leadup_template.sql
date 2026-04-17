-- Inserta la plantilla "LeadUp" en el canvas de FullStackAI como plantilla global
-- Ejecutar en la DB fullstackai: psql -U fai_user -d fullstackai -f seed_leadup_template.sql

DO $$
DECLARE
  admin_id UUID;
  nodes_json TEXT;
  edges_json TEXT;
BEGIN
  -- Obtener el admin ID (usuario del canal FullStackAI)
  SELECT id INTO admin_id FROM users WHERE role = 'admin' LIMIT 1;
  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid();
  END IF;

  -- Nodos en formato @xyflow/react
  nodes_json := '[
    {
      "id": "lu-1",
      "type": "terminal",
      "position": {"x": 60, "y": 280},
      "style": {"width": 340, "height": 200},
      "data": {
        "label": "🕗 Trigger 8am — LeadUp",
        "agentType": "trigger",
        "description": "Dispara el pipeline LeadUp cada mañana a las 8am. Input: sector, ciudad, cantidad.",
        "config": {"cron": "0 8 * * *", "sector": "restaurantes", "city": "Madrid", "qty": 10}
      }
    },
    {
      "id": "lu-2",
      "type": "terminal",
      "position": {"x": 440, "y": 160},
      "style": {"width": 340, "height": 220},
      "data": {
        "label": "🔍 Apollo — Búsqueda Leads",
        "agentType": "apollo_agent",
        "description": "Busca empresas y decision makers en Apollo.io por sector y ciudad.",
        "config": {"roles": ["CEO", "Director", "Fundador"], "country": "ES"}
      }
    },
    {
      "id": "lu-3",
      "type": "terminal",
      "position": {"x": 820, "y": 60},
      "style": {"width": 340, "height": 220},
      "data": {
        "label": "📍 Apify — Google Maps",
        "agentType": "apify_agent",
        "description": "Scraping Google Maps: rating, reseñas, teléfono GMB por empresa.",
        "config": {"actor": "compass/google-maps-scraper"}
      }
    },
    {
      "id": "lu-4",
      "type": "terminal",
      "position": {"x": 1200, "y": 160},
      "style": {"width": 340, "height": 240},
      "data": {
        "label": "🕷️ Scrapling — Análisis Web",
        "agentType": "scraping_agent",
        "description": "Analiza la web de cada empresa: CRM detectado, pixels, RRSS, score SEO.",
        "config": {}
      }
    },
    {
      "id": "lu-5",
      "type": "terminal",
      "position": {"x": 1580, "y": 60},
      "style": {"width": 360, "height": 260},
      "data": {
        "label": "🧠 Claude Analista — Diagnóstico",
        "agentType": "agent",
        "description": "Genera digital_score, oportunidades Sales/Tech/AV y resumen para el comercial.",
        "config": {"model": "claude-sonnet-4-6", "max_tokens": 8192}
      }
    },
    {
      "id": "lu-6",
      "type": "terminal",
      "position": {"x": 1980, "y": 280},
      "style": {"width": 340, "height": 200},
      "data": {
        "label": "💾 Output — LeadUp DB",
        "agentType": "output",
        "description": "Guarda las fichas enriquecidas en la base de datos de LeadUp CRM.",
        "config": {"destination": "leadup_db"}
      }
    }
  ]';

  edges_json := '[
    {"id": "lu-e1", "source": "lu-1", "target": "lu-2", "type": "gradient"},
    {"id": "lu-e2", "source": "lu-2", "target": "lu-3", "type": "gradient"},
    {"id": "lu-e3", "source": "lu-3", "target": "lu-4", "type": "gradient"},
    {"id": "lu-e4", "source": "lu-4", "target": "lu-5", "type": "gradient"},
    {"id": "lu-e5", "source": "lu-5", "target": "lu-6", "type": "gradient"}
  ]';

  -- Eliminar si ya existe y reinsertar
  DELETE FROM templates WHERE name = 'LeadUp' AND is_global = true;

  INSERT INTO templates (user_id, name, nodes, edges, is_global)
  VALUES (admin_id, 'LeadUp', nodes_json::jsonb, edges_json::jsonb, true);

  RAISE NOTICE '✅ Plantilla LeadUp creada en FullStackAI canvas';
END $$;
