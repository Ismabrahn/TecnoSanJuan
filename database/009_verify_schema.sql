-- ============================================================================
-- 009_verify_schema.sql
-- VERIFICACIÓN PRE-MIGRACIÓN: LEGACY (database/) vs NUEVO (supabase/migrations)
-- ----------------------------------------------------------------------------
-- NO DESTRUCTIVO: solo lecturas. Ejecutar en Supabase SQL Editor.
--
-- Objetivo: confirmar, antes de cualquier DROP/ALTER, el estado real de las
-- tablas en producción para decidir si se pueden reemplazar sin perder datos.
--
-- Responde:
--   1. ¿Qué tablas conflictivas existen?
--   2. ¿Cuántas filas tiene cada una? (vacía / con datos / no existe)
--   3. ¿Qué forma tiene el esquema actual? (legacy BIGINT vs nuevo UUID)
--   4. ¿Qué objetos dependen de ellas? (FKs, secuencias, triggers, RLS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tablas existentes (existencia real en producción)
-- ----------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'clients', 'repairs', 'budgets', 'interview_sessions',
      'print_orders', 'notifications', 'events', 'event_dlq', 'admin_activity_log'
  )
ORDER BY table_name;

-- ----------------------------------------------------------------------------
-- 2. Conteo de filas por tabla (tolerante a tablas inexistentes)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _row_counts (table_name text PRIMARY KEY, rows bigint);
  TRUNCATE _row_counts;
  FOREACH t IN ARRAY ARRAY[
      'clients', 'repairs', 'budgets', 'interview_sessions',
      'print_orders', 'notifications', 'events', 'event_dlq', 'admin_activity_log'
  ]::text[]
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
      INSERT INTO _row_counts VALUES (t, n);
    EXCEPTION WHEN undefined_table THEN
      INSERT INTO _row_counts VALUES (t, NULL);
    END;
  END LOOP;
END $$;

SELECT table_name,
       rows,
       CASE
         WHEN rows IS NULL THEN 'NO EXISTE'
         WHEN rows = 0    THEN 'VACIA (dropeable)'
         ELSE 'TIENE DATOS (NO dropear)'
       END AS estado
FROM _row_counts
ORDER BY table_name;

-- ----------------------------------------------------------------------------
-- 3. Forma del esquema actual de las tablas en conflicto
--    (id BIGINT + columnas legacy  => estructura 001_schema.sql)
--    (id UUID + session_id         => estructura migrations nuevas)
-- ----------------------------------------------------------------------------
SELECT table_name, ordinal_position, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('clients', 'repairs', 'budgets', 'interview_sessions')
ORDER BY table_name, ordinal_position;

-- ----------------------------------------------------------------------------
-- 4. Dependencias de claves foráneas hacia las tablas en conflicto
--    (qué tablas hijas se romperían si se dropea la tabla padre)
-- ----------------------------------------------------------------------------
SELECT tc.table_name    AS tabla_hija,
       tc.constraint_name,
       kcu.column_name  AS columna_hija,
       ccu.table_name   AS tabla_padre
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema   = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema   = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name IN ('clients', 'repairs', 'budgets', 'interview_sessions')
ORDER BY ccu.table_name, tc.table_name;

-- ----------------------------------------------------------------------------
-- 5. Estado de Row Level Security
-- ----------------------------------------------------------------------------
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'repairs', 'budgets', 'interview_sessions')
ORDER BY tablename;

-- ----------------------------------------------------------------------------
-- 6. Secuencias (indicador de estructura legacy: GENERATED ALWAYS AS IDENTITY)
-- ----------------------------------------------------------------------------
SELECT sequence_name
FROM information_schema.sequences
WHERE sequence_schema = 'public'
  AND sequence_name IN ('clients_id_seq', 'repairs_id_seq', 'budgets_id_seq')
ORDER BY sequence_name;

-- ----------------------------------------------------------------------------
-- 7. Triggers de actualización automática presentes
--    (legacy: update_updated_at() global | nuevo: update_<tabla>_updated_at())
-- ----------------------------------------------------------------------------
SELECT event_object_table AS tabla, trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('clients', 'repairs', 'budgets', 'interview_sessions')
ORDER BY event_object_table, trigger_name;
