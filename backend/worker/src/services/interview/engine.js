import { defaultLogger } from '../logger.js';
import { eventBus, Events } from './event-bus.js';

export const ENGINE_VERSION = '3.0.0';

export class InterviewEngine {
  constructor(schema) {
    this.schema = schema;
    this.log = defaultLogger;
  }

  setLogger(logger) {
    this.log = logger;
  }

  createState() {
    const state = {
      servicio: this.schema.id,
      campos: {},
      completada: false,
    };
    for (const campo of this.schema.campos) {
      state.campos[campo.nombre] = { valor: null, estado: 'pendiente' };
    }
    state.createdAt = new Date().toISOString();
    state.updatedAt = state.createdAt;
    return state;
  }

  getNextField(state) {
    for (const campo of this.schema.campos) {
      if (campo.requerido === false) continue;
      const c = state.campos[campo.nombre];
      if (!c || c.estado !== 'completo') {
        return campo;
      }
    }
    for (const campo of this.schema.campos) {
      if (campo.requerido !== false) continue;
      const c = state.campos[campo.nombre];
      if (!c || c.estado !== 'completo') {
        return campo;
      }
    }
    return null;
  }

  markField(state, nombre, valor) {
    if (!state.campos[nombre]) {
      state.campos[nombre] = { valor: null, estado: 'pendiente' };
    }
    state.campos[nombre].valor = valor;
    state.campos[nombre].estado = 'completo';
    eventBus.emit(Events.FieldUpdated, { field: nombre, value: valor });
    this.log.info('[ENGINE]', `Campo "${nombre}" = "${JSON.stringify(valor)}"`);
  }

  getPendingFields(state) {
    return this.schema.campos.filter(
      c => !state.campos[c.nombre] || state.campos[c.nombre].estado !== 'completo'
    );
  }

  getPendingRequired(state) {
    return this.schema.campos.filter(
      c => c.requerido !== false && (!state.campos[c.nombre] || state.campos[c.nombre].estado !== 'completo')
    );
  }

  isComplete(state) {
    if (state.completada) return true;
    const pending = this.getPendingRequired(state);
    if (pending.length === 0) {
      state.completada = true;
      state.updatedAt = new Date().toISOString();
      this.log.info('[ENGINE]', 'Entrevista finalizada');
    }
    return state.completada;
  }

  getProgress(state) {
    const total = this.schema.campos.length;
    const answered = this.schema.campos.filter(
      c => state.campos[c.nombre] && state.campos[c.nombre].estado === 'completo'
    ).length;
    return {
      completed: answered,
      pending: total - answered,
      total,
      percent: total > 0 ? Math.round((answered / total) * 100) : 0,
    };
  }

  getStatus(state) {
    const pending = this.getPendingFields(state);
    const total = this.schema.campos.length;
    const completed = total - pending.length;
    return {
      complete: pending.length === 0,
      total,
      completed,
      pending: pending.length,
      pendingFields: pending.map(c => c.nombre),
    };
  }

  getCamposCompletos(state) {
    return this.schema.campos
      .filter(c => state.campos[c.nombre] && state.campos[c.nombre].estado === 'completo')
      .map(c => ({
        nombre: c.nombre,
        etiqueta: c.etiqueta,
        valor: state.campos[c.nombre].valor,
      }));
  }

  addHistory(state, field, oldVal, newVal) {
    if (!state.history) state.history = [];
    state.history.push({
      field,
      old: oldVal,
      new: newVal,
      timestamp: new Date().toISOString(),
    });
  }

  getHistory(state) {
    return state.history || [];
  }
}
