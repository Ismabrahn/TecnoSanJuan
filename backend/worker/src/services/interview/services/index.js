import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const impresion_3d = JSON.parse(readFileSync(resolve(__dirname, './impresion_3d.json'), 'utf-8'));
const carteleria_led = JSON.parse(readFileSync(resolve(__dirname, './carteleria_led.json'), 'utf-8'));
import { validateAllServices } from '../catalog-validator.js';

const SERVICES = [impresion_3d, carteleria_led];

function validateOnLoad() {
  const errors = validateAllServices(SERVICES);
  const keys = Object.keys(errors);
  if (keys.length > 0) {
    const msg = keys.map(k => `  ${k}: ${errors[k].join(', ')}`).join('\n');
    throw new Error(`Error de validación en servicios:\n${msg}`);
  }
}

try {
  validateOnLoad();
} catch (e) {
  console.error('[CATALOG]', e.message);
  throw e;
}

const BY_ID = Object.fromEntries(SERVICES.map(s => [s.id, s]));

export function getService(id) {
  return BY_ID[id] || null;
}

export function getAllServices() {
  return SERVICES;
}

export function getServiceIds() {
  return SERVICES.map(s => s.id);
}

export function detectService(text) {
  const lower = text.toLowerCase();
  for (const svc of SERVICES) {
    for (const kw of (svc.keywords || [])) {
      if (lower.includes(kw)) return svc.id;
    }
  }
  return null;
}
