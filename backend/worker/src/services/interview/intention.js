import { detectService, getAllServices } from './services/index.js';
import { defaultLogger } from '../logger.js';

const log = defaultLogger;

const CONFIDENCE_THRESHOLD = 0.45;

const NEGATION_PATTERNS = [
  /^(no|no sé|no se|no tengo|no quiero|no necesito|nunca|jamás|nada)/i,
];

const GREETING_PATTERNS = [
  /^(hola|buenas|buen[ao]s|hey|que tal|qué tal|como estas|cómo estás|saludos)/i,
];

function isGreeting(message) {
  return GREETING_PATTERNS.some(p => p.test(message.trim()));
}

function isNegation(message) {
  return NEGATION_PATTERNS.some(p => p.test(message.trim()));
}

function keywordMatchScore(message, keywords) {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let score = 0;
  for (const kw of keywords) {
    const normalized = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalized)) {
      score += normalized.length > 3 ? 0.4 : 0.2;
    }
  }
  return Math.min(score, 1);
}

function detectIntent(message) {
  if (!message || message.trim().length < 3) {
    return { service: null, confidence: 0, needsClarification: false, reason: 'empty_message' };
  }

  if (isGreeting(message)) {
    return { service: null, confidence: 0, needsClarification: false, reason: 'greeting' };
  }

  if (isNegation(message)) {
    return { service: null, confidence: 0, needsClarification: false, reason: 'negation' };
  }

  const services = getAllServices();
  let bestService = null;
  let bestScore = 0;

  for (const svc of services) {
    const score = keywordMatchScore(message, svc.keywords || []);
    if (score > bestScore) {
      bestScore = score;
      bestService = svc.id;
    }
  }

  if (bestScore >= CONFIDENCE_THRESHOLD) {
    log.info('[INTENTION]', `Servicio detectado: "${bestService}" (confianza: ${bestScore.toFixed(2)})`);
    return {
      service: bestService,
      confidence: bestScore,
      needsClarification: false,
      reason: 'keyword_match',
    };
  }

  if (bestScore > 0 && bestScore < CONFIDENCE_THRESHOLD) {
    const svc = services.find(s => s.id === bestService);
    log.info('[INTENTION]', `Confianza baja para "${bestService}" (${bestScore.toFixed(2)}), necesita aclaración`);
    return {
      service: bestService,
      confidence: bestScore,
      needsClarification: true,
      reason: 'low_confidence',
      serviceName: svc?.name || bestService,
    };
  }

  return { service: null, confidence: 0, needsClarification: false, reason: 'no_match' };
}

function buildClarifyingQuestion(intent) {
  if (!intent.needsClarification || !intent.serviceName) return null;
  return `¿Te referís a un servicio de ${intent.serviceName}? Contame un poco más para entender mejor lo que necesitás.`;
}

export { detectIntent, buildClarifyingQuestion, CONFIDENCE_THRESHOLD };
