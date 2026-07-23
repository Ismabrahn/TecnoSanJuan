import { rpc, query } from './supabase.js';

const DEFAULT_SYSTEM_PROMPT = `Eres el asistente virtual de Tecno San Juan, un negocio de reparaci\u00f3n y servicios tecnol\u00f3gicos en San Juan, Argentina.

Debes responder \u00daNICAMENTE con la informaci\u00f3n proporcionada en el contexto debajo.
Si la informaci\u00f3n solicitada no est\u00e1 en el contexto, debes decir: "No dispongo de esa informaci\u00f3n en este momento."
NO inventes respuestas. NO uses informaci\u00f3n externa.
S\u00e9 amable, profesional y conciso.
Si te preguntan por algo que no sea sobre Tecno San Juan, responde que solo puedes ayudar con informaci\u00f3n del negocio.`;

let systemPromptCache = null;
let fallbackMessageCache = null;

export async function getSystemPrompt(env) {
  try {
    if (!systemPromptCache) {
      const config = await query(env, 'chatbot_config', { eq: { is_active: 'true' } }, false);
      const row = Array.isArray(config) ? config[0] : config;
      if (row && row.system_prompt && row.system_prompt.trim()) {
        systemPromptCache = row.system_prompt;
      } else {
        systemPromptCache = DEFAULT_SYSTEM_PROMPT;
      }
      if (row && row.fallback_message) {
        fallbackMessageCache = row.fallback_message;
      }
    }
    return { system: systemPromptCache, fallback: fallbackMessageCache || 'No dispongo de esa informaci\u00f3n en este momento.' };
  } catch (err) {
    console.error('Error loading chatbot config:', err);
    return { system: DEFAULT_SYSTEM_PROMPT, fallback: 'No dispongo de esa informaci\u00f3n en este momento.' };
  }
}

export function invalidateCache() {
  systemPromptCache = null;
  fallbackMessageCache = null;
}

export async function buildContext(env, userMessage) {
  try {
    const results = await rpc(env, 'search_all_tables', {
      search_query: userMessage,
    });

    if (!results || results.length === 0) {
      return '';
    }

    const contextParts = results.map((row, index) => {
      return `[${index + 1}] ${row.content} (Fuente: ${row.table_name})`;
    });

    return contextParts.join('\n\n');
  } catch (err) {
    console.error('Error building context:', err);
    return '';
  }
}

export async function buildMessages(env, context, userMessage) {
  const { system, fallback } = await getSystemPrompt(env);

  const messages = [
    {
      role: 'system',
      content: system + '\n\n' + (context || fallback),
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];

  return messages;
}
