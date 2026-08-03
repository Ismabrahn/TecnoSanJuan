# MODULOS.md — Nexus

Mapa completo del sistema: módulos de producto e infraestructura, con estado real
y ubicación en el código.

---

## Módulos de producto

| Módulo | Función | Estado | Ubicación principal |
|---|---|---|---|
| Chat (web) | Atención por chat web: FAQ, info del negocio, horarios, entrevistas | ✅ Funcional | `js/chatbot.js` |
| Chat (WhatsApp) | Atención bidireccional por WhatsApp (entrada + salida) | ✅ Funcional | `handlers/chat.js`, `services/whatsapp/` |
| Interview | Recolecta datos estructurados para reparación, presupuesto e impresión 3D | ✅ Implementado | `services/interview/v2/` |
| Completion Pipeline *(planificado)* | Orquesta finalización de entrevistas: validación → cliente → entidad de negocio → eventos | 🟡 Planificado | `services/completion/` |
| Admin — Conversaciones | Gestión de conversaciones activas desde el panel interno | 🟡 En construcción | `admin/js/admin.js`, `handlers/admin.js` |
| Admin — Clientes | Gestión de clientes: datos personales, historial | 🟡 En construcción | `admin/js/modules/clients/` |
| Admin — Reparaciones | Ciclo de vida de reparaciones | 🟡 En construcción | `admin/js/modules/repairs/` |
| Admin — Presupuestos | Creación y seguimiento de presupuestos | 🟡 En construcción | `admin/js/modules/budgets/` |
| Admin — Dashboard | Vista general: estadísticas, actividad reciente | 🟡 En construcción | `admin/js/modules/dashboard/` |
| Admin — AI Assistant | Asistente IA para uso interno del admin | 🟡 En construcción | `admin/js/ai-assistant.js`, `services/nexus/admin-assistant.js` |
| Print Orders | Órdenes de impresión 3D (schemas y servicio existen; uso final en revisión) | 🟡 Mantenido | `admin/js/modules/print-orders/`, `services/business/print-service.js` |

---

## Infraestructura del backend (Worker)

### Motor de IA — `services/nexus/`

| Componente | Responsabilidad |
|---|---|
| `chat-runtime.js` | Orquestador principal. Decide: ¿entrevista activa? → `InterviewRouter`; sino → `NexusAIEngine` |
| `nexus-ai-engine.js` | Motor de IA. Construye prompt, llama LLM, procesa tool calls, retorna resultado. Sin estado propio. |
| `planning-engine.js` | Dado un mensaje y contexto, determina qué acción tomar. No ejecuta, solo planifica. |
| `tool-registry.js` | Almacena herramientas disponibles `{ name, description, parameters, execute }` |
| `tool-executor.js` | Ejecuta herramientas por nombre con trazabilidad y métricas |
| `profile-manager.js` | Perfiles `customer`, `admin`, `superadmin` con sus `allowedTools[]` |
| `context-manager.js` | Sesiones de conversación en memoria: historial, clientId, estado de entrevista |
| `conversation-manager.js` | CRUD de conversaciones: crear, buscar, filtrar, asignar, estadísticas |
| `conversation-memory.js` | Memoria clave-valor por conversación con TTL (max 10k entries, prune cada 60s) |
| `conversation-session.js` | Modelo de datos de una conversación: id, cliente, canal, estado, historial |
| `observability.js` | Métricas: latencia, tools ejecutadas, errores, mensajes procesados |
| `admin-assistant.js` | Variante del engine para uso interno del panel admin |
| `interview-router.js` | Puente entre Nexus e Interview. Detecta intención, inicia/avanzas entrevista. |
| `client-resolver.js` | Resuelve cliente (nombre + teléfono) a registro en `clients` |
| `interview/completion-handler.js` | Crea registro de negocio (`repair`/`budget`/`print-order`) y cliente al completar entrevista |

### Tools del motor — `services/nexus/tools/`

| Tool | Propósito |
|---|---|
| `conversation-tools.js` | Buscar, crear, actualizar conversaciones |
| `admin-tools.js` | Asignar admin, enviar respuestas, obtener estadísticas |
| `interview-tools.js` | Iniciar, avanzar, completar entrevistas |

### Interview — `services/interview/v2/`

Pipeline de recolección de datos estructurada. Ver `SCHEMA_SPECIFICATION.md` en esa
carpeta para el detalle del schema de servicios.

| Componente | Responsabilidad |
|---|---|
| `interview-controller.js` | Orquesta el pipeline: pregunta → interpreta → resuelve → avanza |
| `flow-evaluator.js` | Determina siguiente campo, completitud y deadlocks según schema y estado |
| `question-generator.js` | Genera la pregunta a mostrar según el campo pendiente |
| `interpreter.js` | Único módulo de v2 que llama a OpenRouter. Extrae entidades del mensaje. |
| `inference-engine.js` | Aplica reglas de inferencia declarativas del schema |
| `condition-evaluator.js` | Evalúa condiciones `skipIf` y `dependsOn` |
| `state-keeper.js` | Estado inmutable de la entrevista con historial |
| `schema-registry.js` | Carga, valida y cachea schemas JSON |
| `schema-index.js` | Mapa de schemas integrados (imports ES estáticos) |
| `stores/supabase-session-store.js` | Persistencia de sesiones en Supabase (`interview_sessions`) |
| `stores/memory-session-store.js` | Persistencia en memoria para tests |
| `session-store.js` | Clase base abstracta de los stores |
| `ai-adapter.js` | Adaptador hacia OpenRouter para el Interpreter y QuestionGenerator |
| `constants.js`, `errors.js`, `utils.js` | Constantes, errores y helpers |

**Pipeline:**
```text
1. ¿Nuevo? → pregunta inicial (welcome + primera pregunta)
2. Interpretar → AI extrae entidades del mensaje del usuario
3. Validar → valida contra schema del servicio
4. Inferir → aplica reglas declarativas del schema
5. Avanzar → FlowEvaluator determina siguiente campo
6. ¿Completo? → generar resumen + structuredSummary
```

### Completion Pipeline — `services/completion/` (planificado)

Módulo de dominio que orquesta el cierre de una entrevista completada.

| Componente | Responsabilidad |
|---|---|
| `completion-pipeline.js` | Punto único: validar → resolver cliente → insertar entidad → actualizar sesión → emitir evento |
| `validation/` | Validar campos críticos del negocio antes de insertar |
| `client-resolver.js` | Upsert de cliente por teléfono (delega en `services/business/client-service.js`) |
| `entity-handler.js` | Delega en `CompletionHandler` para insertar repair/budget/print-order |
| `event-emitter.js` | Emite eventos al bus/queue existente |

**Nota:** actualmente `CompletionHandler` (`services/nexus/interview/completion-handler.js`) existe y está testeado, pero **no está cableado** al flujo de chat. El Completion Pipeline lo envolverá y será invocable desde cualquier canal (web, WhatsApp, tools/agentes).

### WhatsApp — `services/whatsapp/`

| Archivo | Responsabilidad |
|---|---|
| `webhook-handler.js` | Recibe y valida webhooks de Meta |
| `webhook-validator.js` | Verifica firma HMAC del webhook |
| `message-parser.js` | Parsea el payload de Meta a estructura interna |
| `meta-whatsapp-channel.js` | Envía mensajes via Meta Cloud API |
| `whatsapp-service.js` | Orquestador del canal: entrada + salida |
| `contact-resolver.js` | Resuelve contacto de WhatsApp → cliente en Supabase |
| `media-handler.js` | Manejo de mensajes con media (imágenes, audio) |
| `whatsapp-real-tools.js` | Tools del engine específicas para el canal WhatsApp |

### Business — `services/business/`

| Servicio | Responsabilidad |
|---|---|
| `client-service.js` | CRUD de clientes en Supabase |
| `repair-service.js` | CRUD de reparaciones en Supabase |
| `budget-service.js` | CRUD de presupuestos en Supabase |
| `print-service.js` | CRUD de órdenes de impresión en Supabase |

### Eventos — `services/events/`

| Archivo | Responsabilidad |
|---|---|
| `event-bus.js` | Bus central de eventos pub/sub |
| `event-queue.js` | Cola persistente de eventos con procesamiento asíncrono |
| `event-repository.js` | Persistencia de eventos en Supabase |
| `event-worker.js` | Worker que procesa la cola de eventos |
| `event-dispatcher.js` | Despacha eventos a los handlers registrados |
| `event-types.js` | Tipos de eventos del sistema |
| DLQ (`create_event_dlq.sql`) | Dead Letter Queue para eventos fallidos |

### Notificaciones — `services/notifications/`

| Archivo | Responsabilidad |
|---|---|
| `notification-service.js` | Orquestador de notificaciones |
| `notification-template.js` | Templates para diferentes tipos de notificación |
| `channels/` | Canales de entrega (WhatsApp, email, etc.) |

### Handlers — `handlers/`

| Handler | Responsabilidad |
|---|---|
| `chat.js` | Entrada principal de mensajes. Rate limiting, spam detection, pipeline de mensaje. |
| `admin.js` | Panel admin: auth JWT, CRUD conversaciones, asignación, estadísticas |
| `admin-ai.js` | Endpoint de IA para el admin panel |
| `public.js` | Endpoints públicos (info del negocio, horarios) |
| `whatsapp-webhook.js` | Handler dedicado del webhook de WhatsApp |

---

## Guía de navegación rápida

Usar esta sección para llegar al primer punto de código cuando se conoce el cambio
que se quiere hacer, pero no el módulo. Las rutas son relativas a
`backend/worker/src/`, salvo que indiquen lo contrario.

| Quiero cambiar o investigar… | Empezar por | Punto de interés | Seguir hacia |
|---|---|---|---|
| El mensaje que se muestra en el chat web durante una entrevista | `../../../js/chatbot.js` | Bloque que procesa `data.interview`; muestra `data.response` con `addMessage()` y actualiza el progreso | `../../../js/api.js` → `handlers/chat.js` |
| El estado de entrevista que devuelve el backend al navegador | `handlers/chat.js` | Construcción de `responseData.interview` después de `runtime.handleMessage()` | `services/nexus/chat-runtime.js` |
| Cuándo un mensaje inicia una entrevista | `services/nexus/interview-router.js` | `shouldStartInterview()` y `selectSchema()` | `services/nexus/chat-runtime.js` → `services/nexus/tools/interview-tools.js` |
| El inicio de una entrevista y su primera pregunta | `services/nexus/interview-router.js` | `startInterview(schemaId)` | `services/interview/v2/interview-controller.js` → `start()` |
| Cómo se interpreta, valida y avanza una respuesta de entrevista | `services/interview/v2/interview-controller.js` | `answerMessage()` y el resultado con `question`, `interviewComplete`, `summary` | `interpreter.js` → `flow-evaluator.js` → `question-generator.js` |
| Los campos, validaciones y resumen de una reparación | `services/interview/v2/schemas/repair-request.json` | `fields`, reglas de validación y `whatsappTemplate` | `schema-registry.js` → `interview-controller.js` |
| La entrada, seguridad y respuesta de WhatsApp | `handlers/chat.js` | Pipeline de mensaje, rate limit y creación de `ChatRuntime` | `services/whatsapp/` → `services/nexus/chat-runtime.js` |
| La validación del webhook de Meta | `services/whatsapp/webhook-validator.js` | Verificación de firma HMAC | `services/whatsapp/webhook-handler.js` |
| El razonamiento de Nexus y la ejecución de herramientas | `services/nexus/nexus-ai-engine.js` | `process()` | `planning-engine.js` → `tool-executor.js` → `tools/` |
| Una nueva tool del motor de IA | `services/nexus/tools/` | Implementación `{ name, description, parameters, execute }` | `tools/index.js` → `profile-manager.js` → test de la tool |
| Reglas de acceso por perfil | `services/nexus/profile-manager.js` | Perfiles y `allowedTools[]` | `tool-executor.js` |
| Clientes, reparaciones o presupuestos en Supabase | `services/business/` | `client-service.js`, `repair-service.js` o `budget-service.js` | `../supabase/migrations/` |
| Una vista o acción del panel administrativo | `../../../admin/js/modules/` | Módulo de UI correspondiente (`clients`, `repairs`, `budgets`, `dashboard`) | `handlers/admin.js` |
| Rutas HTTP expuestas por el Worker | `router.js` | Despacho por path y método | Handler o API del módulo correspondiente |
| Finalización de entrevista → negocio | `services/nexus/interview/completion-handler.js` | `handle()` y los métodos `#processRepair`/`Budget`/`PrintOrder` | `services/business/` + `services/nexus/client-resolver.js` |
| Persistencia de sesiones de entrevista | `services/interview/v2/stores/supabase-session-store.js` | `create()`/`update()`/`get()` | `services/interview/v2/session-store.js` |

---

### Recorridos principales

**Entrevista desde el chat web**

```text
js/chatbot.js
  → js/api.js
  → handlers/chat.js
  → services/nexus/chat-runtime.js
  → services/nexus/interview-router.js
  → services/interview/v2/interview-controller.js
  → services/interview/v2/stores/supabase-session-store.js
```

**Mensaje entrante por WhatsApp**

```text
Meta Cloud API
  → services/whatsapp/webhook-handler.js
  → services/whatsapp/webhook-validator.js
  → handlers/chat.js
  → services/nexus/chat-runtime.js
  → NexusAIEngine o InterviewRouter
  → services/whatsapp/meta-whatsapp-channel.js
```

**Finalización de entrevista → negocio (v1 objetivo)**

```text
InterviewController
  → CompletionPipeline
    → Validation
    → ClientResolver (services/business/client-service.js)
    → CompletionHandler (services/nexus/interview/completion-handler.js)
    → SupabaseSessionStore (status='completed')
    → EventQueue
  → handlers/chat.js (respuesta enriquecida)
```

**Cambio de datos de negocio**

```text
admin/js/modules/<módulo>/
  → handlers/admin.js
  → services/business/<servicio>-service.js
  → Supabase y su migration correspondiente
```

Antes de modificar cualquiera de estos recorridos, consultar `REGLAS.md`; en
particular, las reglas de Interview, tools, acceso a datos, WhatsApp y
finalización de entrevista.

---

## Tablas de Supabase

**Activas** (tienen migration en `supabase/migrations/`):
- `business_info` — información del negocio, horarios, datos que usa Nexus
- `chatbot_config` — configuración del comportamiento del chatbot
- `clients` — datos de clientes
- `repairs` — reparaciones
- `budgets` — presupuestos
- `print_orders` — órdenes de impresión
- `interview_sessions` — sesiones activas/completadas de entrevista
- `events` — eventos del sistema (event queue)
- `event_dlq` — Dead Letter Queue de eventos fallidos
- `notifications` — registro de notificaciones enviadas
- `admin_activity_log` — log de actividad del panel admin

**Planificadas** (no tienen migration todavía):
- `work_orders`
- `inventory`
- `employees`
- `chat_history` (actualmente en memoria del Worker)
- `audit_log`

---

## Flujo completo: WhatsApp → Respuesta

```text
Usuario envía mensaje WhatsApp
  → Meta Cloud API → POST /webhook/whatsapp
    → webhook-validator verifica firma HMAC
    → chat.js: handleWebhook()
      → Rate limit check (por IP)
      → Spam detection
      → Obtener/crear sesión de conversación
      → ChatRuntime.handleMessage()
        → ¿Interview activa? (interviewRouter.hasActiveInterview())
          → Sí: interviewRouter.processMessage() → interpreta → valida → avanza
          → No: NexusAIEngine.process()
              → PlanningEngine determina plan
              → ToolExecutor ejecuta tool calls
              → ¿Interview tools ejecutadas? → interviewRouter procesa
              → Format response
        → Guardar en historial
        → meta-whatsapp-channel.sendMessage() → respuesta al usuario
```

## Flujo: Admin → Cliente

```text
Admin envía mensaje desde panel
  → admin.js: handleAdminMessage()
    → Verificar JWT
    → Verificar permisos (profile-manager: perfil admin/superadmin)
    → AdminAssistant.process()
      → Tools disponibles para admin (admin-tools, conversation-tools)
      → Respuesta formateada
    → Guardar en historial
    → Notificar al cliente vía WhatsApp
```

## Flujo: Finalización de entrevista → Negocio (v1 objetivo)

```text
Usuario completa entrevista
  → InterviewController devuelve interviewComplete=true
  → ChatRuntime / handlers/chat.js invoca CompletionPipeline
    → CompletionPipeline.validate(fields, schema)
      → Si falla: log + sin entidad; datos en interview_sessions
    → ClientResolver.resolve(name, phone) → upsert clients
    → CompletionHandler.insertEntity(schemaId) → repairs / budgets / print_orders
    → SupabaseSessionStore.update(status='completed')
    → EventQueue.emit(REPAIR_CREATED | BUDGET_CREATED | PRINT_ORDER_CREATED)
  → Respuesta al usuario con summary + structuredSummary + progress
  → Panel admin puede revisar y gestionar la entidad creada
```
