import { buildContext, buildMessages } from '../services/context.js';
import { chat } from '../services/openrouter.js';
import { handleInterview } from '../services/interview/index.js';
import { webSearch, formatSearchResults } from '../services/websearch.js';
import { query } from '../services/supabase.js';
import { errorResponse } from '../middleware/error.js';
import { createSession, extractName, detectWaitingState, detectWaitingNeedState, detectServiceFromMessage, buildNameResponse, STATES } from '../services/conversation/session.js';
import { detectIntent } from '../services/interview/intention.js';
import { defaultLogger } from '../services/logger.js';
import { eventBus, Events } from '../services/interview/event-bus.js';
import { getSession, saveSession, deleteSession } from '../services/session-store.js';

const log = defaultLogger;
const RATE_LIMIT_MAP = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 40;
let RATE_LIMIT_CLEANUP_INTERVAL = null;

const IN_FLIGHT = new Set();
const LAST_MESSAGE = new Map();
const SPAM_WINDOW = 5000;

function cleanupRateLimitMap() {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW * 2;
  for (const [ip, timestamps] of RATE_LIMIT_MAP.entries()) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) {
      RATE_LIMIT_MAP.delete(ip);
    } else {
      RATE_LIMIT_MAP.set(ip, filtered);
    }
  }
}

function checkRateLimit(clientIp) {
  if (!RATE_LIMIT_CLEANUP_INTERVAL) {
    RATE_LIMIT_CLEANUP_INTERVAL = 1;
    setTimeout(() => {
      cleanupRateLimitMap();
      RATE_LIMIT_CLEANUP_INTERVAL = null;
    }, RATE_LIMIT_WINDOW);
  }

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!RATE_LIMIT_MAP.has(clientIp)) {
    RATE_LIMIT_MAP.set(clientIp, []);
  }

  const timestamps = RATE_LIMIT_MAP.get(clientIp).filter(t => t > windowStart);
  timestamps.push(now);
  RATE_LIMIT_MAP.set(clientIp, timestamps);

  return timestamps.length <= RATE_LIMIT_MAX;
}

function detectSpam(clientIp, message) {
  if (IN_FLIGHT.has(clientIp)) {
    return 'Ya tenés una consulta en proceso. Esperá la respuesta.';
  }

  const last = LAST_MESSAGE.get(clientIp);
  if (last && last.message === message && Date.now() - last.time < SPAM_WINDOW) {
    return 'Ese mensaje ya lo enviaste hace segundos. Esperá la respuesta.';
  }

  LAST_MESSAGE.set(clientIp, { message, time: Date.now() });
  return null;
}

export async function handleHealth(env) {
  try {
    await query(env, 'business_info', { limit: '1' }, true);
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'tecno-san-juan-worker',
      timestamp: new Date().toISOString(),
      supabase: 'connected',
      engineVersion: '3.0.0',
      interviewEngine: 'v3-fields',
      commit: '44e7d6c5-fix-kv-preference',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      status: 'degraded',
      service: 'tecno-san-juan-worker',
      timestamp: new Date().toISOString(),
      supabase: 'disconnected',
      error: err.message,
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleChat(request, env) {
  if (request.method !== 'POST') {
    return errorResponse(request, 405, 'Método no permitido');
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || 'anonymous';
  if (!checkRateLimit(clientIp)) {
    return errorResponse(request, 429, 'Demasiadas solicitudes. Intentá de nuevo en un minuto.');
  }

  try {
    const body = await request.json();
    const userMessage = (body.message || '').trim();
    const chatContext = (body.context || '').trim();

    // Reset action: delete session and restart (before message validation)
    if (body.action === 'reset') {
      const sessionId = body.session || clientIp;
      await deleteSession(env, sessionId);
      return new Response(JSON.stringify({
        response: 'Bien, empecemos de nuevo. Decime qué necesitás y te ayudo.',
        interview: null,
        session: null,
        source: 'ai',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!userMessage) {
      return errorResponse(request, 400, 'El mensaje no puede estar vacío');
    }

    if (userMessage.length > 2000) {
      return errorResponse(request, 400, 'El mensaje es demasiado largo');
    }

    const spamError = detectSpam(clientIp, userMessage);
    if (spamError) {
      return errorResponse(request, 429, spamError);
    }

    IN_FLIGHT.add(clientIp);

    try {
      const interview = body.interview || null;

      const sessionId = body.session || clientIp;

      if (chatContext === '3d_quote' || interview) {
        // Prefer client's interview (most recent), fallback to KV for crash recovery
        const kvSession = await getSession(env, sessionId);
        if (kvSession && !interview) {
          log.info('[CHAT]', 'Usando estado desde KV (fallback, no hay interview del cliente)');
        }
        if (interview && kvSession) {
          log.info('[CHAT]', 'Cliente envió interview, ignorando KV para evitar stale state');
        }
        const interviewInput = interview || kvSession;
        if (interviewInput?.state?.campos) {
          const completos = Object.entries(interviewInput.state.campos)
            .filter(([_, c]) => c.estado === 'completo').map(([k]) => k);
          log.info('[CHAT]', `[STATE_TRACE] usando=${interview ? 'cliente' : 'KV'} completos=[${completos.join(',')}] msg="${userMessage.substring(0, 30)}"`);
        }

        const result = await handleInterview(env, interviewInput, userMessage, sessionId);

        // Save session to KV (delete if complete)
        if (sessionId && result.interview) {
          if (result.interview.complete) {
            await deleteSession(env, sessionId);
          } else {
            await saveSession(env, sessionId, { type: result.interview.type, state: result.interview.state });
          }
        }

        if (result.interview?.state?.campos) {
          const completos = Object.entries(result.interview.state.campos)
            .filter(([_, c]) => c.estado === 'completo').map(([k]) => k);
          log.info('[CHAT]', `[STATE_TRACE] despues completos=[${completos.join(',')}]`);
        }
        log.info('[CHAT]', `Entrevista ${result.interview?.complete ? 'completada' : 'en curso'}`, { sessionId });

        let phone = '';
        try {
          const phones = await query(env, 'phones', {}, false);
          const phone3d = phones?.find(p => /3d|impresión/i.test(p.label || p.name || ''));
          if (phone3d) {
            phone = (phone3d.phone || phone3d.number || '').replace(/[^0-9]/g, '');
          }
          if (!phone) {
            const biz = await query(env, 'business_info', { limit: '1' }, true);
            if (biz?.phone) phone = biz.phone.replace(/[^0-9]/g, '');
          }
          if (!phone && phones?.length > 0) {
            phone = (phones[0].phone || phones[0].number || '').replace(/[^0-9]/g, '');
          }
        } catch (e) {
          log.info('[CHAT]', 'Supabase no disponible, usando fallback');
        }

        if (!phone) {
          phone = (env.WHATSAPP_NUMBER || '').replace(/[^0-9]/g, '');
          if (phone) log.info('[CHAT]', 'Teléfono desde variable de entorno');
        }

        if (result.interview?.complete && !phone) {
          log.error('[CHAT]', 'No hay número de WhatsApp configurado');
        }

        return new Response(JSON.stringify({
          response: result.response,
          interview: result.interview,
          summary: result.summary || null,
          structuredSummary: result.structuredSummary || null,
          progress: result.progress || null,
          phone,
          source: 'ai',
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Proactive intent detection: if user shows clear service intent, start interview
      const intent = detectIntent(userMessage);
      if (intent.service && !intent.needsClarification) {
        log.info('[CHAT]', `Intención detectada: "${intent.service}" (${intent.confidence.toFixed(2)}), iniciando entrevista`);
        const result = await handleInterview(env, null, userMessage, sessionId);
        if (sessionId && result.interview) {
          if (result.interview.complete) {
            await deleteSession(env, sessionId);
          } else {
            await saveSession(env, sessionId, { type: result.interview.type, state: result.interview.state });
          }
        }
        return new Response(JSON.stringify({
          response: result.response,
          interview: result.interview,
          summary: result.summary || null,
          structuredSummary: result.structuredSummary || null,
          progress: result.progress || null,
          source: 'ai',
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const session = body.session || createSession();
      const preprocessed = await processSessionPre(env, session, userMessage);
      if (preprocessed) {
        return new Response(JSON.stringify({
          response: preprocessed.response,
          session: preprocessed.session,
          interview: preprocessed.interview || undefined,
          context: chatContext,
          source: 'ai',
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const [context, webResults] = await Promise.all([
        buildContext(env, userMessage),
        webSearch(userMessage).catch(() => []),
      ]);

      const webContext = formatSearchResults(webResults);
      const combined = context + (webContext ? '\n\n' + webContext : '');
      const messages = await buildMessages(env, combined, userMessage, chatContext, session);
      const response = await chat(env, messages);

      processSessionPost(session, response);

      return new Response(JSON.stringify({
        response,
        session,
        hasContext: combined.length > 0,
        context: chatContext,
        source: 'ai',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      IN_FLIGHT.delete(clientIp);
    }
  } catch (err) {
    log.error('[CHAT]', `Error: ${err.message}`);
    return errorResponse(request, 500, err.message);
  }
}

async function processSessionPre(env, session, message) {
  if (session.estado_actual === STATES.WAITING_NAME) {
    const name = extractName(message);
    if (name) {
      session.nombre_cliente = name;
      session.estado_actual = STATES.WAITING_NEED;
      return { response: buildNameResponse(name), session };
    }
  }

  if (session.estado_actual === STATES.WAITING_NEED) {
    const needResult = await processNeedDetection(env, session, message);
    if (needResult) return needResult;
  }

  return null;
}

async function processNeedDetection(env, session, message) {
  const service = detectServiceFromMessage(message);
  if (!service) return null;

  session.estado_actual = STATES.IDENTIFIED;

  if (service === 'servicio_tecnico') {
    return {
      response: `Entendido. Para consultas sobre servicio técnico, te recomiendo contactarnos directamente por WhatsApp y uno de nuestros técnicos va a asesorarte. ¿Hay algo más en lo que pueda ayudarte?`,
      session,
    };
  }

  const prefill = {};
  if (session.nombre_cliente) {
    prefill.nombre = session.nombre_cliente;
  }

  try {
    const result = await handleInterview(env, null, message, null, prefill);
    log.info('[CHAT]', `Entrevista iniciada para: ${service}`, { sessionId: session.sessionId });
    return {
      response: result.response,
      session,
      interview: result.interview,
    };
  } catch (err) {
    log.error('[CHAT]', `[INTERVIEW ERROR] processNeedDetection falló al iniciar entrevista para ${service}: ${err.message}`);
    log.error('[CHAT]', `[INTERVIEW ERROR] Ruta antigua detectada y reemplazada. Usar solo handleInterview().`);
    return null;
  }
}

function processSessionPost(session, aiResponse) {
  if (session.estado_actual === STATES.IDLE) {
    const nextState = detectWaitingState(aiResponse);
    if (nextState) {
      session.estado_actual = nextState;
    }
  } else if (session.estado_actual === STATES.IDENTIFIED) {
    const needState = detectWaitingNeedState(aiResponse);
    if (needState) {
      session.estado_actual = needState;
    }
  }
}
