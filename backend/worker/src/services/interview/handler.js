import { getEngine, getDefinition } from './definitions.js';
import { detectService } from './services/index.js';
import { chat } from '../openrouter.js';
import { buildSummary, buildCompletionMessage } from './summary.js';
import { defaultLogger } from '../logger.js';
import { eventBus, Events } from './event-bus.js';
import { ENGINE_VERSION } from './engine.js';

function normalizeInput(interview) {
  if (!interview || !interview.state) return null;
  if (interview.state && interview.state.campos) {
    if (interview.state.engineVersion === '3.0.0') return interview;
    defaultLogger.info('[HANDLER]', `Estado con engineVersion=${interview.state.engineVersion}, recreando...`);
    return null;
  }
  defaultLogger.info('[HANDLER]', 'Estado legacy detectado (sin campos), iniciando nuevo');
  return null;
}

function getFirstWord(msg) {
  return msg.trim().toLowerCase().replace(/^[¡!¿?\s]+/, '').split(/[\s,;:]+/)[0];
}

function isQuestion(msg) {
  const trimmed = msg.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith('?') || trimmed.endsWith('¿')) return true;
  const qWords = ['cómo', 'como', 'cuándo', 'cuando', 'dónde', 'donde', 'cuál', 'cual', 'qué', 'que', 'quién', 'quien', 'cuánto', 'cuanto', 'por qué', 'porque', 'para qué'];
  const first = trimmed.toLowerCase().replace(/^[¡!¿?\s]+/, '').split(/[\s,;:]+/)[0];
  return qWords.includes(first);
}

function isTriggerMessage(msg) {
  const trimmed = msg.trim().toLowerCase();
  if (!trimmed || trimmed.length <= 2) return true;
  const triggers = new Set(['ok', 'oka', 'okey', 'vale', 'dale', 'si', 'sí', 'sip', 'nah', 'nop', 'no', 'bien', 'joya', 'bárbaro', 'perfecto', 'listo', 'dale', 'sale', 'vamos', 'empecemos', 'empezar']);
  if (triggers.has(trimmed)) return true;
  if (trimmed.length <= 1) return true;
  return false;
}

const EXTRACT_SYSTEM = `Sos un extractor de datos para presupuestos de Tecno San Juan.
Respondé ÚNICAMENTE con un valor JSON sin texto adicional.

Reglas:
- Para tipo "boolean": true o false
- Para tipo "select": UNO de los valores en "opciones"
- Para tipo "texto": el texto exacto mencionado por el usuario
- Si el usuario hace una pregunta en vez de responder: null
- Si el mensaje es demasiado corto o no tiene sentido como respuesta: null
- Si no hay suficiente información: null
- NO inventes datos.
- NO generes preguntas.
- NO agregues explicaciones.`;

function buildExtractPrompt(campo, userMessage, state) {
  const context = Object.entries(state.campos || {})
    .filter(([_, c]) => c.estado === 'completo')
    .map(([k, c]) => `${k}: ${JSON.stringify(c.valor)}`)
    .join('\n');

  let extra = '';
  if (campo.tipo === 'select' && campo.opciones) {
    extra = ` | Opciones válidas: ${campo.opciones.join(', ')}`;
  }

  return [
    { role: 'system', content: EXTRACT_SYSTEM },
    {
      role: 'user',
      content: `Campo a extraer: "${campo.nombre}" (tipo: "${campo.tipo}"${extra})
Pregunta hecha: "${campo.pregunta}"
Contexto:
${context || '(ninguno)'}

Mensaje del usuario: "${userMessage}"

Respondé SOLO con el valor JSON:`,
    },
  ];
}

async function extractWithAI(env, campo, userMessage, state) {
  const msgs = buildExtractPrompt(campo, userMessage, state);
  const raw = await chat(env, msgs);
  defaultLogger.info('[INTERPRETER]', `raw="${raw}" campo="${campo.nombre}" msg="${userMessage.substring(0, 40)}"`);
  try {
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    defaultLogger.info('[INTERPRETER]', `parsed OK: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch {
    const match = raw.match(/\{[\s\S]*\}|true|false|null|"[^"]*"|'[^']*'/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        defaultLogger.info('[INTERPRETER]', `parsed regex: ${JSON.stringify(parsed)}`);
        return parsed;
      } catch { return null; }
    }
    // Fallback: for text fields, use raw text if it doesn't look like JSON
    if (campo.tipo === 'texto' && raw.trim().length > 0) {
      defaultLogger.info('[INTERPRETER]', `fallback raw text: "${raw.trim()}"`);
      return raw.trim();
    }
    defaultLogger.info('[INTERPRETER]', 'null (no match)');
    return null;
  }
}

async function extractValue(env, campo, userMessage, state) {
  if (!campo) return null;

  if (campo.tipo === 'boolean') {
    const first = getFirstWord(userMessage);
    const lowerTrimmed = userMessage.trim().toLowerCase();
    if (lowerTrimmed.startsWith('no sé') || lowerTrimmed.startsWith('no se') || lowerTrimmed === 'no sé' || lowerTrimmed === 'no se') return null;
    if (first === 'no') return false;
    if (['sí', 'si', 'yes', 's'].includes(first)) return true;
    if (lowerTrimmed.startsWith('tengo ') || lowerTrimmed === 'tengo' || lowerTrimmed === 'si tengo' || lowerTrimmed === 'sí tengo') return true;
    if (lowerTrimmed.startsWith('no tengo ') || lowerTrimmed === 'no tengo') return false;
    const extracted = await extractWithAI(env, campo, userMessage, state);
    if (typeof extracted === 'boolean') return extracted;
    return null;
  }

  if (campo.tipo === 'select' && campo.opciones) {
    const lowerMsg = userMessage.toLowerCase();
    for (const opt of campo.opciones) {
      if (lowerMsg.includes(opt.toLowerCase())) return opt;
    }
    const extracted = await extractWithAI(env, campo, userMessage, state);
    if (extracted && campo.opciones.includes(extracted)) return extracted;
    return null;
  }

  if (isTriggerMessage(userMessage)) return null;
  const extracted = await extractWithAI(env, campo, userMessage, state);
  if (extracted && typeof extracted === 'string' && extracted.trim().length > 1) {
    return extracted.trim();
  }
  return null;
}

async function extractMultiple(engine, env, state, userMessage) {
  let field = engine.getNextField(state);
  while (field) {
    const value = await extractValue(env, field, userMessage, state);
    if (value === null) break;
    engine.markField(state, field.nombre, value);
    field = engine.getNextField(state);
  }
}

const TRANSITIONS = ['¡Perfecto!', 'Genial.', 'Bien.', 'Entendido.', 'De acuerdo.', 'Excelente.', 'Listo.'];

async function generateConversationalResponse(env, currentField, nextField, userMessage, value, state, schema, change) {
  const name = state.campos?.nombre?.valor || '';

  if (change) {
    const nextPregunta = nextField?.pregunta || '';
    const nombreCampo = state.campos[change.field]?.etiqueta || change.field;
    try {
      const aiResponse = await chat(env, [
        { role: 'system', content: `Sos un vendedor cordial de Tecno San Juan. El usuario cambió de opinión sobre un dato. Confirmale el cambio de forma breve y natural. Luego preguntá por lo siguiente. Usá el nombre del cliente si lo sabés. No te disculpes.` },
        { role: 'user', content: `Cliente: ${name || 'sin nombre'}
Campo cambiado: ${nombreCampo}
Nuevo valor: ${JSON.stringify(change.value)}
${nextPregunta ? `Siguiente pregunta: "${nextPregunta}"` : 'No faltan más datos'}` }
      ]);
      return aiResponse;
    } catch {
      const transition = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
      return nextPregunta ? `${transition} Ahora, ${nextPregunta.toLowerCase()}` : `${transition} ¿Algo más que necesites?`;
    }
  }

  if (currentField && value !== null && isQuestion(userMessage)) {
    const nextPregunta = nextField?.pregunta || '';
    try {
      const aiResponse = await chat(env, [
        { role: 'system', content: `Sos un vendedor cordial de Tecno San Juan. El usuario respondió un dato pero también te hizo una pregunta. Respondé su pregunta de forma breve y útil. Luego, si falta algún dato, pedilo de forma natural. Usá el nombre del cliente si lo sabés. No seas repetitivo.` },
        { role: 'user', content: `Cliente: ${name || 'sin nombre'}
Mensaje: "${userMessage}"
${nextPregunta ? `Siguiente dato: "${nextPregunta}"` : 'No faltan más datos'}` }
      ]);
      return aiResponse;
    } catch {
      const transition = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
      return nextPregunta ? `${transition} ${nextPregunta}` : '¿Algo más que necesites?';
    }
  }

  if (currentField && isQuestion(userMessage)) {
    const pregunta = currentField.pregunta || '';
    const etiqueta = currentField.etiqueta || currentField.nombre || '';
    try {
      const aiResponse = await chat(env, [
        { role: 'system', content: `Sos un vendedor cordial de Tecno San Juan. El usuario te preguntó algo mientras completaba un presupuesto. Respondé su pregunta de forma breve y útil. Luego, de forma natural, preguntá por el dato que aún necesitás. Usá el nombre del cliente si lo sabés. No seas repetitivo.` },
        { role: 'user', content: `Cliente: ${name || 'sin nombre'}
Mensaje: "${userMessage}"
Dato que necesitamos: ${etiqueta}
Pregunta original: "${pregunta}"` }
      ]);
      return aiResponse;
    } catch {
      return `Gracias por tu consulta. ${pregunta}`;
    }
  }

  const trimmedLower = userMessage.trim().toLowerCase();

  if (currentField && value === null) {
    const pregunta = currentField.pregunta || '';
    if (isTriggerMessage(userMessage)) {
      const transition = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
      return `${transition} ${pregunta}`;
    }

    if (currentField.tipo === 'boolean' && (trimmedLower.startsWith('no sé') || trimmedLower.startsWith('no se'))) {
      return `No hay problema, lo dejamos pendiente. ${pregunta}`;
    }
    const etiqueta = currentField.etiqueta || currentField.nombre || '';
    try {
      const aiResponse = await chat(env, [
        { role: 'system', content: `Sos un vendedor cordial de Tecno San Juan. El usuario respondió algo que no quedó claro o incompleto. Preguntale de nuevo de forma natural, variando un poco la redacción. No te disculpes. Sé breve. Usá el nombre del cliente si lo sabés.` },
        { role: 'user', content: `Cliente: ${name || 'sin nombre'}
Usuario dijo: "${userMessage}"
Dato que necesitamos: ${etiqueta}
Pregunta anterior: "${pregunta}"` }
      ]);
      return aiResponse;
    } catch {
      return pregunta;
    }
  }

  if (!nextField) return null;

  const nextPregunta = nextField.pregunta || '';
  const transition = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
  if (currentField && value !== null) {
    const etiqueta = currentField.etiqueta || currentField.nombre || '';
    if (currentField.tipo === 'boolean') {
      const verb = value === true ? 'Sí' : 'No';
      return `${transition} ${verb}. ${nextPregunta}`;
    }
    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    return `${transition} ${etiqueta}: ${valStr}. ${nextPregunta}`;
  }
  return `${transition} ${nextPregunta}`;
}

async function detectFieldChange(env, state, userMessage) {
  const completed = Object.entries(state.campos || {})
    .filter(([_, c]) => c.estado === 'completo' && c.valor !== null);
  if (completed.length === 0) return null;

  const completedText = completed.map(([k, c]) => `${k}: ${JSON.stringify(c.valor)}`).join('\n');
  try {
    const aiResponse = await chat(env, [
      { role: 'system', content: `Analizá si el usuario quiere CAMBIAR una respuesta ya dada en un presupuesto.
Respondé SOLO con JSON: {"field":"nombre","value":nuevoValor} o null si no hay cambio.
Si dice "no"+"mejor"/"cambio"/"prefiero"/"en realidad" con otro valor: es un cambio.
Si solo responde la pregunta actual o pregunta algo: null.
No inventes cambios.` },
      { role: 'user', content: `Respuestas actuales:
${completedText}

Mensaje: "${userMessage}"` }
    ]);
    const cleaned = aiResponse.replace(/```json\s*|\s*```/g, '').trim();
    if (cleaned === 'null') return null;
    const parsed = JSON.parse(cleaned);
    if (parsed && parsed.field && parsed.value !== undefined && state.campos[parsed.field]) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function handleInterview(env, interview, userMessage, sessionId, prefill = {}) {
  const log = sessionId ? defaultLogger.withSession(sessionId) : defaultLogger;
  const isNew = !normalizeInput(interview);

  let schema, engine, state;

  if (isNew) {
    const serviceId = detectService(userMessage) || 'impresion_3d';
    schema = getDefinition(serviceId);
    engine = getEngine(serviceId);
    state = engine.createState();
    log.info('[HANDLER]', `[INTERVIEW_VERSION] engine="${ENGINE_VERSION}" schemaV=${schema?.schemaVersion} servicio=${serviceId}`);
    log.info('[HANDLER]', `[INTERVIEW_VERSION] campos=${schema?.campos?.length || 0} primerCampo=${schema?.campos?.[0]?.nombre || 'ninguno'}`);

    for (const [key, value] of Object.entries(prefill)) {
      if (state.campos[key]) {
        engine.markField(state, key, value);
        log.info('[HANDLER]', `Pre-cargado: ${key} = ${JSON.stringify(value)}`);
      }
    }

    const firstField = engine.getNextField(state);
    let firstValue = null;
    if (firstField) {
      firstValue = await extractValue(env, firstField, userMessage, state);
      if (firstValue !== null) {
        engine.markField(state, firstField.nombre, firstValue);
        log.info('[HANDLER]', `Extraído de mensaje inicial: ${firstField.nombre} = ${JSON.stringify(firstValue)}`);
        await extractMultiple(engine, env, state, userMessage);
      }
    }

    log.info('[HANDLER]', `Nueva entrevista: ${serviceId}`);
    eventBus.emit(Events.InterviewStarted, { type: serviceId, sessionId });

    const nextField = engine.getNextField(state);
    if (!nextField) {
      const summary = buildSummary(schema, state);
      const response = buildCompletionMessage(schema, state);
      state.completada = true;
      eventBus.emit(Events.InterviewCompleted, { type: schema.id, state, summary });
      log.info('[HANDLER]', 'Entrevista completada inmediatamente');
      return {
        response, summary,
        interview: { type: serviceId, state, complete: true, lastQuestion: null },
        progress: engine.getProgress(state),
      };
    }

    const nextQ = await generateConversationalResponse(env, firstField, nextField, userMessage, firstValue, state, schema);
    if (schema.welcome && schema.welcome.title) {
      const response = `${schema.welcome.title} ${schema.welcome.message} ${nextQ}`;
      return {
        response,
        interview: { type: serviceId, state, complete: false, lastQuestion: response },
        progress: engine.getProgress(state),
      };
    }
    return {
      response: nextQ,
      interview: { type: serviceId, state, complete: false, lastQuestion: nextQ },
      progress: engine.getProgress(state),
    };
  }

  schema = getDefinition(interview.type || interview.state?.servicio);
  engine = getEngine(schema.id);
  state = interview.state;

  const stateVer = state.engineVersion || 'legacy';
  const stateCampos = Object.keys(state.campos || {}).length;
  log.info('[HANDLER]', `[INTERVIEW_VERSION] continuando engine="${ENGINE_VERSION}" stateVersion="${stateVer}" camposEnEstado=${stateCampos}`);
  log.info('[HANDLER]', 'Procesando respuesta');

  const currentField = engine.getNextField(state);
  let value = null;
  if (currentField) {
    log.info('[HANDLER]', `[DEBUG] currentField="${currentField.nombre}" tipo="${currentField.tipo}" msg="${userMessage.substring(0, 40)}"`);
    value = await extractValue(env, currentField, userMessage, state);
    log.info('[RESOLVER]', `entity="${currentField.nombre}" value=${JSON.stringify(value)} accepted=${value !== null}`);
    if (value !== null) {
      const oldVal = state.campos[currentField.nombre]?.valor;
      log.info('[STATE]', `antes nombre=${JSON.stringify(state.campos.nombre?.valor)} estado=${state.campos.nombre?.estado}`);
      engine.markField(state, currentField.nombre, value);
      if (oldVal !== null) engine.addHistory(state, currentField.nombre, oldVal, value);
      log.info('[STATE]', `despues nombre=${JSON.stringify(state.campos.nombre?.valor)} estado=${state.campos.nombre?.estado}`);
      log.info('[HANDLER]', `Extraído: ${currentField.nombre} = ${JSON.stringify(value)}`);
      await extractMultiple(engine, env, state, userMessage);
    } else {
      log.info('[HANDLER]', `[DEBUG] extracción falló para: ${currentField.nombre}, msg="${userMessage.substring(0, 40)}"`);
    }
  }
  const pendingAfter = engine.getPendingFields(state);
  log.info('[ENGINE]', `pendingFields=[${pendingAfter.map(f => f.nombre).join(',')}] completed=${engine.getCamposCompletos(state).length}/${state.campos ? Object.keys(state.campos).length : '?'}`);

  const lower = userMessage.toLowerCase();
  let change = null;
  if (lower.length > 3 && (lower.includes('no ') || lower.includes('mejor') || lower.includes('cambio') || lower.includes('prefiero') || lower.includes('realidad') || lower.includes('otro'))) {
    change = await detectFieldChange(env, state, userMessage);
    if (change) {
      const oldVal = state.campos[change.field]?.valor;
      engine.markField(state, change.field, change.value);
      if (oldVal !== null) engine.addHistory(state, change.field, oldVal, change.value);
      log.info('[HANDLER]', `Cambio de opinión: ${change.field} -> ${JSON.stringify(change.value)}`);
    }
  }

  // Fase 6: Detect service switch mid-interview
  const newServiceId = detectService(userMessage);
  if (newServiceId && newServiceId !== schema.id) {
    const newSchema = getDefinition(newServiceId);
    const newEngine = getEngine(newServiceId);
    const newState = newEngine.createState();
    // Transfer nombre if available
    if (state.campos?.nombre?.estado === 'completo' && state.campos.nombre.valor) {
      newEngine.markField(newState, 'nombre', state.campos.nombre.valor);
    }
    log.info('[HANDLER]', `Cambio de servicio: ${schema.id} -> ${newServiceId}`);

    const firstField = newEngine.getNextField(newState);
    let firstValue = null;
    if (firstField) {
      firstValue = await extractValue(env, firstField, userMessage, newState);
      if (firstValue !== null) {
        newEngine.markField(newState, firstField.nombre, firstValue);
        await extractMultiple(newEngine, env, newState, userMessage);
      }
    }

    const nextField = newEngine.getNextField(newState);
    if (!nextField) {
      const summary = buildSummary(newSchema, newState);
      const response = buildCompletionMessage(newSchema, newState);
      newState.completada = true;
      eventBus.emit(Events.InterviewCompleted, { type: newSchema.id, newState, summary });
      log.info('[HANDLER]', 'Nueva entrevista completada inmediatamente tras cambio de servicio');
      return { response, summary, interview: { type: newServiceId, state: newState, complete: true, lastQuestion: null }, progress: newEngine.getProgress(newState) };
    }

    const nextQ = await generateConversationalResponse(env, firstField, nextField, userMessage, firstValue, newState, newSchema);
    if (newSchema.welcome && newSchema.welcome.title) {
      return { response: `${newSchema.welcome.title} ${newSchema.welcome.message} ${nextQ}`, interview: { type: newServiceId, state: newState, complete: false, lastQuestion: nextQ }, progress: newEngine.getProgress(newState) };
    }
    return { response: nextQ, interview: { type: newServiceId, state: newState, complete: false, lastQuestion: nextQ }, progress: newEngine.getProgress(newState) };
  }

  const allDone = !engine.getNextField(state);
  engine.isComplete(state);

  if (allDone) {
    const summary = buildSummary(schema, state);
    const response = buildCompletionMessage(schema, state);

    eventBus.emit(Events.InterviewCompleted, { type: schema.id, state, summary });
    log.info('[HANDLER]', 'Entrevista completada');

    return {
      response,
      summary,
      interview: { type: schema.id, state, complete: true, lastQuestion: null },
      progress: engine.getProgress(state),
    };
  }

  const nextField = engine.getNextField(state);
  const response = await generateConversationalResponse(env, currentField, nextField, userMessage, value, state, schema, change);

  const status = engine.getStatus(state);
  log.info('[HANDLER]', `Pregunta enviada: "${response.substring(0, 60)}" pendingFields=[${status.pendingFields.join(',')}]`);
  log.info('[HANDLER]', `Siguiente campo: ${nextField?.nombre || 'ninguno'}`);

  return {
    response,
    interview: { type: schema.id, state, complete: false, lastQuestion: response },
    progress: engine.getProgress(state),
  };
}
