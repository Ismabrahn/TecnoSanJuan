import { InterviewEngine } from './engine.js';

const DEFINITIONS = {
  '3d_quote': {
    label: 'Presupuesto de impresión 3D',
    fields: [
      { name: 'pieza',           label: 'Pieza',               type: 'text',    required: true },
      { name: 'archivo',         label: 'Tiene archivo',       type: 'boolean', required: true },
      { name: 'requiere_diseno', label: 'Requiere diseño',     type: 'boolean', required: false, skipIf: { field: 'archivo', value: 'si' } },
      { name: 'medidas',         label: 'Medidas',             type: 'text',    required: true },
      { name: 'cantidad',        label: 'Cantidad',            type: 'text',    required: true },
      { name: 'material',        label: 'Material',            type: 'text',    required: false },
      { name: 'color',           label: 'Color',               type: 'text',    required: false },
      { name: 'uso',             label: 'Uso previsto',        type: 'text',    required: false },
      { name: 'fecha_limite',    label: 'Fecha límite',        type: 'text',    required: false },
      { name: 'observaciones',   label: 'Observaciones',       type: 'text',    required: false },
    ],
  },
};

const ENGINES = {};

export function getEngine(type) {
  if (!ENGINES[type]) {
    const def = DEFINITIONS[type];
    if (!def) throw new Error(`Interview type not found: ${type}`);
    ENGINES[type] = new InterviewEngine(def);
  }
  return ENGINES[type];
}

export function getDefinition(type) {
  return DEFINITIONS[type];
}

export function getInterviewTypes() {
  return Object.keys(DEFINITIONS);
}
