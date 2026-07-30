# DECISIONES.md — Nexus

Registro de decisiones importantes y su motivo. Objetivo: que una IA nueva no
vuelva a proponer ni a debatir algo que ya se resolvió.

---

## Cloudflare Worker como backend

Motivo:
- Reduce infraestructura a mantener (no hay servidor propio).
- Protege lógica sensible (no queda expuesta en el frontend).
- Permite controlar y filtrar las llamadas externas (a Supabase y a OpenRouter).
- Edge deployment: latencia baja, escalado automático.

## Supabase como base de datos

Motivo:
- PostgreSQL como motor, permite relaciones complejas (clientes, reparaciones,
  presupuestos, órdenes de trabajo).
- Trae Auth y RLS (Row Level Security) integrados, sin tener que construir eso a
  mano.
- Migraciones SQL versionadas en `supabase/migrations/`.

## OpenRouter en vez de un proveedor de IA único

Motivo:
- Permite cambiar de modelo de IA sin reescribir la integración.
- Evita quedar atado a un único proveedor (Anthropic, OpenAI, Google, etc.).
- Abstracción en `services/openrouter.js`.

## HTML/CSS/JS vanilla en el frontend, sin framework

Motivo:
- El proyecto todavía no necesita la complejidad de un framework.
- Reduce superficie de mantenimiento y de dependencias.
- Se puede revisar esta decisión si el panel admin crece mucho en interactividad
  — anotar acá si eso pasa.

## El frontend nunca accede directo a Supabase

Toda consulta a la base de datos pasa siempre por el Worker.

Motivo:
- Evita exponer credenciales o queries sensibles en el cliente.
- Centraliza el control de permisos según el rol del usuario (Auth + RLS).

## La IA NO controla el flujo de la aplicación

El motor de IA (NexusAIEngine) solo interpreta mensajes y decide qué herramientas
ejecutar. El flujo de navegación (entrevista activa, estado de sesión, redirect de
handler) lo controla código determinístico (`ChatRuntime`, `InterviewRouter`).

Motivo:
- Los LLMs son no-determinísticos; no son confiables como orquestadores de flujo.
- Separa razonamiento (IA) de control (código).
- Facilita testear el flujo sin mocks de LLM.

## Tool calls como mecanismo de acción

Toda interacción del motor de IA con el mundo exterior (Supabase, WhatsApp, datos
de sesión) pasa obligatoriamente por herramientas registradas (`ToolRegistry`).

Motivo:
- Hace auditable y trazable qué hizo la IA en cada turn.
- Permite testear herramientas individualmente.
- Evita que el LLM acceda a recursos no autorizados.

## Sistema de perfiles (customer / admin / superadmin)

Cada actor tiene un perfil que define exactamente qué herramientas puede usar.
Definido en `services/nexus/profile-manager.js`.

Motivo:
- Un cliente no puede acceder a tools de admin (ver historial de otro cliente,
  asignar técnico, etc.).
- Control de acceso declarativo, no disperso en código.

## Interview como subsistema separado (v2)

El módulo Interview tiene su propio pipeline independiente del engine de IA general
(v2 en `services/interview/v2/`), con schema de servicios, intérprete propio,
resolver y session-store.

Motivo:
- El flujo de recolección de datos es estrictamente estructurado: pregunta →
  interpreta → valida → avanza. No es conversación libre.
- Separarlo del engine general evita que el LLM "improvise" en el flujo de intake.

## Integración con WhatsApp via Meta Cloud API

El canal de entrada principal es WhatsApp, no solo web. La integración está en
`services/whatsapp/` con webhook validation, parser de mensajes y meta-channel.

Motivo:
- Los clientes de un servicio técnico usan WhatsApp, no formularios web.
- El canal web (chatbot.js) coexiste como alternativa secundaria.

## Sistema de eventos asíncronos (EventBus + EventQueue)

Las acciones que no requieren respuesta inmediata (notificaciones, logs, analytics)
se procesan de forma asíncrona a través del event bus.

Motivo:
- Desacopla efectos secundarios del flujo principal de respuesta.
- Evita que un fallo en notificaciones bloquee la respuesta al cliente.

## Vitest como framework de tests

El backend usa Vitest (1369+ tests, 71 archivos) con cobertura de todos los módulos
del engine, interview, conversaciones, WhatsApp, admin, eventos y notificaciones.

Motivo:
- Compatible con ESM nativo (el Worker usa ESM).
- API similar a Jest, sin configuración compleja.
- Los tests son la documentación ejecutable de contratos entre módulos.

## Pivot: de bot de intake (3D/LED, salida a WhatsApp) a asistente de Tecno San Juan

Nexus arrancó como un chatbot de intake de pedidos para un negocio de impresión 3D
y cartelería LED, con salida a un mensaje pre-armado de WhatsApp e integración
directa con la API de Anthropic (HTML autocontenido).

El proyecto pivotó a ser el asistente de Tecno San Juan (reparación de celulares),
con arquitectura completa de backend (Worker + Supabase + OpenRouter) y canal
bidireccional de WhatsApp.

Motivo del pivot: el objetivo del sistema cambió. Ya no era solo administrar
pedidos de un negocio de impresión 3D/LED, sino poder administrar automáticamente
**clientes y trabajo del servicio técnico**: registrar clientes, gestionar el ciclo
completo de una reparación, emitir presupuestos, y reducir el trabajo manual del
técnico. Eso requería una arquitectura con base de datos real (Supabase), backend
propio (Worker) y un motor de IA capaz de razonar sobre múltiples entidades, en
lugar de un HTML autocontenido que solo generaba un mensaje de WhatsApp.

## Cloudflare KV para sesiones de entrevista de corta duración

Las sesiones activas de entrevista se mantienen en Cloudflare KV además de en
Supabase (`interview_sessions`).

Motivo:
- KV tiene latencia extremadamente baja para lecturas (edge cache).
- Las sesiones de entrevista son efímeras (minutos u horas).

**Importante**: KV tiene eventual consistency. Si hay colisión entre el estado
en memoria del cliente y el KV, se da prioridad al estado del cliente.
Ver CAMBIOS.md → "KV vs Supabase para sesiones".

## Schemas de Interview como ES imports estáticos

Los schemas de servicios de Interview (`interview/v2/schemas/`) se importan como
módulos ES estáticos, no con `import()` dinámico.

Motivo:
- Cloudflare Workers no permite `import()` dinámico de archivos en producción.
- Los schemas están disponibles en tiempo de compilación (son configuración, no
  datos).
- El `schema-registry` carga todos los schemas al iniciar el Worker.
