-- Actualiza el flujo LeadUp para usar Apify como fuente primaria
-- y actualiza el prompt del analista con los campos nuevos

DO $$
DECLARE
  flow_id UUID;
  old_trigger_id UUID;
  old_apollo_id  UUID;
  old_apify_id   UUID;
  old_analista_id UUID;
  new_analista_prompt TEXT;
BEGIN
  -- Obtener el flow_id
  SELECT id INTO flow_id FROM flows WHERE LOWER(name)='leadup' LIMIT 1;
  IF flow_id IS NULL THEN
    RAISE NOTICE 'Flujo LeadUp no encontrado';
    RETURN;
  END IF;

  -- Actualizar orden: Apify pasa a ser nodo 1 (después del trigger)
  -- Trigger(0) → Apify(1) → Scrapling(2) → Analista(3) → Output(4)
  -- Apollo se desactiva (order_index=99)

  UPDATE flow_nodes SET order_index=99 WHERE flow_id=flow_id AND node_type='apollo_agent';

  -- Apify: ahora es nodo 1 (fuente primaria de leads desde Google Maps)
  UPDATE flow_nodes SET
    order_index = 1,
    label = '📍 Apify — Google Maps (Fuente Principal)',
    system_prompt = ''
  WHERE flow_id=flow_id AND node_type='apify_agent';

  -- Scrapling: nodo 2
  UPDATE flow_nodes SET order_index=2 WHERE flow_id=flow_id AND node_type='scraping_agent';

  -- Analista Claude: nodo 3 con prompt completo
  new_analista_prompt := 'Eres un analista de negocio digital experto para un equipo comercial. ' ||
    'Recibes un JSON array de empresas con datos de Google Maps y web scraping. ' ||
    'Para CADA empresa genera estos campos adicionales: ' ||
    'digital_score (int 0-100 basado en presencia digital real), ' ||
    'opportunity_level (ALTA|MEDIA|BAJA), ' ||
    'summary (2 frases concisas sobre el negocio para el comercial), ' ||
    'redes_sociales (string: qué redes tiene activas y cómo las usa), ' ||
    'captacion_leads (string: su sistema de captación de clientes), ' ||
    'email_marketing (string: si tiene email marketing y cómo lo usa), ' ||
    'video_contenido (string: producción audiovisual y contenido), ' ||
    'seo_info (string: posicionamiento SEO y visibilidad online), ' ||
    'oportunidad_hbd (string formato: "ALTA — Score X/100 — descripcion"), ' ||
    'opportunity_sales (3 bullets con oportunidades Sales/CRM e impacto estimado), ' ||
    'opportunity_tech (3 bullets con oportunidades Tech/IA e impacto estimado), ' ||
    'opportunity_av (3 bullets con oportunidades Contenido AV e impacto). ' ||
    'Devuelve el array JSON enriquecido. Solo JSON válido, sin texto extra.';

  UPDATE flow_nodes SET
    system_prompt = new_analista_prompt,
    order_index   = 3,
    config        = config || ''{"max_tokens": 8192}''::jsonb
  WHERE flow_id=flow_id AND label LIKE '%Analista%';

  -- Output: nodo 4
  UPDATE flow_nodes SET order_index=4 WHERE flow_id=flow_id AND node_type='output';

  -- Actualizar edges: Trigger(0) → Apify(1) → Scrapling(2) → Analista(3) → Output(4)
  DELETE FROM flow_edges WHERE flow_id=flow_id;

  INSERT INTO flow_edges (flow_id, source_node_id, target_node_id)
  SELECT flow_id, a.id, b.id
  FROM flow_nodes a, flow_nodes b
  WHERE a.flow_id=flow_id AND b.flow_id=flow_id
    AND a.order_index=0 AND b.order_index=1;

  INSERT INTO flow_edges (flow_id, source_node_id, target_node_id)
  SELECT flow_id, a.id, b.id
  FROM flow_nodes a, flow_nodes b
  WHERE a.flow_id=flow_id AND b.flow_id=flow_id
    AND a.order_index=1 AND b.order_index=2;

  INSERT INTO flow_edges (flow_id, source_node_id, target_node_id)
  SELECT flow_id, a.id, b.id
  FROM flow_nodes a, flow_nodes b
  WHERE a.flow_id=flow_id AND b.flow_id=flow_id
    AND a.order_index=2 AND b.order_index=3;

  INSERT INTO flow_edges (flow_id, source_node_id, target_node_id)
  SELECT flow_id, a.id, b.id
  FROM flow_nodes a, flow_nodes b
  WHERE a.flow_id=flow_id AND b.flow_id=flow_id
    AND a.order_index=3 AND b.order_index=4;

  RAISE NOTICE '✅ Flujo LeadUp actualizado: Trigger → Apify → Scrapling → Analista → Output';
END $$;
