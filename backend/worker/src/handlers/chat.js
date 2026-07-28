import { createClient } from '@supabase/supabase-js';
import { chat } from '../services/openrouter.js';
import { query } from '../services/supabase.js';
import { webSearch, formatSearchResults } from '../services/websearch.js';
import { buildContext, buildMessages } from '../services/context.js';
import { errorResponse } from '../middleware/error.js';
import { createSession } from '../services/conversation/session.js';
import { defaultLogger } from '../services/logger.js';
import { deleteSession } from '../services/session-store.js';

const log = defaultLogger;
const RATE_LIMIT_MAP = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 40;
let RATE_LIMIT_CLEANUP_INTERVAL = null;

const IN_FLIGHT = new Set();
const LAST_MESSAGE = new Map();
const SPAM_WINDOW = 5000;
let LAST_MESSAGE_CLEANUP = null;

function cleanupLastMessageMap() {
  const cutoff = Date.now() - SPAM_WINDOW * 10;
  for (const [ip, entry] of LAST_MESSAGE) {
    if (entry.time < cutoff) LAST_MESSAGE.delete(ip);
  }
  LAST_MESSAGE_CLEANUP = null;
}

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
    RATE_LIMIT_CLEANUP_INTERVAL = setTimeout(() => {
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

  if (!LAST_MESSAGE_CLEANUP) {
    LAST_MESSAGE_CLEANUP = setTimeout(cleanupLastMessageMap, SPAM_WINDOW * 10);
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

    if (body.action === 'reset') {
      const sessionId = body.session || clientIp;
      await deleteSession(env, sessionId);
      return new Response(JSON.stringify({
        response: 'Bien, empecemos de nuevo. Decime qué necesitás y te ayudo.',
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
      const runtime = await createChatRuntime(env, chatContext);
      const session = body.session || createSession();
      const sessionId = session.id || session.session_id || crypto.randomUUID();
      session.id = sessionId;

      const result = await runtime.handleMessage({
        message: userMessage,
        sessionId,
      });

      return new Response(JSON.stringify({
        response: result.message || result.question || result.explanation || '',
        session,
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

async function createChatRuntime(env, chatContext) {
  const { NexusAIEngine } = await import('../services/nexus/nexus-ai-engine.js');
  const { PlanningEngine } = await import('../services/nexus/planning-engine.js');
  const { ChatRuntime } = await import('../services/nexus/chat-runtime.js');
  const { InterviewRouter } = await import('../services/nexus/interview-router.js');
  const { SchemaRegistry } = await import('../services/interview/v2/schema-registry.js');
  const { InterviewController } = await import('../services/interview/v2/interview-controller.js');
  const { SupabaseSessionStore } = await import('../services/interview/v2/stores/supabase-session-store.js');
  const { AIAdapter } = await import('../services/interview/v2/ai-adapter.js');
  const { registerInterviewTools } = await import('../services/nexus/tools/interview-tools.js');

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const sessionStore = new SupabaseSessionStore(supabase);
  const aiAdapter = new AIAdapter({
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: env.OPENROUTER_BASE_URL,
    defaultModel: env.OPENROUTER_MODEL,
  });
  const schemaRegistry = new SchemaRegistry({ skipValidation: env.ENVIRONMENT === 'production' });
  const interviewController = new InterviewController({ sessionStore, schemaRegistry, aiAdapter });
  const interviewRouter = new InterviewRouter({ schemaRegistry, interviewController });

  const engine = new NexusAIEngine({
    chatFn: async (prompt) => {
      const [context, webResults] = await Promise.all([
        buildContext(env, prompt),
        webSearch(prompt).catch(() => []),
      ]);
      const webContext = formatSearchResults(webResults);
      const combined = context + (webContext ? '\n\n' + webContext : '');
      const messages = await buildMessages(env, combined, prompt, chatContext);
      return chat(env, messages);
    },
  });

  registerInterviewTools(engine.toolRegistry, { interviewController, schemaRegistry });
  engine.profileManager.get('customer').allowedTools.push(
    'questionGenerator',
    'interpreter',
    'interviewController'
  );

  return new ChatRuntime({ engine, interviewRouter });
}
