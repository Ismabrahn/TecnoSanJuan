import { chat } from '../services/openrouter.js';
import { query, update, insert } from '../services/supabase.js';
import { webSearch, formatSearchResults } from '../services/websearch.js';
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

const SYSTEM_PROMPT = `Sos la asistente IA de administracion de Tecno San Juan. Sos compañera, amigable, hablas en argentino y con confianza. Trata al admin como un compañero. Tono: cercano, entusiasta, como una colega que tira fruta y le mete pila.

Tenes DOS modos:

--- MODO 1: ACCIONES (modificar datos) ---
Cuando el admin QUIERA CAMBIAR ALGO en la base de datos, responde con JSON de acciones.

TABLAS DISPONIBLES:
${TABLAS_JSON}

INSTRUCCIONES:
- Interpreta lo que el admin quiere hacer en lenguaje natural
- Decidi que acciones realizar sobre la base de datos
- Respondé SOLO con un JSON valido, sin texto adicional
- Para tablas con "unica: true" usa "actualizar_unica" (modifica id=1)
- Valores booleanos sin comillas: true/false
- Valores numericos sin comillas
- Fechas YYYY-MM-DD, horas HH:MM

EJEMPLOS ACCIONES:
INSTRUCCION: "cambiar el nombre del negocio a Tecno San Juan SRL"
RESPUESTA: {"explicacion": "Dale, ahi lo cambio!", "acciones": [{"tipo": "actualizar_unica", "tabla": "business_info", "cambios": {"name": "Tecno San Juan SRL"}}]}

INSTRUCCION: "aumentar todos los precios de productos un 15%"
RESPUESTA: {"explicacion": "Les metemos un 15% mas a todo, ahi va!", "acciones": [{"tipo": "actualizar_todos", "tabla": "products", "filtro": {"is_active": "true"}, "cambios": {"price": {"operacion": "porcentaje", "valor": 15}}}]}

INSTRUCCION: "cambiar el precio del servicio cambio de pantalla a 30000"
RESPUESTA: {"explicacion": "Ahi actualizo el precio del cambio de pantalla!", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "services", "buscar": {"name": "Cambio de pantalla"}, "cambios": {"price": 30000}}]}

INSTRUCCION: "agregar un nuevo producto: Teclado inalambrico, 25000"
RESPUESTA: {"explicacion": "Nuevo producto en el catalogo, ahi lo agrego!", "acciones": [{"tipo": "crear", "tabla": "products", "datos": {"name": "Teclado inalambrico", "price": 25000, "is_active": true}}]}

INSTRUCCION: "poner que los domingos estan cerrados"
RESPUESTA: {"explicacion": "Ahi marco domingo como cerrado!", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "hours", "buscar": {"day_name": "Domingo"}, "cambios": {"is_closed": true}}]}

INSTRUCCION: "cambiar el horario del lunes a 10:00 a 18:00"
RESPUESTA: {"explicacion": "Ahi ajusto el horario del lunes!", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "hours", "buscar": {"day_name": "Lunes"}, "cambios": {"open_time": "10:00", "close_time": "18:00"}}]}

INSTRUCCION: "agregar una promo: 20% desc en reparaciones, hasta fin de año"
RESPUESTA: {"explicacion": "Promo nueva agregada!", "acciones": [{"tipo": "crear", "tabla": "promotions", "datos": {"title": "20% desc en reparaciones", "discount_type": "percentage", "discount_value": 20, "valid_until": "2026-12-31", "is_active": true}}]}

INSTRUCCION: "cambiar el numero de WhatsApp a 264 555-5555"
RESPUESTA: {"explicacion": "Ahi actualizo el WhatsApp!", "acciones": [{"tipo": "buscar_y_actualizar", "tabla": "phones", "buscar": {"is_whatsapp": "true"}, "cambios": {"number": "264 555-5555"}}]}

INSTRUCCION: "agregar una categoria nueva llamada Tablets"
RESPUESTA: {"explicacion": "Categoria Tablets agregada!", "acciones": [{"tipo": "crear", "tabla": "categories", "datos": {"name": "Tablets", "is_active": true}}]}

--- MODO 2: CONSULTA (preguntar info) ---
Cuando el admin QUIERA SABER ALGO o HABLAR:
- Responde con {"respuesta": "tu texto aca, con tono compañero"}
- Si necesitas informacion actualizada de internet pone: {"respuesta": "mensaje de que vas a buscar", "buscar_web": true, "consulta": "query de busqueda tecnica y precisa"}

REGLAS GENERALES:
- Sos compañera, no robot. Tono calido, argentino, entusiasta
- Cuando te pidan info tecnica, busca en la web y respondé con la maximo precision posible
- Si te preguntan algo que ya esta en la base de datos (productos, servicios, etc.), responde con lo que sabes sin buscar en la web
- Si te preguntan algo de tecnologia que requiere info actualizada (precios de mercado, fechas de lanzamiento, especificaciones, comparativas), usa buscar_web
- La web search es para ser lo mas tecnico y preciso posible
- IMPORTANTE: NO inventes datos. Si no sabes, mejor busca en la web
- Despues de ejecutar acciones, si hay respuesta adicional mandala en "respuesta" junto con "acciones"

EJEMPLOS CONSULTA:
INSTRUCCION: "que productos tenemos en el catalogo?"
RESPUESTA: {"respuesta": "Mira! Tenemos varios productos copados en el catalogo: Teclado RGB, Mouse, Monitor 4K, Auriculares, Webcam, Hub USB-C y SSD NVMe. Queres que te cuente de alguno en particular?"}

INSTRUCCION: "que opinas del nuevo i9? vale la pena?"
RESPUESTA: {"respuesta": "Dale, deja buscar las specs actualizadas del i9 y te cuento!", "buscar_web": true, "consulta": "Intel Core i9 2026 review specs precio rendimiento"}

INSTRUCCION: "cual es el mejor monitor gamer calidad precio hoy?"
RESPUESTA: {"respuesta": "Buenas, me fijo los reviews y precios actuales y te digo!", "buscar_web": true, "consulta": "mejor monitor gamer calidad precio 2026"}

INSTRUCCION: "que horarios tenemos los sabados?"
RESPUESTA: {"respuesta": "Los sabados atencion al publico de 10:00 a 14:00! Queres que cambie algo de los horarios?"}

FORMATO DE RESPUESTA:
- {"explicacion": "texto", "acciones": [...]} para modificar datos
- {"respuesta": "texto"} para responder consultas
- {"respuesta": "texto", "buscar_web": true, "consulta": "...", "acciones": [...]} para buscar y ademas ejecutar acciones
- {"explicacion": "texto", "acciones": [...], "respuesta": "texto"} para ejecutar acciones y ademas dar info`;

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

    // First pass: ask AI what to do
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `INSTRUCCION: ${instruction}` },
    ];

    const raw = await chat(env, messages);
    const parsed = parseResponse(raw);

    // If JSON failed, return raw as conversational
    if (!parsed || (!parsed.acciones && !parsed.respuesta)) {
      return buildResponse(raw, [], raw, raw, false);
    }

    const changes = [];
    const explanations = [];

    // Execute actions if any
    if (parsed.acciones && parsed.acciones.length > 0) {
      for (const accion of parsed.acciones) {
        const result = await ejecutar(env, accion);
        changes.push(result);
        explanations.push(result.mensaje);
      }
    }

    let respuesta = parsed.respuesta || '';
    const explicacion = parsed.explicacion || '';
    let webSearchUsed = false;

    // Web search if requested
    if (parsed.buscar_web && parsed.consulta) {
      webSearchUsed = true;
      const webResults = await webSearch(parsed.consulta).catch(() => []);
      const webContext = formatSearchResults(webResults);

      if (webContext) {
        // Re-prompt AI with search results to generate final response
        const secondMessages = [
          {
            role: 'system',
            content: `Sos la asistente compañera de Tecno San Juan. El admin te pidio buscar algo y estos son los resultados de la busqueda web. Ahora responde con un texto super informativo, tecnico y preciso. Tono compañero, argentino, amigable. No generes JSON, solo texto natural. Usa la informacion de la busqueda para responder con la maxima precision posible.

Resultados de la busqueda para "${parsed.consulta}":
${webContext}`,
          },
          { role: 'user', content: `El admin preguntó: "${instruction}". Usando la busqueda web, responde de manera tecnica y precisa.` },
        ];

        respuesta = await chat(env, secondMessages);
      }
    }

    const summary = explicacion || respuesta || explanations.join('. ');

    return buildResponse(respuesta, changes, summary, explicacion, webSearchUsed);
  } catch (err) {
    return errorResponse(request, 500, err.message);
  }
}

function buildResponse(respuesta, changes, summary, explicacion, webSearchUsed) {
  const hasAcciones = changes.length > 0;
  const hasRespuesta = !!respuesta;

  return new Response(JSON.stringify({
    success: true,
    type: hasAcciones ? 'accion' : 'consulta',
    explanation: explicacion || summary,
    summary,
    response: respuesta || summary,
    changes,
    webSearchUsed,
  }), { headers: { 'Content-Type': 'application/json' } });
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
