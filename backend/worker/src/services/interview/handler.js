import { chat } from '../openrouter.js';
import { getEngine, getDefinition } from './definitions.js';

const SYSTEM_QUESTION = 'Generá UNA SOLA pregunta en argentino, natural y conversacional, para obtener la información del cliente. No expliques nada, no saludes, no te presentes, no hagas introducciones, no des información técnica. Respondé únicamente la pregunta, nada más.';

function buildQuestionMessages(field, currentValues) {
  const preamble = `Campo a obtener: "${field.label}"${field.required ? ' (obligatorio)' : ' (opcional)'}`;
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
  return def.fields
    .filter(f => state[f.name] !== null && state[f.name] !== '---')
    .map(f => `${f.label}: ${state[f.name]}`)
    .join('\n');
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
