import { defaultLogger } from '../logger.js';
import { eventBus, Events } from './event-bus.js';

export const ENGINE_VERSION = '2.0.0';

export class InterviewEngine {
  constructor(definition) {
    this.definition = definition;
    this.log = defaultLogger;
  }

  createState(session) {
    const state = {};
    for (const q of this.definition.questions) {
      state[q.id] = null;
    }
    state.finalizada = false;
    state.history = [];
    state.schemaVersion = this.definition.schemaVersion || 1;
    state.engineVersion = ENGINE_VERSION;
    state.createdAt = new Date().toISOString();
    state.updatedAt = state.createdAt;
    return state;
  }

  setLogger(logger) {
    this.log = logger;
  }

  shouldSkip(state, question) {
    if (!question.skipIf) return false;
    const clauses = Array.isArray(question.skipIf) ? question.skipIf : [question.skipIf];
    return clauses.some(clause => {
      const val = state[clause.field];
      const targets = Array.isArray(clause.value) ? clause.value : [clause.value];
      return targets.some(t => {
        if (t === '__null__') return val === null;
        if (t === true) return val === true || val === 'si' || val === true;
        if (t === false) return val === false || val === 'no' || val === false;
        return String(val) === String(t);
      });
    });
  }

  dependsOnSatisfied(state, question) {
    if (!question.dependsOn) return true;
    const depends = Array.isArray(question.dependsOn) ? question.dependsOn : [question.dependsOn];
    return depends.every(dep => {
      const val = state[dep.field];
      if (dep.equals !== undefined) return String(val) === String(dep.equals);
      if (dep.in !== undefined) return dep.in.map(String).includes(String(val));
      return false;
    });
  }

  addHistory(state, field, newVal) {
    const oldVal = state[field];
    if (oldVal === newVal) return;
    state.history.push({
      field,
      old: oldVal,
      new: newVal,
      timestamp: new Date().toISOString(),
    });
  }

  _skipQuestion(state, q, reason) {
    if (state[q.id] === '---') return;
    state[q.id] = '---';
    eventBus.emit(Events.QuestionSkipped, { field: q.id, reason });
    this.log.info('[ENGINE]', `"${q.id}" saltado por ${reason}`);
  }

  getNextQuestion(state) {
    for (const q of this.definition.questions) {
      if (!q.question) continue;
      if (state[q.id] !== null) continue;
      if (!this.dependsOnSatisfied(state, q)) continue;
      if (this.shouldSkip(state, q)) continue;
      if (q.blocking !== false) return q;
    }
    for (const q of this.definition.questions) {
      if (!q.question) continue;
      if (state[q.id] !== null) continue;
      if (!this.dependsOnSatisfied(state, q)) continue;
      if (this.shouldSkip(state, q)) continue;
      if (q.blocking === false) return q;
    }
    return null;
  }

  processSkips(state) {
    for (const q of this.definition.questions) {
      if (state[q.id] !== null) continue;
      if (!q.question) {
        this._skipQuestion(state, q, 'inferred');
        continue;
      }
      if (!this.dependsOnSatisfied(state, q)) {
        this._skipQuestion(state, q, 'dependsOn');
        continue;
      }
      if (this.shouldSkip(state, q)) {
        this._skipQuestion(state, q, 'skipIf');
      }
    }
  }

  getPendingFields(state) {
    const blocking = [];
    const nonBlocking = [];
    for (const q of this.definition.questions) {
      if (!q.question) continue;
      if (state[q.id] === null || state[q.id] === undefined) {
        if (!this.dependsOnSatisfied(state, q)) continue;
        if (!this.shouldSkip(state, q)) {
          (q.blocking !== false ? blocking : nonBlocking).push(q);
        }
      }
    }
    return [...blocking, ...nonBlocking];
  }

  getStatus(state) {
    const pending = this.getPendingFields(state);
    const total = this.definition.questions.filter(q => q.question).length;
    const completed = total - pending.length;
    return {
      complete: pending.length === 0,
      total,
      completed,
      pending: pending.length,
      pendingFields: pending.map(q => q.id),
    };
  }

  getProgress(state) {
    const total = this.definition.questions.filter(q => q.question).length;
    const answered = this.definition.questions.filter(
      q => q.question && state[q.id] !== null && state[q.id] !== '---'
    ).length;
    const skipped = this.definition.questions.filter(
      q => q.question && state[q.id] === '---'
    ).length;
    return {
      completed: answered,
      skipped,
      pending: total - answered - skipped,
      total,
      percent: total > 0 ? Math.round(((answered + skipped) / total) * 100) : 0,
    };
  }

  isComplete(state) {
    this.processSkips(state);
    const blockingMissing = this.getBlockingFieldsMissing(state);
    const complete = blockingMissing.length === 0;
    if (complete) {
      state.finalizada = true;
      state.updatedAt = new Date().toISOString();
      this.log.info('[ENGINE]', 'Entrevista finalizada');
    }
    return complete;
  }

  getMissingField(state) {
    const next = this.getNextQuestion(state);
    if (!next) return null;
    this.log.info('[ENGINE]', `Siguiente pregunta: ${next.id}`);
    return { ...next, skip: false };
  }

  getHistory(state) {
    return state.history || [];
  }

  checkVersionCompatibility(state) {
    if (state.schemaVersion !== this.definition.schemaVersion) {
      this.log.warn('[ENGINE]', `Versión de esquema incompatible: estado=${state.schemaVersion}, servicio=${this.definition.schemaVersion}`);
      return false;
    }
    return true;
  }

  getRequiredPending(state) {
    const pending = [];
    for (const q of this.definition.questions) {
      if (!q.question) continue;
      if (state[q.id] === null || state[q.id] === undefined) {
        if (!this.dependsOnSatisfied(state, q)) continue;
        if (this.shouldSkip(state, q)) continue;
        if (q.blocking !== false) {
          pending.push(q);
        }
      }
    }
    return pending;
  }

  getBlockingFieldsMissing(state) {
    const missing = [];
    for (const q of this.definition.questions) {
      if (!q.question) continue;
      const val = state[q.id];
      if (val === null || val === undefined || val === '' || val === '---' || val === 'loop_skip') {
        if (!this.dependsOnSatisfied(state, q)) continue;
        if (this.shouldSkip(state, q)) continue;
        if (q.blocking !== false) {
          missing.push(q);
        }
      }
    }
    return missing;
  }
}
