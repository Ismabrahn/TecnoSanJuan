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
  try {
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const match = raw.match(/\{[\s\S]*\}|true|false|null|"[^"]*"|'[^']*'/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

async function extractValue(env, campo, userMessage, state) {
  if (!campo) return null;

  if (isQuestion(userMessage)) return null;

  if (campo.tipo === 'boolean') {
    const first = getFirstWord(userMessage);
    if (first === 'no') return false;
    if (['sí', 'si', 'yes', 's'].includes(first)) return true;
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

async function generateConversationalResponse(env, currentField, nextField, userMessage, value, state, schema) {
  const name = state.campos?.nombre?.valor || '';

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

  if (currentField && value === null) {
    const pregunta = currentField.pregunta || '';
    const etiqueta = currentField.etiqueta || currentField.nombre || '';
    try {
      const aiResponse = await chat(env, [
        { role: 'system', content: `Sos un vendedor cordial de Tecno San Juan. No entendiste bien la respuesta del usuario. Preguntale de nuevo de forma clara y natural, variando un poco la redacción. Sé breve. Usá el nombre del cliente si lo sabés.` },
        { role: 'user', content: `Cliente: ${name || 'sin nombre'}
Usuario dijo: "${userMessage}"
Dato que necesitamos: ${etiqueta}
Pregunta anterior: "${pregunta}"` }
      ]);
      return aiResponse;
    } catch {
      return `Disculpá, no entendí bien. ${pregunta}`;
    }
  }

  if (!nextField) return null;

  const nextPregunta = nextField.pregunta || '';
  const transition = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
  return `${transition} ${nextPregunta}`;
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
    if (value !== null) {
      engine.markField(state, currentField.nombre, value);
      log.info('[HANDLER]', `Extraído: ${currentField.nombre} = ${JSON.stringify(value)}`);
      await extractMultiple(engine, env, state, userMessage);
    } else {
      log.info('[HANDLER]', `[DEBUG] extracción falló para: ${currentField.nombre}, msg="${userMessage.substring(0, 40)}"`);
    }
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
  const response = await generateConversationalResponse(env, currentField, nextField, userMessage, value, state, schema);

  log.info('[HANDLER]', `Siguiente campo: ${nextField?.nombre || 'ninguno'}`);

  return {
    response,
    interview: { type: schema.id, state, complete: false, lastQuestion: response },
    progress: engine.getProgress(state),
  };
}
