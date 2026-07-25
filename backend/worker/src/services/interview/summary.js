import { defaultLogger } from '../logger.js';
import { eventBus, Events } from './event-bus.js';

const log = defaultLogger;

function fillTemplate(template, state, schema, fieldsText) {
  let result = template;
  result = result.replace(/\{\{nombre\}\}/g, state.nombre || '');
  result = result.replace(/\{\{name\}\}/g, schema.name || schema.id);
  result = result.replace(/\{\{fields\}\}/g, fieldsText || '');
  result = result.replace(/\{\{summary\}\}/g, '');
  for (const q of (schema.questions || [])) {
    const ph = `{{${q.id}}}`;
    result = result.replace(new RegExp(ph, 'g'), state[q.id] !== null && state[q.id] !== '---' ? String(state[q.id]) : '');
  }
  return result.trim();
}

function getFieldsText(schema, state) {
  return schema.questions
    .filter(q => q.id !== 'nombre' && state[q.id] !== null && state[q.id] !== '---' && state[q.id] !== undefined)
    .map(q => `- ${q.label || q.id}: ${state[q.id]}`)
    .join('\n');
}

export function buildSummary(schema, state) {
  const fieldsText = getFieldsText(schema, state);
  const result = fillTemplate(schema.summaryTemplate || 'Resumen:\n\n{{fields}}', state, schema, fieldsText);

  log.info('[SUMMARY]', 'Resumen generado');
  eventBus.emit(Events.SummaryGenerated, { schema: schema.id, state });
  return result;
}

export function buildStructuredSummary(schema, state) {
  return schema.questions
    .filter(q => state[q.id] !== null && state[q.id] !== '---' && state[q.id] !== undefined)
    .map(q => `${q.id}: ${state[q.id]}`);
}

export function buildCompletionMessage(schema, state, summary) {
  const template = schema.completionTemplate || '{{summary}}';
  let result = template;
  result = result.replace(/\{\{nombre\}\}/g, state.nombre || '');
  result = result.replace(/\{\{name\}\}/g, schema.name || schema.id);
  result = result.replace(/\{\{summary\}\}/g, summary);
  result = result.replace(/\{\{fields\}\}/g, getFieldsText(schema, state));
  for (const q of (schema.questions || [])) {
    const ph = `{{${q.id}}}`;
    result = result.replace(new RegExp(ph, 'g'), state[q.id] !== null && state[q.id] !== '---' ? String(state[q.id]) : '');
  }
  return result.trim();
}
