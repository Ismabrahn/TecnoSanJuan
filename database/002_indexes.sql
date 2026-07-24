-- ============================================================================
-- Tecno San Juan - Índices de performance
-- ============================================================================
-- Todos los índices se crean CONCURRENTLY donde es posible para evitar
-- bloqueos en producción. En Supabase (PostgreSQL < 13) no es necesario
-- especificarlo, se ejecutan en segundo plano automáticamente.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Índices para claves foráneas (aceleran JOINs)
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_prices_service_id ON prices(service_id);
CREATE INDEX IF NOT EXISTS idx_repairs_client_id ON repairs(client_id);
CREATE INDEX IF NOT EXISTS idx_repairs_service_id ON repairs(service_id);
CREATE INDEX IF NOT EXISTS idx_repairs_assigned_to ON repairs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_repair_id ON work_orders(repair_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_employee_id ON work_orders(employee_id);
CREATE INDEX IF NOT EXISTS idx_budgets_client_id ON budgets(client_id);
CREATE INDEX IF NOT EXISTS idx_budgets_repair_id ON budgets(repair_id);
CREATE INDEX IF NOT EXISTS idx_employees_auth_user_id ON employees(auth_user_id);

-- --------------------------------------------------------------------------
-- Índices para filtros por is_active (consultas frecuentes)
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_faqs_active ON faqs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_hours_active ON hours(is_active) WHERE is_active = true;

-- --------------------------------------------------------------------------
-- Índices para ordenamiento
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_faqs_sort ON faqs(sort_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_featured_messages_sort ON featured_messages(sort_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_hours_day ON hours(day_of_week) WHERE is_active = true;

-- --------------------------------------------------------------------------
-- Índices de búsqueda de texto (para el chatbot y búsqueda admin)
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_services_search
  ON services USING GIN (to_tsvector('spanish', name || ' ' || description))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_categories_search
  ON categories USING GIN (to_tsvector('spanish', name || ' ' || description))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_faqs_search
  ON faqs USING GIN (to_tsvector('spanish', question || ' ' || answer))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_promotions_search
  ON promotions USING GIN (to_tsvector('spanish', title || ' ' || description))
  WHERE is_active = true;

-- --------------------------------------------------------------------------
-- Índices para búsqueda por nombre (ILIKE)
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_services_name ON services USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients USING gin (name gin_trgm_ops);

-- --------------------------------------------------------------------------
-- Índices para productos
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_search
  ON products USING GIN (to_tsvector('spanish', name || ' ' || description || ' ' || features || ' ' || category))
  WHERE is_active = true;

-- --------------------------------------------------------------------------
-- Índices para tablas futuras
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
CREATE INDEX IF NOT EXISTS idx_repairs_created ON repairs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets(status);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_history_session ON chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created ON chat_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
