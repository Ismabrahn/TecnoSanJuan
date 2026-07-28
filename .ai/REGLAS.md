# REGLAS.md — Nexus

Cosas que no se pueden romper sin pensarlo dos veces y documentar el cambio.

---

## Reglas técnicas

### Acceso a datos
- El frontend nunca accede directamente a Supabase. Toda consulta pasa por el
  Cloudflare Worker.
- Toda lógica sensible (llamadas a OpenRouter, manejo de credenciales, decisiones
  de acceso) vive en el Worker, no en el cliente.
- Toda tabla nueva en Supabase requiere RLS antes de usarse en producción.
- Los permisos de acceso dependen del rol del usuario (Auth + RLS + profile-manager),
  no de checks manuales en el frontend.

### Motor de IA
- La IA NO controla el flujo de la aplicación. Solo interpreta mensajes y decide
  qué tool calls ejecutar. El flujo (estado de entrevista, sesión, respuesta final)
  lo controla código determinístico (`ChatRuntime`, `InterviewRouter`).
- Toda interacción del LLM con el exterior pasa por herramientas registradas en el
  `ToolRegistry`. No debe haber acceso directo a Supabase desde el motor de IA.
- `nexus-ai-engine.js` no tiene estado propio — todo el estado viene en `context`.
  No agregarle propiedades de estado.
- No modificar `nexus-ai-engine.js`, `chat-runtime.js` ni `tool-executor.js` para
  agregar una nueva herramienta. El proceso correcto está en ARCHITECTURE.md.

### Herramientas (tools)
- Las tools tienen estructura `{ name, description, parameters, execute }`.
- Un perfil (`customer`, `admin`, `superadmin`) define `allowedTools[]`. Una tool no
  disponible en el perfil no puede ser ejecutada, aunque el LLM la llame.
- Si se agrega una nueva tool, debe registrarse en `tools/index.js` Y agregarse al
  `allowedTools[]` del perfil correspondiente en `profile-manager.js`.

### Interview
- El módulo Interview v2 tiene su propio intérprete que llama a OpenRouter
  (`services/interview/interpreter.js`). Es el único punto de contacto del
  subsistema con la IA externa. No duplicar esta lógica en el engine general.
- El flujo de entrevista es estrictamente lineal según el schema del servicio. No
  saltear pasos ni modificar el orden sin actualizar el schema.

### WhatsApp
- La verificación de firma HMAC del webhook de Meta se realiza siempre en
  `webhook-validator.js` antes de procesar cualquier mensaje.
- El rate limiting y spam detection del `chat.js` no deben desactivarse en
  producción (protegen contra abuso de la API de OpenRouter).

### Tests
- Cada nuevo módulo o servicio de backend debe tener tests en Vitest.
- No modificar la interfaz pública de un módulo sin actualizar sus tests.
- Los tests son la documentación ejecutable de los contratos entre módulos — no
  eliminar tests sin entender qué contrato cubren.

---

## Reglas de negocio

- Una reparación pertenece a un cliente (no se crean reparaciones huérfanas).
- No crear clientes duplicados (verificar por teléfono o email antes de crear).
- El módulo Interview ocurre antes que el módulo Repair — no se puede iniciar una
  reparación sin datos del cliente y del dispositivo.
- Los estados de una reparación siguen este orden:
  **Pendiente → Diagnóstico → En reparación → Finalizado → Entregado**.
  No saltear estados ni ir hacia atrás sin lógica explícita.
- Los presupuestos están asociados a un cliente o a una reparación, nunca son
  entidades flotantes.

---

## Cosas conocidas que NO son errores (deuda técnica aceptada)

Esta sección existe para que una IA nueva no "corrija" algo que en realidad es una
elección consciente por etapa del proyecto.

- **Historial de chat en memoria**: `chat_history` todavía no persiste en Supabase —
  vive en el `ConversationManager` (in-memory en el Worker). Planificado, no
  implementado. No es un bug.
- **`work_orders`, `inventory`, `employees`, `audit_log`**: no existen todavía en
  Supabase. Planificadas, no implementadas.
- **Panel admin incompleto**: funcionalidad parcial ahí es esperable, está en
  construcción activa. No señal de que algo se rompió.
- **Frontend sin framework**: a propósito (ver DECISIONES.md). No proponer migrar a
  React/Vue/Svelte sin que eso se discuta como decisión nueva.
- **`print-orders`**: es un módulo del rubro anterior (impresión 3D/LED). Está en el
  código pero su continuidad en el proyecto de Tecno San Juan está pendiente de
  decisión.
- **`anti-loop.js` en interview**: mecanismo defensivo para evitar bucles infinitos
  en el flujo de entrevista. No es código muerto.

---

## Cómo agregar una nueva tool (proceso obligatorio)

1. Crear `src/services/nexus/tools/mi-tool.js` con `{ name, description, parameters, execute }`.
2. Importar y registrar en `tools/index.js`.
3. Agregar al `allowedTools[]` del perfil correcto en `profile-manager.js`.
4. Escribir tests en `tools/mi-tool.test.js`.
5. Documentar el cambio en CAMBIOS.md.

**No tocar** `nexus-ai-engine.js`, `chat-runtime.js` ni `tool-executor.js`.
