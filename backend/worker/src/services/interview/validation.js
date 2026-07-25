export function validateField(value, question) {
  const errors = [];

  if (!question.validation) return errors;

  const v = question.validation;
  const strVal = String(value ?? '');

  if (v.minLength && strVal.length < v.minLength) {
    errors.push({ field: question.id, rule: 'minLength', message: `Mínimo ${v.minLength} caracteres` });
  }

  if (v.maxLength && strVal.length > v.maxLength) {
    errors.push({ field: question.id, rule: 'maxLength', message: `Máximo ${v.maxLength} caracteres` });
  }

  if (v.regex && !new RegExp(v.regex).test(strVal)) {
    errors.push({ field: question.id, rule: 'regex', message: 'Formato inválido' });
  }

  if (v.min !== undefined && Number(value) < v.min) {
    errors.push({ field: question.id, rule: 'min', message: `Valor mínimo: ${v.min}` });
  }

  if (v.max !== undefined && Number(value) > v.max) {
    errors.push({ field: question.id, rule: 'max', message: `Valor máximo: ${v.max}` });
  }

  return errors;
}

export function validateRequired(state, question) {
  if (!question.required) return [];
  const val = state[question.id];
  if (val === null || val === undefined || val === '' || val === '---') {
    return [{ field: question.id, rule: 'required', message: 'Este campo es obligatorio' }];
  }
  return [];
}

export function validateAllFields(state, questions) {
  const allErrors = [];
  for (const q of questions) {
    const requiredErr = validateRequired(state, q);
    allErrors.push(...requiredErr);
    if (requiredErr.length === 0) {
      const valErr = validateField(state[q.id], q);
      allErrors.push(...valErr);
    }
  }
  return allErrors;
}
