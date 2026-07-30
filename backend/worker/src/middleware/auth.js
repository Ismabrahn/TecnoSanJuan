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

  const rawAllowed = env.ADMIN_ALLOWED_EMAILS || '';
  // Filtramos espacios, comillas accidentales y lo pasamos a minúsculas
  const allowedEmails = rawAllowed
    .split(',')
    .map(e => e.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .filter(Boolean);

  const userEmail = (result.email || '').trim().toLowerCase();

  if (allowedEmails.length > 0 && (!userEmail || !allowedEmails.includes(userEmail))) {
    return { 
      authenticated: false, 
      error: `Email no autorizado. Esperado: [${allowedEmails.join(', ')}], Recibido: '${userEmail}'`, 
      status: 403 
    };
  }

  return { authenticated: true, user: result };
}
