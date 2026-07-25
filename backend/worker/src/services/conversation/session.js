const STATES = {
  IDLE: 'idle',
  WAITING_NAME: 'waiting_name',
  WAITING_NEED: 'esperando_necesidad',
  WAITING_PHONE: 'waiting_phone',
  WAITING_EMAIL: 'waiting_email',
  IDENTIFIED: 'identified',
  CONSULTING: 'consultando_servicio',
  QUOTING: 'cotizando',
};

export function createSession() {
  return {
    nombre_cliente: '',
    telefono: '',
    email: '',
    estado_actual: STATES.IDLE,
  };
}

const PREFIXES = [
  /^(?:mi nombre es|me llamo|yo soy|soy|el nombre es)\s+/i,
];

const NAME_WORD = /^[a-záéíóúñ]+$/i;

export function extractName(message) {
  const text = message.trim();
  if (!text) return null;

  let cleaned = text;
  for (const prefix of PREFIXES) {
    cleaned = cleaned.replace(prefix, '').trim();
  }

  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length >= 2 && words.every(w => NAME_WORD.test(w))) {
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  if (words.length === 1 && words[0].length >= 3 && NAME_WORD.test(words[0])) {
    return words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
  }

  if (cleaned !== text && cleaned.length >= 2) {
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length > 0 && parts[0].length >= 3) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    }
  }

  return null;
}

export function detectWaitingState(aiResponse) {
  const lower = aiResponse.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const patterns = {
    [STATES.WAITING_NAME]: [
      /cual es tu nombre/,
      /como te llamas/,
      /decime tu nombre/,
      /tu nombre[\s,]*por favor/,
      /como puedo llamarte/,
      /dime tu nombre/,
      /presentate/,
      /quien eres/,
    ],
    [STATES.WAITING_PHONE]: [
      /tu telefono/,
      /numero de telefono/,
      /decime tu telefono/,
      /cual es tu (numero|telefono)/,
      /dejame tu (numero|telefono)/,
      /pasame tu (numero|telefono)/,
    ],
    [STATES.WAITING_EMAIL]: [
      /tu correo/,
      /tu email/,
      /tu direccion de correo/,
      /cual es tu (correo|email)/,
      /dejame tu (correo|email)/,
    ],
  };

  for (const [state, statePatterns] of Object.entries(patterns)) {
    for (const pattern of statePatterns) {
      if (pattern.test(lower)) {
        return state;
      }
    }
  }

  return null;
}

export function detectWaitingNeedState(aiResponse) {
  const lower = aiResponse.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const patterns = [
    /que (necesitas|necesit[aá]s|quieres|quer[eé]s|buscas)/,
    /en que (te|puedo) (ayudo|ayudar)/,
    /contame (que|en que)/,
    /decime (que|en que)/,
  ];
  return patterns.some(p => p.test(lower)) ? STATES.WAITING_NEED : null;
}

const SERVICE_KEYWORDS = {
  impresion_3d: [
    '3d', 'impresion', 'impresi\u00f3n', 'imprimir', 'pieza', 'figura', 'llavero',
    'soporte', 'prototipo', 'repuesto', 'personalizado', 'stl', 'modelo 3d',
    'objeto', 'pl\u00e1stico', 'filamento', 'pla', 'abs', 'resina',
  ],
  carteleria_led: [
    'cartel', 'letrero', 'neon', 'ne\u00f3n', 'avisador', 'luminoso', 'led',
    'carteler\u00eda', 'carteleria', 'letra', 'cartel de', 'avisos', 'luminaria',
  ],
  servicio_tecnico: [
    'reparaci\u00f3n', 'reparacion', 'arreglo', 't\u00e9cnico', 'tecnico', 'service',
    'arreglar', 'reparar', 'falla', 'fall\u00f3', 'fallo', 'no funciona',
    'pantalla', 'bater\u00eda', 'bateria', 'cambio', 'mantenimiento',
    'diagn\u00f3stico', 'diagnostico', 'service t\u00e9cnico',
  ],
};

export function detectServiceFromMessage(message) {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return service;
    }
  }
  return null;
}

export function buildNameResponse(name) {
  return `Perfecto ${name}. \u00bfEn qu\u00e9 puedo ayudarte hoy?`;
}

export { STATES };
