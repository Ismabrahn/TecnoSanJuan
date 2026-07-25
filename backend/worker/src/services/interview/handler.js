import { getEngine, getDefinition } from './definitions.js';
import { detectService } from './services/index.js';
import { chat } from '../openrouter.js';
import { buildSummary, buildCompletionMessage } from './summary.js';
import { defaultLogger } from '../logger.js';
import { eventBus, Events } from './event-bus.js';

function normalizeInput(interview) {
  if (!interview || !interview.state) return null;
  if (interview.state && interview.state.campos) return interview;
  if (interview.type && interview.state && !interview.state.campos) return null;
  return null;
}

function getFirstWord(msg) {
  return msg.trim().toLowerCase().replace(/^[¡!¿?\s]+/, '').split(/[\s,;:]+/)[0];
}

const EXTRACT_SYSTEM = `Sos un extractor de datos para presupuestos de Tecno San Juan.
Respondé ÚNICAMENTE con un valor JSON sin texto adicional.

Reglas:
- Para tipo "boolean": true o false
- Para tipo "select": UNO de los valores en "opciones"
- Para tipo "texto": el texto exacto mencionado por el usuario
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
  if (extracted && typeof extracted === 'string' && extracted.trim()) {
    return extracted.trim();
  }
  if (userMessage.trim()) return userMessage.trim();
  return null;
}

export async function handleInterview(env, interview, userMessage, sessionId) {
  const log = sessionId ? defaultLogger.withSession(sessionId) : defaultLogger;
  const isNew = !normalizeInput(interview);

  let schema, engine, state;

  if (isNew) {
    const serviceId = detectService(userMessage) || 'impresion_3d';
    schema = getDefinition(serviceId);
    engine = getEngine(serviceId);
    state = engine.createState();

    log.info('[HANDLER]', `Nueva entrevista: ${serviceId}`);
    eventBus.emit(Events.InterviewStarted, { type: serviceId, sessionId });

    if (schema.welcome && schema.welcome.title) {
      const firstField = engine.getNextField(state);
      const firstQ = firstField?.pregunta || '¿Cuál es tu nombre?';
      const response = `${schema.welcome.title} ${schema.welcome.message} ${firstQ}`;
      return {
        response,
        interview: { type: serviceId, state, complete: false, lastQuestion: response },
        progress: engine.getProgress(state),
      };
    }

    const firstField = engine.getNextField(state);
    const firstQ = firstField?.pregunta || '¿Cuál es tu nombre?';
    const response = `Claro, te ayudo con eso. ${firstQ}`;
    return {
      response,
      interview: { type: serviceId, state, complete: false, lastQuestion: response },
      progress: engine.getProgress(state),
    };
  }

  schema = getDefinition(interview.type || interview.state?.servicio);
  engine = getEngine(schema.id);
  state = interview.state;

  log.info('[HANDLER]', 'Procesando respuesta');

  const currentField = engine.getNextField(state);
  if (currentField) {
    const value = await extractValue(env, currentField, userMessage, state);
    if (value !== null) {
      engine.markField(state, currentField.nombre, value);
      log.info('[HANDLER]', `Extraído: ${currentField.nombre} = ${JSON.stringify(value)}`);
    } else {
      log.info('[HANDLER]', `No se pudo extraer valor para: ${currentField.nombre}`);
    }
  }

  const allDone = !engine.getNextField(state);
  engine.isComplete(state);

  if (allDone) {
    const summary = buildSummary(schema, state);
    const structuredSummary = schema.campos
      .filter(c => state.campos[c.nombre] && state.campos[c.nombre].estado === 'completo')
      .map(c => `${c.nombre}: ${state.campos[c.nombre].valor}`);

    const response = buildCompletionMessage(schema, state, summary);

    eventBus.emit(Events.InterviewCompleted, { type: schema.id, state, summary });
    log.info('[HANDLER]', 'Entrevista completada');

    return {
      response,
      summary,
      structuredSummary,
      interview: { type: schema.id, state, complete: true, lastQuestion: null },
      progress: engine.getProgress(state),
    };
  }

  const nextField = engine.getNextField(state);
  const nextQuestion = nextField?.pregunta || 'Perfecto. ¿Algo más que debamos saber?';

  log.info('[HANDLER]', `Siguiente campo: ${nextField?.nombre || 'ninguno'}`);

  return {
    response: nextQuestion,
    interview: { type: schema.id, state, complete: false, lastQuestion: nextQuestion },
    progress: engine.getProgress(state),
  };
}
