# README.md — Nexus

## ¿Qué es este proyecto?

Nexus es el asistente de inteligencia artificial de Tecno San Juan (servicio técnico
de celulares). No es solo un chatbot: es la capa que conecta a los clientes con los
datos del negocio (reparaciones, presupuestos, clientes) y con el panel interno de
administración.

## Objetivo

- Atender consultas de clientes automáticamente (chat web + WhatsApp).
- Recopilar los datos necesarios para iniciar una reparación (módulo Interview).
- Reducir trabajo repetitivo del servicio técnico.
- Centralizar la información del negocio.
- Servir de base escalable para administración interna (panel admin, presupuestos,
  inventario, órdenes de trabajo).

## Usuarios

- **Cliente final**: consulta por chat web o WhatsApp (horarios, info del negocio,
  problemas de su dispositivo) y pasa por el flujo Interview para iniciar una
  reparación.
- **Tecno San Juan (admin)**: usa el panel administrativo para gestionar
  conversaciones, clientes, reparaciones, presupuestos e historial.

## Tecnologías

- **Frontend**: HTML/CSS/JavaScript vanilla (sin framework). Incluye página pública,
  chatbot Nexus y panel administrativo.
- **Backend**: Cloudflare Worker — recibe requests del frontend y de WhatsApp,
  controla acceso a datos, conecta Supabase con la IA, procesa lógica sensible.
- **Base de datos**: Supabase (PostgreSQL), con Auth y RLS (Row Level Security).
- **IA**: OpenRouter API — permite cambiar de modelo sin atarse a un único proveedor.
- **WhatsApp**: integración via Meta Cloud API para recibir y enviar mensajes.
- **Tests**: Vitest. 1369+ tests en 71 archivos cubriendo todos los módulos del
  backend.

## Estructura del repositorio

```
tecno-san-juan/
├── .ai/                     ← memoria estructurada del proyecto (este directorio)
├── admin/                   ← panel administrativo (HTML/CSS/JS)
│   ├── index.html
│   ├── login.html
│   └── js/
│       ├── admin.js
│       ├── auth.js
│       ├── config.js
│       ├── ai-assistant.js
│       └── modules/         ← módulos de UI: clients, repairs, budgets, dashboard…
├── backend/
│   └── worker/              ← Cloudflare Worker (Node/ESM)
│       ├── src/
│       │   ├── router.js
│       │   ├── handlers/    ← chat.js (WhatsApp), admin.js, public.js
│       │   ├── middleware/  ← auth, cors, error
│       │   ├── services/
│       │   │   ├── nexus/   ← motor principal de IA + gestión de conversaciones
│       │   │   ├── interview/v2/ ← subsistema de recolección de datos (versión actual)
│       │   │   ├── business/  ← client-service, repair-service, budget-service
│       │   │   ├── events/    ← event-bus, event-queue, event-pipeline
│       │   │   ├── notifications/ ← notification-service, templates
│       │   │   └── whatsapp/  ← webhook, parser, meta-channel
│       │   └── utils/
│       └── supabase/migrations/
├── css/                     ← estilos del frontend público
├── js/                      ← JS del frontend público (chatbot.js, api.js…)
├── database/                ← documentación de base de datos
├── docs/                    ← documentación adicional
└── index.html               ← página pública principal
```

## Estado actual

MVP avanzado. El backend está completo con arquitectura de producción: engine de IA
con tool calls, subsistema de entrevistas (Interview v2), integración WhatsApp,
eventos, notificaciones y tests exhaustivos. El panel admin está en construcción
activa. Ver MODULOS.md para el estado detallado por módulo.

## Cómo orientarse rápido

1. El flujo de un mensaje comienza en `handlers/chat.js` (WhatsApp) o en el
   frontend JS (`js/chatbot.js`), pasa por el Worker, y llega a `ChatRuntime`.
2. `ChatRuntime` decide: ¿hay entrevista activa? → `InterviewRouter`; sino →
   `NexusAIEngine`.
3. `NexusAIEngine` usa `PlanningEngine` + `ToolExecutor` para razonar y actuar.
4. Toda lógica sensible y acceso a Supabase/OpenRouter vive en el Worker.
5. Leer REGLAS.md antes de tocar flujo de chat, acceso a datos, o modelo de
   reparaciones.
6. Cualquier cambio de arquitectura, módulo, regla o decisión → anotar en
   CAMBIOS.md.
