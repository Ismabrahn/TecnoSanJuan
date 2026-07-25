export function validateServiceSchema(schema) {
  const errors = [];

  if (!schema.id) errors.push('Falta "id"');
  if (!schema.name) errors.push('Falta "name"');
  if (!schema.description) errors.push(`"${schema.id || '?'}": falta "description"`);
  if (!Array.isArray(schema.questions)) errors.push(`"${schema.id || '?'}": falta o inválido "questions"`);
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

  for (const q of (schema.questions || [])) {
    if (!q.id) { errors.push(`"${schema.id}": pregunta sin "id"`); continue; }

    if (ids.has(q.id)) errors.push(`"${schema.id}": ID duplicado "${q.id}"`);
    ids.add(q.id);

    if (!q.label) errors.push(`"${schema.id}": "${q.id}" sin "label"`);

    if (q.question && q.type !== 'inferred' && !q.label) {
      errors.push(`"${schema.id}": "${q.id}" tiene question pero no label`);
    }

    if (q.dependsOn) {
      const depends = Array.isArray(q.dependsOn) ? q.dependsOn : [q.dependsOn];
      for (const dep of depends) {
        const exists = schema.questions.some(sq => sq.id === dep.field);
        if (!exists) errors.push(`"${schema.id}": "${q.id}" dependsOn.field "${dep.field}" no existe`);
      }
    }

    if (q.skipIf) {
      const clauses = Array.isArray(q.skipIf) ? q.skipIf : [q.skipIf];
      for (const clause of clauses) {
        if (clause.field) {
          const exists = schema.questions.some(sq => sq.id === clause.field);
          if (!exists) errors.push(`"${schema.id}": "${q.id}" skipIf.field "${clause.field}" no existe`);
        }
      }
    }

    if (q.type === 'select' && q.options) {
      const opts = new Set();
      for (const opt of q.options) {
        if (opts.has(opt)) errors.push(`"${schema.id}": "${q.id}" opción duplicada "${opt}"`);
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
      const exists = schema.questions.some(sq => sq.id === name);
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
