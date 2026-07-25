import { defaultLogger } from '../logger.js';
import { eventBus, Events } from './event-bus.js';

const log = defaultLogger;

function getFieldsText(schema, state) {
  return schema.campos
    .filter(c => c.nombre !== 'nombre' && state.campos[c.nombre] && state.campos[c.nombre].estado === 'completo')
    .map(c => `- ${c.etiqueta || c.nombre}: ${state.campos[c.nombre].valor}`)
    .join('\n');
}

export function buildSummary(schema, state) {
  const fieldsText = getFieldsText(schema, state);
  let result = schema.summaryTemplate || 'Resumen:\n\n{{fields}}';
  result = result.replace(/\{\{nombre\}\}/g, state.campos?.nombre?.valor || '');
  result = result.replace(/\{\{name\}\}/g, schema.name || schema.id);
  result = result.replace(/\{\{fields\}\}/g, fieldsText || '');
  result = result.replace(/\{\{summary\}\}/g, '');
  for (const campo of (schema.campos || [])) {
    const ph = `{{${campo.nombre}}}`;
    const val = state.campos[campo.nombre]?.estado === 'completo' ? String(state.campos[campo.nombre].valor) : '';
    result = result.replace(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), val);
  }
  log.info('[SUMMARY]', 'Resumen generado');
  eventBus.emit(Events.SummaryGenerated, { schema: schema.id, state });
  return result.trim();
}

export function buildStructuredSummary(schema, state) {
  return schema.campos
    .filter(c => state.campos[c.nombre] && state.campos[c.nombre].estado === 'completo')
    .map(c => `${c.nombre}: ${state.campos[c.nombre].valor}`);
}

export function buildCompletionMessage(schema, state) {
  const template = schema.completionTemplate || '¡Perfecto {{nombre}}! Ya tenemos todos los datos. Nuestro equipo va a preparar el presupuesto.';
  let result = template;
  result = result.replace(/\{\{nombre\}\}/g, state.campos?.nombre?.valor || '');
  result = result.replace(/\{\{name\}\}/g, schema.name || schema.id);
  result = result.replace(/\{\{summary\}\}/g, '');
  result = result.replace(/\{\{fields\}\}/g, '');
  for (const campo of (schema.campos || [])) {
    const ph = `{{${campo.nombre}}}`;
    const val = state.campos[campo.nombre]?.estado === 'completo' ? String(state.campos[campo.nombre].valor) : '';
    result = result.replace(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), val);
  }
  return result.trim();
}
