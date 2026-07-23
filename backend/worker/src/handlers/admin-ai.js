import { chat } from '../services/openrouter.js';
import { query, update, insert } from '../services/supabase.js';
import { errorResponse } from '../middleware/error.js';

const TABLAS = {
  business_info: { desc: 'Informacion del negocio (fila unica)', cols: { name: 'texto (nombre del negocio)', slogan: 'texto', description: 'texto largo', logo_url: 'url de imagen', primary_color: 'color hex', secondary_color: 'color hex', website: 'url', founded_year: 'año numerico' }, unica: true },
  address: { desc: 'Direccion (fila unica)', cols: { street: 'calle', number: 'numero', city: 'ciudad', province: 'provincia', postal_code: 'codigo postal', latitude: 'decimal', longitude: 'decimal', maps_url: 'url de google maps', notes: 'texto' }, unica: true },
  chatbot_config: { desc: 'Configuracion del chatbot (fila unica)', cols: { welcome_message: 'texto', system_prompt: 'texto largo', fallback_message: 'texto', temperature: 'numero decimal 0-2', max_tokens: 'numero entero' }, unica: true },
  products: { desc: 'Productos en venta (catalogo)', cols: { name: 'nombre', description: 'descripcion', price: 'precio numerico', category: 'categoria', features: 'caracteristicas texto largo', image_url: 'url de imagen', is_active: 'booleano true/false' } },
  services: { desc: 'Servicios de reparacion', cols: { name: 'nombre', description: 'descripcion', price: 'precio numerico', category_id: 'id de categoria (numerico)', estimated_duration: 'duracion ej: 2 hours', image_url: 'url de imagen', is_active: 'booleano true/false' } },
  categories: { desc: 'Categorias de servicios', cols: { name: 'nombre', description: 'descripcion', icon: 'icono texto', image_url: 'url de imagen', sort_order: 'orden numerico', parent_id: 'id de categoria padre o null', is_active: 'booleano true/false' } },
  prices: { desc: 'Precios por variante de servicio', cols: { service_id: 'id del servicio', label: 'etiqueta ej: Estandar, Premium', amount: 'monto numerico', currency: 'moneda ARS o USD', is_active: 'booleano true/false' } },
  promotions: { desc: 'Promociones y descuentos', cols: { title: 'titulo', description: 'descripcion', discount_type: 'percentage o fixed', discount_value: 'valor numerico', valid_from: 'fecha YYYY-MM-DD', valid_until: 'fecha YYYY-MM-DD', image_url: 'url de imagen', is_active: 'booleano true/false' } },
  warranties: { desc: 'Garantias', cols: { title: 'titulo', description: 'descripcion', duration: 'texto ej: 6 meses', terms: 'terminos y condiciones', is_active: 'booleano true/false' } },
  print3d: { desc: 'Impresion 3D', cols: { material: 'nombre del material', description: 'descripcion', price_per_gram: 'precio por gramo', colors: 'colores separados por coma', max_dimensions: 'dimensiones maximas', layer_height: 'altura de capa', infill_options: 'opciones de relleno', lead_time: 'tiempo de entrega', is_active: 'booleano true/false' } },
  faqs: { desc: 'Preguntas frecuentes', cols: { question: 'pregunta', answer: 'respuesta', category: 'categoria', sort_order: 'orden numerico', is_active: 'booleano true/false' } },
  hours: { desc: 'Horarios de atencion', cols: { day_of_week: '0=Domingo, 1=Lunes ... 6=Sabado', day_name: 'nombre del dia', open_time: 'horario apertura HH:MM', close_time: 'horario cierre HH:MM', is_closed: 'booleano true=cerrado', is_active: 'booleano true/false' } },
  social_media: { desc: 'Redes sociales', cols: { platform: 'nombre ej: Instagram', url: 'url completa', icon: 'icono texto', sort_order: 'orden numerico', is_active: 'booleano true/false' } },
  phones: { desc: 'Telefonos de contacto', cols: { label: 'etiqueta ej: WhatsApp', number: 'numero de telefono', is_whatsapp: 'booleano true=whatsapp', country_code: 'codigo pais ej: +54', sort_order: 'orden numerico', is_active: 'booleano true/false' } },
  emails: { desc: 'Correos electronicos', cols: { label: 'etiqueta', email: 'direccion de email', sort_order: 'orden numerico', is_active: 'booleano true/false' } },
  featured_messages: { desc: 'Mensajes destacados (banners)', cols: { message: 'texto del mensaje', type: 'info/warning/promo/alert', sort_order: 'orden numerico', is_active: 'booleano true/false' } },
};

const TABLAS_JSON = JSON.stringify(Object.entries(TABLAS).map(([k, v]) => ({
  tabla: k,
  descripcion: v.desc,
  columnas: Object.entries(v.cols).map(([c, d]) => `${c} (${d})`),
  ...(v.unica ? { unica: true } : {}),
})), null, 2);

const SYSTEM_PROMPT = `Sos un asistente que ayuda al administrador de Tecno San Juan a modificar la base de datos del sistema.

TABLAS DISPONIBLES:
${TABLAS_JSON}

INSTRUCCIONES:
- Interpreta lo que el admin quiere hacer en lenguaje natural
- Decidi que acciones realizar sobre la base de datos
- Respondé SOLO con un JSON valido, sin texto adicional
- Para tablas con "unica: true" usa tipo "actualizar_unica" que modifica id=1
- Los valores booleanos se envian como true/false sin comillas
- Los valores numericos se envian como numeros sin comillas
- Las fechas van en formato YYYY-MM-DD
- Las horas van en formato HH:MM

EJEMPLOS:

--- NEGOCIO ---
INSTRUCCION: "cambiar el nombre del negocio a Tecno San Juan SRL y el slogan a 'Expertos en tecnologia'"
RESPUESTA: {"explicacion": "Se actualiza la informacion del negocio", "acciones": [{"tipo": "actualizar_unica", "tabla": "business_info", "cambios": {"name": "Tecno San Juan SRL", "slogan": "Expertos en tecnologia"}}]}

INSTRUCCION: "cambiar el color primario a #ff0000"
RESPUESTA: {"explicacion": "Se cambia el color primario del negocio", "acciones": [{"tipo": "actualizar_unica", "tabla": "business_info", "cambios": {"primary_color": "#ff0000"}}]}

--- DIRECCION ---
INSTRUCCION: "cambiar la direccion a Av. Rawson 456"
RESPUESTA: {"explicacion": "Se actualiza la direccion", "acciones": [{"tipo": "actualizar_unica", "tabla": "address", "cambios": {"street": "Av. Rawson", "number": "456"}}]}

--- HORARIOS ---
INSTRUCCION: "cambiar el horario del lunes a 10:00 a 18:00"
RESPUESTA: {"explicacion": "Se cambia el horario del lunes", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "hours", "buscar": {"day_name": "Lunes"}, "cambios": {"open_time": "10:00", "close_time": "18:00"}}]}

INSTRUCCION: "poner que los domingos estan cerrados"
RESPUESTA: {"explicacion": "Se marca el domingo como cerrado", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "hours", "buscar": {"day_name": "Domingo"}, "cambios": {"is_closed": true}}]}

--- CATEGORIAS ---
INSTRUCCION: "agregar una categoria nueva llamada Tablets"
RESPUESTA: {"explicacion": "Se crea la categoria Tablets", "acciones": [{"tipo": "crear", "tabla": "categories", "datos": {"name": "Tablets", "is_active": true}}]}

INSTRUCCION: "cambiar el nombre de la categoria Accesorios a Accesorios y Perifericos"
RESPUESTA: {"explicacion": "Se renombra la categoria", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "categories", "buscar": {"name": "Accesorios"}, "cambios": {"name": "Accesorios y Perifericos"}}]}

--- SERVICIOS ---
INSTRUCCION: "aumentar todos los precios de servicios un 10%"
RESPUESTA: {"explicacion": "Se aumentan todos los precios de servicios activos un 10%", "acciones": [{"tipo": "actualizar_todos", "tabla": "services", "filtro": {"is_active": "true"}, "cambios": {"price": {"operacion": "porcentaje", "valor": 10}}}]}

INSTRUCCION: "cambiar el precio del servicio cambio de pantalla a 30000"
RESPUESTA: {"explicacion": "Se cambia el precio del servicio Cambio de pantalla", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "services", "buscar": {"name": "Cambio de pantalla"}, "cambios": {"price": 30000}}]}

INSTRUCCION: "agregar un servicio nuevo: reparacion de tablets, $15000"
RESPUESTA: {"explicacion": "Se crea el servicio Reparacion de tablets", "acciones": [{"tipo": "crear", "tabla": "services", "datos": {"name": "Reparacion de tablets", "price": 15000, "is_active": true}}]}

--- PRODUCTOS ---
INSTRUCCION: "aumentar todos los precios de productos un 15%"
RESPUESTA: {"explicacion": "Se aumenta el precio de todos los productos activos un 15%", "acciones": [{"tipo": "actualizar_todos", "tabla": "products", "filtro": {"is_active": "true"}, "cambios": {"price": {"operacion": "porcentaje", "valor": 15}}}]}

INSTRUCCION: "cambiar el precio del Monitor 4K a 175000"
RESPUESTA: {"explicacion": "Se cambia el precio del Monitor 27 4K IPS", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "products", "buscar": {"name": "Monitor 27 4K IPS"}, "cambios": {"price": 175000}}]}

INSTRUCCION: "agregar un nuevo producto: Teclado inalambrico, $25000"
RESPUESTA: {"explicacion": "Se crea un nuevo producto", "acciones": [{"tipo": "crear", "tabla": "products", "datos": {"name": "Teclado inalambrico", "price": 25000, "is_active": true}}]}

--- TELEFONOS ---
INSTRUCCION: "cambiar el numero de WhatsApp a 264 555-5555"
RESPUESTA: {"explicacion": "Se actualiza el numero de WhatsApp", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "phones", "buscar": {"is_whatsapp": "true"}, "cambios": {"number": "264 555-5555"}}]}

INSTRUCCION: "agregar un telefono nuevo: Fijo, 264 444-4444"
RESPUESTA: {"explicacion": "Se agrega un nuevo telefono", "acciones": [{"tipo": "crear", "tabla": "phones", "datos": {"label": "Fijo", "number": "264 444-4444", "country_code": "+54", "is_active": true}}]}

--- REDES SOCIALES ---
INSTRUCCION: "cambiar la URL de Instagram a https://instagram.com/nuevo"
RESPUESTA: {"explicacion": "Se actualiza la URL de Instagram", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "social_media", "buscar": {"platform": "Instagram"}, "cambios": {"url": "https://instagram.com/nuevo"}}]}

--- CORREOS ---
INSTRUCCION: "cambiar el email de contacto a info@tecnosanjuan.com.ar"
RESPUESTA: {"explicacion": "Se actualiza el email de contactos", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "emails", "buscar": {"label": "Consultas"}, "cambios": {"email": "info@tecnosanjuan.com.ar"}}]}

--- PROMOCIONES ---
INSTRUCCION: "agregar una promocion: 20% de descuento en reparaciones, valida hasta 2026-12-31"
RESPUESTA: {"explicacion": "Se crea una nueva promocion", "acciones": [{"tipo": "crear", "tabla": "promotions", "datos": {"title": "20% descuento en reparaciones", "discount_type": "percentage", "discount_value": 20, "valid_until": "2026-12-31", "is_active": true}}]}

--- PREGUNTAS FRECUENTES ---
INSTRUCCION: "agregar una pregunta frecuente: Hacen envios? Si, hacemos envios en San Juan"
RESPUESTA: {"explicacion": "Se agrega una nueva pregunta frecuente", "acciones": [{"tipo": "crear", "tabla": "faqs", "datos": {"question": "Hacen envios?", "answer": "Si, hacemos envios en toda la provincia de San Juan", "is_active": true}}]}

--- MENSAJES DESTACADOS ---
INSTRUCCION: "agregar un banner de promo: Descuentos de temporada!"
RESPUESTA: {"explicacion": "Se agrega un mensaje destacado", "acciones": [{"tipo": "crear", "tabla": "featured_messages", "datos": {"message": "Descuentos de temporada!", "type": "promo", "is_active": true}}]}

--- GARANTIAS ---
INSTRUCCION: "cambiar la duracion de la garantia a 12 meses"
RESPUESTA: {"explicacion": "Se actualiza la garantia", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "warranties", "buscar": {"title": "Garantia en reparaciones"}, "cambios": {"duration": "12 meses", "duration_days": 365}}]}

--- CHATBOT ---
INSTRUCCION: "cambiar el mensaje de bienvenida del chatbot a Hola! Como puedo ayudarte?"
RESPUESTA: {"explicacion": "Se actualiza el mensaje de bienvenida del chatbot", "acciones": [{"tipo": "actualizar_unica", "tabla": "chatbot_config", "cambios": {"welcome_message": "Hola! Como puedo ayudarte?"}}]}

IMPORTANTE: Usa siempre nombres de tablas y columnas exactos de la lista.`;

function parseResponse(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

export async function handleAdminAiAction(request, env) {
  try {
    const body = await request.json();
    const instruction = (body.instruction || '').trim();
    if (!instruction) {
      return errorResponse(request, 400, 'La instruccion no puede estar vacia');
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `INSTRUCCION: ${instruction}` },
    ];

    const raw = await chat(env, messages);
    const parsed = parseResponse(raw);

    if (!parsed) {
      return new Response(JSON.stringify({
        success: true, explanation: raw, changes: [], summary: raw,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const results = [];
    for (const accion of (parsed.acciones || [])) {
      results.push(await ejecutar(env, accion));
    }

    const summary = parsed.explicacion || results.map(r => r.mensaje).join('. ');
    return new Response(JSON.stringify({
      success: true,
      explanation: parsed.explicacion || '',
      summary,
      changes: results,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

async function ejecutar(env, accion) {
  const { tipo, tabla, filtro, cambios, buscar, datos } = accion;

  try {
    if (tipo === 'actualizar_unica') {
      await update(env, tabla, 1, cambios || {}, true);
      return { tabla, tipo, mensaje: `Actualizada ${tabla}` };
    }

    if (tipo === 'actualizar_todos') {
      const opts = {};
      if (filtro) opts.eq = filtro;
      const registros = await query(env, tabla, opts, true);
      const modificados = [];

      for (const reg of registros) {
        const nuevos = {};
        for (const [campo, val] of Object.entries(cambios || {})) {
          if (typeof val === 'object' && val?.operacion) {
            const orig = Number(reg[campo]) || 0;
            switch (val.operacion) {
              case 'porcentaje': nuevos[campo] = Math.round(orig * (1 + val.valor / 100) * 100) / 100; break;
              case 'multiplicar': nuevos[campo] = Math.round(orig * val.valor * 100) / 100; break;
              case 'sumar': nuevos[campo] = Math.round((orig + val.valor) * 100) / 100; break;
              case 'restar': nuevos[campo] = Math.round((orig - val.valor) * 100) / 100; break;
            }
          } else if (val !== null && val !== undefined) {
            nuevos[campo] = val;
          }
        }
        if (Object.keys(nuevos).length > 0) {
          await update(env, tabla, reg.id, nuevos, true);
          modificados.push({ id: reg.id, nombre: reg.name || reg.title || `#${reg.id}`, cambios: nuevos });
        }
      }

      return { tabla, tipo, cantidad: modificados.length, mensaje: `Actualizados ${modificados.length} registro(s) en ${tabla}`, detalles: modificados };
    }

    if (tipo === 'buscar_y_actualizar') {
      const opts = {};
      if (buscar) opts.eq = buscar;
      const registros = await query(env, tabla, opts, true);
      const modificados = [];

      for (const reg of registros) {
        const nuevos = {};
        for (const [campo, val] of Object.entries(cambios || {})) {
          if (typeof val === 'object' && val?.operacion) {
            const orig = Number(reg[campo]) || 0;
            switch (val.operacion) {
              case 'porcentaje': nuevos[campo] = Math.round(orig * (1 + val.valor / 100) * 100) / 100; break;
              case 'multiplicar': nuevos[campo] = Math.round(orig * val.valor * 100) / 100; break;
              case 'sumar': nuevos[campo] = Math.round((orig + val.valor) * 100) / 100; break;
              case 'restar': nuevos[campo] = Math.round((orig - val.valor) * 100) / 100; break;
              default: nuevos[campo] = Math.round((orig + Number(val.valor)) * 100) / 100;
            }
          } else if (val !== null && val !== undefined) {
            nuevos[campo] = val;
          }
        }
        if (Object.keys(nuevos).length > 0) {
          await update(env, tabla, reg.id, nuevos, true);
          modificados.push({ id: reg.id, nombre: reg.name || reg.title || `#${reg.id}`, cambios: nuevos });
        }
      }

      return { tabla, tipo, cantidad: modificados.length, mensaje: `Actualizados ${modificados.length} registro(s) en ${tabla}`, detalles: modificados };
    }

    if (tipo === 'crear') {
      const limpios = {};
      for (const [campo, val] of Object.entries(datos || {})) {
        if (val !== null && val !== undefined && val !== '') {
          limpios[campo] = val;
        }
      }
      const resultado = await insert(env, tabla, limpios, true);
      return { tabla, tipo, mensaje: `Creado en ${tabla}`, id: resultado?.id };
    }

    return { tabla, tipo, mensaje: 'Tipo de accion no reconocido: ' + tipo };
  } catch (err) {
    return { tabla, tipo: tipo || 'desconocido', error: err.message, mensaje: `Error: ${err.message}` };
  }
}
