# Configuración de Supabase para Tecno San Juan

## Prerrequisitos

- Cuenta en [Supabase](https://supabase.com) (plan Free suficiente para empezar)
- Proyecto creado en Supabase
- Acceso al SQL Editor del proyecto

---

## Paso 1: Crear el proyecto en Supabase

1. Ingresá a https://supabase.com → **New project**
2. Completá:
   - **Name:** `tecno-san-juan`
   - **Database Password:** (guardala, la vas a necesitar)
   - **Region:** South America (us-east-1 es la más cercana)
3. Esperá a que termine la creación (~2 minutos)
4. Andá a **Project Settings** → **API** y anotá:
   - `Project URL` → será tu `SUPABASE_URL`
   - `anon public key` → será tu `SUPABASE_ANON_KEY`
   - `service_role key` → será tu `SUPABASE_SERVICE_ROLE_KEY`

---

## Paso 2: Ejecutar los scripts SQL

En el SQL Editor de Supabase, ejecutá los archivos en **este orden exacto**:

### 2.1. Esquema + tablas

```
Archivo: database/001_schema.sql
```

- Crea las 23 tablas (15 activas + 8 futuras)
- Crea todas las constraints, claves foráneas y checks
- No borra nada existente (usa `IF NOT EXISTS`/idempotente)

### 2.2. Índices

```
Archivo: database/002_indexes.sql
```

- Crea índices en todas las claves foráneas
- Crea índices GIN para búsqueda full-text (chatbot)
- Crea índices parciales (`WHERE is_active = true`) para consultas frecuentes
- Crea índices trigram para búsqueda por nombre

### 2.3. Row Level Security

```
Archivo: database/003_rls.sql
```

- Habilita RLS en todas las tablas
- Crea políticas de lectura pública para las 15 tablas públicas
- Crea políticas de escritura solo para usuarios autenticados
- Crea políticas restringidas para tablas privadas (employees, audit_log)

### 2.4. Funciones y triggers

```
Archivo: database/004_functions.sql
```

- Crea el trigger `update_updated_at()` en todas las tablas que lo necesitan
- Crea `search_all_tables()` para búsqueda del chatbot
- Crea `get_chatbot_config()` para obtener configuración
- Crea `get_business_context()` para resumen completo del negocio

### 2.5. Datos de ejemplo

```
Archivo: database/005_seed.sql
```

- Puebla todas las tablas con datos de muestra
- Es **idempotente** (se puede ejecutar múltiples veces sin duplicar)

---

## Paso 3: Verificar la instalación

Ejecutá estas consultas en el SQL Editor para verificar que todo funciona:

### Verificar tablas creadas

```sql
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Deberían aparecer 23 tablas.

### Verificar RLS activo

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('__efmigrations_history')
ORDER BY tablename;
```

Todas deben tener `rowsecurity = true`.

### Verificar índices

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### Verificar datos de ejemplo

```sql
SELECT 'business_info' as tabla, count(*) as registros FROM business_info
UNION ALL SELECT 'categories', count(*) FROM categories
UNION ALL SELECT 'services', count(*) FROM services
UNION ALL SELECT 'faqs', count(*) FROM faqs
UNION ALL SELECT 'hours', count(*) FROM hours
ORDER BY tabla;
```

### Probar búsqueda del chatbot

```sql
SELECT * FROM search_all_tables('reparación pantalla precio');
```

Debería devolver resultados de services y otras tablas.

### Probar RLS como usuario anónimo

```sql
-- Esto debería funcionar (lectura pública):
SELECT name, price FROM services WHERE is_active = true LIMIT 5;

-- Esto debería fallar si no estás autenticado:
-- (probarlo desde la API con anon key, no desde el SQL Editor)
```

---

## Paso 4: Configurar Autenticación (Supabase Auth)

### 4.1. Habilitar email/password

1. Andá a **Authentication** → **Providers**
2. Asegurate de que **Email** esté habilitado
3. Opcional: desactivá **Confirm email** si querés crear usuarios rápidamente

### 4.2. Crear usuario administrador

1. Andá a **Authentication** → **Users**
2. **Invite user** → ingresá `admin@tecnosanjuan.com`
3. Establecé una contraseña segura
4. Guardá el **User UID** que aparece en la lista

> **Importante:** Este email debe coincidir con `ADMIN_ALLOWED_EMAILS` en el Worker.

### 4.3. (Opcional) Crear perfil de empleado

```sql
INSERT INTO employees (auth_user_id, name, email, role)
VALUES (
  'UUID_DEL_USUARIO_CREADO',
  'Administrador',
  'admin@tecnosanjuan.com',
  'admin'
);
```

Esto vincula el usuario de auth con el sistema de empleados.

---

## Paso 5: Configurar el Worker con los valores de Supabase

### 5.1. Vars (públicas, van en wrangler.toml)

```toml
[vars]
SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
OPENROUTER_MODEL = "google/gemini-2.0-flash-001"
ADMIN_ALLOWED_EMAILS = "admin@tecnosanjuan.com"
SITE_URL = "https://tecnosanjuan.com"
```

### 5.2. Secrets (solo en Cloudflare, NUNCA en el repositorio)

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OPENROUTER_API_KEY
```

---

## Paso 6: Probar el flujo completo

### 6.1. API pública

```bash
# Obtener servicios
curl https://tu-worker.workers.dev/api/public/services

# Obtener horarios
curl https://tu-worker.workers.dev/api/public/hours
```

Debería devolver JSON con los datos.

### 6.2. Chatbot (consulta simple)

```bash
curl -X POST https://tu-worker.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "¿Cuáles son los horarios?"}'
```

Debería devolver una respuesta directa (source: "database").

### 6.3. Admin (requiere token)

```bash
# Probar sin token (debe dar 401)
curl https://tu-worker.workers.dev/api/admin/services

# Probar con token
curl https://tu-worker.workers.dev/api/admin/services \
  -H "Authorization: Bearer TU_JWT"
```

### 6.4. Frontend

Abrir el sitio desde GitHub Pages. Debería:
- Mostrar el layout completo
- Cargar servicios, promociones, FAQs desde la API
- El chatbot funcional

---

## Resumen de seguridad

| Tabla | Pública (lectura) | Admin (CRUD) | Servicio |
|-------|:-----------------:|:------------:|----------|
| business_info | ✅ | ✅ | Datos generales |
| categories | ✅ (solo activas) | ✅ | Categorías |
| services | ✅ (solo activos) | ✅ | Servicios |
| prices | ✅ (solo activos) | ✅ | Precios |
| promotions | ✅ (solo activas) | ✅ | Promociones |
| warranties | ✅ (solo activas) | ✅ | Garantías |
| print3d | ✅ (solo activos) | ✅ | Impresión 3D |
| faqs | ✅ (solo activas) | ✅ | FAQs |
| social_media | ✅ (solo activas) | ✅ | Redes sociales |
| phones | ✅ (solo activos) | ✅ | Teléfonos |
| emails | ✅ (solo activos) | ✅ | Correos |
| address | ✅ | ✅ | Dirección |
| featured_messages | ✅ (solo activos) | ✅ | Mensajes |
| hours | ✅ (solo activos) | ✅ | Horarios |
| chatbot_config | ✅ | ✅ | Config chatbot |
| clients | ❌ | ✅ | Clientes (futuro) |
| repairs | ❌ | ✅ | Reparaciones (futuro) |
| work_orders | ❌ | ✅ | Órdenes (futuro) |
| budgets | ❌ | ✅ | Presupuestos (futuro) |
| inventory | ❌ | ✅ | Inventario (futuro) |
| employees | ❌ | ✅ (admin) | Empleados (futuro) |
| chat_history | ❌ | ✅ | Historial chat (futuro) |
| audit_log | ❌ | ✅ (solo admin) | Auditoría (futuro) |

## Troubleshooting

**Error: "relation does not exist"**
→ Ejecutá los scripts en orden: 001 → 002 → 003 → 004 → 005

**Error: "permission denied" al insertar datos**
→ Las tablas tienen RLS. Usá el SQL Editor (tiene permisos de dueño) o ejecutá con service_role key.

**El chatbot devuelve "No dispongo de esa información" siempre**
→ Verificá que la función `search_all_tables()` devuelva resultados. Probala directamente en SQL Editor.

**Error de JWT en el admin**
→ Verificá que `SUPABASE_URL` y `SUPABASE_ANON_KEY` sean correctos en el frontend. El token se obtiene de Supabase Auth al hacer login.
