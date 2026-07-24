import { buildContext, buildMessages } from '../services/context.js';
import { chat } from '../services/openrouter.js';
import { handleInterview } from '../services/interview/index.js';
import { webSearch, formatSearchResults } from '../services/websearch.js';
import { query } from '../services/supabase.js';
import { errorResponse } from '../middleware/error.js';

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

      if (chatContext === '3d_quote' || interview) {
        const result = await handleInterview(env, interview, userMessage);

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
        } catch (e) {}

        return new Response(JSON.stringify({
          response: result.response,
          interview: result.interview,
          phone,
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
      const messages = await buildMessages(env, combined, userMessage, chatContext);
      const response = await chat(env, messages);

      return new Response(JSON.stringify({
        response,
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
    console.error('Chat error:', err.message);
    return errorResponse(request, 500, err.message);
  }
}
