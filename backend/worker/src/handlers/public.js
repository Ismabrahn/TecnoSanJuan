import { query } from '../services/supabase.js';
import { errorResponse } from '../middleware/error.js';

const PUBLIC_TABLES = {
  'business-info': { table: 'business_info', single: true },
  'services': { table: 'services' },
  'categories': { table: 'categories', order: 'sort_order.asc' },
  'prices': { table: 'prices' },
  'promotions': { table: 'promotions', order: 'valid_until.asc' },
  'warranties': { table: 'warranties' },
  'print3d': { table: 'print3d' },
  'faqs': { table: 'faqs', order: 'sort_order.asc' },
  'social-media': { table: 'social_media', order: 'sort_order.asc' },
  'phones': { table: 'phones' },
  'address': { table: 'address', single: true },
  'featured-messages': { table: 'featured_messages', order: 'sort_order.asc' },
  'emails': { table: 'emails', order: 'sort_order.asc' },
  'chatbot-config': { table: 'chatbot_config', single: true },
};

export async function handlePublicGet(request, env, resource) {
  const config = PUBLIC_TABLES[resource];
  if (!config) {
    return errorResponse(request, 404, `Recurso no encontrado: ${resource}`);
  }

  try {
    const options = { eq: { is_active: 'true' } };
    if (config.order) options.order = config.order;

    const data = await query(env, config.table, options, false);

    if (config.single) {
      return new Response(JSON.stringify(data[0] || null), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(request, 500, 'Error al obtener datos');
  }
}
