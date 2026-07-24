import { query, getById, insert, update, remove } from '../services/supabase.js';
import { errorResponse } from '../middleware/error.js';
import { sanitize } from '../utils/validate.js';

const RESOURCE_MAP = {
  'business-info': 'business_info',
  'services': 'services',
  'categories': 'categories',
  'prices': 'prices',
  'promotions': 'promotions',
  'warranties': 'warranties',
  'print3d': 'print3d',
  'faqs': 'faqs',
  'social-media': 'social_media',
  'phones': 'phones',
  'address': 'address',
  'featured-messages': 'featured_messages',
  'hours': 'hours',
  'emails': 'emails',
  'products': 'products',
  'chatbot-config': 'chatbot_config',
};

export async function handleAdminGetAll(request, env, resource) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const options = { order: 'id.asc' };

    if (search && resource !== 'business-info' && resource !== 'address') {
      options.search = search;
    }

    const data = await query(env, table, options, true);
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminGetOne(request, env, resource, id) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const data = await getById(env, table, id, true);
    if (!data) return errorResponse(request, 404, 'Registro no encontrado');
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleAdminCreate(request, env, resource) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const body = await request.json();
    const sanitized = sanitizeObject(body);
    const result = await insert(env, table, sanitized, true);
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 400, err.message);
  }
}

export async function handleAdminUpdate(request, env, resource, id) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const body = await request.json();
    const sanitized = sanitizeObject(body);
    const result = await update(env, table, id, sanitized, true);
    if (!result) return errorResponse(request, 404, 'Registro no encontrado');
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 400, err.message);
  }
}

export async function handleAdminDelete(request, env, resource, id) {
  const table = RESOURCE_MAP[resource];
  if (!table) return errorResponse(request, 404, 'Recurso no encontrado');

  try {
    const deleted = await remove(env, table, id, true);
    return new Response(JSON.stringify(deleted), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

export async function handleUpdatePassword(request, env, auth) {
  try {
    const body = await request.json();
    const newPassword = body.password;
    if (!newPassword || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 8 caracteres' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userEmail = auth.user?.email;
    if (!userEmail) {
      return new Response(JSON.stringify({ error: 'Email no encontrado en el token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const svcKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(userEmail)}`, {
      headers: {
        'Authorization': `Bearer ${svcKey}`,
        'apikey': svcKey,
      },
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      return new Response(JSON.stringify({ error: `Error al buscar usuario: ${errText}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const users = await listRes.json();
    const user = Array.isArray(users) ? users[0] : users?.users?.[0];

    if (!user || !user.id) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${svcKey}`,
        'apikey': svcKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return new Response(JSON.stringify({ error: `Error al actualizar contraseña: ${errText}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'Contraseña actualizada correctamente' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'id' || key === 'created_at' || key === 'updated_at') continue;
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'string') {
      result[key] = sanitize(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
