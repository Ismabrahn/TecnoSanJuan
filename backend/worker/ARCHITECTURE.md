# Arquitectura de Nexus — Interview Platform v2

## Principios Fundamentales

1. **La IA NO controla el flujo.** Solo interpreta respuestas y extrae entidades.
2. **Toda pregunta se lee del JSON de configuración.** Engine decide cuándo mostrar cada pregunta.
3. **Todo el texto visible viene del JSON.** `welcome.title`, `welcome.message`, `completionTemplate`.
4. **El resumen se construye con templates.** `summaryTemplate` con placeholders `{{nombre}}`, `{{fields}}`.
5. **Agregar un servicio = crear un archivo JSON.** Nunca tocar el Engine.
6. **Validación startup.** Todos los JSON se validan al cargar el Worker. Si hay errores, no arranca.

---

## Módulos

```
src/services/
  logger.js                        ← Logger centralizado
  interview/
    engine.js                      ← Interview Engine (estado, progreso, skip, dependsOn, history)
    handler.js                     ← Orchestrator (coordina Engine + Interpreter + Resolver + Summary)
    interpreter.js                 ← AI Interpreter (única llamada a OpenRouter)
    resolver.js                    ← Entity Resolver (valida contra schema + validation rules)
    validation.js                  ← Validation Engine (reglas declarativas: regex, min, max, etc.)
    summary.js                     ← Summary Builder (templates con {{placeholder}})
    catalog-validator.js           ← Catalog Validator (valida JSONs al startup)
    event-bus.js                   ← Event Bus interno
    definitions.js                 ← Factory de Engine por servicio
    services/
      index.js                     ← Plugin loader + validación startup
      impresion_3d.json            ← Config de Impresión 3D
      carteleria_led.json          ← Config de Cartelería LED
```

### `src/services/interview/services/` — Service Configuration (Plugin System)

Cada servicio es un archivo JSON. El plugin loader (`services/index.js`) los carga y valida al startup.

**Estructura del JSON:**

```json
{
  "id": "carteleria_led",
  "name": "Cartelería LED",
  "schemaVersion": 1,
  "serviceVersion": "1.0.0",
  "updatedAt": "2026-07-24T00:00:00Z",

  "welcome": {
    "title": "Hola.",
    "message": "Voy a hacerte algunas preguntas para preparar tu presupuesto."
  },

  "completionTemplate": "¡Perfecto {{nombre}}! ...\n\n{{summary}}\n\nAdjuntá ...",
  "summaryTemplate": "Hola.\n\nSolicito ...\n\n{{fields}}\n\nGracias.",
  "keywords": ["cartel", "led", ...],
  "catalog": { "forbidden": ["animación", ...] },

  "questions": [
    { "id": "nombre", "label": "Nombre", "question": "¿Cuál es tu nombre?",
      "type": "text", "required": true,
      "validation": { "minLength": 3, "maxLength": 100 } },
    { "id": "requiere_diseno", "label": "Diseño",
      "skipIf": { "field": "archivo", "value": true } },
    { "id": "controlador", "label": "Controlador",
      "dependsOn": { "field": "tipo_iluminacion", "equals": "RGB" } }
  ]
}
```

**Validación startup** (catalog-validator.js):
- IDs duplicados
- `dependsOn.field` refiere a un ID existente
- `skipIf.field` refiere a un ID existente
- `summaryTemplate` placeholders refieren a IDs válidos o placeholders reservados
- `welcome.title`, `welcome.message` requeridos
- `schemaVersion`, `serviceVersion` requeridos
- Opciones duplicadas en `select`

### `src/services/interview/engine.js` — Interview Engine

Controla el estado de la entrevista. **Nunca llama a OpenRouter.**

```js
createState(session?)    // Inicializa estado con versiones, history[]
getNextQuestion(state)   // Retorna la siguiente pregunta o null
getPendingFields(state)  // Pendientes no saltados
getStatus(state)         // { complete, total, completed, pending, pendingFields[] }
getProgress(state)       // { completed, skipped, pending, total, percent }
isComplete(state)        // Marca saltables como '---', retorna boolean
shouldSkip(state, q)     // Evalúa skipIf
dependsOnSatisfied(state, q) // Evalúa dependsOn (equals, in)
addHistory(state, field, newVal) // Registra cambio en history[]
getHistory(state)        // Retorna history[]
checkVersionCompatibility(state) // Compara schemaVersion
```

**Flujo de getNextQuestion():**
```
Itera questions[]
  → Sin .question (inferido): continua
  → Ya tiene valor: continua
  → dependsOn NO satisfecho: marca '---', continua
  → shouldSkip: marca '---', continua
  → Retorna pregunta
  → Ninguna: retorna null (completa)
```

**getProgress()** devuelve:
```json
{ "completed": 5, "skipped": 1, "pending": 4, "total": 10, "percent": 60 }
```

**Versionado:** `state.schemaVersion` se compara con el schema actual. Si cambió, se emite warning.

### `src/services/interview/validation.js` — Validation Engine

Valida declarativamente los valores de campos contra reglas definidas en el JSON.

**Reglas soportadas:**

| Regla | Descripción |
|-------|-------------|
| `minLength` | Longitud mínima de string |
| `maxLength` | Longitud máxima de string |
| `regex` | Expresión regular |
| `min` | Valor numérico mínimo |
| `max` | Valor numérico máximo |

**No depende del modelo IA.** Las validaciones se aplican en el Resolver después de la extracción de entidades.

### `src/services/interview/interpreter.js` — AI Interpreter

Único módulo que llama a OpenRouter. **Extrae entidades exclusivamente.**

**Contrato de entrada:** estado actual + mensaje del usuario + campos pendientes.

**Contrato de salida (JSON estricto):**
```json
{
  "entities": [
    { "field": "texto", "value": "MUSCULACIÓN", "confidence": 0.99 }
  ],
  "intent": "valid_answer" | "partial" | "question" | "ambiguous" | "off_topic"
}
```

Restricciones:
- No genera preguntas, sugerencias, ni texto libre.
- No devuelve `confirmacion`.
- Para `select`: solo valores exactos de `options[]`.

### `src/services/interview/resolver.js` — Entity Resolver

Valida entidades del Interpreter contra:
1. Schema: el campo existe en `questions[]`
2. Estado: el campo no está completo
3. Select: el valor está en `options[]`
4. Forbidden: el valor no contiene palabras prohibidas
5. Validation: el valor pasa las reglas de `validation` (minLength, regex, etc.)

**Salida:**
```js
{ resolved: [{ field, value, confidence }], rejected: [{ field, value, reason }] }
```

**Motivos de rechazo:** `not_in_schema`, `invalid_option`, `prohibited_word`, `validation_error`, `already_populated`.

### `src/services/interview/summary.js` — Summary Builder

Construye textos 100% a partir de templates. **Nunca usa IA.**

**Placeholders disponibles:**
- `{{nombre}}` → `state.nombre`
- `{{name}}` → `schema.name`
- `{{fields}}` → lista formateada de campos completados (`- Label: valor`)
- `{{summary}}` → resultado de `buildSummary()` (para `completionTemplate`)
- `{{id_del_campo}}` → cualquier campo del state

**Funciones:**
| Función | Propósito |
|---------|-----------|
| `buildSummary(schema, state)` | Resumen para WhatsApp desde `summaryTemplate` |
| `buildCompletionMessage(schema, state, summary)` | Mensaje de finalización desde `completionTemplate` |
| `buildStructuredSummary(schema, state)` | Array `[campo: valor]` para uso interno |

### `src/services/interview/catalog-validator.js` — Catalog Validator

Se ejecuta al importar los servicios. Valida todos los JSON y lanza error si hay problemas.

**Verifica:**
- Campos requeridos (`id`, `name`, `welcome`, `summaryTemplate`, etc.)
- IDs duplicados en questions
- `dependsOn.field` y `skipIf.field` existen
- Placeholders en templates refieren a IDs válidos
- Opciones duplicadas en select
- `schemaVersion`, `serviceVersion` presentes

### `src/services/interview/handler.js` — Orchestrator

Coordina Engine + Interpreter + Resolver + Summary. **No contiene lógica de negocio.**

**Pipeline:**
```
1. ¿Nueva entrevista?
   → engine.createState()
   → render welcome.title + welcome.message + primera pregunta
   → return

2. Detectar servicio (keywords) → detectService()

3. AI interpret → interpreter.interpret()

4. Resolver entidades → resolver.resolveEntities()

5. Aplicar al estado con history

6. ¿Nombre falta? → retornar pregunta nombre

7. engine.getNextQuestion()
   → ¿Complete? → buildSummary() + buildCompletionMessage() → return
   → ¿Hay pregunta? → return
```

**NO contiene llamadas a OpenRouter.** (excepto interpreter.interpret() que es la única).

### `src/services/interview/event-bus.js` — Event Bus

Sistema de eventos interno, desacoplado.

**Eventos:**
```
InterviewStarted    → interview:started
QuestionAnswered    → question:answered
FieldUpdated        → field:updated
QuestionSkipped     → question:skipped
InterviewCompleted  → interview:completed
SummaryGenerated    → summary:generated
WhatsAppRendered    → whatsapp:rendered
WhatsAppOpened      → whatsapp:opened
AnalyticsUpdated    → analytics:updated
```

**Uso:**
```js
import { eventBus, Events } from './event-bus.js';
eventBus.on(Events.InterviewCompleted, (data) => { /* track */ });
eventBus.emit(Events.InterviewCompleted, { type, state, summary });
```

### `src/services/logger.js` — Centralized Logger

**Formato:** `[MODULE] [LEVEL] [session:id] [service:id] [q:field] [latency] message`

**Uso:**
```js
import { defaultLogger } from '../logger.js';
const log = defaultLogger.withSession(sessionId, serviceId);
log.info('[ENGINE]', 'Mensaje', { questionId: 'nombre', latency: 150 });
```

**Módulos:** `[ENGINE]`, `[HANDLER]`, `[INTERPRETER]`, `[RESOLVER]`, `[VALIDATION]`, `[SUMMARY]`, `[CHAT]`, `[WHATSAPP]`, `[CATALOG]`.

### `js/whatsapp.js` — WhatsApp Service (Frontend)

Módulo independiente para el botón de WhatsApp. Emite eventos `CustomEvent` en `document`.

**Eventos frontend:**
- `whatsapp:rendered` → botón renderizado
- `whatsapp:click` → click en botón
- `whatsapp:opened` → WhatsApp abierto exitosamente
- `whatsapp:blocked` → popup bloqueado
- `whatsapp:error` → error

---

## Ciclo de Vida

```
IDLE → WAITING_NAME → WAITING_NEED → IDENTIFIED → presupuesto_completo
```

1. **IDLE**: Usuario escribe. Sesión sin estado de entrevista.
2. **WAITING_NAME**: Se pregunta el nombre.
3. **WAITING_NEED**: Se pregunta qué servicio necesita.
4. **IDENTIFIED**: Servicio detectado → comienza entrevista guiada por handler.
5. **presupuesto_completo**: Todos los campos obligatorios respondidos.
   - `engine.getProgress().percent === 100`
   - Summary Builder genera resumen
   - WhatsApp button en frontend
   - Input deshabilitado

---

## Flujo Completo

```
Usuario envía mensaje
  → chat.js: ¿context=3d_quote o interview state?
    → handler.handleInterview()
      → ¿Nuevo? → welcome.title + welcome.message + primera pregunta
      → detectService() por keywords
      → interpret() → OpenRouter extrae entidades
      → resolveEntities() → valida contra schema + validation rules
      → engine.addHistory() + engine.getNextQuestion()
        → ¿Complete? → buildSummary() + buildCompletionMessage() → return
        → ¿Hay pregunta? → return
  → chat.js: agrega phone, summary, progress, structuredSummary
    → Frontend: ¿complete?
      → whatsapp.js → botón con eventos
      → Progress bar 100%
      → Input deshabilitado
```

---

## Agregar un Nuevo Servicio

1. Crear `src/services/interview/services/mi_servicio.json`
2. Incluir: `id`, `name`, `description`, `schemaVersion`, `serviceVersion`, `updatedAt`
3. Incluir: `welcome.title`, `welcome.message`
4. Incluir: `summaryTemplate`, `completionTemplate` (usar `{{placeholder}}`)
5. Incluir: `keywords[]`, `questions[]`
6. Opcional: `catalog.forbidden[]`, `validation` por campo, `skipIf`, `dependsOn`
7. Agregar al import en `services/index.js`:

```js
import mi_servicio from './mi_servicio.json' assert { type: 'json' };
const SERVICES = [impresion_3d, carteleria_led, mi_servicio];
```

**No modificar:**
- `engine.js`
- `handler.js`
- `interpreter.js`
- `resolver.js`
- `summary.js`
- `validation.js`
- `catalog-validator.js`

---

## Tests

```bash
npm test
```

**65+ tests** cubren:
- Engine: createState, getProgress, getStatus, isComplete, skipIf, dependsOn, history, versioning
- Validation: minLength, maxLength
- Catalog: IDs duplicados, dependsOn inválido, welcome faltante, opciones duplicadas
- Summary: templates con placeholders, completionMessage
- Resolver: schema validation, select options, forbidden words, validation errors
- resolveBoolean

---

## Depuración

### Logs

| Prefijo | Módulo | Eventos clave |
|---------|--------|---------------|
| `[ENGINE]` | engine.js | NEXT_QUESTION, COMPLETE, skipIf, dependsOn |
| `[HANDLER]` | handler.js | ENTITY_SAVED, REJECTED, status |
| `[INTERPRETER]` | interpreter.js | Llamadas a OpenRouter |
| `[RESOLVER]` | resolver.js | REJECTED, BLOCKED, validation |
| `[VALIDATION]` | validation.js | Errores de reglas |
| `[SUMMARY]` | summary.js | GENERATED |
| `[CHAT]` | chat.js | Rate limit, session, phone |
| `[WHATSAPP]` | whatsapp.js | Botón, URL, popup |
| `[CATALOG]` | catalog-validator.js | Errores startup |

### Problemas comunes

**Error al deploy: "Error de validación en servicios"**
→ Verificar JSON: IDs duplicados, welcome faltante, dependsOn roto.

**El botón de WhatsApp no aparece:**
1. `[CHAT]` debe mostrar "Entrevista completada"
2. `[WHATSAPP]` debe mostrar "VALIDATED" o "ERROR"
3. `WHATSAPP_NUMBER` en `wrangler.toml`
4. `summary` no debe ser null

**La entrevista no avanza:**
1. `[HANDLER]` Estado: verificar `completados/total`
2. `[ENGINE]` nextQuestion: qué pregunta sigue
3. `[RESOLVER]` rejected: entidades rechazadas y por qué

**Campos inferidos no se completan:**
→ Son campos sin `.question`. El Engine los salta automáticamente.
→ El Interpreter los extrae si el usuario los menciona.

---

## Recomendaciones v2/v3

- **v2.1**: Persistencia de sesiones en KV/Supabase
- **v2.2**: Soporte para `conditionalOptions` (opciones que cambian según otro campo)
- **v2.3**: Dashboard de analytics con eventos del EventBus
- **v3.0**: Interfaz visual para crear/modificar servicios sin editar JSON
