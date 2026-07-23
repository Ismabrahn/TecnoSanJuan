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
    await update(env, table, id, { is_active: false }, true);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'id' || key === 'created_at' || key === 'updated_at') continue;
    if (typeof value === 'string') {
      result[key] = sanitize(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
