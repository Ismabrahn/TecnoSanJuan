const INTENT_PATTERNS = {
  'budget-request': [
    /\b(necesito|quiero|solicito)\s+(un\s+)?(presupuesto|cotizaci[oó]n)\b/i,
    /\b(cu[aá]nto\s+(cuesta|vale|cobran|sale)|precio|costo)\s+(para\s+)?(arreglar|reparar|cambiar|el\s+arreglo)\b/i,
    /\b(pasame|me\s+pasas)\s+(un\s+)?(presupuesto|precio)\b/i,
  ],
  'repair-request': [
    /\b(mi\s+|el\s+)?(celular|tel[ée]fono|notebook|pc|tablet|equipo)\s+(no\s+)?(prende|enciende|arranca|funciona|carga|anda)\b/i,
    /\b(se\s+)?(me\s+)?rompi[oó]\s+(la\s+|el\s+)?(pantalla|celular|tel[ée]fono|vidrio|pin)\b/i,
    /\b(necesito|quiero)\s+(arreglar|reparar|cambiar)\b/i,
    /\b(reparaci[oó]n|arreglo)\s+de\s+(celular|tel[ée]fono|notebook|pantalla|tablet|pc|equipo)\b/i,
    /(^|\s)se\s+(me\s+)?(cay[oó]|moj[oó]|golpe[oó])(\s|$)/i,
  ],
  'print-order': [
    /\b(necesito|quiero)\s+(imprimir|una\s+impresi[oó]n)\b/i,
    /\b(imprimime|imprim[ií]s)\s+(una\s+)?(pieza|figura|modelo|dise[ñn]o)\b/i,
    /\b(presupuesto|cotizaci[oó]n)\s+(para\s+)?impresi[oó]n\b/i,
  ],
};

const INTENT_SCHEMA_MAP = {
  'repair-request': 'repair-request',
  'budget-request': 'budget-request',
  'print-order': 'print-order',
};

export class InterviewRouter {
  #schemaRegistry;
  #interviewController;
  #patterns;
  #schemaMap;

  constructor(options = {}) {
    this.#schemaRegistry = options.schemaRegistry;
    this.#interviewController = options.interviewController;
    this.#patterns = options.patterns || INTENT_PATTERNS;
    this.#schemaMap = options.schemaMap || INTENT_SCHEMA_MAP;

    if (!this.#schemaRegistry) {
      throw new Error('InterviewRouter: schemaRegistry is required');
    }
    if (!this.#interviewController) {
      throw new Error('InterviewRouter: interviewController is required');
    }
  }

  shouldStartInterview(message) {
    if (!message || typeof message !== 'string') return null;

    for (const [intent, patterns] of Object.entries(this.#patterns)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          return intent;
        }
      }
    }

    return null;
  }

  selectSchema(intent) {
    const schemaId = this.#schemaMap[intent];
    if (!schemaId) return null;
    return schemaId;
  }

  async startInterview(schemaId, message = null) {
    const schema = await this.#schemaRegistry.load(schemaId);
    const result = await this.#interviewController.start(schema, message);
    return {
      sessionId: result.sessionId,
      schemaId: result.schemaId,
      question: result.question,
      interviewComplete: result.interviewComplete,
      summary: result.summary,
    };
  }

  async hasActiveInterview(sessionId) {
    return this.#interviewController.hasSession(sessionId);
  }

  async answerMessage(sessionId, message) {
    return this.#interviewController.answerMessage(sessionId, message);
  }

  async getInterviewSession(sessionId) {
    return this.#interviewController.getSession(sessionId);
  }
}
