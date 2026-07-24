import { chat } from '../openrouter.js';
import { getEngine, getDefinition } from './definitions.js';

const SYSTEM_QUESTION = 'Generá UNA SOLA pregunta en argentino, natural, con empatía y conversacional, para obtener la información del cliente. Incluí una breve explicación de por qué se necesita ese dato (una o dos líneas máximo, como lo haría un empleado al tomar un pedido). No saludes, no te presentes, no hagas introducciones, no des información técnica extensa. Respondé únicamente la pregunta con su breve contexto, nada más.';

const FIELD_CONTEXT = {
  nombre: 'Necesitamos tu nombre para registrar el pedido.',
  pieza: 'Esto nos ayuda a estimar el tiempo de impresión, el material y la complejidad del trabajo.',
  archivo: 'Si ya tenés el archivo podemos calcular el presupuesto mucho más rápido.',
  requiere_diseno: 'Si no tenés el archivo, nosotros podemos diseñarlo por vos.',
  medidas: 'Las medidas nos permiten calcular el material necesario y el costo.',
  cantidad: 'La cantidad influye en el precio final y el tiempo de entrega.',
  material: 'Cada material tiene distintas propiedades y precios.',
  color: 'Para preparar el material del color correcto.',
  uso: 'El uso nos ayuda a recomendar el material y diseño más adecuado.',
  fecha_limite: 'Para organizar la producción y asegurarnos de cumplir con los tiempos.',
  observaciones: 'Cualquier detalle extra que debamos conocer antes de empezar.',
};

function buildQuestionMessages(field, currentValues) {
  const contexto = FIELD_CONTEXT[field.name] || '';
  const preamble = `Campo a obtener: "${field.label}"${field.required ? ' (obligatorio)' : ' (opcional)'}. ${contexto}`;
  const known = Object.entries(currentValues)
    .filter(([, v]) => v !== null && v !== '---')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const context = known ? `Datos ya obtenidos:\n${known}` : 'No hay datos previos.';
  return [
    { role: 'system', content: SYSTEM_QUESTION },
    { role: 'user', content: `${preamble}\n\n${context}` },
  ];
}

function buildStructuredSummary(def, state) {
  const lines = def.fields
    .filter(f => state[f.name] !== null && state[f.name] !== '---')
    .map(f => `${f.summaryLabel || f.label}: ${state[f.name]}`);
  return '------------------------------------\nSOLICITUD DE IMPRESIÓN 3D\n' + lines.join('\n') + '\n------------------------------------';
}

export async function handleInterview(env, interview, userMessage) {
  const type = interview?.type || '3d_quote';
  const engine = getEngine(type);

  let state = interview?.state ? { ...interview.state } : engine.createState();

  if (!interview?.state) {
    const firstField = engine.getNextField(state);
    if (!firstField) {
      return { response: 'Error: no hay campos definidos.', interview: { type, state, complete: true } };
    }
    const msgs = buildQuestionMessages(firstField, {});
    let response = await chat(env, msgs);
    response = response.replace(/^(Pregunta:|Question:)\s*/i, '').trim();
    return {
      response,
      interview: { type, state, complete: false },
    };
  }

  const prevField = engine.getMissingField(state);
  if (prevField) {
    const value = engine.extractValue(prevField, userMessage);
    engine.updateState(state, prevField.name, value);
  }

  engine.isComplete(state);

  const nextField = engine.getMissingField(state);
  if (!nextField) {
    state.finalizada = true;
    const def = getDefinition(type);
    const summary = buildStructuredSummary(def, state);
    return {
      response: summary,
      interview: { type, state, complete: true },
    };
  }

  const msgs = buildQuestionMessages(nextField, state);
  let response = await chat(env, msgs);
  response = response.replace(/^(Pregunta:|Question:)\s*/i, '').trim();
  return {
    response,
    interview: { type, state, complete: false },
  };
}
