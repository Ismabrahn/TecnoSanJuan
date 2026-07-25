import { getEngine, getDefinition } from './definitions.js';
import { detectService } from './services/index.js';
import { detectIntent, buildClarifyingQuestion } from './intention.js';
import { antiLoop } from './anti-loop.js';
import { interpret } from './interpreter.js';
import { resolveEntities } from './resolver.js';
import { buildSummary, buildCompletionMessage, buildStructuredSummary } from './summary.js';
import { defaultLogger } from '../logger.js';
import { eventBus, Events } from './event-bus.js';

export async function handleInterview(env, interview, userMessage, sessionId) {
  let type = interview?.type || null;
  let state = interview?.state ? { ...interview.state } : null;

  const log = sessionId ? defaultLogger.withSession(sessionId, type) : defaultLogger;

  const isNew = state === null;

  if (isNew) {
    const intent = detectIntent(userMessage);
    type = (intent.service && !intent.needsClarification) ? intent.service : (detectService(userMessage) || 'impresion_3d');

    if (intent.needsClarification && !detectService(userMessage)) {
      const clarifying = buildClarifyingQuestion(intent);
      const pendingState = { intent, tipo_trabajo: null };
      log.info('[HANDLER]', `Intención ambigua, pregunta aclaratoria: "${intent.serviceName}"`);
      return {
        response: clarifying,
        interview: { type: null, state: pendingState, complete: false, lastQuestion: clarifying },
        progress: { completed: 0, skipped: 0, pending: 1, total: 1, percent: 0 },
      };
    }

    const def = getDefinition(type);
    const eng = getEngine(type);
    state = eng.createState();
    state.tipo_trabajo = type;
    state.contexto_servicio_mostrado = false;
    state.askedFields = [];

    eventBus.emit(Events.InterviewStarted, { type, sessionId });

    if (!def.welcome || !def.welcome.title) {
      const blocking = eng.getRequiredPending(state);
      const firstBlocking = blocking[0];
      const question = firstBlocking?.question || '¿Cuál es tu nombre?';
      log.info('[HANDLER]', 'Nueva entrevista sin bienvenida', { questionId: firstBlocking?.id || 'nombre' });
      const respuesta = `Claro, te ayudo con eso. ${question}`;
      state.contexto_servicio_mostrado = true;
      return { response: respuesta, interview: { type, state, complete: false, lastQuestion: respuesta } };
    }

    const welcomeTitle = def.welcome.title;
    const welcomeMsg = def.welcome.message || 'Voy a hacerte algunas preguntas.';
    const nameQ = def.questions.find(q => q.id === 'nombre');
    const firstQ = nameQ?.question || '¿Cuál es tu nombre?';

    const response = `${welcomeTitle} ${welcomeMsg} ${firstQ}`;
    state.contexto_servicio_mostrado = true;

    log.info('[HANDLER]', 'Nueva entrevista iniciada', { questionId: 'nombre' });
    return { response, interview: { type, state, complete: false, lastQuestion: response } };
  }

  log.info('[HANDLER]', 'Procesando mensaje', { questionId: interview.lastQuestion });

  if (state.tipo_trabajo === null) {
    const intent = detectIntent(userMessage);
    if (intent.service && !intent.needsClarification) {
      type = intent.service;
      state.tipo_trabajo = intent.service;
      const ndef = getDefinition(type);
      for (const q of ndef.questions) {
        if (state[q.id] === undefined) state[q.id] = null;
      }
      log.info('[HANDLER]', `Servicio detectado por intención: ${type}`);
    } else {
      const detected = detectService(userMessage);
      if (detected) {
        type = detected;
        state.tipo_trabajo = detected;
        const ndef = getDefinition(type);
        for (const q of ndef.questions) {
          if (state[q.id] === undefined) state[q.id] = null;
        }
        log.info('[HANDLER]', `Servicio detectado por keyword: ${detected}`);
      }
    }
  }

  const finalType = type || state.tipo_trabajo || 'impresion_3d';
  const def = getDefinition(finalType);
  const eng = getEngine(finalType);

  if (state.tipo_trabajo === null) {
    state.tipo_trabajo = finalType;
  }

  if (!state.askedFields) state.askedFields = [];

  for (const q of def.questions) {
    if (state[q.id] === undefined) state[q.id] = null;
  }

  const forbidden = def.catalog?.forbidden || [];

  const parsed = await interpret(env, state, userMessage, def.questions);
  const entities = parsed?.entities || [];

  log.info('[HANDLER]', `AI entities: ${JSON.stringify(entities)}`, { sessionId });

  const { resolved, rejected } = resolveEntities(entities, def, state, forbidden);

  log.info('[HANDLER]', `Resolved: ${resolved.map(e => `${e.field}=${JSON.stringify(e.value)}`).join(', ') || 'none'} | Rejected: ${rejected.map(r => `${r.field}=${r.value}`).join(', ') || 'none'}`, { sessionId });

  let updated = false;
  for (const entity of resolved) {
    if (entity.field === 'tipo_trabajo') {
      if (state.tipo_trabajo === null) {
        state.tipo_trabajo = entity.value;
        const ndef = getDefinition(entity.value);
        for (const q of ndef.questions) {
          if (state[q.id] === undefined) state[q.id] = null;
        }
      }
      continue;
    }
    if (state[entity.field] === 'loop_skip') {
      log.info('[HANDLER]', `Campo "${entity.field}" estaba en loop_skip, restaurando valor`);
    }
    eng.addHistory(state, entity.field, entity.value);
    state[entity.field] = entity.value;
    updated = true;
    eventBus.emit(Events.FieldUpdated, { field: entity.field, value: entity.value, confidence: entity.confidence });
    log.info('[HANDLER]', `Campo "${entity.field}" = "${entity.value}"`, { questionId: entity.field });
  }

  if (rejected.length > 0) {
    log.info('[HANDLER]', `Entidades rechazadas: ${rejected.map(r => `${r.field}=${r.value}`).join(', ')}`);
  }

  if (state.tipo_trabajo === null) {
    const fallbackQ = '¿Qué trabajo querés realizar? Trabajamos con impresión 3D y cartelería LED.';
    log.info('[HANDLER]', 'Servicio no detectado, preguntando');
    return { response: fallbackQ, interview: { type: finalType, state, complete: false, lastQuestion: fallbackQ } };
  }

  if (state.nombre === null) {
    const q = def.questions.find(q => q.id === 'nombre');
    const question = q?.question || '¿Cuál es tu nombre?';
    log.info('[HANDLER]', 'Preguntando nombre');
    return { response: question, interview: { type: finalType, state, complete: false, lastQuestion: question } };
  }

  {
    const dbgState = JSON.stringify({nombre: state.nombre, pieza: state.pieza, archivo: state.archivo, cantidad: state.cantidad, askedFields: state.askedFields});
    log.info('[HANDLER]', `[DEBUG] Estado antes de fallback booleano: ${dbgState}`, { sessionId });

    const currentQuestion = interview?.lastQuestion || '';
    log.info('[HANDLER]', `[DEBUG] lastQuestion="${currentQuestion?.substring(0, 60)}"`, { sessionId });

    let pending = null;
    if (currentQuestion) {
      pending = def.questions.find(q => {
        if (!q.question) return false;
        return currentQuestion.endsWith(q.question) || q.question === currentQuestion;
      });
    }
    log.info('[HANDLER]', `[DEBUG] pending por lastQuestion: ${pending?.id || 'ninguno'}`, { sessionId });

    if (!pending) {
      const next = eng.getNextQuestion(state);
      log.info('[HANDLER]', `[DEBUG] getNextQuestion retorna: ${next?.id || 'null'}`, { sessionId });
      pending = next;
    }

    if (pending && pending.type === 'boolean' && state[pending.id] === null) {
      const firstWord = userMessage.trim().toLowerCase().replace(/^[^a-záéíóúñ]+/i, '').split(/[\s,;:]+/)[0];
      log.info('[HANDLER]', `[DEBUG] Boolean check: field="${pending.id}" firstWord="${firstWord}"`, { sessionId });
      let boolVal = null;
      if (firstWord === 'no') boolVal = false;
      else if (['sí', 'si', 'yes'].includes(firstWord)) boolVal = true;
      if (boolVal !== null) {
        eng.addHistory(state, pending.id, boolVal);
        state[pending.id] = boolVal;
        updated = true;
        log.info('[HANDLER]', `[DEBUG] Boolean fallback: "${pending.id}" = ${boolVal}`, { sessionId });
      } else {
        log.info('[HANDLER]', `[DEBUG] Boolean fallback: "${firstWord}" no se reconoce como booleano, no se aplica`, { sessionId });
      }
    } else {
      log.info('[HANDLER]', `[DEBUG] Boolean fallback no aplica: pending=${pending?.id || 'null'} type=${pending?.type} stateVal=${pending ? state[pending.id] : 'N/A'}`, { sessionId });
    }
  }

  eng.isComplete(state);
  const status = eng.getStatus(state);
  const progress = eng.getProgress(state);

  let nextField = eng.getNextQuestion(state);

  if (!state.contexto_servicio_mostrado) {
    state.contexto_servicio_mostrado = true;
    const intro = def.welcome.message || 'Perfecto, vamos a tomar los datos.';
    let response = intro;
    if (nextField && nextField.question) {
      response = `${intro} ${nextField.question}`;
    }
    log.info('[HANDLER]', `Intro mostrada: ${nextField?.id || 'ninguna'}`);
    return { response, interview: { type: finalType, state, complete: false, lastQuestion: response }, progress };
  }

  if (nextField) {
    const loopResult = antiLoop.detectLoop(state, sessionId, nextField);
    if (loopResult) {
      log.info('[HANDLER]', `Anti-loop saltó "${nextField.id}", buscando siguiente`);
      nextField = eng.getNextQuestion(state);
    }
    if (nextField && nextField.id) {
      state.askedFields.push(nextField.id);
      antiLoop.trackAsked(sessionId, nextField.id);
    }
  }

  if (!nextField) {
    const blocking = eng.getBlockingFieldsMissing(state);
    if (blocking.length > 0) {
      log.info('[HANDLER]', `Faltan ${blocking.length} campos blocking, preguntando primero`);
      const nextBlocking = blocking[0];
      const loopResult2 = antiLoop.detectLoop(state, sessionId, nextBlocking);
      if (loopResult2) {
        const nextBlocking2 = blocking[1];
        if (nextBlocking2) {
          const q2 = nextBlocking2.question;
          state.askedFields.push(nextBlocking2.id);
          antiLoop.trackAsked(sessionId, nextBlocking2.id);
          log.info('[HANDLER]', `Anti-loop saltó bloqueante, siguiente: ${nextBlocking2.id}`);
          return { response: q2, interview: { type: finalType, state, complete: false, lastQuestion: q2 }, progress };
        }
        log.info('[HANDLER]', 'Anti-loop: todos los bloqueantes agotados, forzando finalización');
        state.finalizada = true;
        state.updatedAt = new Date().toISOString();
        const summary = buildSummary(def, state);
        const structuredSummary = buildStructuredSummary(def, state);
        const response = buildCompletionMessage(def, state, summary);
        eventBus.emit(Events.InterviewCompleted, { type: finalType, state, summary });
        return {
          response, summary, structuredSummary,
          interview: { type: finalType, state, complete: true },
          progress,
        };
      }
      state.askedFields.push(nextBlocking.id);
      antiLoop.trackAsked(sessionId, nextBlocking.id);
      return {
        response: nextBlocking.question,
        interview: { type: finalType, state, complete: false, lastQuestion: nextBlocking.question },
        progress,
      };
    }

    state.finalizada = true;
    state.updatedAt = new Date().toISOString();
    const summary = buildSummary(def, state);
    const structuredSummary = buildStructuredSummary(def, state);
    const response = buildCompletionMessage(def, state, summary);

    eventBus.emit(Events.InterviewCompleted, { type: finalType, state, summary });
    log.info('[HANDLER]', 'Entrevista completada');
    eventBus.emit(Events.SummaryGenerated, { type: finalType, summary });

    return {
      response,
      summary,
      structuredSummary,
      interview: { type: finalType, state, complete: true },
      progress,
    };
  }

  const nextQuestion = nextField.question;
  log.info('[HANDLER]', `Siguiente pregunta: ${nextField.id}`);
  eventBus.emit(Events.QuestionAnswered, { field: nextField.id, question: nextQuestion });
  return { response: nextQuestion, interview: { type: finalType, state, complete: false, lastQuestion: nextQuestion }, progress };
}
