import { rpc, query } from './supabase.js';

const DEFAULT_SYSTEM_PROMPT = `Eres el asistente virtual de Tecno San Juan, un negocio de reparaci\u00f3n y servicios tecnol\u00f3gicos en San Juan, Argentina.

MISI\u00d3N PRINCIPAL - Responder sobre Tecno San Juan:
Us\u00e1 la informaci\u00f3n del negocio para responder sobre servicios, productos, precios, horarios, promociones y todo lo relacionado con Tecno San Juan. Sos un experto en esto.

B\u00daSQUEDA WEB:
Ten\u00e9s acceso a b\u00fasqueda web en tiempo real. Cuando te pregunten sobre temas que requieran informaci\u00f3n actualizada (fechas de lanzamiento, precios de mercado, noticias, especificaciones t\u00e9cnicas, comparativas), US\u00c1 la b\u00fasqueda web autom\u00e1ticamente para responder con informaci\u00f3n precisa y actual. No te limites a decir que no sab\u00e9s, busc\u00e1 en la web.

REGLAS:
- Si es sobre Tecno San Juan, prioriz\u00e1 SIEMPRE la informaci\u00f3n del negocio.
- Para preguntas generales de tecnolog\u00eda, us\u00e1 la b\u00fasqueda web.
- No inventes datos sobre Tecno San Juan. Si no est\u00e1 en el contexto, no lo afirmes.
- S\u00e9 amable, profesional, conciso y en argentino.
- Si alguien pregunta por objetos personalizados (llaveros, figuras, escudos, piezas \u00fanicas, etc.) asum\u00ed que lo hacemos en 3D y ofrecelo.`;

export async function getSystemPrompt(env) {
  try {
    const config = await query(env, 'chatbot_config', { eq: { is_active: 'true' } }, false);
    const row = Array.isArray(config) ? config[0] : config;
    const system = (row && row.system_prompt && row.system_prompt.trim()) ? row.system_prompt : DEFAULT_SYSTEM_PROMPT;
    const fallback = (row && row.fallback_message) ? row.fallback_message : 'No dispongo de esa informaci\u00f3n en este momento.';
    return { system, fallback };
  } catch (err) {
    console.error('Error loading chatbot config:', err);
    return { system: DEFAULT_SYSTEM_PROMPT, fallback: 'No dispongo de esa informaci\u00f3n en este momento.' };
  }
}

export async function buildContext(env, userMessage) {
  try {
    let contexto = '';

    try {
      const resumen = await rpc(env, 'get_business_context', {});
      if (resumen) contexto += resumen + '\n\n';
    } catch (e) {
      console.warn('Error fetching business context:', e);
    }

    try {
      const results = await rpc(env, 'search_all_tables', {
        search_query: userMessage,
      });

      if (results && results.length > 0) {
        const searchParts = results.map((row, index) => {
          return `[${index + 1}] ${row.content} (Fuente: ${row.table_name})`;
        });
        contexto += 'Resultados de búsqueda:\n' + searchParts.join('\n\n');
      }
    } catch (e) {
      console.warn('Error searching tables:', e);
    }

    return contexto || '';
  } catch (err) {
    console.error('Error building context:', err);
    return '';
  }
}

export async function buildMessages(env, context, userMessage, chatContext) {
  const { system, fallback } = await getSystemPrompt(env);

  let systemContent = system;
  if (chatContext) {
    systemContent += `\n\nContexto actual: ${chatContext}`;
  }
  if (context && context.trim()) {
    systemContent += '\n\nINFORMACIÓN DISPONIBLE:\n' + context;
  }

  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userMessage },
  ];

  return messages;
}
