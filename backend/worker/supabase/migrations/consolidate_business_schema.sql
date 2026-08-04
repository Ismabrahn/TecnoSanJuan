-- ============================================================================
-- consolidate_business_schema.sql
-- Migración consolidada de producción (FASE 3 — Commit de esquema)
-- ----------------------------------------------------------------------------
-- Objetivo: reemplazar el esquema legacy BIGINT de negocio por el esquema
-- UUID nuevo compatible con los servicios actuales, preservando los 31
-- registros reales de interview_sessions.
--
-- SEGURIDAD (regla: NO DROP sin evidencia de tablas vacías):
--   1. Pre-flight: aborta si clients/repairs/budgets tienen filas.
--   2. Pre-flight: aborta si hay dependencias FK externas NO declaradas hacia
--      las tablas que se van a dropear.
--   3. work_orders se mantiene intacta: solo se elimina su FK legacy
--      (work_orders_repair_id_fkey) hacia repairs antes del DROP.
--   4. Documenta la migración en schema_migration_log antes de tocar nada.
--   5. interview_sessions NO se dropea; solo ALTER aditivo.
--
-- Orden de ejecución:
--   pre-flight -> backup/log -> DROP FKs legacy -> DROP legacy
--   -> CREATE nuevo esquema -> ALTER interview_sessions
--   -> índices UNIQUE de idempotencia
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. PRE-FLIGHT — evidencia de que los DROP son seguros
-- ----------------------------------------------------------------------------

-- 0.1 Pre-flight de existencia y conteo.
--     Obligatorias (deben existir): clients, repairs, budgets, interview_sessions.
--       - clients/repairs/budgets: se aborta si tienen filas (no dropear).
--       - interview_sessions: se aborta si no existe; nunca se dropea.
--     Opcionales (tablas NUEVAS, pueden no existir aún): print_orders, events,
--       notifications, event_dlq, admin_activity_log. Se cuentan SOLO si existen.
--     Uso de to_regclass() para evitar ERROR 42P01 (relation does not exist).
DO $$
DECLARE
  t text;
  n bigint;
  required text[] := ARRAY['clients', 'repairs', 'budgets', 'interview_sessions'];
  optional text[] := ARRAY['print_orders', 'events', 'notifications', 'event_dlq', 'admin_activity_log'];
BEGIN
  -- Tablas obligatorias: deben existir en producción.
  FOREACH t IN ARRAY required LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'ABORT: tabla obligatoria % no existe.', t;
    END IF;
  END LOOP;

  -- clients/repairs/budgets: DROP autorizado solo si siguen vacías.
  FOREACH t IN ARRAY ARRAY['clients', 'repairs', 'budgets']::text[] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'ABORT: % tiene % filas. No se dropea.', t, n;
    END IF;
  END LOOP;

  -- interview_sessions: se conserva; se verifica que siga teniendo datos.
  EXECUTE 'SELECT count(*) FROM public.interview_sessions' INTO n;
  IF n = 0 THEN
    RAISE NOTICE 'WARNING: interview_sessions está vacía (se esperaba 31 registros).';
  END IF;

  -- Tablas nuevas: se reportan solo si existen, sin abortar si faltan.
  FOREACH t IN ARRAY optional LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      RAISE NOTICE 'INFO: % ya existe con % filas (tabla nueva).', t, n;
    END IF;
  END LOOP;
END $$;

-- 0.2 Dependencias FK externas hacia clients/repairs/budgets.
--     Aborta si hay alguna FK externa NO declarada (una tabla que las
--     referencie bloquearía el DROP o se rompería).
--     Las FKs legacy declaradas se eliminan explícitamente en la sección 2.
DO $$
DECLARE
  dep record;
  declared_fks text[] := ARRAY[
    'work_orders_repair_id_fkey',
    'budgets_repair_id_fkey',
    'repairs_client_id_fkey',
    'budgets_client_id_fkey'
  ];
BEGIN
  FOR dep IN
    SELECT c.conrelid::regclass AS dependent_table,
           c.conname AS constraint_name
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid IN (
        to_regclass('public.clients'),
        to_regclass('public.repairs'),
        to_regclass('public.budgets')
      )
      AND c.conrelid NOT IN (
        to_regclass('public.clients'),
        to_regclass('public.repairs'),
        to_regclass('public.budgets')
      )
      AND NOT (c.conname = ANY(declared_fks))
  LOOP
    RAISE EXCEPTION 'ABORT: % depende de una tabla a dropear (FK % no declarada)', dep.dependent_table, dep.constraint_name;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 1. BACKUP / DOCUMENTACIÓN — registro persistente de la migración
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migration_log (
  id             BIGSERIAL PRIMARY KEY,
  migration_name TEXT NOT NULL,
  detail         JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migration_log (migration_name, detail)
VALUES (
  'consolidate_business_schema',
  jsonb_build_object(
    'dropped_empty', jsonb_build_array('clients', 'repairs', 'budgets'),
    'interview_sessions_preserved_rows', (SELECT count(*) FROM public.interview_sessions),
    'note', 'Legacy BIGINT tables replaced by UUID schema; interview_sessions only ALTERed (no DROP).'
  )
);

-- ----------------------------------------------------------------------------
-- 2. DROP de FKs legacy y de las tablas legacy vacías
-- ----------------------------------------------------------------------------
-- 2.1 Eliminar explícitamente las FKs legacy que dependen de las tablas a
--     dropear. work_orders se mantiene intacta (solo se le quita su FK a
--     repairs); las demás FKs residen en las propias tablas que se dropean.
ALTER TABLE IF EXISTS public.work_orders DROP CONSTRAINT IF EXISTS work_orders_repair_id_fkey;
ALTER TABLE IF EXISTS public.budgets     DROP CONSTRAINT IF EXISTS budgets_repair_id_fkey;
ALTER TABLE IF EXISTS public.repairs     DROP CONSTRAINT IF EXISTS repairs_client_id_fkey;
ALTER TABLE IF EXISTS public.budgets     DROP CONSTRAINT IF EXISTS budgets_client_id_fkey;

-- 2.2 DROP — SOLO las tres tablas legacy vacías
DROP TABLE IF EXISTS public.budgets;
DROP TABLE IF EXISTS public.repairs;
DROP TABLE IF EXISTS public.clients;

-- ----------------------------------------------------------------------------
-- 3. CREATE — esquema nuevo UUID
-- ----------------------------------------------------------------------------

-- 3.1 clients (compatible con ClientService)
CREATE TABLE IF NOT EXISTS public.clients (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT NULL,
  notes      TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients (phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients (email);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON public.clients (created_at DESC);

-- 3.2 repairs (session_id NOT NULL: trazabilidad hacia la entrevista origen;
--     client_id NULL: una solicitud puede existir sin cliente resuelto aún)
CREATE TABLE IF NOT EXISTS public.repairs (
  id         UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES public.clients(id),
  device     TEXT NOT NULL,
  problem    TEXT NOT NULL,
  urgency    TEXT NOT NULL DEFAULT 'normal',
  status     TEXT NOT NULL DEFAULT 'received'
             CHECK (status IN ('received', 'diagnosing', 'repairing', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repairs_status ON public.repairs (status);
CREATE INDEX IF NOT EXISTS idx_repairs_client_id ON public.repairs (client_id);

-- 3.3 budgets (compatible con BudgetService)
CREATE TABLE IF NOT EXISTS public.budgets (
  id          UUID PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  client_id   UUID REFERENCES public.clients(id),
  service_type TEXT NOT NULL,
  description TEXT NOT NULL,
  contact     TEXT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budgets_status ON public.budgets (status);
CREATE INDEX IF NOT EXISTS idx_budgets_client_id ON public.budgets (client_id);

-- 3.4 print_orders (compatible con PrintService)
CREATE TABLE IF NOT EXISTS public.print_orders (
  id          UUID PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  client_id   UUID REFERENCES public.clients(id),
  description TEXT NOT NULL,
  material    TEXT NOT NULL,
  colors      JSONB NOT NULL DEFAULT '[]'::jsonb,
  quantity    INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'printing', 'completed', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_orders_status ON public.print_orders (status);
CREATE INDEX IF NOT EXISTS idx_print_orders_client_id ON public.print_orders (client_id);

-- 3.5 events (sistema de eventos; FK a clients)
CREATE TABLE IF NOT EXISTS public.events (
  id            UUID PRIMARY KEY,
  event_id      UUID NOT NULL,
  type          TEXT NOT NULL,
  entity_id     UUID,
  client_id     UUID REFERENCES public.clients(id),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending',
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_id ON public.events (event_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.events (type);

-- 3.6 event_dlq (dead letter queue; FK a clients)
CREATE TABLE IF NOT EXISTS public.event_dlq (
  id            UUID PRIMARY KEY,
  event_id      UUID NOT NULL,
  type          TEXT NOT NULL,
  entity_id     UUID,
  client_id     UUID REFERENCES public.clients(id),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  failed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  replayed_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'failed'
);

CREATE INDEX IF NOT EXISTS idx_event_dlq_status ON public.event_dlq (status);
CREATE INDEX IF NOT EXISTS idx_event_dlq_failed_at ON public.event_dlq (failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_dlq_event_id ON public.event_dlq (event_id);

-- 3.7 notifications (sistema de notificaciones; FK a clients)
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY,
  client_id       UUID REFERENCES public.clients(id),
  type            TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'email',
  status          TEXT NOT NULL DEFAULT 'pending',
  message         TEXT NOT NULL,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON public.notifications (client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications (type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications (status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);

-- 3.8 admin_activity_log (log de actividad del panel admin)
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  UUID,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_log_user_id ON public.admin_activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_entity ON public.admin_activity_log (entity);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created_at ON public.admin_activity_log (created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. ALTER interview_sessions — SOLO aditivo, sin pérdida de datos
-- ----------------------------------------------------------------------------

-- 4.1 user_id si falta (para auth futuro)
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS user_id UUID NULL;

-- 4.2 índices nuevos (los de status/schema_id ya existen desde 008)
CREATE INDEX IF NOT EXISTS idx_interview_sessions_created_at
  ON public.interview_sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id
  ON public.interview_sessions (user_id)
  WHERE user_id IS NOT NULL;

-- 4.3 CHECK de status compatible si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'interview_sessions_status_check'
      AND conrelid = to_regclass('public.interview_sessions')
  ) THEN
    ALTER TABLE public.interview_sessions
      ADD CONSTRAINT interview_sessions_status_check
      CHECK (status IN ('active', 'completed', 'expired'));
  END IF;
END $$;

-- 4.4 trigger de updated_at si no existe
CREATE OR REPLACE FUNCTION update_interview_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interview_sessions_updated_at ON public.interview_sessions;
CREATE TRIGGER trg_interview_sessions_updated_at
  BEFORE UPDATE ON public.interview_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_interview_sessions_updated_at();

-- 4.5 RLS + políticas service_role (idempotente)
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_select" ON public.interview_sessions;
CREATE POLICY "service_role_all_select"
  ON public.interview_sessions FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all_insert" ON public.interview_sessions;
CREATE POLICY "service_role_all_insert"
  ON public.interview_sessions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all_update" ON public.interview_sessions;
CREATE POLICY "service_role_all_update"
  ON public.interview_sessions FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all_delete" ON public.interview_sessions;
CREATE POLICY "service_role_all_delete"
  ON public.interview_sessions FOR DELETE
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 5. ÍNDICES UNIQUE DE IDEMPOTENCIA
--    Una sesión completada solo puede generar UNA entidad de negocio.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_repairs_session_id ON public.repairs (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_session_id ON public.budgets (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_print_orders_session_id ON public.print_orders (session_id);

-- ----------------------------------------------------------------------------
-- 6. RLS de las tablas de negocio nuevas (service_role solamente)
-- ----------------------------------------------------------------------------
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_clients_select" ON public.clients;
CREATE POLICY "service_role_all_clients_select" ON public.clients FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_clients_insert" ON public.clients;
CREATE POLICY "service_role_all_clients_insert" ON public.clients FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_clients_update" ON public.clients;
CREATE POLICY "service_role_all_clients_update" ON public.clients FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_clients_delete" ON public.clients;
CREATE POLICY "service_role_all_clients_delete" ON public.clients FOR DELETE
  USING (auth.role() = 'service_role');

ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_repairs_select" ON public.repairs;
CREATE POLICY "service_role_all_repairs_select" ON public.repairs FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_repairs_insert" ON public.repairs;
CREATE POLICY "service_role_all_repairs_insert" ON public.repairs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_repairs_update" ON public.repairs;
CREATE POLICY "service_role_all_repairs_update" ON public.repairs FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_repairs_delete" ON public.repairs;
CREATE POLICY "service_role_all_repairs_delete" ON public.repairs FOR DELETE
  USING (auth.role() = 'service_role');

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_budgets_select" ON public.budgets;
CREATE POLICY "service_role_all_budgets_select" ON public.budgets FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_budgets_insert" ON public.budgets;
CREATE POLICY "service_role_all_budgets_insert" ON public.budgets FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_budgets_update" ON public.budgets;
CREATE POLICY "service_role_all_budgets_update" ON public.budgets FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_budgets_delete" ON public.budgets;
CREATE POLICY "service_role_all_budgets_delete" ON public.budgets FOR DELETE
  USING (auth.role() = 'service_role');

ALTER TABLE public.print_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_print_orders_select" ON public.print_orders;
CREATE POLICY "service_role_all_print_orders_select" ON public.print_orders FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_print_orders_insert" ON public.print_orders;
CREATE POLICY "service_role_all_print_orders_insert" ON public.print_orders FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_print_orders_update" ON public.print_orders;
CREATE POLICY "service_role_all_print_orders_update" ON public.print_orders FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_print_orders_delete" ON public.print_orders;
CREATE POLICY "service_role_all_print_orders_delete" ON public.print_orders FOR DELETE
  USING (auth.role() = 'service_role');

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_events_select" ON public.events;
CREATE POLICY "service_role_all_events_select" ON public.events FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_events_insert" ON public.events;
CREATE POLICY "service_role_all_events_insert" ON public.events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_events_update" ON public.events;
CREATE POLICY "service_role_all_events_update" ON public.events FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_events_delete" ON public.events;
CREATE POLICY "service_role_all_events_delete" ON public.events FOR DELETE
  USING (auth.role() = 'service_role');

ALTER TABLE public.event_dlq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_event_dlq_select" ON public.event_dlq;
CREATE POLICY "service_role_all_event_dlq_select" ON public.event_dlq FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_event_dlq_insert" ON public.event_dlq;
CREATE POLICY "service_role_all_event_dlq_insert" ON public.event_dlq FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_event_dlq_update" ON public.event_dlq;
CREATE POLICY "service_role_all_event_dlq_update" ON public.event_dlq FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_event_dlq_delete" ON public.event_dlq;
CREATE POLICY "service_role_all_event_dlq_delete" ON public.event_dlq FOR DELETE
  USING (auth.role() = 'service_role');

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_notifications_select" ON public.notifications;
CREATE POLICY "service_role_all_notifications_select" ON public.notifications FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_notifications_insert" ON public.notifications;
CREATE POLICY "service_role_all_notifications_insert" ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_notifications_update" ON public.notifications;
CREATE POLICY "service_role_all_notifications_update" ON public.notifications FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_notifications_delete" ON public.notifications;
CREATE POLICY "service_role_all_notifications_delete" ON public.notifications FOR DELETE
  USING (auth.role() = 'service_role');

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_activity_log_select" ON public.admin_activity_log;
CREATE POLICY "service_role_all_activity_log_select" ON public.admin_activity_log FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_activity_log_insert" ON public.admin_activity_log;
CREATE POLICY "service_role_all_activity_log_insert" ON public.admin_activity_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_activity_log_delete" ON public.admin_activity_log;
CREATE POLICY "service_role_all_activity_log_delete" ON public.admin_activity_log FOR DELETE
  USING (auth.role() = 'service_role');

COMMIT;

-- ============================================================================
-- POST-VERIFICACIÓN (ejecutar aparte tras COMMIT):
--   SELECT 'clients' AS tabla, count(*) FROM public.clients
--   UNION ALL SELECT 'repairs', count(*) FROM public.repairs
--   UNION ALL SELECT 'budgets', count(*) FROM public.budgets
--   UNION ALL SELECT 'interview_sessions', count(*) FROM public.interview_sessions;
-- Esperado: 0 / 0 / 0 / 31 (o el conteo original de interview_sessions).
-- ============================================================================
