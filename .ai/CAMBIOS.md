# CAMBIOS.md — Nexus

Memoria de evolución. Solo entran acá cambios de **arquitectura, módulos, reglas o
decisiones importantes** — no es un changelog de commits, para eso está git.

Repositorio: https://github.com/Ismabrahn/TecnoSanJuan

---

## 2026-08-03 — Fix definitivo del primer mensaje en producción y limpieza de logs de diagnóstico

- **Causa raíz encontrada:** `AIAdapter` aliasaba `globalThis.fetch` en un campo
  privado y lo invocaba como `this.#fetch(...)`. En el runtime de Cloudflare
  Workers el `fetch` nativo exige el scope global como receptor; con la instancia
  de `AIAdapter` como `this` lanzaba `TypeError: Illegal invocation`, envuelto
  como `AINetworkError` y tragado en silencio por el `catch` de `start()`. El
  sistema parecía funcionar por el fallback heurístico; la extracción IA real
  nunca corría en producción. En tests y en Node local no fallaba porque se
  inyecta un fetch mock y el fetch de Node no es sensible al receptor.
- **Fix 1 (`f41efcb`):** `ai-adapter.js` — `globalThis.fetch.bind(globalThis)`
  preserva el receptor correcto en Workers; los mocks inyectados en tests no se
  tocan.
- **Fix 2 (`57d24cd`):** `interview-router.js` — `startInterview()` ahora propaga
  `summary` desde `InterviewController.start()`. Antes se descartaba y el usuario
  recibía el fallback genérico "Solicitud procesada correctamente." en lugar del
  `summaryTemplate` del schema.
- **Diagnóstico con logs temporales:** se agregaron `[Interpreter:RAW]`
  (`8fe2999`), `[Interpreter:AI_ERROR]` y `[ChatRuntime:ROUTE]` (`2485025`) para
  localizar el punto de falla. Una vez confirmados los fixes en producción, se
  eliminan los tres. El log permanente `[AIAdapter]` se conserva.
- **Verificado en producción:** el mensaje "Hola, se me cayó el Samsung S23 al
  agua, soy Juan, mi número es 3405806523" extrae `clientName`, `clientPhone`,
  `device` y `problem`, completa la entrevista en el primer turno y responde con
  el `summaryTemplate` del schema.
- **Tests:** 1360 pasan / 12 fallan (los mismos tests stale de
  `interview-router.test.js`).

---

## 2026-08-03 — Fix: contrato de claves entre Interpreter y schemas de Interview

- **Motivo:** el primer mensaje se persistía e interpretaba, pero los campos
  extraídos no se aplicaban porque el LLM devolvía claves genéricas (`name`,
  `phone`, `equipment`, `issue`) en lugar de los `field.id` exactos del schema
  (`clientName`, `clientPhone`, `device`, `problem`).
- **Cambio:** se actualizó el system prompt de `interpreter.js` para exigir
  explícitamente que las claves del objeto `fields` coincidan exactamente con
  los `field.id` definidos en el schema. Se agregaron ejemplos correctos e
  incorrectos.
- **Comportamiento:** cuando el LLM respeta los IDs del schema, el primer
  mensaje alimenta `InterviewController.start()` y los campos válidos se aplican
  automáticamente. Si el mensaje completa todos los campos requeridos, la
  entrevista finaliza en el primer turno.
- **Tests:** 1360 pasan / 12 fallan. Los 12 fallos siguen siendo los tests stale
  de `interview-router.test.js`.

---

## 2026-08-03 — Primer mensaje: persistencia y aplicación automática de campos válidos

- **Motivo:** el mensaje inicial que dispara una entrevista (ej. "Hola, se me
  rompió la pantalla del iPhone, soy Juan, mi teléfono es 123456789") contenía
  datos útiles que se descartaban; el sistema volvía a pedir nombre, teléfono y
  problema.
- **Cambios implementados:**
  - `services/interview/v2/interview-controller.js`: `start(schema, message)`
    ahora acepta un mensaje opcional, lo guarda en `state.metadata.initialMessage`
    y, si hay `Interpreter`, extrae campos y aplica los que sean válidos según el
    schema.
  - Nuevo helper privado `#applyExtractedFields` reutilizado por `start` y
    `answerMessage` para mantener una sola lógica de validación/aplicación.
  - `services/nexus/interview-router.js`: `startInterview(schemaId, message)`
    reenvía el mensaje original al controller.
  - `services/nexus/chat-runtime.js`: pasa el mensaje del usuario a
    `startInterview` cuando se detecta una intención de entrevista.
  - Tests en `services/interview/v2/interview-controller.test.js`: cobertura de
    metadata `initialMessage`, seeding de campos válidos, descarte de campos
    inválidos y comportamiento sin `Interpreter`.
- **Comportamiento:** la entrevista avanza según los campos que ya pasaron
  validación; los inválidos se descartan sin bloquear el flujo. Si el mensaje no
  aporta campos válidos, la entrevista comienza desde la primera pregunta.
- **Tests:** nuevo baseline `1360 pasan / 12 fallan` en `backend/worker`. Los 12
  fallos siguen siendo los tests stale de `interview-router.test.js` (regex High
  Precision); no se introdujeron nuevos fallos.

---

## 2026-08-03 — Baseline de tests y tests stale detectados

- Se ejecutó `npm test` en `backend/worker`: **1357 tests pasan, 12 fallan**.
- Los 12 fallos están en `src/services/nexus/interview-router.test.js`: el test
  espera que frases como `"no funciona mi equipo"`, `"pantalla rota"`,
  `"quiero saber el precio"`, `"presupuesto de reparación"`, `"necesito un diseño 3d"`
  inicien entrevistas, pero los patrones regex actuales (más estrictos tras el
  ajuste de 2026-07-30) no las matchean.
- Esto indica que los tests quedaron desactualizados respecto a la decisión de
  **High Precision** (no High Recall) del `InterviewRouter`.
- Se registra este baseline; los tests no se modifican en Cambio 0 porque el
  objetivo es consolidar el estado actual. Se abordarán en un cambio posterior.

---

## 2026-08-03 — Corrección de inconsistencia detectada entre `.ai/` y el código

- Se detectó que `backend/worker/src/services/interview/v2/schemas/repair-request.json`
  tenía `minimumRequired` eliminado en el working tree, mientras que
  `print-order.json` y `budget-request.json` aún conservaban `minimumRequired: 2`.
- Se corrigió `.ai/README.md` y `.ai/DECISIONES.md` para reflejar el estado real
  del código: decisión tomada de eliminar el campo, pero implementación parcial
  en este momento.
- Esta corrección aplica la regla: **el código es la fuente de verdad**.

---

## 2026-08-03 — Cambio 6: eliminar `minimumRequired` de todos los schemas de Interview

- **Motivo:** con `minimumRequired: 2`, las entrevistas finalizaban tras nombre
  + teléfono, sin recopilar datos del negocio (equipo, problema, pieza, material,
  cantidad, tipo de servicio, descripción).
- **Cambio:** se elimina `minimumRequired` de `print-order.json` y
  `budget-request.json` (ya estaba eliminado de `repair-request.json`).
- **Comportamiento:** ahora las entrevistas completan cuando todos los campos
  `required` no-skipped están respondidos.
- **Nota:** campos opcionales al final del `fieldOrder` (`urgency` en
  `repair-request`, `contact` en `budget-request`) no se preguntan porque la
  entrevista ya completó los requeridos. Cambiar eso requiere marcarlos como
  `required: true` o modificar la semántica del motor — fuera de alcance de este
  cambio.
- **Tests:** baseline 1357 pasan / 12 fallan en `interview-router.test.js` por
  tests stale. No se introdujeron nuevos fallos.

---

## 2026-08-03 — Nueva regla de mantenimiento de `.ai/`

- Se agrega a `.ai/REGLAS.md` la regla: **la memoria estructurada describe
  siempre el estado actual del proyecto**; las funcionalidades planificadas o
  futuras deben identificarse explícitamente como tales y nunca presentarse como
  implementadas.

---

## 2026-08-03 — Arquitectura v1 definida y plan revisado

- Se define oficialmente la **Nexus Architecture v1** en `.ai/README.md`, con
  capas claras: Adaptadores → Dominio → Infraestructura, y principios de diseño
  para soportar Tool Calling, MCP, agentes especializados y nuevos canales.
- Se documenta el **Completion Pipeline** (`services/completion/`) como módulo de
  dominio planificado: único punto de orquestación para crear registros de
  negocio al completar una entrevista, invocable desde web, WhatsApp y futuras
  tools/agentes.
- Se corrige la memoria respecto a Cloudflare KV: las sesiones de entrevista v2
  viven únicamente en Supabase (`interview_sessions`); KV es legacy para
  sesiones de conversación.
- Se registra la decisión de eliminar `minimumRequired` de los schemas de
  entrevista y usar la completitud por campos requeridos.
- Se documenta la estrategia de 3 etapas para el primer mensaje de una
  entrevista: persistir → extraer sugerencias → aplicar con compuerta de
  confianza.
- Se establece que no habrá modo dry-run técnico: la validación de datos
  completados será un flujo de trabajo del panel admin (`repairs.status='received'`,
  `budgets.status='pending'`).
- Se actualizan `.ai/MODULOS.md` y `.ai/REGLAS.md` para reflejar el estado real
  del subsistema Interview v2 y las nuevas reglas de arquitectura v1.
- Esta revisión **no incluye código**: es la base obligatoria antes de iniciar
  la implementación incremental del chat público.

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
- **Fix Crítico de Autorización JWT**: Se restauró la validación del JWT de
  acceso (User Token) utilizando `JWKS` (`createRemoteJWKSet`), para soportar el
  algoritmo **ES256/RS256** configurado en la instancia de Supabase. Se removió
  la validación estricta de la cadena del `issuer` que causaba falsos positivos
  de error 401.
- Se implementó un saneamiento riguroso en el middleware de autorización
  (`middleware/auth.js`) para ignorar espacios, comillas accidentales y
  diferencias de mayúsculas/minúsculas entre el email extraído del JWT y la
  variable de entorno `ADMIN_ALLOWED_EMAILS`. Además, se agregó reporte
  detallado en el error 403.

## 2026-07-30 — Fix de Comportamiento Conversacional y Memoria (Interview vs Chat)

- **Motivo del cambio**: Consultas informativas simples (ej. "¿cuánto cuesta un mouse?")
  estaban disparando falsos positivos en el `InterviewRouter`, iniciando flujos
  de recolección de datos (pedir nombre/teléfono) que resultaban en solicitudes
  de presupuesto vacías. Adicionalmente, el motor de IA principal (`PlanningEngine`)
  sufría pérdida de contexto (amnesia) tras terminar un flujo o recibir mensajes
  cortos (ej. "¿qué?"), debido a que el historial de conversación no se estaba
  inyectando en su prompt.
- **Archivos Modificados**: 
  - `backend/worker/src/services/nexus/interview-router.js`
  - `backend/worker/src/services/nexus/planning-engine.js`
- **Decisión y Comportamiento Esperado**: 
  1. Se ajustaron las expresiones regulares en `interview-router.js` (`budget-request`, 
     `repair-request`, `print-order`) para requerir intenciones claras mediante verbos 
     de acción (ej. "necesito reparar", "se me rompió", "cotización para arreglar"). 
     Consultas de precios o información genérica ya no inician el `Interview` y
     pasan directamente al LLM para una respuesta conversacional.
  2. Se expuso el `conversationHistory` en la plantilla base del `PlanningEngine`.
     El LLM ahora tiene acceso a toda la ventana de contexto de la sesión, permitiendo
     mantener conversaciones naturales coherentes después de flujos interrumpidos
     o consultas cortas.
- **Nueva regla de arquitectura**: El `InterviewRouter` debe utilizar validaciones
  estrictas (High Precision) en vez de coincidencia difusa (High Recall). Es preferible
  que la IA atienda una solicitud vagamente formulada de forma conversacional hasta
  que el usuario exprese una intención clara, antes que disparar un flujo estructurado
  por error.

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
