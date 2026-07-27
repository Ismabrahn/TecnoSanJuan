import { StateKeeper } from './state-keeper.js';
import { FlowEvaluator } from './flow-evaluator.js';
import { QuestionGenerator } from './question-generator.js';
import { MemorySessionStore } from './stores/memory-session-store.js';
import { deepFreeze } from './utils.js';
import { InterpreterError } from './errors.js';

// ── Validation helpers ─────────────────────────────────────────

const OPTION_TYPES = new Set(['select', 'multiselect']);

function validateFieldValue(field, value) {
  const errors = [];

  const isRequired = field.required !== false;
  if (isRequired && (value === null || value === undefined || value === '')) {
    errors.push(field.errorMessage || `El campo ${field.label} es obligatorio.`);
    return errors;
  }

  if (value === null || value === undefined || value === '') {
    return errors;
  }

  const v = field.validation || {};

  switch (field.type) {
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(num)) {
        errors.push('El valor debe ser un número válido.');
      } else {
        if (v.min !== undefined && num < v.min) {
          errors.push(`El valor mínimo es ${v.min}.`);
        }
        if (v.max !== undefined && num > v.max) {
          errors.push(`El valor máximo es ${v.max}.`);
        }
      }
      break;
    }

    case 'text':
    case 'phone':
    case 'email': {
      if (typeof value !== 'string') {
        errors.push('El valor debe ser texto.');
      } else {
        if (typeof v.minLength === 'number' && value.length < v.minLength) {
          errors.push(`La longitud mínima es ${v.minLength} caracteres.`);
        }
        if (typeof v.maxLength === 'number' && value.length > v.maxLength) {
          errors.push(`La longitud máxima es ${v.maxLength} caracteres.`);
        }
        if (v.pattern) {
          try {
            const regex = new RegExp(v.pattern);
            if (!regex.test(value)) {
              errors.push(field.errorMessage || 'El formato ingresado no es válido.');
            }
          } catch {
            errors.push('Error en la validación del formato.');
          }
        }
      }
      break;
    }

    case 'select': {
      if (field.options) {
        const valid = field.options.some(o => o.value === value);
        if (!valid) {
          errors.push('Seleccioná una opción válida.');
        }
      }
      break;
    }

    case 'multiselect': {
      if (!Array.isArray(value)) {
        errors.push('El valor debe ser una lista de opciones.');
      } else if (field.options) {
        const validValues = new Set(field.options.map(o => o.value));
        const invalid = value.filter(v => !validValues.has(v));
        if (invalid.length > 0) {
          errors.push('Algunas opciones seleccionadas no son válidas.');
        }
      }
      break;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push('El valor debe ser sí o no.');
      }
      break;
    }
  }

  return errors;
}

// ── Synthetic interpreter result for retry ─────────────────────

function makeRetryInterpreterResult(fieldId, value) {
  return deepFreeze({
    extractedFields: { [fieldId]: value },
    ignoredFields: [],
    ambiguousFields: [],
    confidence: 0,
    detectedIntent: 'ANSWER',
    reasoning: '',
    unknownFragments: [],
    aiUsed: false,
    latency: 0,
  });
}

function makeEmptyInterpreterResult() {
  return deepFreeze({
    extractedFields: {},
    ignoredFields: [],
    ambiguousFields: [],
    confidence: 1,
    detectedIntent: 'ANSWER',
    reasoning: '',
    unknownFragments: [],
    aiUsed: false,
    latency: 0,
  });
}

// ── InterviewController ───────────────────────────────────────

export class InterviewController {
  sessionStore;
  #questionGenerator;

  constructor(options = {}) {
    this.sessionStore = options.sessionStore || new MemorySessionStore();
    this.#questionGenerator = options.questionGenerator
      || new QuestionGenerator({ aiAdapter: options.aiAdapter || null });
  }

  async start(schema) {
    if (!schema || typeof schema !== 'object') {
      throw new InterpreterError('IC_INVALID_SCHEMA', 'Schema must be a non-null object');
    }
    if (!Array.isArray(schema.fields)) {
      throw new InterpreterError('IC_INVALID_SCHEMA', 'Schema must have a fields array');
    }
    if (!schema.serviceId) {
      throw new InterpreterError('IC_INVALID_SCHEMA', 'Schema must have a serviceId');
    }
    if (!schema.serviceVersion) {
      throw new InterpreterError('IC_INVALID_SCHEMA', 'Schema must have a serviceVersion');
    }

    const state = StateKeeper.create(
      schema.serviceId,
      schema.serviceVersion
    );

    const sessionId = state.getInterviewId();
    await this.sessionStore.create(sessionId, { state, schema });

    const flowResult = FlowEvaluator.evaluate(schema, state);
    const interpreterResult = makeEmptyInterpreterResult();
    const question = await this.#questionGenerator.generate(
      schema, state, flowResult, interpreterResult
    );

    return deepFreeze({
      sessionId,
      question,
      interviewComplete: flowResult.isComplete || question.question === null,
    });
  }

  async answer(sessionId, input) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new InterpreterError('IC_INVALID_SESSION', 'SessionId must be a non-empty string');
    }

    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new InterpreterError('IC_SESSION_NOT_FOUND', `Session '${sessionId}' not found`);
    }

    if (!input || typeof input !== 'object') {
      throw new InterpreterError('IC_INVALID_INPUT', 'Input must be a non-null object');
    }

    const fieldId = input.fieldId;
    const value = input.value;

    if (typeof fieldId !== 'string' || fieldId.length === 0) {
      throw new InterpreterError('IC_INVALID_FIELD_ID', 'fieldId must be a non-empty string');
    }

    const field = session.schema.fields.find(f => f.id === fieldId);
    if (!field) {
      throw new InterpreterError(
        'IC_FIELD_NOT_FOUND',
        `Field '${fieldId}' not found in schema`
      );
    }

    const isAlreadyCompleted = session.state.isFieldCompleted(fieldId);
    if (isAlreadyCompleted) {
      throw new InterpreterError(
        'IC_FIELD_ALREADY_COMPLETED',
        `Field '${fieldId}' is already answered`
      );
    }

    const errors = validateFieldValue(field, value);

    if (errors.length > 0) {
      const interpreterResult = makeRetryInterpreterResult(fieldId, value);
      const flowResult = FlowEvaluator.evaluate(session.schema, session.state);
      const question = await this.#questionGenerator.generate(
        session.schema, session.state, flowResult, interpreterResult
      );

      return deepFreeze({
        sessionId,
        question,
        interviewComplete: false,
        saved: false,
        validationError: errors.join(' '),
      });
    }

    session.state.setUserValue(fieldId, value);

    const flowResult = FlowEvaluator.evaluate(session.schema, session.state);
    const interpreterResult = makeEmptyInterpreterResult();
    const question = await this.#questionGenerator.generate(
      session.schema, session.state, flowResult, interpreterResult
    );

    return deepFreeze({
      sessionId,
      question,
      interviewComplete: flowResult.isComplete || question.question === null,
      saved: true,
      validationError: null,
    });
  }

  async next(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new InterpreterError('IC_INVALID_SESSION', 'SessionId must be a non-empty string');
    }

    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new InterpreterError('IC_SESSION_NOT_FOUND', `Session '${sessionId}' not found`);
    }

    const flowResult = FlowEvaluator.evaluate(session.schema, session.state);
    const interpreterResult = makeEmptyInterpreterResult();
    const question = await this.#questionGenerator.generate(
      session.schema, session.state, flowResult, interpreterResult
    );

    return deepFreeze({
      sessionId,
      question,
      interviewComplete: flowResult.isComplete || question.question === null,
    });
  }

  async getSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new InterpreterError('IC_INVALID_SESSION', 'SessionId must be a non-empty string');
    }

    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new InterpreterError('IC_SESSION_NOT_FOUND', `Session '${sessionId}' not found`);
    }

    return deepFreeze({
      sessionId,
      state: session.state.toJSON(),
      schema: session.schema,
    });
  }

  async hasSession(sessionId) {
    return this.sessionStore.exists(sessionId);
  }

  async clearSession(sessionId) {
    await this.sessionStore.delete(sessionId);
  }
}
