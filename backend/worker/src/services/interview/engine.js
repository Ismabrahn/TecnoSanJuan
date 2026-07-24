export class InterviewEngine {
  constructor(definition) {
    this.definition = definition;
  }

  createState() {
    const state = {};
    for (const field of this.definition.fields) {
      state[field.name] = null;
    }
    state.finalizada = false;
    return state;
  }

  shouldSkip(state, field) {
    if (!field.skipIf) return false;
    const actual = state[field.skipIf.field];
    if (field.skipIf.value === '__null__') {
      return actual === null;
    }
    return actual === field.skipIf.value;
  }

  getNextField(state) {
    for (const field of this.definition.fields) {
      if (state[field.name] !== null) continue;
      if (this.shouldSkip(state, field)) {
        state[field.name] = '---';
        continue;
      }
      return field;
    }
    return null;
  }

  extractValue(field, raw) {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (field.type === 'boolean') {
      const lower = trimmed.toLowerCase();
      if (/^(s[ií]|si|dale|ok|obvio|claro|sep|sim|afirmativo|yes|yeah|sip)/.test(lower)) return 'si';
      if (/^(no|nop|nope|non|noo|negativo|nada)/.test(lower)) return 'no';
    }
    return trimmed;
  }

  updateState(state, fieldName, value) {
    state[fieldName] = value;
    return state;
  }

  isComplete(state) {
    for (const field of this.definition.fields) {
      if (state[field.name] === null) {
        const skipped = this.shouldSkip(state, field);
        if (!skipped) return false;
        state[field.name] = '---';
      }
    }
    return true;
  }

  getMissingField(state) {
    const next = this.getNextField(state);
    if (!next) return null;
    return {
      ...next,
      skip: this.shouldSkip(state, next),
    };
  }

  getSummary(state) {
    return this.definition.fields
      .filter(f => state[f.name] !== null && state[f.name] !== '---')
      .map(f => `${f.label}: ${state[f.name]}`)
      .join('\n');
  }
}
