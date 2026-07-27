import { SchemaRegistry } from '../../../services/interview/v2/schema-registry.js';
import { InterviewController } from '../../../services/interview/v2/interview-controller.js';
import { createInterviewApi } from './controller.js';

function jsonResponse(data, status = 200) {
  const body = JSON.stringify(data);
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseSessionId(pathRemainder) {
  const parts = pathRemainder.split('/').filter(Boolean);
  if (parts.length === 0) return { sessionId: null, sub: null };
  const sessionId = parts[0];
  const sub = parts.length > 1 ? parts.slice(1).join('/') : null;
  return { sessionId, sub };
}

export function createInterviewRouter({ schemaRegistry, interviewController }) {
  const api = createInterviewApi({ schemaRegistry, interviewController });

  async function handleStart(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const result = await api.start(body);
    return jsonResponse(result.body, result.httpStatus);
  }

  async function handleAnswer(request, sessionId) {
    let body;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const result = await api.answer(sessionId, body);
    return jsonResponse(result.body, result.httpStatus);
  }

  async function handleGetSession(sessionId) {
    const result = await api.getSession(sessionId);
    return jsonResponse(result.body, result.httpStatus);
  }

  async function handleDeleteSession(sessionId) {
    const result = await api.clearSession(sessionId);
    return jsonResponse(result.body, result.httpStatus);
  }

  return async function handleInterviewV2(request, env, pathRemainder) {
    const method = request.method;

    if (pathRemainder === 'start' && method === 'POST') {
      return handleStart(request);
    }

    const { sessionId, sub } = parseSessionId(pathRemainder);

    if (!sessionId) {
      return jsonResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint no encontrado.' },
      }, 404);
    }

    if (sub === 'answer' && method === 'POST') {
      return handleAnswer(request, sessionId);
    }

    if (sub === null && method === 'GET') {
      return handleGetSession(sessionId);
    }

    if (sub === null && method === 'DELETE') {
      return handleDeleteSession(sessionId);
    }

    return jsonResponse({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint no encontrado.' },
    }, 404);
  };
}

const defaultRouter = createInterviewRouter({
  schemaRegistry: new SchemaRegistry(),
  interviewController: new InterviewController(),
});

export const handleInterviewV2 = defaultRouter;
