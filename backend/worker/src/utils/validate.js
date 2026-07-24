export function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

export function required(value, fieldName) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    throw new ValidationError(`${fieldName} es requerido`);
  }
}

export function isString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} debe ser texto`);
  }
}

export function isNumber(value, fieldName) {
  if (value !== undefined && value !== null && isNaN(Number(value))) {
    throw new ValidationError(`${fieldName} debe ser un número`);
  }
}

export function isBoolean(value, fieldName) {
  if (value !== undefined && value !== null && typeof value !== 'boolean') {
    throw new ValidationError(`${fieldName} debe ser verdadero o falso`);
  }
}

export function isDate(value, fieldName) {
  if (value && isNaN(Date.parse(value))) {
    throw new ValidationError(`${fieldName} debe ser una fecha válida`);
  }
}

export function isEmail(value, fieldName) {
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ValidationError(`${fieldName} debe ser un email válido`);
  }
}

export function maxLength(value, max, fieldName) {
  if (typeof value === 'string' && value.length > max) {
    throw new ValidationError(`${fieldName} no debe exceder ${max} caracteres`);
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}
