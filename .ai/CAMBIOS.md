# CAMBIOS.md — Nexus

Memoria de evolución. Solo entran acá cambios de **arquitectura, módulos, reglas o
decisiones importantes** — no es un changelog de commits, para eso está git.

Repositorio: https://github.com/Ismabrahn/TecnoSanJuan

---

## 2026-07-30 — Navegación de código en `.ai/`

- Se agregó a `MODULOS.md` una guía de navegación rápida con puntos de entrada,
  funciones relevantes y recorridos para chat web, Interview, WhatsApp, tools,
  panel admin, servicios de negocio y rutas HTTP.
- El objetivo es que una persona o IA nueva pueda ubicar el primer archivo y la
  dirección correcta de un cambio sin recorrer todo el repositorio.

## 2026-07-30 — Autenticación del panel admin

- Se reemplazó la configuración de ejemplo de Supabase en `admin/js/auth.js` por
  la instancia real del proyecto y su clave pública `anon`.
- El inicio de sesión del panel conserva una interfaz de solo contraseña; el
  correo administrador se define internamente para completar el flujo de
  autenticación de Supabase.
- El correo interno de autenticación se ajustó a `admin@tecnosanjuan.com`, que
  corresponde al usuario administrador existente en Supabase Auth.

## 2026-07-28 — Cambios de código

- `fix(interview)`: se resolvió el flujo de entrevista en producción y se previno
  la filtración de texto de planificación (planning text leakage) hacia el usuario.

## 2026-07-28 — Cambios de documentación `.ai/`

- Se actualizó la memoria estructurada `.ai/` (README, DECISIONES, MODULOS, REGLAS,
  CAMBIOS) para reflejar el estado real del proyecto.
- Se documentó el estado real del backend: arquitectura completa de producción con
  engine de IA (`NexusAIEngine`), sistema de tool calls, `PlanningEngine`,
  `ProfileManager`, `ChatRuntime`, `ContextManager`, `ConversationManager`.
- Se documentó la integración bidireccional con WhatsApp via Meta Cloud API.
- Se documentó el subsistema Interview como completamente implementado (versión
  actual en `services/interview/v2/`).
- Se documentaron las tablas de Supabase realmente existentes con migrations.
- Se documentó el sistema de eventos asíncronos (EventBus, EventQueue, DLQ) y
  el sistema de notificaciones.
- Se registró la existencia de 1369+ tests en Vitest cubriendo todos los módulos.

---

## 2026-07-27

- `feat(interview)`: integración del motor Interview con el handler de chat,
  WhatsApp y la API. El motor de entrevistas quedó completamente conectado al
  flujo de producción.
- Se creó la tabla `interview_sessions` en Supabase con sus índices.
- `fix(schema-registry)`: los schemas de servicios se cambiaron a imports ES
  estáticos para compatibilidad con Cloudflare Workers (no permite imports
  dinámicos de archivos en producción).
- `wrangler.toml`: se agregaron `compatibility_flags` para compatibilidad con
  Node.js; se limpiaron triggers redundantes; se actualizaron `kv_namespaces`
  y variables de entorno.
- **Release Candidate** del stack Nexus AI Platform (commit: 2026-07-27T02:32).

---

## 2026-07-25

- Cleanup: se eliminó código muerto (simple-query, exports sin uso).
- **Eliminación y reconstrucción del sistema de entrevistas**: el sistema anterior
  fue eliminado completamente y reemplazado por el subsistema Interview actual
  (directorio `services/interview/v2/`).
- Extracción múltiple de entidades + schemas en `.js` + migración a Wrangler 4.
- Refactorización interna del motor Interview: separación limpia entre el motor de
  recolección de datos y la capa de IA conversacional.
- Migración completa: se eliminó la ruta antigua de `chat.js`, se implementó
  prefill de datos, se agregaron tests de integración.
- Se detectó y corrigió bug de consistencia eventual en KV: se dio prioridad al
  estado de entrevista del cliente sobre el KV store (las sesiones de Cloudflare
  KV tienen eventual consistency).
- Se agregó logging `[STATE_TRACE]` para debugging de estado en producción.
- Se agregó campo `engineVersion` al estado para detectar sesiones legacy de KV.
- `chat.js`: se implementó rate limiting por IP y detección de spam.
- Se agregaron campos `phone`/`website` al módulo de business-info en el admin.
- CI/CD: se fijó el workflow de deploy con Node 22 + Wrangler directo.

---

## 2026-07-24

- Se implementó el sistema de admin con gestión de conversaciones, asignación de
  admins, vista de historial y búsqueda.
- Se agregó soporte de KV namespace de Cloudflare para persistencia de sesiones
  de entrevista (alternativa a Supabase para sesiones de corta duración).
- El chatbot web ya usa `data.summary` para mostrar el resumen al usuario al
  completar la entrevista, con fallback a `data.response`.

---

## Línea de tiempo del proyecto (reconstruida de commits)

Esta sección registra los hitos arquitectónicos mayores en orden cronológico.
Fuente: historial de commits del repositorio GitHub.

| Fecha | Evento |
|---|---|
| Antes de 2026-07-24 | Versión original: HTML autocontenido, chat simple de intake de pedidos para negocio de impresión 3D/LED, salida a mensaje de WhatsApp pre-armado, integración directa con API de Anthropic. Sin backend propio ni base de datos. |
| ~2026-07-24 | **Pivot**: el objetivo cambió de administrar pedidos de 3D/LED a administrar automáticamente clientes y trabajo del servicio técnico de celulares (Tecno San Juan). Eso requirió una arquitectura nueva: backend (Worker), base de datos real (Supabase) y motor de IA capaz de razonar sobre múltiples entidades. |
| ~2026-07-24 | Integración de WhatsApp via Meta Cloud API (rate limiting, spam detection) |
| ~2026-07-24–25 | Primera versión del sistema de entrevistas (luego eliminada y reconstruida) |
| 2026-07-25 | Eliminación del sistema de entrevistas antiguo; reconstrucción como Interview v2 |
| 2026-07-25 | Refactorización interna del motor Interview: separación motor puro / IA conversacional |
| 2026-07-25 | Migración a Wrangler 4; fix de eventual consistency en KV sessions |
| 2026-07-27 | Release Candidate: stack completo Nexus AI Platform |
| 2026-07-27 | Fix schema-registry: static imports para Cloudflare Workers |
| 2026-07-27 | Creación de tabla `interview_sessions` en Supabase |
| 2026-07-27 | feat: Interview integrado con chat + WhatsApp + API |
| 2026-07-28 | fix: flujo de entrevista en producción + prevención de text leakage |
| 2026-07-28 | Primera versión de la memoria estructurada `.ai/` |

---

## Notas técnicas importantes extraídas de la historia

- **KV vs Supabase para sesiones**: Cloudflare KV tiene eventual consistency. Se
  resolvió dando siempre prioridad al estado de la sesión del cliente en memoria
  sobre el KV store. Las sesiones de entrevista de larga duración se persisten en
  Supabase (`interview_sessions`).
- **Schema-registry**: los schemas de servicios de Interview deben ser ES imports
  estáticos (no `import()` dinámicos) por restricciones de Cloudflare Workers.
- **Text leakage**: el `PlanningEngine` genera texto interno de planificación que
  NO debe llegar al usuario. Hay una capa explícita que filtra/formatea la respuesta
  antes de enviarla. No modificar este filtro sin entender la implicancia.
- **Interview: una sola versión activa**. El directorio `services/interview/v2/`
  contiene el subsistema de entrevistas actual. No existe versión v3: hubo una
  refactorización interna del mismo motor (separación de responsabilidades) que
  el equipo referenció informalmente, pero el código sigue en `v2/`. Si se crea una
  versión nueva del subsistema, se creará un directorio `v3/`; hasta entonces,
  toda referencia a Interview apunta a `services/interview/v2/`.
