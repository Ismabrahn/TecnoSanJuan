import { handlePublicGet } from './handlers/public.js';
import {
  handleAdminGetAll,
  handleAdminGetOne,
  handleAdminCreate,
  handleAdminUpdate,
  handleAdminDelete,
} from './handlers/admin.js';
import { handleChat, handleHealth } from './handlers/chat.js';
import { requireAdmin } from './middleware/auth.js';
import { handleOptions, getCorsHeaders } from './middleware/cors.js';
import { errorResponse, handleError } from './middleware/error.js';

const PUBLIC_PREFIX = '/api/public/';
const ADMIN_PREFIX = '/api/admin/';
const CHAT_PATH = '/chat';
const HEALTH_PATH = '/health';

export async function handleRequest(request, env) {
  try {
    const options = handleOptions(request);
    if (options) return options;

    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = getCorsHeaders(request);

    if (path === HEALTH_PATH) {
      const response = await handleHealth(env);
      return addCors(response, corsHeaders);
    }

    if (path === CHAT_PATH) {
      const response = await handleChat(request, env);
      return addCors(response, corsHeaders);
    }

    if (path.startsWith(PUBLIC_PREFIX)) {
      const resource = path.slice(PUBLIC_PREFIX.length);
      const response = await handlePublicGet(request, env, resource);
      return addCors(response, corsHeaders);
    }

    if (path.startsWith(ADMIN_PREFIX)) {
      const auth = await requireAdmin(request, env);
      if (!auth.authenticated) {
        return errorResponse(request, auth.status, auth.error);
      }

      const remaining = path.slice(ADMIN_PREFIX.length);
      const parts = remaining.split('/');
      const resource = parts[0];
      const id = parts[1];

      if (request.method === 'GET' && !id) {
        const response = await handleAdminGetAll(request, env, resource);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'GET' && id) {
        const response = await handleAdminGetOne(request, env, resource, id);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'POST' && !id) {
        const response = await handleAdminCreate(request, env, resource);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'PUT' && id) {
        const response = await handleAdminUpdate(request, env, resource, id);
        return addCors(response, corsHeaders);
      }
      if (request.method === 'DELETE' && id) {
        const response = await handleAdminDelete(request, env, resource, id);
        return addCors(response, corsHeaders);
      }

      return errorResponse(request, 405, 'Método no permitido');
    }

    return errorResponse(request, 404, 'Endpoint no encontrado');
  } catch (err) {
    return handleError(request, err);
  }
}

function addCors(response, corsHeaders) {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
