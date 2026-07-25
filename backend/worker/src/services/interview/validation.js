export function validateField(value, campo) {
  const errors = [];
  if (!campo.validacion) return errors;

  const v = campo.validacion;
  const strVal = String(value ?? '');

  if (v.minLength && strVal.length < v.minLength) {
    errors.push({ field: campo.nombre, rule: 'minLength', message: `Mínimo ${v.minLength} caracteres` });
  }

  if (v.maxLength && strVal.length > v.maxLength) {
    errors.push({ field: campo.nombre, rule: 'maxLength', message: `Máximo ${v.maxLength} caracteres` });
  }

  if (v.regex && !new RegExp(v.regex).test(strVal)) {
    errors.push({ field: campo.nombre, rule: 'regex', message: 'Formato inválido' });
  }

  if (v.min !== undefined && Number(value) < v.min) {
    errors.push({ field: campo.nombre, rule: 'min', message: `Valor mínimo: ${v.min}` });
  }

  if (v.max !== undefined && Number(value) > v.max) {
    errors.push({ field: campo.nombre, rule: 'max', message: `Valor máximo: ${v.max}` });
  }

  return errors;
}

export function validateAllFields(state, schema) {
  const allErrors = [];
  for (const campo of (schema.campos || [])) {
    const val = state.campos[campo.nombre]?.valor;
    const valErr = validateField(val, campo);
    allErrors.push(...valErr);
  }
  return allErrors;
}
