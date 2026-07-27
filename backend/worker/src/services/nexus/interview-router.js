const INTENT_PATTERNS = {
  'budget-request': [
    /\bcu[aá]nto\s+(cuesta|vale|cobran|sale)\b/i,
    /\b(precio[s]?|presupuesto|cotizaci[oó]n|costo|tarifa)\b/i,
    /\bquier[oó]\s+saber\s+(el\s+)?(precio|presupuesto)\b/i,
    /\b(informaci[oó]n|info)\s+(de\s+)?(precios|costos)\b/i,
    /\b(cu[aá]nto|presupuesto)\s+(cuesta|sale|vale|saldr[íi]a)\b/i,
  ],
  'repair-request': [
    /\b(no\s+)?(prende|enciende|arranca|funciona|carga|anda)\b/i,
    /\b(se\s+)?rompi(o|ó)(\s|$)/i,
    /\b(pantalla|bater[ií]a|cargador|golpe)\b/i,
    /(^|\s)(pinch[oó]|moj[oó]|mojad[ao])(\s|$)/i,
    /\b(celular|telefono|notebook|laptop|tablet|equipo)\s+(no\s+)?(prende|funciona|carga|anda)\b/i,
    /\b(arreglar|reparar)\s+(mi\s+|una\s+)?(cel|telefono|notebook|pc|tablet|compu)\b/i,
    /\b(repar[ao]|arregl[oae])\s+(de\s+)?(celular|telefono|notebook|pantalla|tablet|pc|equipo)\b/i,
  ],
  'print-order': [
    /\b(impresi[oó]n|imprim(ir|o))\s+(3d|3D|tres\s+d)\b/i,
    /\b(pieza|figura|modelo|diseño)\s+(3d|3D|impreso|impresa)\b/i,
    /\b(necesito|quiero)\s+(un\s+)?(diseño|pieza|impresi[oó]n)\b/i,
    /\bimpres[ióo]n\s+3d\b/i,
    /\b(imprimime|imprim[ií]s?)\s+(una\s+)?(pieza|figura|modelo)\b/i,
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

  async startInterview(schemaId) {
    const schema = await this.#schemaRegistry.load(schemaId);
    const result = await this.#interviewController.start(schema);
    return {
      sessionId: result.sessionId,
      question: result.question,
      interviewComplete: result.interviewComplete,
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
