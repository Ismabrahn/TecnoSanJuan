import { query } from './supabase.js';

const PATTERNS = [
  {
    keywords: ['horario', 'horarios', 'abierto', 'cierran', 'abren', 'atención', 'atencion'],
    table: 'hours',
    handler: formatHours,
  },
  {
    keywords: ['precio', 'precios', 'cuesta', 'cuanto', 'cuánto', 'valor', 'costar', 'costo', 'presupuesto'],
    table: 'services',
    handler: formatServices,
  },
  {
    keywords: ['dirección', 'direccion', 'ubicación', 'ubicacion', 'donde', 'dónde', 'mapa'],
    table: 'address',
    single: true,
    handler: formatAddress,
  },
  {
    keywords: ['teléfono', 'telefono', 'teléfonos', 'telefonos', 'llamar', 'contacto', 'whatsapp'],
    table: 'phones',
    handler: formatPhones,
  },
  {
    keywords: ['garantía', 'garantia', 'garantías', 'garantias'],
    table: 'warranties',
    handler: formatWarranties,
  },
  {
    keywords: ['promoción', 'promocion', 'promociones', 'descuento', 'oferta', 'ofertas'],
    table: 'promotions',
    handler: formatPromotions,
  },
  {
    keywords: ['impresión', 'impresion', '3d', 'impresión 3d', 'impresion 3d', 'filamento', 'pla'],
    table: 'print3d',
    handler: formatPrint3d,
  },
  {
    keywords: ['servicio', 'servicios', 'reparación', 'reparacion', 'arreglar', 'mantenimiento'],
    table: 'services',
    handler: formatServices,
  },
  {
    keywords: ['redes', 'social', 'redes sociales', 'instagram', 'facebook'],
    table: 'social_media',
    handler: formatSocialMedia,
  },
  {
    keywords: ['email', 'correo', 'mail', 'email'],
    table: 'emails',
    handler: formatEmails,
  },
  {
    keywords: ['mensaje', 'mensajes', 'destacado', 'destacados', 'anuncio', 'importante'],
    table: 'featured_messages',
    handler: formatFeaturedMessages,
  },
];

export function detectIntent(message) {
  const msg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const pattern of PATTERNS) {
    if (pattern.keywords.some(kw => msg.includes(kw))) {
      return pattern;
    }
  }

  return null;
}

export async function handleSimpleQuery(env, message) {
  const intent = detectIntent(message);
  if (!intent) return null;

  try {
    const options = { eq: { is_active: 'true' } };
    if (intent.table === 'hours') options.order = 'day_of_week.asc';
    if (intent.table === 'promotions') options.order = 'valid_until.asc';

    let data;
    if (intent.single) {
      const result = await query(env, intent.table, options, false);
      data = Array.isArray(result) ? result[0] : result;
    } else {
      data = await query(env, intent.table, options, false);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    return intent.handler(data);
  } catch (err) {
    console.error('Simple query error:', err);
    return null;
  }
}

function formatHours(data) {
  const rows = Array.isArray(data) ? data : [data];
  const active = rows.filter(r => r.is_active !== false);
  if (active.length === 0) return null;

  const parts = active.map(h => {
    if (h.is_closed) return `${h.day_name}: Cerrado`;
    const open = h.open_time ? h.open_time.slice(0, 5) : '--';
    const close = h.close_time ? h.close_time.slice(0, 5) : '--';
    return `${h.day_name}: ${open} a ${close}`;
  });

  return 'Nuestros horarios de atención son:\n' + parts.join('\n');
}

function formatServices(data) {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return null;

  const active = rows.filter(r => r.is_active !== false).slice(0, 10);
  if (active.length === 0) return null;

  const parts = active.map(s => {
    const price = s.price ? ` $${Number(s.price).toLocaleString('es-AR')}` : '';
    return `- ${s.name}${price}`;
  });

  let response = 'Estos son nuestros servicios disponibles:\n' + parts.join('\n');
  if (rows.length > 10) {
    response += '\n\nY muchos más. Consultanos por el servicio específico que necesitás.';
  }

  return response;
}

function formatAddress(data) {
  if (!data) return null;
  const addr = Array.isArray(data) ? data[0] : data;
  if (!addr) return null;

  let response = `Estamos en ${addr.street} ${addr.number || ''}, ${addr.city}, ${addr.province}.`;
  if (addr.notes) response += ` ${addr.notes}`;
  if (addr.maps_url) response += `\n\nGoogle Maps: ${addr.maps_url}`;

  return response;
}

function formatPhones(data) {
  const rows = Array.isArray(data) ? data : [data];
  const active = rows.filter(r => r.is_active !== false);
  if (active.length === 0) return null;

  const parts = active.map(p => {
    const label = p.label ? `${p.label}: ` : '';
    return `${label}${p.number}`;
  });

  return 'Podés contactarnos al:\n' + parts.join('\n');
}

function formatWarranties(data) {
  const rows = Array.isArray(data) ? data : [data];
  const active = rows.filter(r => r.is_active !== false);
  if (active.length === 0) return null;

  const parts = active.map(w => {
    let text = `${w.title}`;
    if (w.description) text += `: ${w.description}`;
    if (w.duration) text += ` (${w.duration})`;
    return text;
  });

  return 'Información de garantías:\n' + parts.join('\n\n');
}

function formatPromotions(data) {
  const rows = Array.isArray(data) ? data : [data];
  const active = rows.filter(r => r.is_active !== false);
  if (active.length === 0) return null;

  const parts = active.map(p => {
    const badge = p.discount_type === 'percentage'
      ? `${p.discount_value}% OFF`
      : `$${Number(p.discount_value).toLocaleString('es-AR')} OFF`;
    let text = `${p.title}: ${badge}`;
    if (p.description) text += ` - ${p.description}`;
    return text;
  });

  return 'Promociones vigentes:\n' + parts.join('\n\n');
}

function formatPrint3d(data) {
  const rows = Array.isArray(data) ? data : [data];
  const active = rows.filter(r => r.is_active !== false);
  if (active.length === 0) return null;

  const parts = active.map(p => {
    let text = `${p.material}: $${p.price_per_gram}/g`;
    if (p.colors) text += ` | Colores: ${p.colors}`;
    if (p.lead_time) text += ` | Entrega: ${p.lead_time}`;
    return text;
  });

  return 'Servicios de impresión 3D:\n' + parts.join('\n\n');
}

function formatSocialMedia(data) {
  const rows = Array.isArray(data) ? data : [data];
  const active = rows.filter(r => r.is_active !== false);
  if (active.length === 0) return null;

  const parts = active.map(s => `${s.platform}: ${s.url}`);
  return 'Seguinos en nuestras redes:\n' + parts.join('\n');
}

function formatFeaturedMessages(data) {
  const rows = Array.isArray(data) ? data : [data];
  const active = rows.filter(r => r.is_active !== false);
  if (active.length === 0) return null;

  const parts = active.map(m => m.message);
  return parts.join('\n');
}

function formatEmails(data) {
  const rows = Array.isArray(data) ? data : [data];
  const active = rows.filter(r => r.is_active !== false);
  if (active.length === 0) return null;

  const parts = active.map(e => {
    const label = e.label ? `${e.label}: ` : '';
    return `${label}${e.email}`;
  });

  return 'Correos electrónicos de contacto:\n' + parts.join('\n');
}
