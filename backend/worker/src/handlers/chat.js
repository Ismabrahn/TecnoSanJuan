import { buildContext, buildMessages } from '../services/context.js';
import { chat } from '../services/openrouter.js';
import { handleSimpleQuery } from '../services/simple-query.js';
import { query } from '../services/supabase.js';
import { errorResponse } from '../middleware/error.js';

const RATE_LIMIT_MAP = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 20;
let RATE_LIMIT_CLEANUP_INTERVAL = null;

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

    if (!userMessage) {
      return errorResponse(request, 400, 'El mensaje no puede estar vacío');
    }

    if (userMessage.length > 2000) {
      return errorResponse(request, 400, 'El mensaje es demasiado largo');
    }

    const simpleResponse = await handleSimpleQuery(env, userMessage);
    if (simpleResponse) {
      return new Response(JSON.stringify({
        response: simpleResponse,
        hasContext: true,
        source: 'database',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const context = await buildContext(env, userMessage);
    const messages = await buildMessages(env, context, userMessage);
    const response = await chat(env, messages);

    return new Response(JSON.stringify({
      response,
      hasContext: context.length > 0,
      source: 'ai',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    return errorResponse(request, 500, err.message);
  }
}
