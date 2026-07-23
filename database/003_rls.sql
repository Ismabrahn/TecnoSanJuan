-- ============================================================================
-- Tecno San Juan - Políticas de Row Level Security (RLS)
-- ============================================================================
--
-- ESTRATEGIA DE SEGURIDAD:
--
-- Dos roles de acceso:
--   1. anon (público)   → Solo lectura en tablas públicas
--   2. authenticated    → Lectura/Escritura total en todas las tablas
--
-- TABLAS PÚBLICAS (acceso anónimo SOLO lectura):
--   business_info, categories, services, prices, promotions,
--   warranties, print3d, faqs, social_media, phones, emails,
--   address, featured_messages, hours, chatbot_config
--
-- TABLAS PRIVADAS (solo authenticated - lectura y escritura):
--   clients, repairs, work_orders, budgets, inventory, employees,
--   chat_history, audit_log
--
-- NOTA: El Cloudflare Worker usa la clave service_role, que
--       *omite* RLS. Las políticas aquí aplican cuando alguien
--       consulta Supabase directamente con anon key desde el
--       frontend (por ejemplo, usando @supabase/supabase-js).
--       En nuestra arquitectura actual, TODO pasa por el Worker,
--       usando service_role. Estas políticas son la capa extra
--       de seguridad por si en el futuro se accede directo.
-- ============================================================================

-- ============================================================================
-- 1. TABLAS PÚBLICAS - Solo lectura para anon, CRUD para authenticated
-- ============================================================================

-- business_info (pública - lectura)
ALTER TABLE business_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON business_info;
DROP POLICY IF EXISTS "Escritura administradores" ON business_info;
CREATE POLICY "Lectura pública" ON business_info FOR SELECT USING (true);
CREATE POLICY "Escritura administradores" ON business_info FOR ALL USING (auth.role() = 'authenticated');

-- categories (pública - solo activas)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON categories;
DROP POLICY IF EXISTS "Escritura administradores" ON categories;
CREATE POLICY "Lectura pública" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON categories FOR ALL USING (auth.role() = 'authenticated');

-- services (pública - solo activos)
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON services;
DROP POLICY IF EXISTS "Escritura administradores" ON services;
CREATE POLICY "Lectura pública" ON services FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON services FOR ALL USING (auth.role() = 'authenticated');

-- prices (pública - solo activos)
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON prices;
DROP POLICY IF EXISTS "Escritura administradores" ON prices;
CREATE POLICY "Lectura pública" ON prices FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON prices FOR ALL USING (auth.role() = 'authenticated');

-- promotions (pública - solo activas)
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON promotions;
DROP POLICY IF EXISTS "Escritura administradores" ON promotions;
CREATE POLICY "Lectura pública" ON promotions FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON promotions FOR ALL USING (auth.role() = 'authenticated');

-- warranties (pública - solo activas)
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON warranties;
DROP POLICY IF EXISTS "Escritura administradores" ON warranties;
CREATE POLICY "Lectura pública" ON warranties FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON warranties FOR ALL USING (auth.role() = 'authenticated');

-- print3d (pública - solo activos)
ALTER TABLE print3d ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON print3d;
DROP POLICY IF EXISTS "Escritura administradores" ON print3d;
CREATE POLICY "Lectura pública" ON print3d FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON print3d FOR ALL USING (auth.role() = 'authenticated');

-- faqs (pública - solo activas)
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON faqs;
DROP POLICY IF EXISTS "Escritura administradores" ON faqs;
CREATE POLICY "Lectura pública" ON faqs FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON faqs FOR ALL USING (auth.role() = 'authenticated');

-- social_media (pública - solo activas)
ALTER TABLE social_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON social_media;
DROP POLICY IF EXISTS "Escritura administradores" ON social_media;
CREATE POLICY "Lectura pública" ON social_media FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON social_media FOR ALL USING (auth.role() = 'authenticated');

-- phones (pública - solo activos)
ALTER TABLE phones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON phones;
DROP POLICY IF EXISTS "Escritura administradores" ON phones;
CREATE POLICY "Lectura pública" ON phones FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON phones FOR ALL USING (auth.role() = 'authenticated');

-- emails (pública - solo activos)
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON emails;
DROP POLICY IF EXISTS "Escritura administradores" ON emails;
CREATE POLICY "Lectura pública" ON emails FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON emails FOR ALL USING (auth.role() = 'authenticated');

-- address (pública - lectura)
ALTER TABLE address ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON address;
DROP POLICY IF EXISTS "Escritura administradores" ON address;
CREATE POLICY "Lectura pública" ON address FOR SELECT USING (true);
CREATE POLICY "Escritura administradores" ON address FOR ALL USING (auth.role() = 'authenticated');

-- featured_messages (pública - solo activos)
ALTER TABLE featured_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON featured_messages;
DROP POLICY IF EXISTS "Escritura administradores" ON featured_messages;
CREATE POLICY "Lectura pública" ON featured_messages FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON featured_messages FOR ALL USING (auth.role() = 'authenticated');

-- hours (pública - solo activos)
ALTER TABLE hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON hours;
DROP POLICY IF EXISTS "Escritura administradores" ON hours;
CREATE POLICY "Lectura pública" ON hours FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON hours FOR ALL USING (auth.role() = 'authenticated');

-- chatbot_config (pública - solo lectura)
ALTER TABLE chatbot_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON chatbot_config;
DROP POLICY IF EXISTS "Escritura administradores" ON chatbot_config;
CREATE POLICY "Lectura pública" ON chatbot_config FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON chatbot_config FOR ALL USING (auth.role() = 'authenticated');

-- products (pública - solo activos)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública" ON products;
DROP POLICY IF EXISTS "Escritura administradores" ON products;
CREATE POLICY "Lectura pública" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "Escritura administradores" ON products FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- 2. TABLAS PRIVADAS - Solo authenticated (lectura y escritura)
-- ============================================================================

-- clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso empleados" ON clients;
CREATE POLICY "Acceso empleados" ON clients FOR ALL USING (auth.role() = 'authenticated');

-- repairs
ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso empleados" ON repairs;
CREATE POLICY "Acceso empleados" ON repairs FOR ALL USING (auth.role() = 'authenticated');

-- work_orders
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso empleados" ON work_orders;
CREATE POLICY "Acceso empleados" ON work_orders FOR ALL USING (auth.role() = 'authenticated');

-- budgets
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso empleados" ON budgets;
CREATE POLICY "Acceso empleados" ON budgets FOR ALL USING (auth.role() = 'authenticated');

-- inventory
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso empleados" ON inventory;
CREATE POLICY "Acceso empleados" ON inventory FOR ALL USING (auth.role() = 'authenticated');

-- employees
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso administradores" ON employees;
CREATE POLICY "Acceso administradores" ON employees FOR ALL USING (
  auth.role() = 'authenticated'
  AND (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_user_id = auth.uid()
      AND e.role IN ('admin', 'manager')
    )
    OR auth.uid() = employees.auth_user_id
  )
);

-- chat_history
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso empleados" ON chat_history;
CREATE POLICY "Acceso empleados" ON chat_history FOR ALL USING (auth.role() = 'authenticated');

-- audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso administradores" ON audit_log;
CREATE POLICY "Acceso administradores" ON audit_log FOR SELECT USING (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.auth_user_id = auth.uid()
    AND e.role IN ('admin', 'manager')
  )
);
