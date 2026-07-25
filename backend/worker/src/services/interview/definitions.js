import { InterviewEngine } from './engine.js';
import { getService, getAllServices, getServiceIds, detectService } from './services/index.js';

const ENGINES = {};

export function getEngine(type) {
  if (!ENGINES[type]) {
    const svc = getService(type);
    if (!svc) throw new Error(`Interview type not found: ${type}`);
    ENGINES[type] = new InterviewEngine(svc);
  }
  return ENGINES[type];
}

export function getDefinition(type) {
  return getService(type);
}

export function getInterviewTypes() {
  return getServiceIds();
}

export { detectService as detectWorkType };
