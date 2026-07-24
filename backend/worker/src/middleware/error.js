import { getCorsHeaders } from './cors.js';

export function errorResponse(request, status, message, details = null) {
  const body = {
    error: true,
    message,
  };
  if (details) {
    body.details = details;
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request),
    },
  });
}

export function handleError(request, err) {
  console.error('Unhandled error:', err);

  const status = err.status || 500;
  const message = err.message || 'Error interno del servidor';

  return errorResponse(request, status, message);
}
