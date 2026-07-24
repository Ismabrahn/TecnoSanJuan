-- ============================================================================
-- Tecno San Juan - Esquema completo de base de datos
-- Versión: 2.0.0
-- Descripción: Tablas actuales del negocio + estructura preparada para
--              funcionalidades futuras (clientes, reparaciones, inventario, etc.)
-- ============================================================================
-- Tablas públicas (lectura anónima): business_info, categories, services, prices,
--   promotions, warranties, print3d, faqs, social_media, phones, emails, address,
--   featured_messages, hours, chatbot_config
-- Tablas privadas (solo autenticados): clients, repairs, work_orders, budgets,
--   inventory, employees, chat_history, audit_log
-- ============================================================================

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- TABLAS ACTUALES (en producción desde el día 1)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. business_info - Información general de la empresa (una sola fila)
-- --------------------------------------------------------------------------
CREATE TABLE business_info (
  id          BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name        TEXT NOT NULL,
  legal_name  TEXT,
  tax_id      TEXT,
  slogan      TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  logo_url    TEXT NOT NULL DEFAULT '',
  primary_color   TEXT NOT NULL DEFAULT '#2563eb',
  secondary_color TEXT NOT NULL DEFAULT '#1e40af',
  website     TEXT,
  founded_year INTEGER CHECK (founded_year IS NULL OR (founded_year >= 1900 AND founded_year <= EXTRACT(YEAR FROM NOW()))),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE business_info IS 'Información general del negocio (fila única)';
COMMENT ON COLUMN business_info.id IS 'Restricción CHECK (id=1) fuerza una sola fila';

-- --------------------------------------------------------------------------
-- 2. categories - Categorías de servicios (jerárquicas)
-- --------------------------------------------------------------------------
CREATE TABLE categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  parent_id   BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE categories IS 'Categorías de servicios con soporte jerárquico (parent_id)';
COMMENT ON COLUMN categories.parent_id IS 'Categoría padre para subcategorías';

-- --------------------------------------------------------------------------
-- 3. services - Servicios ofrecidos por el negocio
-- --------------------------------------------------------------------------
CREATE TABLE services (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id       BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  image_url         TEXT NOT NULL DEFAULT '',
  price             DECIMAL(12,2) CHECK (price IS NULL OR price >= 0),
  estimated_duration INTERVAL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE services IS 'Servicios del negocio, asociados a una categoría';

-- --------------------------------------------------------------------------
-- 4. prices - Precios por variante de servicio (ej: básico, premium)
-- --------------------------------------------------------------------------
CREATE TABLE prices (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id  BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT '',
  amount      DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  currency    TEXT NOT NULL DEFAULT 'ARS' CHECK (char_length(currency) = 3),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE prices IS 'Precios por variante de un servicio';

-- --------------------------------------------------------------------------
-- 5. promotions - Promociones y descuentos
-- --------------------------------------------------------------------------
CREATE TABLE promotions (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  image_url           TEXT NOT NULL DEFAULT '',
  discount_type       TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value      DECIMAL(12,2) CHECK (discount_value IS NULL OR discount_value >= 0),
  min_purchase        DECIMAL(12,2) CHECK (min_purchase IS NULL OR min_purchase >= 0),
  valid_from          DATE,
  valid_until         DATE,
  applicable_service_ids BIGINT[],
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE promotions IS 'Promociones activas con fechas de validez';

-- --------------------------------------------------------------------------
-- 6. warranties - Garantías ofrecidas
-- --------------------------------------------------------------------------
CREATE TABLE warranties (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  duration      TEXT NOT NULL DEFAULT '',
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days >= 0),
  terms         TEXT NOT NULL DEFAULT '',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE warranties IS 'Garantías ofrecidas con duración y términos';

-- --------------------------------------------------------------------------
-- 7. print3d - Servicios de impresión 3D
-- --------------------------------------------------------------------------
CREATE TABLE print3d (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  material          TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  price_per_gram    DECIMAL(12,2) CHECK (price_per_gram IS NULL OR price_per_gram >= 0),
  colors            TEXT NOT NULL DEFAULT '',
  max_dimensions    TEXT NOT NULL DEFAULT '',
  max_dimensions_mm TEXT,
  layer_height      TEXT NOT NULL DEFAULT '',
  infill_options    TEXT NOT NULL DEFAULT '',
  lead_time         TEXT NOT NULL DEFAULT '',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE print3d IS 'Servicios y materiales de impresión 3D';

-- --------------------------------------------------------------------------
-- 8. faqs - Preguntas frecuentes
-- --------------------------------------------------------------------------
CREATE TABLE faqs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE faqs IS 'Preguntas frecuentes ordenables';

-- --------------------------------------------------------------------------
-- 9. social_media - Redes sociales
-- --------------------------------------------------------------------------
CREATE TABLE social_media (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform    TEXT NOT NULL,
  url         TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE social_media IS 'Redes sociales del negocio';

-- --------------------------------------------------------------------------
-- 10. phones - Teléfonos de contacto
-- --------------------------------------------------------------------------
CREATE TABLE phones (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label         TEXT NOT NULL DEFAULT '',
  number        TEXT NOT NULL,
  is_whatsapp   BOOLEAN NOT NULL DEFAULT false,
  country_code  TEXT NOT NULL DEFAULT '+54',
  sort_order    INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE phones IS 'Teléfonos de contacto del negocio';

-- --------------------------------------------------------------------------
-- 11. emails - Correos electrónicos de contacto
-- --------------------------------------------------------------------------
CREATE TABLE emails (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE emails IS 'Correos electrónicos de contacto';

-- --------------------------------------------------------------------------
-- 12. address - Dirección del negocio (una sola fila)
-- --------------------------------------------------------------------------
CREATE TABLE address (
  id              BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  street          TEXT NOT NULL,
  number          TEXT NOT NULL DEFAULT '',
  city            TEXT NOT NULL DEFAULT 'San Juan',
  province        TEXT NOT NULL DEFAULT 'San Juan',
  postal_code     TEXT NOT NULL DEFAULT '',
  country         TEXT NOT NULL DEFAULT 'Argentina',
  latitude        DECIMAL(10,7),
  longitude       DECIMAL(10,7),
  maps_url        TEXT NOT NULL DEFAULT '',
  additional_info TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE address IS 'Dirección del negocio (fila única)';

-- --------------------------------------------------------------------------
-- 13. featured_messages - Mensajes destacados (banners)
-- --------------------------------------------------------------------------
CREATE TABLE featured_messages (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'promo', 'alert')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE featured_messages IS 'Mensajes destacados tipo banner';

-- --------------------------------------------------------------------------
-- 14. hours - Horarios de atención
-- --------------------------------------------------------------------------
CREATE TABLE hours (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  day_name    TEXT NOT NULL,
  open_time   TIME WITHOUT TIME ZONE,
  close_time  TIME WITHOUT TIME ZONE,
  is_closed   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE hours IS 'Horarios de atención por día de la semana';

-- --------------------------------------------------------------------------
-- 15. chatbot_config - Configuración del chatbot (una sola fila)
-- --------------------------------------------------------------------------
CREATE TABLE chatbot_config (
  id              BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  welcome_message TEXT NOT NULL DEFAULT '¡Hola! Soy el asistente virtual de Tecno San Juan. Consultame sobre servicios, precios, horarios y más.',
  system_prompt   TEXT NOT NULL DEFAULT '',
  fallback_message TEXT NOT NULL DEFAULT 'No dispongo de esa información en este momento.',
  temperature     DECIMAL(3,2) NOT NULL DEFAULT 0.30 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens      INTEGER NOT NULL DEFAULT 1024 CHECK (max_tokens > 0 AND max_tokens <= 8192),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chatbot_config IS 'Configuración del chatbot (fila única)';

-- ============================================================================
-- TABLAS FUTURAS (estructura lista, vacías hasta implementar cada feature)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 16. clients - Registro de clientes
-- --------------------------------------------------------------------------
CREATE TABLE clients (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  document_type   TEXT CHECK (document_type IS NULL OR document_type IN ('DNI', 'Pasaporte', 'CUIT', 'CUIL')),
  document_number TEXT,
  notes           TEXT NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clients IS 'Registro de clientes (futuro)';

-- --------------------------------------------------------------------------
-- 17. repairs - Reparaciones
-- --------------------------------------------------------------------------
CREATE TABLE repairs (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id       BIGINT REFERENCES clients(id) ON DELETE SET NULL,
  device_type     TEXT NOT NULL,
  brand           TEXT NOT NULL DEFAULT '',
  model           TEXT NOT NULL DEFAULT '',
  serial_number   TEXT NOT NULL DEFAULT '',
  reported_issue  TEXT NOT NULL,
  diagnostic      TEXT NOT NULL DEFAULT '',
  service_id      BIGINT REFERENCES services(id) ON DELETE SET NULL,
  assigned_to     BIGINT, -- REFERENCES employees(id) cuando exista la tabla
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'diagnosing', 'approved', 'in_progress', 'completed', 'delivered', 'cancelled')),
  estimated_cost  DECIMAL(12,2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  final_cost      DECIMAL(12,2) CHECK (final_cost IS NULL OR final_cost >= 0),
  notes           TEXT NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE repairs IS 'Registro de reparaciones (futuro)';

-- --------------------------------------------------------------------------
-- 18. work_orders - Órdenes de trabajo
-- --------------------------------------------------------------------------
CREATE TABLE work_orders (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  repair_id     BIGINT REFERENCES repairs(id) ON DELETE CASCADE,
  employee_id   BIGINT, -- REFERENCES employees(id) cuando exista
  description   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  notes         TEXT NOT NULL DEFAULT '',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE work_orders IS 'Órdenes de trabajo asociadas a reparaciones (futuro)';

-- --------------------------------------------------------------------------
-- 19. budgets - Presupuestos
-- --------------------------------------------------------------------------
CREATE TABLE budgets (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id   BIGINT REFERENCES clients(id) ON DELETE SET NULL,
  repair_id   BIGINT REFERENCES repairs(id) ON DELETE SET NULL,
  items       JSONB NOT NULL DEFAULT '[]',
  subtotal    DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
  tax         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total       DECIMAL(12,2) NOT NULL CHECK (total >= 0),
  valid_until DATE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  notes       TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE budgets IS 'Presupuestos para clientes (futuro)';

-- --------------------------------------------------------------------------
-- 20. inventory - Inventario / Stock
-- --------------------------------------------------------------------------
CREATE TABLE inventory (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sku         TEXT UNIQUE,
  category    TEXT NOT NULL DEFAULT '',
  quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_stock   INTEGER NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
  unit_price  DECIMAL(12,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  sale_price  DECIMAL(12,2) CHECK (sale_price IS NULL OR sale_price >= 0),
  supplier    TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE inventory IS 'Inventario de repuestos y productos (futuro)';

-- --------------------------------------------------------------------------
-- 21. employees - Empleados
-- --------------------------------------------------------------------------
CREATE TABLE employees (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee', 'technician')),
  specialties   TEXT[],
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE employees IS 'Empleados del negocio vinculados a auth.users (futuro)';

-- --------------------------------------------------------------------------
-- 22. chat_history - Historial de conversaciones del chatbot
-- --------------------------------------------------------------------------
CREATE TABLE chat_history (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    TEXT NOT NULL,
  user_message  TEXT NOT NULL,
  bot_response  TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('database', 'ai')),
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chat_history IS 'Historial de conversaciones del chatbot (futuro)';

-- --------------------------------------------------------------------------
-- 23. audit_log - Historial de cambios en todas las tablas
-- --------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   BIGINT,
  action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data    JSONB,
  new_data    JSONB,
  changed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Registro de cambios en datos sensibles (futuro)';
