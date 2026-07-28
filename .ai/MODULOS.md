# MODULOS.md — Nexus

Mapa completo del sistema: módulos de producto e infraestructura, con estado real
y ubicación en el código.

---

## Módulos de producto

| Módulo | Función | Estado | Ubicación principal |
|---|---|---|---|
| Chat (web) | Atención por chat web: FAQ, info del negocio, horarios | ✅ Funcional | `js/chatbot.js` |
| Chat (WhatsApp) | Atención bidireccional por WhatsApp (entrada + salida) | ✅ Funcional | `handlers/chat.js`, `services/whatsapp/` |
| Interview v2 | Recolecta datos estructurados para reparación: nombre, teléfono, dispositivo, problema | ✅ Implementado | `services/interview/v2/` |
| Admin — Conversaciones | Gestión de conversaciones activas desde el panel interno | 🟡 En construcción | `admin/js/admin.js`, `handlers/admin.js` |
| Admin — Clientes | Gestión de clientes: datos personales, historial | 🟡 En construcción | `admin/js/modules/clients/` |
| Admin — Reparaciones | Ciclo de vida de reparaciones: Pendiente → Diagnóstico → En reparación → Finalizado → Entregado | 🟡 En construcción | `admin/js/modules/repairs/` |
| Admin — Presupuestos | Creación y seguimiento de presupuestos | 🟡 En construcción | `admin/js/modules/budgets/` |
| Admin — Dashboard | Vista general: estadísticas, actividad reciente | 🟡 En construcción | `admin/js/modules/dashboard/` |
| Print Orders | Gestión de órdenes de impresión (rubro anterior, pendiente de evaluar si se mantiene) | 🟡 Legacy/evaluar | `admin/js/modules/print-orders/`, `services/business/print-service.js` |
| AI Assistant (admin) | Asistente IA para uso interno del admin | 🟡 En construcción | `admin/js/ai-assistant.js`, `services/nexus/admin-assistant.js` |

---

## Infraestructura del backend (Worker)

### Motor de IA — `services/nexus/`

| Componente | Responsabilidad |
|---|---|
| `chat-runtime.js` | Orquestador principal. Decide: ¿entrevista activa? → InterviewRouter; sino → NexusAIEngine |
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
| `admin-assistant.js` | Variante del engine para uso interno del admin panel |
| `interview-router.js` | Puente entre Nexus e Interview v2. Detecta si hay entrevista activa. |

### Tools del motor — `services/nexus/tools/`

| Tool | Propósito |
|---|---|
| `conversation-tools.js` | Buscar, crear, actualizar conversaciones |
| `admin-tools.js` | Asignar admin, enviar respuestas, obtener estadísticas |
| `interview-tools.js` | Iniciar, avanzar, completar entrevistas |

### Interview v2 — `services/interview/v2/`

Pipeline de recolección de datos estructurada. Ver `SCHEMA_SPECIFICATION.md` en esa
carpeta para el detalle del schema de servicios.

| Componente | Responsabilidad |
|---|---|
| `interview-controller.js` | Orquesta el pipeline: pregunta → interpreta → resuelve → avanza |
| `question-generator.js` | Genera la pregunta a mostrar según el campo pendiente |
| `interpreter.js` | Único módulo que llama a OpenRouter. Extrae entidades del mensaje. |
| `resolver.js` | Valida entidades contra schema + reglas de validación |
| `session-store.js` | Persistencia de sesiones de entrevista en Supabase |

**Pipeline:**
```
1. ¿Nuevo? → pregunta inicial (welcome + primera pregunta)
2. Interpretar → AI extrae entidades del mensaje del usuario
3. Resolver → validar contra schema del servicio
4. Avanzar → engine.getNextQuestion()
5. ¿Completo? → generar resumen + template WhatsApp
```

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
| `chat.js` | Entrada principal de mensajes WhatsApp. Rate limiting, spam detection, pipeline. |
| `admin.js` | Panel admin: auth JWT, CRUD conversaciones, asignación, estadísticas |
| `admin-ai.js` | Endpoint de IA para el admin panel |
| `public.js` | Endpoints públicos (info del negocio, horarios) |
| `whatsapp-webhook.js` | Handler dedicado del webhook de WhatsApp |

---

## Tablas de Supabase

**Activas** (tienen migration en `supabase/migrations/`):
- `business_info` — información del negocio, horarios, datos que usa Nexus
- `emails` — gestión de correos / config relacionada
- `chatbot_config` — configuración del comportamiento del chatbot
- `clients` — datos de clientes
- `repairs` — reparaciones
- `budgets` — presupuestos
- `print_orders` — órdenes de impresión
- `interview_sessions` — sesiones activas de entrevista Interview v2
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

```
Usuario envía mensaje WhatsApp
  → Meta Cloud API → POST /webhook/whatsapp
    → webhook-validator verifica firma HMAC
    → chat.js: handleWebhook()
      → Rate limit check (por IP)
      → Spam detection
      → Obtener/crear sesión de conversación
      → ChatRuntime.handleMessage()
        → ¿Interview activa? (interviewRouter.hasActiveInterview())
          → Sí: interviewRouter.processMessage() → interpreta → resuelve → avanza
          → No: NexusAIEngine.process()
              → PlanningEngine determina plan
              → ToolExecutor ejecuta tool calls
              → ¿Interview tools ejecutadas? → interviewRouter procesa
              → Format response
        → Guardar en historial
        → meta-whatsapp-channel.sendMessage() → respuesta al usuario
```

## Flujo: Admin → Cliente

```
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
