export function validateServiceSchema(schema) {
  const errors = [];

  if (!schema.id) errors.push('Falta "id"');
  if (!schema.name) errors.push('Falta "name"');
  if (!schema.description) errors.push(`"${schema.id || '?'}": falta "description"`);
  if (!Array.isArray(schema.campos)) errors.push(`"${schema.id || '?'}": falta o inválido "campos"`);
  if (!schema.summaryTemplate) errors.push(`"${schema.id || '?'}": falta "summaryTemplate"`);
  if (!schema.completionTemplate) errors.push(`"${schema.id || '?'}": falta "completionTemplate"`);
  if (!schema.welcome) errors.push(`"${schema.id || '?'}": falta sección "welcome"`);
  if (schema.welcome && !schema.welcome.title) errors.push(`"${schema.id || '?'}": falta "welcome.title"`);
  if (schema.welcome && !schema.welcome.message) errors.push(`"${schema.id || '?'}": falta "welcome.message"`);
  if (schema.schemaVersion === undefined) errors.push(`"${schema.id || '?'}": falta "schemaVersion"`);
  if (!schema.serviceVersion) errors.push(`"${schema.id || '?'}": falta "serviceVersion"`);
  if (!schema.keywords || !Array.isArray(schema.keywords) || schema.keywords.length === 0) {
    errors.push(`"${schema.id || '?'}": falta "keywords"`);
  }

  const ids = new Set();

  for (const campo of (schema.campos || [])) {
    if (!campo.nombre) { errors.push(`"${schema.id}": campo sin "nombre"`); continue; }

    if (ids.has(campo.nombre)) errors.push(`"${schema.id}": nombre duplicado "${campo.nombre}"`);
    ids.add(campo.nombre);

    if (!campo.etiqueta) errors.push(`"${schema.id}": "${campo.nombre}" sin "etiqueta"`);
    if (!campo.tipo) errors.push(`"${schema.id}": "${campo.nombre}" sin "tipo"`);

    if (campo.tipo === 'select' && campo.opciones) {
      const opts = new Set();
      for (const opt of campo.opciones) {
        if (opts.has(opt)) errors.push(`"${schema.id}": "${campo.nombre}" opción duplicada "${opt}"`);
        opts.add(opt);
      }
    }
  }

  const validPlaceholders = new Set(['nombre', 'name', 'fields', 'summary']);
  const templates = ['summaryTemplate', 'completionTemplate'];

  for (const tplKey of templates) {
    const tpl = schema[tplKey];
    if (!tpl) continue;
    const matches = tpl.match(/\{\{(\w+)\}\}/g) || [];
    for (const ph of matches) {
      const name = ph.replace(/\{\{|\}\}/g, '');
      if (validPlaceholders.has(name)) continue;
      const exists = (schema.campos || []).some(c => c.nombre === name);
      if (!exists) errors.push(`"${schema.id}": placeholder "{{${name}}}" en ${tplKey} no tiene campo correspondiente`);
    }
  }

  return errors;
}

export function validateAllServices(services) {
  const allErrors = {};
  for (const svc of services) {
    const errs = validateServiceSchema(svc);
    if (errs.length > 0) allErrors[svc.id || 'unknown'] = errs;
  }
  return allErrors;
}
