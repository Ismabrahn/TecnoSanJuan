-- ============================================================================
-- Tecno San Juan - Funciones, triggers y stored procedures
-- ============================================================================

-- ============================================================================
-- 1. TRIGGER: updated_at automático
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tables_with_updated_at TEXT[] := ARRAY[
    'business_info', 'categories', 'services', 'prices', 'promotions',
    'warranties', 'print3d', 'faqs', 'address', 'featured_messages',
    'hours', 'chatbot_config', 'products', 'clients', 'repairs', 'work_orders',
    'budgets', 'inventory', 'employees'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_with_updated_at
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;', t, t
    );
    EXECUTE format(
      'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- 2. FUNCIÓN: Búsqueda full-text en todas las tablas públicas
--    (Usada por el chatbot para construir contexto)
-- ============================================================================

CREATE OR REPLACE FUNCTION search_all_tables(search_query TEXT)
RETURNS TABLE(table_name TEXT, id BIGINT, content TEXT, relevance REAL) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT 'services'::TEXT AS table_name, s.id,
           'Servicio: ' || s.name || '. Descripción: ' || s.description AS content,
           ts_rank(to_tsvector('spanish', s.name || ' ' || s.description), plainto_tsquery('spanish', search_query)) AS relevance
    FROM services s
    WHERE s.is_active AND (to_tsvector('spanish', s.name || ' ' || s.description) @@ plainto_tsquery('spanish', search_query))
  UNION ALL
    SELECT 'categories'::TEXT, c.id,
           'Categoría: ' || c.name || '. Descripción: ' || c.description,
           ts_rank(to_tsvector('spanish', c.name || ' ' || c.description), plainto_tsquery('spanish', search_query))
    FROM categories c
    WHERE c.is_active AND (to_tsvector('spanish', c.name || ' ' || c.description) @@ plainto_tsquery('spanish', search_query))
  UNION ALL
    SELECT 'promotions'::TEXT, p.id,
           'Promoción: ' || p.title || '. Descripción: ' || p.description,
           ts_rank(to_tsvector('spanish', p.title || ' ' || p.description), plainto_tsquery('spanish', search_query))
    FROM promotions p
    WHERE p.is_active AND (to_tsvector('spanish', p.title || ' ' || p.description) @@ plainto_tsquery('spanish', search_query))
  UNION ALL
    SELECT 'faqs'::TEXT, f.id,
           'Pregunta: ' || f.question || '. Respuesta: ' || f.answer,
           ts_rank(to_tsvector('spanish', f.question || ' ' || f.answer), plainto_tsquery('spanish', search_query))
    FROM faqs f
    WHERE f.is_active AND (to_tsvector('spanish', f.question || ' ' || f.answer) @@ plainto_tsquery('spanish', search_query))
  UNION ALL
    SELECT 'warranties'::TEXT, w.id,
           'Garantía: ' || w.title || '. Descripción: ' || w.description || '. Duración: ' || COALESCE(w.duration, '') || '. Términos: ' || COALESCE(w.terms, ''),
           ts_rank(to_tsvector('spanish', w.title || ' ' || w.description || ' ' || COALESCE(w.duration, '') || ' ' || COALESCE(w.terms, '')), plainto_tsquery('spanish', search_query))
    FROM warranties w
    WHERE w.is_active AND (to_tsvector('spanish', w.title || ' ' || w.description || ' ' || COALESCE(w.duration, '') || ' ' || COALESCE(w.terms, '')) @@ plainto_tsquery('spanish', search_query))
  UNION ALL
    SELECT 'print3d'::TEXT, p3.id,
           'Impresión 3D - Material: ' || p3.material || '. Descripción: ' || p3.description || '. Precio por gramo: $' || p3.price_per_gram || '. Dimensiones máximas: ' || COALESCE(p3.max_dimensions, '') || '. Tiempo de entrega: ' || COALESCE(p3.lead_time, ''),
           ts_rank(to_tsvector('spanish', p3.material || ' ' || p3.description || ' ' || COALESCE(p3.max_dimensions, '') || ' ' || COALESCE(p3.lead_time, '')), plainto_tsquery('spanish', search_query))
    FROM print3d p3
    WHERE p3.is_active AND (to_tsvector('spanish', p3.material || ' ' || p3.description || ' ' || COALESCE(p3.max_dimensions, '') || ' ' || COALESCE(p3.lead_time, '')) @@ plainto_tsquery('spanish', search_query))
  UNION ALL
    SELECT 'featured_messages'::TEXT, fm.id,
           'Mensaje: ' || fm.message,
           ts_rank(to_tsvector('spanish', fm.message), plainto_tsquery('spanish', search_query))
    FROM featured_messages fm
    WHERE fm.is_active AND (to_tsvector('spanish', fm.message) @@ plainto_tsquery('spanish', search_query))
  UNION ALL
    SELECT 'products'::TEXT, p.id,
           'Producto: ' || p.name || '. Precio: $' || p.price || '. Descripción: ' || p.description || '. Características: ' || p.features || '. Categoría: ' || p.category AS content,
           ts_rank(to_tsvector('spanish', p.name || ' ' || p.description || ' ' || p.features || ' ' || p.category), plainto_tsquery('spanish', search_query)) AS relevance
    FROM products p
    WHERE p.is_active AND (to_tsvector('spanish', p.name || ' ' || p.description || ' ' || p.features || ' ' || p.category) @@ plainto_tsquery('spanish', search_query))
  UNION ALL
    SELECT 'business_info'::TEXT, bi.id,
           bi.name || '. ' || COALESCE(bi.slogan, '') || '. ' || COALESCE(bi.description, ''),
           ts_rank(to_tsvector('spanish', bi.name || ' ' || COALESCE(bi.slogan, '') || ' ' || COALESCE(bi.description, '')), plainto_tsquery('spanish', search_query))
    FROM business_info bi
    WHERE (to_tsvector('spanish', bi.name || ' ' || COALESCE(bi.slogan, '') || ' ' || COALESCE(bi.description, '')) @@ plainto_tsquery('spanish', search_query))
  ) AS resultados
  ORDER BY resultados.relevance DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION search_all_tables IS 'Busca en todas las tablas públicas y devuelve fragmentos relevantes para el chatbot';

-- ============================================================================
-- 3. FUNCIÓN: Obtener configuración del chatbot
-- ============================================================================

CREATE OR REPLACE FUNCTION get_chatbot_config()
RETURNS JSONB AS $$
DECLARE
  config JSONB;
BEGIN
  SELECT jsonb_build_object(
    'welcome_message', COALESCE(welcome_message, ''),
    'system_prompt', COALESCE(system_prompt, ''),
    'fallback_message', COALESCE(fallback_message, ''),
    'temperature', temperature,
    'max_tokens', max_tokens
  ) INTO config
  FROM chatbot_config
  WHERE is_active = true
  LIMIT 1;

  RETURN config;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_chatbot_config IS 'Devuelve la configuración activa del chatbot';

-- ============================================================================
-- 4. FUNCIÓN: Obtener datos completos del negocio para contexto del chatbot
-- ============================================================================

CREATE OR REPLACE FUNCTION get_business_context()
RETURNS TEXT AS $$
DECLARE
  result TEXT := '';
  info RECORD;
BEGIN
  SELECT * INTO info FROM business_info LIMIT 1;
  result := 'Empresa: ' || info.name || '. ' || COALESCE(info.slogan, '');

  result := result || E'\n\nSERVICIOS:\n';
  result := result || COALESCE(
    (SELECT string_agg('- ' || s.name || CASE WHEN s.price IS NOT NULL THEN ' ($' || s.price::text || ')' ELSE '' END, E'\n')
     FROM services s WHERE s.is_active), 'Sin servicios');

  result := result || E'\n\nHORARIOS:\n';
  result := result || COALESCE(
    (SELECT string_agg(h.day_name || ': ' || CASE WHEN h.is_closed THEN 'Cerrado' ELSE h.open_time::text || ' - ' || h.close_time::text END, E'\n' ORDER BY h.day_of_week)
     FROM hours h WHERE h.is_active), 'Sin horarios');

  result := result || E'\n\nPRODUCTOS EN VENTA:\n';
  result := result || COALESCE(
    (SELECT string_agg('- ' || p.name || ' ($' || p.price::text || ') - ' || p.description, E'\n')
     FROM products p WHERE p.is_active), 'Sin productos');

  result := result || E'\n\nPROMOCIONES:\n';
  result := result || COALESCE(
    (SELECT string_agg('- ' || p.title || ' (' || p.discount_value::text || CASE WHEN p.discount_type = 'percentage' THEN '%' ELSE ' ARS' END || ' OFF)', E'\n')
     FROM promotions p WHERE p.is_active AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE)), 'Sin promociones');

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_business_context IS 'Devuelve un resumen completo del negocio para contexto del chatbot';
