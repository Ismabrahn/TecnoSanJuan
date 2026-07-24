import { verifyAuth } from '../utils/jwt.js';

export async function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Token no proporcionado', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');
  const result = await verifyAuth(token, env.SUPABASE_URL);

  if (!result.authenticated) {
    return { authenticated: false, error: result.error, status: 401 };
  }

  const allowedEmails = (env.ADMIN_ALLOWED_EMAILS || '').split(',').map(e => e.trim());
  if (allowedEmails.length > 0 && result.email && !allowedEmails.includes(result.email)) {
    return { authenticated: false, error: 'Email no autorizado', status: 403 };
  }

  return { authenticated: true, user: result };
}
