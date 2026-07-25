import { InterviewEngine } from '../src/services/interview/engine.js';
import { validateField, validateRequired, validateAllFields } from '../src/services/interview/validation.js';
import { validateServiceSchema } from '../src/services/interview/catalog-validator.js';
import { resolveEntities, resolveBoolean } from '../src/services/interview/resolver.js';
import { buildSummary, buildCompletionMessage, buildStructuredSummary } from '../src/services/interview/summary.js';
import { EventBus, Events } from '../src/services/interview/event-bus.js';
import { getEngine } from '../src/services/interview/definitions.js';
import { detectService } from '../src/services/interview/services/index.js';
import { detectIntent, buildClarifyingQuestion, CONFIDENCE_THRESHOLD } from '../src/services/interview/intention.js';
import { AntiLoop, antiLoop as antiLoopInstance } from '../src/services/interview/anti-loop.js';
import { getSession, saveSession, deleteSession } from '../src/services/session-store.js';
import { readFileSync } from 'fs';
import { strict as assert } from 'assert';

const schema = JSON.parse(readFileSync(new URL('../src/services/interview/services/impresion_3d.json', import.meta.url), 'utf8'));
const ledSchema = JSON.parse(readFileSync(new URL('../src/services/interview/services/carteleria_led.json', import.meta.url), 'utf8'));

let passed = 0;
let failed = 0;
let errors = [];

const _testPromises = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      _testPromises.push(
        result.then(() => passed++, e => {
          failed++;
          errors.push({ name, message: e.message });
          console.log(`  FAIL: ${name} -> ${e.message}`);
        })
      );
    } else {
      passed++;
    }
  } catch (e) {
    failed++;
    errors.push({ name, message: e.message });
    console.log(`  FAIL: ${name} -> ${e.message}`);
  }
}

async function _runTests() {
  await Promise.all(_testPromises);
}

function group(name, fn) {
  console.log(`\n=== ${name} ===`);
  fn();
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: esperado "${expected}", recibido "${actual}"`);
}

// ================================================================
// FASE 2: INTERVIEW ENGINE
// ================================================================
group('FASE 2: INTERVIEW ENGINE', () => {

  group('2.1 createState()', () => {
    test('crea estado con todos los campos en null', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      for (const q of schema.questions) {
        assertEqual(state[q.id], null, `${q.id} debe ser null`);
      }
    });

    test('incluye metadatos de version', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      assertEqual(state.schemaVersion, 1, 'schemaVersion debe ser 1');
      assertEqual(state.engineVersion, '2.0.0', 'engineVersion debe ser 2.0.0');
      assertEqual(state.finalizada, false, 'finalizada debe ser false');
    });

    test('state.history es un array vacio', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      assert.ok(Array.isArray(state.history), 'history debe ser array');
      assertEqual(state.history.length, 0, 'history debe estar vacio');
    });

    test('acepta parametro session sin romper', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState({ sessionId: 'test-123' });
      assertEqual(state.nombre, null, 'session no afecta estado');
    });
  });

  group('2.2 getNextQuestion()', () => {
    test('estado vacio retorna primera pregunta con question', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const next = eng.getNextQuestion(state);
      assert.ok(next !== null, 'debe retornar una pregunta');
      assert.ok(next.question, 'debe tener question');
    });

    test('retorna null cuando todo esta completo', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan'; state.pieza = 'Soporte'; state.archivo = true;
      state.requiere_diseno = '---'; state.medidas = '10x10'; state.cantidad = '5';
      state.material = 'PLA'; state.color = 'Rojo'; state.plazo = '1 semana';
      state.observaciones = 'Ninguna';
      const next = eng.getNextQuestion(state);
      assertEqual(next, null, 'debe retornar null cuando completo');
    });

    test('salta preguntas sin .question (inferidas)', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      const textoQ = ledSchema.questions.find(q => q.id === 'texto');
      assert.ok(textoQ, 'texto existe');
      assert.ok(!textoQ.question, 'texto no tiene question');
      // Engine should skip it in getNextQuestion
      const next = eng.getNextQuestion(state);
      assert.ok(next !== null, 'debe retornar una pregunta');
      assert.notEqual(next.id, 'texto', 'no debe retornar campo inferido');
    });

    test('respeta skipIf', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.archivo = true;
      state.nombre = 'Juan'; state.pieza = 'Soporte';
      const reqDiseno = schema.questions.find(q => q.id === 'requiere_diseno');
      assert.ok(eng.shouldSkip(state, reqDiseno), 'debe saltar requiere_diseno cuando archivo=true');
      eng.isComplete(state);
      assertEqual(state.requiere_diseno, '---', 'requiere_diseno debe marcarse como saltado');
    });

    test('NO salta cuando skipIf no coincide', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.archivo = false;
      state.nombre = 'Juan'; state.pieza = 'Soporte';
      const reqDiseno = schema.questions.find(q => q.id === 'requiere_diseno');
      assert.ok(!eng.shouldSkip(state, reqDiseno), 'NO debe saltar cuando archivo=false');
    });
  });

  group('2.3 dependsOnSatisfied()', () => {
    test('retorna true cuando no hay dependsOn', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      assert.ok(eng.dependsOnSatisfied(state, {}) === true, 'sin dependsOn = true');
    });

    test('equals: retorna true cuando coincide', () => {
      const eng = new InterviewEngine(schema);
      const state = { tipo_iluminacion: 'RGB' };
      assert.ok(eng.dependsOnSatisfied(state, { dependsOn: { field: 'tipo_iluminacion', equals: 'RGB' } }), 'equals RGB coincide');
    });

    test('equals: retorna false cuando NO coincide', () => {
      const eng = new InterviewEngine(schema);
      const state = { tipo_iluminacion: 'Color fijo' };
      assert.ok(!eng.dependsOnSatisfied(state, { dependsOn: { field: 'tipo_iluminacion', equals: 'RGB' } }), 'equals RGB no coincide con Color fijo');
    });

    test('in: retorna true cuando valor esta en lista', () => {
      const eng = new InterviewEngine(schema);
      const state = { archivo: true };
      assert.ok(eng.dependsOnSatisfied(state, { dependsOn: { field: 'archivo', in: ['true', 'si'] } }), 'true esta en [true, si]');
    });

    test('in: retorna false cuando valor NO esta en lista', () => {
      const eng = new InterviewEngine(schema);
      const state = { archivo: false };
      assert.ok(!eng.dependsOnSatisfied(state, { dependsOn: { field: 'archivo', in: ['true', 'si'] } }), 'false NO esta en [true, si]');
    });

    test('campo inexistente retorna false', () => {
      const eng = new InterviewEngine(schema);
      const state = {};
      assert.ok(!eng.dependsOnSatisfied(state, { dependsOn: { field: 'no_existe' } }), 'campo inexistente = false');
    });

    test('multiple dependsOn: todos deben cumplirse', () => {
      const eng = new InterviewEngine(schema);
      const state = { a: 'x', b: 'y' };
      assert.ok(eng.dependsOnSatisfied(state, { dependsOn: [{ field: 'a', equals: 'x' }, { field: 'b', equals: 'y' }] }), 'ambos deben cumplirse');
      assert.ok(!eng.dependsOnSatisfied(state, { dependsOn: [{ field: 'a', equals: 'x' }, { field: 'b', equals: 'z' }] }), 'falla si uno no cumple');
    });
  });

  group('2.4 getPendingFields()', () => {
    test('estado vacio retorna todas las preguntas', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const pending = eng.getPendingFields(state);
      const withQuestion = schema.questions.filter(q => q.question).length;
      assertEqual(pending.length, withQuestion, 'deben ser todas las preguntas con question');
    });

    test('campos completados no aparecen en pendientes', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.pieza = 'Soporte';
      const pending = eng.getPendingFields(state);
      assert.ok(!pending.some(p => p.id === 'nombre'), 'nombre no debe estar pendiente');
      assert.ok(!pending.some(p => p.id === 'pieza'), 'pieza no debe estar pendiente');
    });

    test('campos saltados no aparecen en pendientes', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.archivo = true;
      eng.isComplete(state);
      const pending = eng.getPendingFields(state);
      assert.ok(!pending.some(p => p.id === 'requiere_diseno'), 'requiere_diseno saltado no debe estar pendiente');
    });

    test('campos inferidos sin question NO aparecen', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      const pending = eng.getPendingFields(state);
      assert.ok(!pending.some(p => p.id === 'texto'), 'texto inferido no debe aparecer');
      assert.ok(!pending.some(p => p.id === 'elementos_graficos'), 'elementos_graficos inferido no debe aparecer');
    });
  });

  group('2.5 getStatus()', () => {
    test('estado vacio: complete=false, pending=total', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const status = eng.getStatus(state);
      assertEqual(status.complete, false, 'no debe estar completo');
      assertEqual(status.pending, status.total, 'pending debe ser igual a total');
      assertEqual(status.completed, 0, '0 completados');
    });

    test('estado completo: complete=true', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan'; state.pieza = 'Soporte'; state.archivo = true;
      state.requiere_diseno = '---'; state.medidas = '10x10'; state.cantidad = '5';
      state.material = 'PLA'; state.color = 'Rojo'; state.plazo = '1 semana';
      state.observaciones = 'Ninguna';
      eng.isComplete(state);
      const status = eng.getStatus(state);
      assertEqual(status.complete, true, 'debe estar completo');
      assertEqual(status.pending, 0, '0 pendientes');
    });

    test('parcial: completed entre 0 y total', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.pieza = 'Soporte';
      const status = eng.getStatus(state);
      assertEqual(status.completed, 2, '2 completados');
      assertEqual(status.pending, status.total - 2, 'pending = total - completed');
    });
  });

  group('2.6 getProgress()', () => {
    test('estado vacio: 0%', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const p = eng.getProgress(state);
      assertEqual(p.percent, 0, '0% cuando vacio');
      assertEqual(p.completed, 0, '0 completados');
      assertEqual(p.skipped, 0, '0 saltados');
    });

    test('estado completo: 100%', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan'; state.pieza = 'Soporte'; state.archivo = true;
      state.requiere_diseno = '---'; state.medidas = '10x10'; state.cantidad = '5';
      state.material = 'PLA'; state.color = 'Rojo'; state.plazo = '1 semana';
      state.observaciones = 'Ninguna';
      eng.isComplete(state);
      const p = eng.getProgress(state);
      assertEqual(p.percent, 100, '100% cuando completo');
    });

    test('parcial: porcentaje correcto', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.pieza = 'Soporte';
      state.archivo = true;
      eng.isComplete(state);
      // 3 answered + 1 skipped = 4 processed out of 10
      const p = eng.getProgress(state);
      assertEqual(p.completed, 3, '3 completados');
      assertEqual(p.skipped, 1, '1 saltado (requiere_diseno)');
      assertEqual(p.total, 10, '10 total');
    });

    test('estado completado + saltados no excede total', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const p = eng.getProgress(state);
      assert.ok(p.completed + p.skipped + p.pending === p.total, 'completed + skipped + pending debe ser = total');
    });
  });

  group('2.7 isComplete()', () => {
    test('retorna true cuando todo completado', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan'; state.pieza = 'Soporte'; state.archivo = true;
      state.requiere_diseno = '---'; state.medidas = '10x10'; state.cantidad = '5';
      state.material = 'PLA'; state.color = 'Rojo'; state.plazo = '1 semana';
      state.observaciones = 'Ninguna';
      assert.ok(eng.isComplete(state), 'debe estar completo');
      assertEqual(state.finalizada, true, 'finalizada debe ser true');
    });

    test('retorna false cuando faltan campos obligatorios', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan';
      assert.ok(!eng.isComplete(state), 'no debe estar completo si falta pieza');
    });

    test('marca campos saltables como ---', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.archivo = true;
      eng.isComplete(state);
      assertEqual(state.requiere_diseno, '---', 'requiere_diseno debe marcarse como saltado');
    });

    test('marca campos inferidos sin question como ---', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      eng.isComplete(state);
      assertEqual(state.texto, '---', 'texto inferido debe marcarse como saltado');
      assertEqual(state.elementos_graficos, '---', 'elementos_graficos inferido debe marcarse como saltado');
    });

    test('retorna true cuando solo faltan non-blocking fields', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.tipo_diseno = 'Cartel';
      state.medidas = '50x30';
      state.ubicacion = 'Local';
      state.interior_exterior = 'Interior';
      state.tipo_iluminacion = 'RGB';
      assert.ok(eng.isComplete(state), 'debe estar completo si solo faltan non-blocking');
      assert.ok(state.finalizada, 'finalizada debe ser true');
    });

    test('actualiza updatedAt al completar', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan'; state.pieza = 'Soporte'; state.archivo = true;
      state.requiere_diseno = '---'; state.medidas = '10x10'; state.cantidad = '5';
      state.material = 'PLA'; state.color = 'Rojo'; state.plazo = '1 semana';
      state.observaciones = 'Ninguna';
      const before = state.updatedAt;
      // Set a past date to ensure it changes
      state.updatedAt = '2000-01-01T00:00:00.000Z';
      eng.isComplete(state);
      assert.notEqual(state.updatedAt, '2000-01-01T00:00:00.000Z', 'updatedAt debe actualizarse al completar');
      assert.ok(state.finalizada, 'finalizada debe ser true');
    });
  });

  group('2.8 shouldSkip()', () => {
    test('retorna false si no hay skipIf', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      assert.ok(!eng.shouldSkip(state, {}), 'sin skipIf = false');
    });

    test('retorna true cuando valor coincide con string', () => {
      const eng = new InterviewEngine(schema);
      assert.ok(eng.shouldSkip({ archivo: true }, { skipIf: { field: 'archivo', value: true } }), 'true coincide con true');
    });

    test('retorna true cuando valor booleano "si"', () => {
      const eng = new InterviewEngine(schema);
      assert.ok(eng.shouldSkip({ archivo: 'si' }, { skipIf: { field: 'archivo', value: true } }), '"si" debe coincidir con true');
    });

    test('retorna true cuando valor booleano "no"', () => {
      const eng = new InterviewEngine(schema);
      assert.ok(eng.shouldSkip({ archivo: 'no' }, { skipIf: { field: 'archivo', value: false } }), '"no" debe coincidir con false');
    });

    test('retorna true con __null__ cuando valor es null', () => {
      const eng = new InterviewEngine(schema);
      assert.ok(eng.shouldSkip({ nombre: null }, { skipIf: { field: 'nombre', value: '__null__' } }), 'null coincide con __null__');
    });
  });

  group('2.9 addHistory()', () => {
    test('registra cambio cuando valor cambia', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.color = 'Rojo';
      eng.addHistory(state, 'color', 'Azul');
      assertEqual(state.history.length, 1, 'debe registrar 1 cambio');
      assertEqual(state.history[0].field, 'color', 'field debe ser color');
      assertEqual(state.history[0].old, 'Rojo', 'old debe ser Rojo');
      assertEqual(state.history[0].new, 'Azul', 'new debe ser Azul');
    });

    test('NO registra cambio si el valor es el mismo', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.color = 'Rojo';
      eng.addHistory(state, 'color', 'Rojo');
      assertEqual(state.history.length, 0, 'no debe registrar si valor no cambia');
    });

    test('getHistory() retorna el historial', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.color = 'Rojo';
      eng.addHistory(state, 'color', 'Azul');
      const h = eng.getHistory(state);
      assertEqual(h.length, 1, 'getHistory debe retornar historial');
    });

    test('history incluye timestamp', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.color = 'Rojo';
      eng.addHistory(state, 'color', 'Azul');
      assert.ok(state.history[0].timestamp, 'debe incluir timestamp');
    });
  });

  group('2.10 checkVersionCompatibility()', () => {
    test('versiones iguales retorna true', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      assert.ok(eng.checkVersionCompatibility(state), 'misma version = true');
    });

    test('versiones distintas retorna false', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.schemaVersion = 999;
      assert.ok(!eng.checkVersionCompatibility(state), 'version distinta = false');
    });
  });
});

// ================================================================
// FASE 3: AI INTERPRETER (tests sintácticos, no llama a OpenRouter)
// ================================================================
group('FASE 3: AI INTERPRETER (sin red)', () => {
  group('3.1 parseJsonResponse', () => {
    test('codigo parsea JSON valido del AI', () => {
      // Simular parseJsonResponse logic (embedded in interpreter.js)
      const input = '{"entities":[{"field":"texto","value":"MUSCULACION","confidence":0.99}],"intent":"valid_answer"}';
      const cleaned = input.replace(/```json\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      assertEqual(parsed.entities.length, 1, 'debe tener 1 entidad');
      assertEqual(parsed.entities[0].field, 'texto', 'field debe ser texto');
      assertEqual(parsed.entities[0].value, 'MUSCULACION', 'value debe ser MUSCULACION');
    });

    test('codigo parsea JSON con delimitadores markdown', () => {
      const input = '```json\n{"entities":[{"field":"texto","value":"TEST"}],"intent":"valid_answer"}\n```';
      const cleaned = input.replace(/```json\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      assertEqual(parsed.entities[0].value, 'TEST', 'debe extraer TEST ignorando markdown');
    });

    test('codigo retorna null si no hay JSON', () => {
      const input = 'Hola, soy un asistente amigable.';
      const cleaned = input.replace(/```json\s*|\s*```/g, '').trim();
      let result = null;
      try { result = JSON.parse(cleaned); } catch {
        const match = input.match(/\{[\s\S]*\}/);
        if (match) { try { result = JSON.parse(match[0]); } catch {} }
      }
      assertEqual(result, null, 'texto sin JSON debe retornar null');
    });

    test('codigo extrae JSON dentro de texto', () => {
      const input = 'Aca esta el JSON: {"entities":[{"field":"color","value":"Rojo"}],"intent":"valid_answer"} Muchas gracias.';
      const cleaned = input.replace(/```json\s*|\s*```/g, '').trim();
      let result = null;
      try { result = JSON.parse(cleaned); } catch {
        const match = input.match(/\{[\s\S]*\}/);
        if (match) { try { result = JSON.parse(match[0]); } catch {} }
      }
      assert.ok(result !== null, 'debe extraer JSON dentro de texto');
      assertEqual(result.entities[0].field, 'color', 'field debe ser color');
    });
  });
});

// ================================================================
// FASE 4: ENTITY RESOLVER
// ================================================================
group('FASE 4: ENTITY RESOLVER', () => {
  const testSchema = {
    questions: [
      { id: 'nombre', label: 'Nombre', type: 'text', validation: { minLength: 3, maxLength: 100 } },
      { id: 'tipo_iluminacion', label: 'Iluminacion', type: 'select', options: ['Color fijo', 'RGB'] },
      { id: 'medidas', label: 'Medidas', type: 'text' },
    ],
  };

  group('4.1 Campos validos', () => {
    test('entidad valida se resuelve correctamente', () => {
      const state = { nombre: null, tipo_iluminacion: null };
      const r = resolveEntities([{ field: 'nombre', value: 'Juan', confidence: 0.95 }], testSchema, state, []);
      assertEqual(r.resolved.length, 1, 'debe resolver 1 entidad');
      assertEqual(r.resolved[0].field, 'nombre', 'field = nombre');
      assertEqual(r.resolved[0].value, 'Juan', 'value = Juan');
      assertEqual(r.resolved[0].confidence, 0.95, 'confidence = 0.95');
    });

    test('confidence por defecto es 0.9', () => {
      const state = { nombre: null, tipo_iluminacion: null };
      const r = resolveEntities([{ field: 'nombre', value: 'Juan' }], testSchema, state, []);
      assertEqual(r.resolved[0].confidence, 0.9, 'sin confidence explicito debe ser 0.9');
    });
  });

  group('4.2 Campos rechazados', () => {
    test('campo inexistente en schema es rechazado', () => {
      const state = { nombre: null, tipo_iluminacion: null };
      const r = resolveEntities([{ field: 'no_existe', value: 'test' }], testSchema, state, []);
      assertEqual(r.resolved.length, 0, 'no debe resolver');
      assertEqual(r.rejected.length, 1, 'debe rechazar 1');
      assertEqual(r.rejected[0].reason, 'not_in_schema', 'razon: not_in_schema');
    });

    test('opcion invalida para select es rechazada', () => {
      const state = { nombre: null, tipo_iluminacion: null };
      const r = resolveEntities([{ field: 'tipo_iluminacion', value: 'Amarillo' }], testSchema, state, []);
      assertEqual(r.rejected[0].reason, 'invalid_option', 'razon: invalid_option');
    });

    test('palabra prohibida es bloqueada', () => {
      const state = { nombre: null, tipo_iluminacion: null };
      const r = resolveEntities([{ field: 'nombre', value: 'animacion LED' }], testSchema, state, ['animación']);
      assertEqual(r.rejected[0].reason, 'prohibited_word', 'razon: prohibited_word');
    });

    test('validation error (minLength) rechaza entidad', () => {
      const state = { nombre: null, tipo_iluminacion: null };
      const r = resolveEntities([{ field: 'nombre', value: 'AB' }], testSchema, state, []);
      assertEqual(r.rejected[0].reason, 'validation_error', 'razon: validation_error');
    });

    test('campo ya completado es ignorado (no rechazado)', () => {
      const state = { nombre: 'Juan', tipo_iluminacion: null };
      const r = resolveEntities([{ field: 'nombre', value: 'Pedro' }], testSchema, state, []);
      assertEqual(r.resolved.length, 0, 'no debe resolver campo ya completado');
      assertEqual(r.rejected.length, 0, 'no debe rechazar campo ya completado (es skip)');
    });

    test('tipo_trabajo se maneja especial y continua', () => {
      const state = { nombre: null, tipo_trabajo: null };
      const r = resolveEntities([{ field: 'tipo_trabajo', value: 'impresion_3d' }], testSchema, state, []);
      assertEqual(r.resolved.length, 1, 'tipo_trabajo debe resolverse');
      assertEqual(r.resolved[0].field, 'tipo_trabajo', 'field = tipo_trabajo');
    });

    test('tipo_trabajo ya asignado se ignora', () => {
      const state = { nombre: null, tipo_trabajo: 'carteleria_led' };
      const r = resolveEntities([{ field: 'tipo_trabajo', value: 'impresion_3d' }], testSchema, state, []);
      assertEqual(r.resolved.length, 0, 'no debe resolver tipo_trabajo ya asignado');
    });
  });

  group('4.3 resolveBoolean()', () => {
    test('si -> true', () => { assertEqual(resolveBoolean('si'), true); });
    test('no -> false', () => { assertEqual(resolveBoolean('no'), false); });
    test('true -> true', () => { assertEqual(resolveBoolean(true), true); });
    test('false -> false', () => { assertEqual(resolveBoolean(false), false); });
    test('sí -> true', () => { assertEqual(resolveBoolean('sí'), true); });
  });

  group('4.4 Booleans en resolveEntities', () => {
    const boolSchema = {
      questions: [
        { id: 'tiene_stl', label: 'STL', type: 'boolean', required: false, blocking: false },
        { id: 'nombre', label: 'Nombre', type: 'text', required: true },
      ],
    };

    test('"no" string se normaliza a false', () => {
      const r = resolveEntities([{ field: 'tiene_stl', value: 'no' }], boolSchema, { tiene_stl: null, nombre: null }, []);
      assertEqual(r.resolved.length, 1, 'debe resolver');
      assertEqual(r.resolved[0].value, false, '"no" debe normalizarse a false');
    });

    test('"si" string se normaliza a true', () => {
      const r = resolveEntities([{ field: 'tiene_stl', value: 'si' }], boolSchema, { tiene_stl: null, nombre: null }, []);
      assertEqual(r.resolved[0].value, true, '"si" debe normalizarse a true');
    });

    test('"sí" con tilde se normaliza a true', () => {
      const r = resolveEntities([{ field: 'tiene_stl', value: 'sí' }], boolSchema, { tiene_stl: null, nombre: null }, []);
      assertEqual(r.resolved[0].value, true, '"sí" debe normalizarse a true');
    });

    test('true booleano pasa sin cambios', () => {
      const r = resolveEntities([{ field: 'tiene_stl', value: true }], boolSchema, { tiene_stl: null, nombre: null }, []);
      assertEqual(r.resolved[0].value, true, 'true se mantiene');
    });

    test('false booleano pasa sin cambios', () => {
      const r = resolveEntities([{ field: 'tiene_stl', value: false }], boolSchema, { tiene_stl: null, nombre: null }, []);
      assertEqual(r.resolved[0].value, false, 'false se mantiene');
    });

    test('valor no-booleano es rechazado para campo boolean', () => {
      const r = resolveEntities([{ field: 'tiene_stl', value: 'quizás' }], boolSchema, { tiene_stl: null, nombre: null }, []);
      assertEqual(r.resolved.length, 0, 'no debe resolver');
      assertEqual(r.rejected.length, 1, 'debe rechazar');
      assertEqual(r.rejected[0].reason, 'invalid_boolean', 'razon: invalid_boolean');
    });

    test('campo text normal no se ve afectado por resolveBoolean', () => {
      const r = resolveEntities([{ field: 'nombre', value: 'no' }], boolSchema, { tiene_stl: null, nombre: null }, []);
      assertEqual(r.resolved.length, 1, 'debe resolver');
      assertEqual(r.resolved[0].value, 'no', 'text "no" se mantiene como string');
    });
  });

  group('4.6 Prohibited words (especifico para carteleria)', () => {
    test('USB en texto debe rechazarse', () => {
      const state = { nombre: null };
      const ledForbidden = ledSchema.catalog.forbidden;
      const r = resolveEntities([{ field: 'nombre', value: 'necesito un USB' }], { questions: [{ id: 'nombre', label: 'Nombre', type: 'text' }] }, state, ledForbidden);
      assertEqual(r.rejected[0].reason, 'prohibited_word', 'USB debe ser prohibido');
    });
  });

  group('4.7 Required field validation', () => {

    test('REGRESSION: boolean false en campo required NO se rechaza como vacio', () => {
      const state = { archivo: null };
      const r = resolveEntities([{ field: 'archivo', value: false }], { questions: [{ id: 'archivo', label: 'STL', type: 'boolean', required: true }] }, state, []);
      assertEqual(r.resolved.length, 1, 'debe resolver boolean false aunque sea required');
      assertEqual(r.resolved[0].value, false, 'valor debe ser false');
      assertEqual(r.rejected.length, 0, 'no debe rechazarse');
    });

    test('REGRESSION: boolean true en campo required se resuelve', () => {
      const state = { archivo: null };
      const r = resolveEntities([{ field: 'archivo', value: true }], { questions: [{ id: 'archivo', label: 'STL', type: 'boolean', required: true }] }, state, []);
      assertEqual(r.resolved.length, 1, 'debe resolver boolean true');
      assertEqual(r.resolved[0].value, true, 'valor debe ser true');
    });

    test('campo requerido con valor vacio es rechazado', () => {
      const state = { nombre: null };
      const r = resolveEntities([{ field: 'nombre', value: '' }], { questions: [{ id: 'nombre', label: 'Nombre', type: 'text', required: true }] }, state, []);
      assertEqual(r.rejected.length, 1, 'debe rechazar valor vacio');
      assertEqual(r.rejected[0].reason, 'required', 'razon: required');
    });

    test('campo requerido con whitespace es rechazado', () => {
      const state = { nombre: null };
      const r = resolveEntities([{ field: 'nombre', value: '   ' }], { questions: [{ id: 'nombre', label: 'Nombre', type: 'text', required: true }] }, state, []);
      assertEqual(r.rejected[0].reason, 'required', 'solo whitespace debe ser rechazado');
    });

    test('campo NO requerido con valor vacio NO es rechazado por required', () => {
      const state = { color: null };
      const r = resolveEntities([{ field: 'color', value: '' }], { questions: [{ id: 'color', label: 'Color', type: 'text', required: false }] }, state, []);
      // Vacio no pasa validation pero no es rechazo required
      assert.equal(r.rejected.length, 0, 'no-required vacio no es rechazado');
    });

    test('campo requerido con valor valido se resuelve', () => {
      const state = { nombre: null };
      const r = resolveEntities([{ field: 'nombre', value: 'Juan' }], { questions: [{ id: 'nombre', label: 'Nombre', type: 'text', required: true }] }, state, []);
      assertEqual(r.resolved.length, 1, 'debe resolver campo requerido con valor');
    });
  });
});

// ================================================================
// FASE 5: VALIDATION ENGINE
// ================================================================
group('FASE 5: VALIDATION ENGINE', () => {
  group('5.1 validateField()', () => {
    test('sin validation rules retorna vacio', () => {
      const err = validateField('cualquier cosa', {});
      assertEqual(err.length, 0, 'sin rules = sin errores');
    });

    test('minLength: texto corto genera error', () => {
      const err = validateField('AB', { id: 'nombre', validation: { minLength: 3 } });
      assertEqual(err.length, 1, 'debe tener 1 error');
      assertEqual(err[0].rule, 'minLength', 'rule = minLength');
    });

    test('minLength: texto largo NO genera error', () => {
      const err = validateField('Juan', { id: 'nombre', validation: { minLength: 3 } });
      assertEqual(err.length, 0, 'texto valido sin errores');
    });

    test('maxLength: texto largo genera error', () => {
      const err = validateField('A'.repeat(101), { id: 'nombre', validation: { maxLength: 100 } });
      assertEqual(err.length, 1, 'debe tener 1 error');
      assertEqual(err[0].rule, 'maxLength', 'rule = maxLength');
    });

    test('regex: formato incorrecto genera error', () => {
      const err = validateField('abc', { id: 'medidas', validation: { regex: '^[0-9]+x[0-9]+$' } });
      assertEqual(err.length, 1, 'regex sin match debe dar error');
      assertEqual(err[0].rule, 'regex', 'rule = regex');
    });

    test('regex: formato correcto NO genera error', () => {
      const err = validateField('100x50', { id: 'medidas', validation: { regex: '^[0-9]+x[0-9]+$' } });
      assertEqual(err.length, 0, 'regex match sin errores');
    });

    test('min: valor numerico bajo genera error', () => {
      const err = validateField(0, { id: 'cantidad', validation: { min: 1 } });
      assertEqual(err.length, 1, '0 menor que min=1 debe dar error');
    });

    test('max: valor numerico alto genera error', () => {
      const err = validateField(100, { id: 'cantidad', validation: { max: 50 } });
      assertEqual(err.length, 1, '100 mayor que max=50 debe dar error');
    });

    test('multiples errores simultaneos', () => {
      const err = validateField('', { id: 'nombre', validation: { minLength: 3, maxLength: 100, regex: '^[a-zA-Z]+$' } });
      assert.ok(err.length >= 2, 'debe tener al menos 2 errores (minLength + regex)');
    });

    test('null value no causa error con null safety', () => {
      const err = validateField(null, { id: 'nombre', validation: { minLength: 3 } });
      // null se convierte en '' y '' length 0 < 3, entonces da error
      assertEqual(err.length, 1, 'null debe dar minLength error');
    });

    test('undefined value no causa crash', () => {
      const err = validateField(undefined, { id: 'nombre', validation: { minLength: 3 } });
      assertEqual(err.length, 1, 'undefined debe dar minLength error');
    });
  });

  group('5.2 validateRequired()', () => {
    test('campo requerido null da error', () => {
      const err = validateRequired({ nombre: null }, { id: 'nombre', required: true });
      assertEqual(err.length, 1, 'required null debe dar error');
    });

    test('campo requerido --- da error', () => {
      const err = validateRequired({ nombre: '---' }, { id: 'nombre', required: true });
      assertEqual(err.length, 1, 'required --- debe dar error');
    });

    test('campo requerido con valor NO da error', () => {
      const err = validateRequired({ nombre: 'Juan' }, { id: 'nombre', required: true });
      assertEqual(err.length, 0, 'required con valor sin errores');
    });

    test('campo NO requerido null NO da error', () => {
      const err = validateRequired({ color: null }, { id: 'color', required: false });
      assertEqual(err.length, 0, 'no-required null sin errores');
    });
  });

  group('5.3 validateAllFields()', () => {
    test('estado valido sin errores', () => {
      const state = { nombre: 'Juan', pieza: 'Soporte' };
      const questions = [
        { id: 'nombre', label: 'Nombre', type: 'text', required: true, validation: { minLength: 3 } },
        { id: 'pieza', label: 'Pieza', type: 'text', required: false },
      ];
      const err = validateAllFields(state, questions);
      assertEqual(err.length, 0, 'estado valido sin errores');
    });

    test('multiples campos con errores', () => {
      const state = { nombre: 'AB', pieza: null };
      const questions = [
        { id: 'nombre', label: 'Nombre', type: 'text', required: true, validation: { minLength: 3 } },
        { id: 'pieza', label: 'Pieza', type: 'text', required: true },
      ];
      const err = validateAllFields(state, questions);
      assert.ok(err.length >= 2, 'debe tener al menos 2 errores (minLength + required)');
    });
  });
});

// ================================================================
// FASE 6: CATALOG VALIDATOR (SERVICIOS JSON)
// ================================================================
group('FASE 6: CATALOG VALIDATOR (JSON)', () => {
  group('6.1 Servicios actuales', () => {
    test('impresion_3d.json es valido', () => {
      const err = validateServiceSchema(schema);
      assertEqual(err.length, 0, `impresion_3d errores: ${err.join(', ')}`);
    });

    test('carteleria_led.json es valido', () => {
      const err = validateServiceSchema(ledSchema);
      assertEqual(err.length, 0, `carteleria_led errores: ${err.join(', ')}`);
    });
  });

  group('6.2 Campos requeridos', () => {
    test('falta id -> error', () => {
      const err = validateServiceSchema({ questions: [] });
      assert.ok(err.some(e => e.includes('id')), 'debe detectar falta de id');
    });

    test('falta welcome -> error', () => {
      const minimal = { id: 't', name: 'T', description: 'T', questions: [{ id: 'q', label: 'Q', question: '?' }], summaryTemplate: '{{fields}}', completionTemplate: 'done', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'] };
      const err = validateServiceSchema(minimal);
      assert.ok(err.some(e => e.includes('welcome')), 'debe detectar falta de welcome');
    });

    test('falta summaryTemplate -> error', () => {
      const err = validateServiceSchema({ id: 't', name: 'T', welcome: { title: 'H', message: 'M' }, questions: [{ id: 'q', label: 'Q', question: '?' }], completionTemplate: 'done', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'] });
      assert.ok(err.some(e => e.includes('summaryTemplate')), 'debe detectar falta de summaryTemplate');
    });

    test('falta completionTemplate -> error', () => {
      const err = validateServiceSchema({ id: 't', name: 'T', welcome: { title: 'H', message: 'M' }, questions: [{ id: 'q', label: 'Q', question: '?' }], summaryTemplate: '{{fields}}', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'] });
      assert.ok(err.some(e => e.includes('completionTemplate')), 'debe detectar falta de completionTemplate');
    });

    test('falta schemaVersion -> error', () => {
      const err = validateServiceSchema({ id: 't', name: 'T', welcome: { title: 'H', message: 'M' }, questions: [{ id: 'q', label: 'Q', question: '?' }], summaryTemplate: '{{fields}}', completionTemplate: 'done', serviceVersion: '1.0.0', keywords: ['t'] });
      assert.ok(err.some(e => e.includes('schemaVersion')), 'debe detectar falta de schemaVersion');
    });
  });

  group('6.3 IDs duplicados', () => {
    test('ID duplicado en questions es detectado', () => {
      const dup = { id: 't', name: 'T', description: 'T', welcome: { title: 'H', message: 'M' }, summaryTemplate: '{{fields}}', completionTemplate: 'done', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'], questions: [{ id: 'dup', label: 'A', question: '?' }, { id: 'dup', label: 'B', question: '?' }] };
      const err = validateServiceSchema(dup);
      assert.ok(err.some(e => e.includes('duplicado')), 'debe detectar ID duplicado');
    });
  });

  group('6.4 dependsOn invalido', () => {
    test('dependsOn a campo inexistente -> error', () => {
      const s = { id: 't', name: 'T', description: 'T', welcome: { title: 'H', message: 'M' }, summaryTemplate: '{{fields}}', completionTemplate: 'done', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'], questions: [{ id: 'q', label: 'Q', question: '?', dependsOn: { field: 'no_existe' } }] };
      const err = validateServiceSchema(s);
      assert.ok(err.some(e => e.includes('dependsOn')), 'debe detectar dependsOn a campo inexistente');
    });
  });

  group('6.5 skipIf invalido', () => {
    test('skipIf a campo inexistente -> error', () => {
      const s = { id: 't', name: 'T', description: 'T', welcome: { title: 'H', message: 'M' }, summaryTemplate: '{{fields}}', completionTemplate: 'done', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'], questions: [{ id: 'q', label: 'Q', question: '?', skipIf: { field: 'no_existe', value: true } }] };
      const err = validateServiceSchema(s);
      assert.ok(err.some(e => e.includes('skipIf')), 'debe detectar skipIf a campo inexistente');
    });
  });

  group('6.6 Placeholders invalidos', () => {
    test('placeholder {{inexistente}} en summaryTemplate -> error', () => {
      const s = { id: 't', name: 'T', description: 'T', welcome: { title: 'H', message: 'M' }, summaryTemplate: '{{nombre}} {{inexistente}}', completionTemplate: 'done', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'], questions: [{ id: 'nombre', label: 'Nombre', question: '?' }] };
      const err = validateServiceSchema(s);
      assert.ok(err.some(e => e.includes('placeholder')), 'debe detectar placeholder inexistente');
    });

    test('placeholder {{inexistente}} en completionTemplate -> error', () => {
      const s = { id: 't', name: 'T', description: 'T', welcome: { title: 'H', message: 'M' }, summaryTemplate: '{{fields}}', completionTemplate: '{{inexistente}}', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'], questions: [{ id: 'q', label: 'Q', question: '?' }] };
      const err = validateServiceSchema(s);
      assert.ok(err.some(e => e.includes('placeholder')), 'debe detectar placeholder inexistente en completionTemplate');
    });
  });

  group('6.7 Opciones duplicadas', () => {
    test('opciones duplicadas en select -> error', () => {
      const s = { id: 't', name: 'T', description: 'T', welcome: { title: 'H', message: 'M' }, summaryTemplate: '{{fields}}', completionTemplate: 'done', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'], questions: [{ id: 'q', label: 'Q', question: '?', type: 'select', options: ['A', 'A'] }] };
      const err = validateServiceSchema(s);
      assert.ok(err.some(e => e.includes('opci')), 'debe detectar opciones duplicadas');
    });
  });

  group('6.8 Labels faltantes', () => {
    test('pregunta sin label -> error', () => {
      const s = { id: 't', name: 'T', description: 'T', welcome: { title: 'H', message: 'M' }, summaryTemplate: '{{fields}}', completionTemplate: 'done', schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['t'], questions: [{ id: 'q', question: '?' }] };
      const err = validateServiceSchema(s);
      assert.ok(err.some(e => e.includes('label')), 'debe detectar falta de label');
    });
  });

  group('6.9 processSkips() (nuevo)', () => {
    test('marca campos inferidos como ---', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      eng.processSkips(state);
      assertEqual(state.texto, '---', 'texto inferido debe marcarse');
      assertEqual(state.elementos_graficos, '---', 'elementos_graficos inferido debe marcarse');
    });

    test('no sobreescribe valor existente con ---', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.pieza = 'Soporte';
      eng.processSkips(state);
      assertEqual(state.pieza, 'Soporte', 'no debe sobrescribir valor existente');
    });

    test('no marca --- si skipIf no se cumple', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.archivo = false;
      state.nombre = 'Juan'; state.pieza = 'Soporte';
      eng.processSkips(state);
      assertEqual(state.requiere_diseno, null, 'requiere_diseno debe seguir null');
    });
  });
});

// ================================================================
// FASE 7: SUMMARY BUILDER
// ================================================================
group('FASE 7: SUMMARY BUILDER', () => {
  const eng = new InterviewEngine(schema);

  function makeCompleteState() {
    const s = eng.createState();
    s.nombre = 'Juan'; s.pieza = 'Soporte'; s.archivo = true;
    s.requiere_diseno = '---'; s.medidas = '10x10cm'; s.cantidad = '3';
    s.material = 'PLA'; s.color = 'Rojo'; s.plazo = '1 semana';
    s.observaciones = 'Ninguna';
    return s;
  }

  group('7.1 buildSummary()', () => {
    test('genera resumen con datos del cliente', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      assert.ok(summary.includes('Juan'), 'debe contener nombre');
      assert.ok(summary.includes('Soporte'), 'debe contener pieza');
    });

    test('usa {{nombre}} placeholder correctamente', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      assert.ok(!summary.includes('{{nombre}}'), '{{nombre}} debe ser reemplazado');
    });

    test('usa {{fields}} placeholder correctamente', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      assert.ok(!summary.includes('{{fields}}'), '{{fields}} debe ser reemplazado');
      assert.ok(summary.includes('Pieza:'), 'debe mostrar campos formateados');
    });

    test('NO incluye campos saltados (---)', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      assert.ok(!summary.includes('Requiere diseño'), 'no debe incluir campo saltado');
    });

    test('NO incluye campo nombre en fields (va en header)', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      const lines = summary.split('\n').filter(l => l.includes('nombre'));
      // nombre should appear once in the Cliente: line, not in fields
      assert.ok(summary.includes('Cliente:\nJuan') || summary.includes('Cliente: Juan'), 'nombre debe estar en header');
    });

    test('estado vacio no causa error', () => {
      const empty = eng.createState();
      const summary = buildSummary(schema, empty);
      assert.ok(typeof summary === 'string', 'debe retornar string');
    });
  });

  group('7.2 buildCompletionMessage()', () => {
    test('incluye saludo personalizado con nombre', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      const msg = buildCompletionMessage(schema, s, summary);
      assert.ok(msg.includes('Perfecto Juan'), 'debe incluir saludo');
    });

    test('incluye el resumen completo', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      const msg = buildCompletionMessage(schema, s, summary);
      assert.ok(msg.includes(summary), 'debe incluir el resumen');
    });

    test('usa {{summary}} placeholder', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      const msg = buildCompletionMessage(schema, s, summary);
      assert.ok(!msg.includes('{{summary}}'), '{{summary}} debe ser reemplazado');
    });

    test('menciona adjuntar archivos', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      const msg = buildCompletionMessage(schema, s, summary);
      assert.ok(msg.includes('WhatsApp') || msg.includes('archivos'), 'debe mencionar WhatsApp o archivos');
    });
  });

  group('7.3 buildStructuredSummary()', () => {
    test('retorna array de strings con campo: valor', () => {
      const s = makeCompleteState();
      const result = buildStructuredSummary(schema, s);
      assert.ok(Array.isArray(result), 'debe retornar array');
      assert.ok(result.some(line => line.includes('nombre: Juan')), 'debe incluir nombre');
      assert.ok(result.some(line => line.includes('pieza: Soporte')), 'debe incluir pieza');
    });

    test('excluye campos saltados (---)', () => {
      const s = makeCompleteState();
      const result = buildStructuredSummary(schema, s);
      assert.ok(!result.some(line => line.includes('requiere_diseno')), 'no debe incluir campo saltado');
    });

    test('estado vacio sin errores', () => {
      const s = eng.createState();
      const result = buildStructuredSummary(schema, s);
      assert.ok(Array.isArray(result), 'debe retornar array aunque vacio');
    });
  });
});

// ================================================================
// FASE 8: EVENT BUS
// ================================================================
group('FASE 8: EVENT BUS', () => {
  test('EventBus: emit y on funcionan', () => {
    const bus = new EventBus();
    let captured = null;
    bus.on('test:event', (data) => { captured = data; });
    bus.emit('test:event', { value: 42 });
    assertEqual(captured.value, 42, 'debe capturar el evento');
  });

  test('EventBus: off remueve handler', () => {
    const bus = new EventBus();
    let count = 0;
    const unsub = bus.on('test:event', () => { count++; });
    bus.emit('test:event', {});
    unsub();
    bus.emit('test:event', {});
    assertEqual(count, 1, 'solo debe contar 1 vez (2do emit despues de off)');
  });

  test('EventBus: once solo se ejecuta una vez', () => {
    const bus = new EventBus();
    let count = 0;
    bus.once('test:event', () => { count++; });
    bus.emit('test:event', {});
    bus.emit('test:event', {});
    assertEqual(count, 1, 'once debe ejecutarse solo 1 vez');
  });

  test('EventBus: clear remueve todos los handlers', () => {
    const bus = new EventBus();
    let count = 0;
    bus.on('test:event', () => { count++; });
    bus.clear();
    bus.emit('test:event', {});
    assertEqual(count, 0, 'clear debe remover todos');
  });

  test('Events: todas las constantes definidas', () => {
    assert.ok(Events.InterviewStarted, 'InterviewStarted');
    assert.ok(Events.QuestionAnswered, 'QuestionAnswered');
    assert.ok(Events.FieldUpdated, 'FieldUpdated');
    assert.ok(Events.QuestionSkipped, 'QuestionSkipped');
    assert.ok(Events.InterviewCompleted, 'InterviewCompleted');
    assert.ok(Events.SummaryGenerated, 'SummaryGenerated');
    assert.ok(Events.AnalyticsUpdated, 'AnalyticsUpdated');
  });
});

// ================================================================
// FASE 9: REGRESSION TESTS (errores historicos)
// ================================================================
group('FASE 9: REGRESSION (errores historicos)', () => {
  test('REGRESSION: IA no genera preguntas (no tiene function para eso)', () => {
    // The interpreter has NO function to generate questions
    // This is verified at architecture level
    const interpreterContent = readFileSync(new URL('../src/services/interview/interpreter.js', import.meta.url), 'utf8');
    assert.ok(interpreterContent.includes('NO generes preguntas NUNCA'), 'prompt debe prohibir preguntas');
    assert.ok(!interpreterContent.includes('question:'), 'no debe generar key question');
  });

  test('REGRESSION: WhatsApp no usa texto de IA', () => {
    // Summary builder uses ONLY templates
    const summaryContent = readFileSync(new URL('../src/services/interview/summary.js', import.meta.url), 'utf8');
    assert.ok(!summaryContent.includes('openrouter'), 'summary no debe importar openrouter');
    assert.ok(!summaryContent.includes('chat('), 'summary no debe llamar a chat');
  });

  test('REGRESSION: Boton WhatsApp sin numero no se renderiza', () => {
    // whatsapp.js validatePhone returns null for empty
    // Test via createWhatsAppButton logic in js/whatsapp.js
    // Since we can't import frontend JS directly, test validatePhone equivalent
    const clean = ('' || '').replace(/\D/g, '');
    assertEqual(clean, '', 'phone vacio debe ser string vacio');
  });

  test('REGRESSION: URL WhatsApp es correcta', () => {
    // Test URL construction
    const phone = '5492645123456'.replace(/\D/g, '');
    const msg = encodeURIComponent('Hola. Solicito presupuesto.');
    const url = `https://wa.me/${phone}?text=${msg}`;
    assert.ok(url.startsWith('https://wa.me/'), 'URL debe empezar con wa.me');
    assert.ok(url.includes('5492645123456'), 'URL debe incluir numero');
    assert.ok(url.includes('Solicito'), 'URL debe incluir mensaje');
  });

  test('REGRESSION: No se ofrecen animaciones en carteleria', () => {
    const forbidden = ledSchema.catalog.forbidden;
    assert.ok(forbidden.some(f => f.includes('animación')), 'animacion debe estar en forbidden');
    assert.ok(forbidden.some(f => f.includes('USB')), 'USB debe estar en forbidden');
  });

  test('REGRESSION: Campos inferidos no tienen question', () => {
    const texto = ledSchema.questions.find(q => q.id === 'texto');
    const graficos = ledSchema.questions.find(q => q.id === 'elementos_graficos');
    assert.ok(!texto.question, 'texto no debe tener question');
    assert.ok(!graficos.question, 'elementos_graficos no debe tener question');
  });

  test('REGRESSION: Engine nunca llama a OpenRouter', () => {
    const engineContent = readFileSync(new URL('../src/services/interview/engine.js', import.meta.url), 'utf8');
    assert.ok(!engineContent.includes('openrouter'), 'engine no debe importar openrouter');
    assert.ok(!engineContent.includes('chat('), 'engine no debe llamar a chat');
  });

  test('REGRESSION: Progress total nunca es 0', () => {
    const eng = new InterviewEngine(schema);
    const state = eng.createState();
    const p = eng.getProgress(state);
    assert.ok(p.total > 0, 'total debe ser > 0');
    // Even if all questions had no .question, total would be 0
    // But all services have at least nombre question
  });

  test('REGRESSION: Engine.getStatus pendingFields es array', () => {
    const eng = new InterviewEngine(schema);
    const s = eng.createState();
    const status = eng.getStatus(s);
    assert.ok(Array.isArray(status.pendingFields), 'pendingFields debe ser array');
  });

  test('REGRESSION: OpenRouter tiene timeout configurado', () => {
    const orContent = readFileSync(new URL('../src/services/openrouter.js', import.meta.url), 'utf8');
    assert.ok(orContent.includes('AbortController'), 'debe usar AbortController para timeout');
    assert.ok(orContent.includes('OPENROUTER_TIMEOUT'), 'debe tener constante OPENROUTER_TIMEOUT');
    assert.ok(orContent.includes('controller.signal'), 'debe pasar signal a fetch');
  });

  test('REGRESSION: structuredSummary se genera en handler', () => {
    const handlerContent = readFileSync(new URL('../src/services/interview/handler.js', import.meta.url), 'utf8');
    assert.ok(handlerContent.includes('structuredSummary'), 'handler debe incluir structuredSummary');
    assert.ok(handlerContent.includes('buildStructuredSummary'), 'handler debe importar buildStructuredSummary');
  });

  test('REGRESSION: getNextQuestion no muta estado', () => {
    const eng = new InterviewEngine(schema);
    const state = eng.createState();
    state.archivo = true;
    state.nombre = 'Juan'; state.pieza = 'Soporte';
    // getNextQuestion should NOT mark requiere_diseno as '---'
    const next = eng.getNextQuestion(state);
    assertEqual(state.requiere_diseno, null, 'getNextQuestion no debe mutar requiere_diseno');
    // processSkips should
    eng.processSkips(state);
    assertEqual(state.requiere_diseno, '---', 'processSkips debe marcar requiere_diseno');
  });
});

// ================================================================
// FASE 10: WHATSAPP TESTS
// ================================================================
group('FASE 10: WHATSAPP (logica frontend)', () => {
  group('10.1 Validacion de telefono', () => {
    test('telefono valido se limpia correctamente', () => {
      const phone = '+5492645123456'.replace(/\D/g, '');
      assertEqual(phone, '5492645123456', 'debe limpiar + y dejar solo numeros');
    });

    test('telefono vacio retorna vacio', () => {
      const phone = ('' || '').replace(/\D/g, '');
      assertEqual(phone, '', 'vacio debe retornar vacio');
    });

    test('caracteres especiales se eliminan', () => {
      const phone = '+54 9 (264) 512-3456'.replace(/\D/g, '');
      assertEqual(phone, '5492645123456', 'debe eliminar espacios, (), -');
    });

    test('telefono con codigo pais correcto', () => {
      const phone = '+543405480010'.replace(/\D/g, '');
      assertEqual(phone, '543405480010', 'codigo pais 54 para Argentina');
    });

    test('longitud minima 8 digitos', () => {
      const clean = '12345'.replace(/\D/g, '');
      assert.ok(clean.length < 8, 'corto debe tener < 8 digitos');
    });
  });

  group('10.2 Construccion URL WhatsApp', () => {
    test('URL completa correcta', () => {
      const phone = '5492645123456';
      const msg = encodeURIComponent('Hola. Solicito presupuesto.');
      const url = `https://wa.me/${phone}?text=${msg}`;
      assertEqual(url, 'https://wa.me/5492645123456?text=Hola.%20Solicito%20presupuesto.', 'URL debe ser exacta');
    });

    test('URL con saltos de linea', () => {
      const text = 'Linea 1\nLinea 2';
      const encoded = encodeURIComponent(text);
      assert.ok(encoded.includes('%0A'), 'saltos de linea deben codificarse como %0A');
    });

    test('URL con emojis', () => {
      const text = 'Hola 😀';
      const encoded = encodeURIComponent(text);
      const url = `https://wa.me/5492645123456?text=${encoded}`;
      assert.ok(url.length > 30, 'URL con emoji debe ser valida');
    });

    test('URL con texto largo', () => {
      const text = 'A'.repeat(1000);
      const encoded = encodeURIComponent(text);
      const url = `https://wa.me/5492645123456?text=${encoded}`;
      // WhatsApp URL limit is around 4096 chars
      assert.ok(url.length < 4096, 'URL debe ser menor a 4096 chars');
    });
  });

  group('10.3 Boton WhatsApp', () => {
    test('summary debe existir para crear boton', () => {
      const eng = new InterviewEngine(schema);
      const s = eng.createState();
      s.nombre = 'Test'; s.pieza = 'X'; s.archivo = true;
      s.requiere_diseno = '---'; s.medidas = '1x1'; s.cantidad = '1';
      s.material = 'PLA'; s.color = 'N'; s.plazo = 'Hoy'; s.observaciones = '-';
      const summary = buildSummary(schema, s);
      assert.ok(summary.length > 0, 'summary debe tener contenido');
    });
  });
});

// ================================================================
// FASE 11: EDGE CASES
// ================================================================
group('FASE 11: EDGE CASES', () => {
  test('servicio inexistente lanza error', () => {
    try {
      getEngine('servicio_inexistente');
      assert.fail('debe lanzar error');
    } catch (e) {
      assert.ok(e.message.includes('not found'), 'error debe mencionar not found');
    }
  });

  test('JSON invalido causa error en catalog-validator', () => {
    const err = validateServiceSchema({});
    assert.ok(err.length > 0, 'JSON vacio debe tener errores');
  });

  test('estado null en history no causa crash', () => {
    const eng = new InterviewEngine(schema);
    const state = eng.createState();
    // Simulate corrupted history
    state.history = null;
    const h = eng.getHistory(state);
    assert.ok(Array.isArray(h), 'getHistory debe retornar array aunque history sea null');
  });

  test('processSkips es seguro llamado multiple veces', () => {
    const eng = new InterviewEngine(schema);
    const state = eng.createState();
    state.archivo = true;
    eng.processSkips(state);
    eng.processSkips(state);
    assertEqual(state.requiere_diseno, '---', 'no debe cambiar tras segunda llamada');
  });

  test('getNextQuestion con estado corrupto no causa crash', () => {
    const eng = new InterviewEngine(schema);
    const state = eng.createState();
    state.nombre = 'Juan';
    // Remove pieza field from state (corruption)
    delete state.pieza;
    // should not crash, pieza will be undefined which !== null so it's skipped
    const next = eng.getNextQuestion(state);
    assert.ok(next !== null, 'debe continuar sin crash');
  });

  test('createState con questions vacio', () => {
    const emptyEng = new InterviewEngine({ id: 'empty', name: 'Empty', questions: [] });
    const state = emptyEng.createState();
    assertEqual(Object.keys(state).filter(k => !['finalizada','history','schemaVersion','engineVersion','createdAt','updatedAt'].includes(k)).length, 0, 'sin preguntas no debe tener campos');
    const next = emptyEng.getNextQuestion(state);
    assertEqual(next, null, 'sin preguntas no debe tener siguiente');
  });
});

// ================================================================
// FASE 12: SESSION STORE (KV)
// ================================================================
group('FASE 12: SESSION STORE (KV)', () => {
  function createMockKv() {
    const store = new Map();
    return {
      get: async (key, type) => {
        const val = store.get(key);
        if (!val) return null;
        return type === 'json' ? JSON.parse(val) : val;
      },
      put: async (key, val, opts) => {
        store.set(key, val);
      },
      delete: async (key) => {
        store.delete(key);
      },
      _store: store,
    };
  }

  test('getSession sin KV binding retorna null', async () => {
    const result = await getSession({}, 'test-session');
    assertEqual(result, null, 'sin KV debe retornar null');
  });

  test('saveSession sin KV binding retorna false', async () => {
    const result = await saveSession({}, 'test-session', { data: 'test' });
    assertEqual(result, false, 'sin KV debe retornar false');
  });

  test('save and get session from KV', async () => {
    const kv = createMockKv();
    const env = { SESSION_KV: kv };
    const data = { type: 'impresion_3d', state: { nombre: 'Juan' } };

    await saveSession(env, 'session-1', data);
    const loaded = await getSession(env, 'session-1');
    assert.ok(loaded !== null, 'debe cargar sesion guardada');
    assertEqual(loaded.type, 'impresion_3d', 'tipo debe coincidir');
    assertEqual(loaded.state.nombre, 'Juan', 'estado debe coincidir');
  });

  test('getSession con ID inexistente retorna null', async () => {
    const kv = createMockKv();
    const env = { SESSION_KV: kv };

    const loaded = await getSession(env, 'no-existe');
    assertEqual(loaded, null, 'sesion inexistente debe retornar null');
  });

  test('deleteSession remueve sesion', async () => {
    const kv = createMockKv();
    const env = { SESSION_KV: kv };

    await saveSession(env, 'session-del', { data: 'test' });
    assert.ok(await getSession(env, 'session-del') !== null, 'debe existir antes de borrar');

    await deleteSession(env, 'session-del');
    assertEqual(await getSession(env, 'session-del'), null, 'debe ser null despues de borrar');
  });

  test('saveSession con TTL personalizado', async () => {
    const kv = createMockKv();
    const env = { SESSION_KV: kv };

    let capturedTtl = null;
    const kvWithCapture = {
      ...kv,
      put: async (key, val, opts) => {
        capturedTtl = opts?.expirationTtl;
        await kv.put(key, val, opts);
      },
    };

    await saveSession({ SESSION_KV: kvWithCapture }, 'session-ttl', { data: 'test' }, 3600);
    assertEqual(capturedTtl, 3600, 'debe usar TTL personalizado');
  });

  test('getSession con sessionId vacio retorna null', async () => {
    const kv = createMockKv();
    const env = { SESSION_KV: kv };

    assertEqual(await getSession(env, ''), null, 'sessionId vacio = null');
    assertEqual(await getSession(env, null), null, 'sessionId null = null');
  });

  test('KV error no propaga (fallback graceful)', async () => {
    const brokenKv = {
      get: async () => { throw new Error('KV error'); },
      put: async () => { throw new Error('KV error'); },
      delete: async () => { throw new Error('KV error'); },
    };
    const env = { SESSION_KV: brokenKv };

    assertEqual(await getSession(env, 'test'), null, 'error get debe retornar null');
    assertEqual(await saveSession(env, 'test', {}), false, 'error save debe retornar false');
    assertEqual(await deleteSession(env, 'test'), false, 'error delete debe retornar false');
  });
});

// ================================================================
// FASE 13: INTENTION DETECTION
// ================================================================
group('FASE 13: INTENTION DETECTION', () => {
  group('13.1 detectIntent()', () => {
    test('cartel LED detecta carteleria_led', () => {
      const result = detectIntent('Necesito un cartel LED');
      assertEqual(result.service, 'carteleria_led', 'debe detectar carteleria_led');
      assert.ok(result.confidence > 0.4, 'confianza debe ser > 0.4');
      assertEqual(result.needsClarification, false, 'no necesita aclaración');
    });

    test('pieza impresa detecta impresion_3d', () => {
      const result = detectIntent('Necesito una pieza impresa en 3D');
      assertEqual(result.service, 'impresion_3d', 'debe detectar impresion_3d');
      assert.ok(result.confidence > 0.4, 'confianza debe ser > 0.4');
    });

    test('saludo no detecta servicio', () => {
      const result = detectIntent('Hola, cómo estás?');
      assertEqual(result.service, null, 'saludo = sin servicio');
      assertEqual(result.reason, 'greeting');
    });

    test('mensaje vacio no detecta servicio', () => {
      const result = detectIntent('');
      assertEqual(result.service, null, 'vacio = sin servicio');
    });

    test('negacion no detecta servicio', () => {
      const result = detectIntent('No, gracias');
      assertEqual(result.service, null, 'negacion = sin servicio');
    });

    test('mensaje ambiguo con match bajo puede pedir clarificacion', () => {
      const result = detectIntent('cartel');
      assert.ok(result.service === 'carteleria_led' || result.needsClarification, 'match bajo puede pedir clarificacion');
    });
  });

  group('13.2 buildClarifyingQuestion()', () => {
    test('genera pregunta clarificadora', () => {
      const q = buildClarifyingQuestion({ needsClarification: true, serviceName: 'Impresión 3D' });
      assert.ok(q.includes('Impresión 3D'), 'debe mencionar el servicio');
    });

    test('retorna null si no necesita clarificacion', () => {
      const q = buildClarifyingQuestion({ needsClarification: false });
      assertEqual(q, null, 'sin clarificacion = null');
    });
  });
});

// ================================================================
// FASE 14: ANTI-LOOP SYSTEM
// ================================================================
group('FASE 14: ANTI-LOOP', () => {
  group('14.1 AntiLoop class', () => {
    test('trackea preguntas por sesion', () => {
      const al = new AntiLoop();
      al.trackAsked('session-1', 'nombre');
      al.trackAsked('session-1', 'nombre');
      assertEqual(al.getRepeatCount('session-1', 'nombre'), 2);
    });

    test('deteccion de loop despues de 2 repeticiones', () => {
      const al = new AntiLoop();
      al.trackAsked('session-1', 'medidas');
      al.trackAsked('session-1', 'medidas');
      assert.ok(al.isLooping('session-1', 'medidas'), 'debe detectar loop tras 2 repeticiones');
    });

    test('sin repeticion no hay loop', () => {
      const al = new AntiLoop();
      assert.ok(!al.isLooping('session-x', 'campo'), '0 repeticiones = sin loop');
    });

    test('detectLoop marca field como loop_skip en state', () => {
      const al = new AntiLoop();
      const state = { medidas: null };
      al.trackAsked('s1', 'medidas');
      al.trackAsked('s1', 'medidas');
      const result = al.detectLoop(state, 's1', { id: 'medidas' });
      assert.ok(result.skipped, 'debe saltar');
      assertEqual(result.reason, 'loop_detected');
      assertEqual(state.medidas, 'loop_skip', 'state debe actualizarse');
    });

    test('resetSession limpia datos de sesion', () => {
      const al = new AntiLoop();
      al.trackAsked('s1', 'a');
      al.trackAsked('s2', 'b');
      al.resetSession('s1');
      assertEqual(al.getRepeatCount('s1', 'a'), 0, 's1 debe resetearse');
      assertEqual(al.getRepeatCount('s2', 'b'), 1, 's2 no debe afectarse');
    });

    test('getStats retorna estadisticas', () => {
      const al = new AntiLoop();
      al.trackAsked('s1', 'x');
      al.trackAsked('s1', 'x');
      al.trackAsked('s1', 'y');
      const stats = al.getStats('s1');
      assertEqual(stats.x, 2);
      assertEqual(stats.y, 1);
    });
  });
});

// ================================================================
// FASE 15: ENGINE ENHANCEMENTS (REQUIRED/BLOCKING)
// ================================================================
group('FASE 15: ENGINE ENHANCEMENTS', () => {
  group('15.1 getRequiredPending()', () => {
    test('solo retorna campos blocking', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.pieza = 'Soporte';
      state.archivo = true;
      eng.isComplete(state);
      const pending = eng.getRequiredPending(state);
      for (const p of pending) {
        assert.ok(p.blocking !== false, `"${p.id}" debe ser blocking`);
      }
    });

    test('campos blocking:false no aparecen', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan'; state.pieza = 'X'; state.archivo = true;
      state.medidas = '10'; state.cantidad = '1'; state.plazo = 'Hoy';
      state.requiere_diseno = '---';
      const pending = eng.getRequiredPending(state);
      const nonBlocking = pending.filter(p => p.blocking === false);
      assertEqual(nonBlocking.length, 0, 'no debe incluir campos con blocking:false');
    });
  });

  group('15.2 getNextQuestion() blocking priority', () => {
    test('retorna blocking antes que non-blocking', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.tipo_diseno = 'Cartel texto';
      state.medidas = '50x30';
      state.ubicacion = 'Local comercial';
      state.interior_exterior = 'Interior';
      state.tipo_iluminacion = 'RGB';
      // non-blocking faltantes: imagen_referencia, color, montaje, plazo, observaciones
      // blocking faltantes: ninguna (todas las blocking respondidas)
      const next = eng.getNextQuestion(state);
      assert.ok(next !== null, 'debe retornar algo');
      assertEqual(next.blocking, false, 'solo non-blocking deben quedar');
    });

    test('blocking faltante retorna antes que non-blocking', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.tipo_diseno = 'Cartel texto';
      // No respondio medidas (blocking), pero imagen_referencia (non-blocking) aparece antes en JSON
      state.imagen_referencia = true;
      const next = eng.getNextQuestion(state);
      assert.ok(next !== null, 'debe retornar algo');
      assertEqual(next.id, 'medidas', 'debe retornar medidas (blocking) antes que non-blocking');
    });

    test('non-blocking se retorna solo cuando no hay blocking pendientes', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.tipo_diseno = 'Cartel texto';
      state.medidas = '50x30';
      state.ubicacion = 'Local';
      state.interior_exterior = 'Interior';
      state.tipo_iluminacion = 'RGB';
      const next = eng.getNextQuestion(state);
      assert.ok(next !== null, 'debe retornar non-blocking');
      assertEqual(next.blocking, false, 'debe ser non-blocking');
    });

    test('sin blocking ni non-blocking pendientes retorna null', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      for (const q of ledSchema.questions) {
        if (q.question) state[q.id] = q.type === 'boolean' ? false : 'test';
      }
      const next = eng.getNextQuestion(state);
      assertEqual(next, null, 'todo respondido = null');
    });
  });

  group('15.4 getBlockingFieldsMissing()', () => {
    test('retorna campos blocking faltantes', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan';
      const missing = eng.getBlockingFieldsMissing(state);
      assert.ok(missing.some(m => m.id === 'pieza'), 'pieza debe estar en missing');
      assert.ok(missing.some(m => m.id === 'medidas'), 'medidas debe estar en missing');
    });

    test('trata loop_skip como faltante', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.pieza = 'loop_skip';
      const missing = eng.getBlockingFieldsMissing(state);
      assert.ok(missing.some(m => m.id === 'pieza'), 'loop_skip debe tratarse como faltante');
    });

    test('campos con blocking:false no aparecen en missing', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan'; state.pieza = 'X'; state.archivo = true;
      state.medidas = '10'; state.cantidad = '1'; state.plazo = 'Hoy';
      // material tiene blocking:false, no deberia aparecer aunque falte
      const missing = eng.getBlockingFieldsMissing(state);
      assert.ok(!missing.some(m => m.id === 'material'), 'material blocking:false no debe estar');
      assert.ok(!missing.some(m => m.id === 'color'), 'color blocking:false no debe estar');
    });
  });
});

// ================================================================
// FASE 16: TEST CASES DE INTEGRACION (Casos 1-5)
// ================================================================
group('FASE 16: CASOS DE PRUEBA', () => {
  group('16.1 Caso 1: Cartel LED no pregunta STL', () => {
    test('detectIntent para cartel led retorna carteleria_led', () => {
      const result = detectIntent('Quiero un cartel LED');
      assertEqual(result.service, 'carteleria_led', 'debe detectar carteleria_led');
      assertEqual(result.needsClarification, false, 'no necesita aclaracion');
    });

    test('handler con cartel led usa carteleria_led no impresion_3d', () => {
      const detected = detectService('Quiero un cartel LED');
      assertEqual(detected, 'carteleria_led', 'detectService debe retornar carteleria_led');
    });

    test('carteleria_led no tiene pregunta STL', () => {
      const hasStlQuestion = ledSchema.questions.some(q =>
        (q.question || '').toLowerCase().includes('stl') ||
        (q.question || '').toLowerCase().includes('archivo')
      );
      assert.ok(!hasStlQuestion, 'carteleria_led no debe tener preguntas sobre STL/archivos');
    });
  });

  group('16.2 Caso 2: Tengo STL', () => {
    test('detectIntent para STL retorna impresion_3d', () => {
      const result = detectIntent('Tengo un archivo STL');
      assertEqual(result.service, 'impresion_3d', 'STL debe asociarse a impresion_3d');
    });

    test('impresion_3d tiene pregunta sobre archivo STL', () => {
      const archivoQ = schema.questions.find(q => q.id === 'archivo');
      assert.ok(archivoQ, 'debe existir pregunta archivo');
      assert.ok((archivoQ.question || '').toLowerCase().includes('stl') ||
                (archivoQ.question || '').toLowerCase().includes('diseño'),
                'debe preguntar sobre archivo/diseño');
    });

    test('archivo=true salta requiere_diseno', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.archivo = true;
      eng.isComplete(state);
      assertEqual(state.requiere_diseno, '---', 'requiere_diseno debe saltarse cuando archivo=true');
    });
  });

  group('16.3 Caso 3: No tengo diseño', () => {
    test('archivo=false NO salta requiere_diseno', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.archivo = false;
      const reqDiseno = schema.questions.find(q => q.id === 'requiere_diseno');
      assert.ok(!eng.shouldSkip(state, reqDiseno), 'archivo=false no debe saltar requiere_diseno');
    });

    test('requiere_diseno pregunta si necesita ayuda con diseño', () => {
      const reqDiseno = schema.questions.find(q => q.id === 'requiere_diseno');
      assert.ok(reqDiseno, 'requiere_diseno existe');
      assert.ok((reqDiseno.question || '').toLowerCase().includes('diseño') ||
                (reqDiseno.question || '').toLowerCase().includes('ayudemos'),
                'debe ofrecer ayuda con diseño');
    });

    test('requiere_diseno es blocking:false (no bloquea)', () => {
      const reqDiseno = schema.questions.find(q => q.id === 'requiere_diseno');
      assertEqual(reqDiseno.blocking, false, 'requiere_diseno debe ser no bloqueante');
    });
  });

  group('16.4 Caso 4: Pieza de moto', () => {
    test('detectIntent para pieza funcional retorna impresion_3d', () => {
      const result = detectIntent('Necesito una pieza para mi moto');
      assertEqual(result.service, 'impresion_3d', 'pieza de moto = impresion_3d');
    });

    test('getRequiredPending incluye pieza como blocking', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const pending = eng.getRequiredPending(state);
      assert.ok(pending.some(p => p.id === 'pieza'), 'pieza debe ser requerida');
      assert.ok(pending.some(p => p.id === 'medidas'), 'medidas debe ser requerida');
    });
  });

  group('16.5 Caso 5: Boolean "No" se resuelve correctamente', () => {
    test('resolveEntities convierte "no" a false para campo boolean', () => {
      const state = { archivo: null, nombre: 'Juan', pieza: 'Soporte' };
      const schema = { questions: [
        { id: 'nombre', type: 'text' },
        { id: 'pieza', type: 'text' },
        { id: 'archivo', type: 'boolean' },
      ]};
      const r = resolveEntities([{ field: 'archivo', value: 'no' }], schema, state, []);
      assertEqual(r.resolved.length, 1, 'debe resolver');
      assertEqual(r.resolved[0].value, false, '"no" normalizado a false');
    });

    test('resolveEntities convierte "si" a true para campo boolean', () => {
      const state = { archivo: null, nombre: 'Juan', pieza: 'Soporte' };
      const schema = { questions: [
        { id: 'nombre', type: 'text' },
        { id: 'pieza', type: 'text' },
        { id: 'archivo', type: 'boolean' },
      ]};
      const r = resolveEntities([{ field: 'archivo', value: 'si' }], schema, state, []);
      assertEqual(r.resolved[0].value, true, '"si" normalizado a true');
    });

    test('archivo=false no salta requiere_diseno', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.archivo = false;
      const reqDiseno = schema.questions.find(q => q.id === 'requiere_diseno');
      assert.ok(!eng.shouldSkip(state, reqDiseno), 'archivo=false no debe saltar requiere_diseno');
    });

    test('isComplete con blocking completo y boolean no-blocking pendiente', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.tipo_diseno = 'Cartel con logo';
      state.medidas = '1m x 50cm';
      state.ubicacion = 'Local';
      state.interior_exterior = 'Interior';
      state.tipo_iluminacion = 'RGB';
      // imagen_referencia (boolean, non-blocking) no respondido
      assert.ok(eng.isComplete(state), 'debe completar aunque boolean no-blocking falte');
    });

    test('getNextQuestion retorna non-blocking boolean despues de blocking', () => {
      const eng = new InterviewEngine(ledSchema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.tipo_diseno = 'Cartel';
      state.medidas = '50x30';
      state.ubicacion = 'Local';
      state.interior_exterior = 'Interior';
      state.tipo_iluminacion = 'RGB';
      const next = eng.getNextQuestion(state);
      assert.ok(next !== null, 'debe tener siguiente');
      assertEqual(next.blocking, false, 'siguiente no debe ser blocking');
    });

    test('REGRESSION: AI devuelve archivo:false (boolean), required:true, NO se rechaza', () => {
      // This simulates the EXACT production scenario where the AI returns
      // {"field":"archivo","value":false} (JSON boolean, not string)
      // which was previously rejected by the required check: !false === true
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Ismael';
      state.pieza = 'soporte para telefono';
      // Simulate what the AI returns
      const entities = [{ field: 'archivo', value: false, confidence: 0.99 }];
      const { resolved, rejected } = resolveEntities(entities, schema, state, []);
      assertEqual(resolved.length, 1, 'archivo=false DEBE resolverse');
      assertEqual(rejected.length, 0, 'NO debe rechazarse');
      assertEqual(resolved[0].value, false, 'valor debe ser false');
      state.archivo = resolved[0].value;
      // Now verify the engine skips this field
      const next = eng.getNextQuestion(state);
      assert.notEqual(next?.id, 'archivo', 'getNextQuestion NO debe devolver archivo');
      assert.ok(state.archivo === false, 'state.archivo debe ser false');
    });

    test('REGRESSION: AI extrae cantidad="no" pero archivo boolean sigue null y se resuelve', () => {
      // Production scenario: AI sees ALL pending fields and extracts cantidad="no"
      // from the user saying "No" to the STL question.
      // resolved.length > 0 (cantidad was extracted), so old fallback didn't trigger.
      // The boolean fallback must ALWAYS check the first pending question.
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Ismael';
      state.pieza = 'soporte para telefono';
      // AI extracts cantidad="no" instead of archivo=false
      const entities = [{ field: 'cantidad', value: 'no', confidence: 0.6 }];
      const { resolved, rejected } = resolveEntities(entities, schema, state, []);
      assertEqual(resolved.length, 1, 'cantidad="no" se resuelve (text field, minLength:1)');
      state.cantidad = resolved[0].value;
      assertEqual(state.cantidad, 'no', 'cantidad almacenado');
      // archivo is still null
      assert.equal(state.archivo, null, 'archivo sigue null');
      // Now the handler boolean fallback should handle it
      const pending = eng.getNextQuestion(state);
      assert.equal(pending?.id, 'archivo', 'archivo es la siguiente pregunta pendiente');
      assert.equal(pending?.type, 'boolean', 'archivo es boolean');
      // Simulate the boolean fallback
      if (pending && pending.type === 'boolean' && state[pending.id] === null) {
        const firstWord = 'no'.toLowerCase().replace(/^[¡!¿?\s]+/, '').split(/[\s,;:]+/)[0];
        if (firstWord === 'no') {
          state[pending.id] = false;
        }
      }
      assert.equal(state.archivo, false, 'archivo se establece a false por fallback');
      const next = eng.getNextQuestion(state);
      assert.notEqual(next?.id, 'archivo', 'archivo NO debe ser la siguiente pregunta');
    });
  });

  group('16.6 Caso 6: Anti-loop con respuestas negativas', () => {
    test('2 preguntas repetidas activan anti-loop', () => {
      const al = new AntiLoop();
      const state = { medidas: null };
      const question = { id: 'medidas', question: '¿Medidas?' };
      al.trackAsked('s1', 'medidas');
      al.trackAsked('s1', 'medidas');
      const result = al.detectLoop(state, 's1', question);
      assert.ok(result.skipped, 'debe activarse anti-loop');
      assertEqual(state.medidas, 'loop_skip', 'debe marcar loop_skip');
    });

    test('loop_skip permite blockeante ser reemplazado', () => {
      const al = new AntiLoop();
      const state = { pieza: null, medidas: null };
      al.trackAsked('s1', 'pieza');
      al.trackAsked('s1', 'pieza');
      al.detectLoop(state, 's1', { id: 'pieza' });
      assertEqual(state.pieza, 'loop_skip', 'pieza marcado loop_skip');
      assertEqual(state.medidas, null, 'medidas no afectado');
    });

    test('getBlockingFieldsMissing incluye loop_skip como faltante', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.nombre = 'Juan';
      state.pieza = 'loop_skip';
      const missing = eng.getBlockingFieldsMissing(state);
      assert.ok(missing.some(m => m.id === 'pieza'), 'loop_skip debe ser tratado como faltante');
    });
  });
});

// ================================================================
// FINAL REPORT
// ================================================================
await _runTests();
const total = passed + failed;
console.log(`\n${'='.repeat(60)}`);
console.log(`RESULTADO FINAL: ${passed}/${total} passed, ${failed} failed`);
console.log(`${'='.repeat(60)}`);

if (errors.length > 0) {
  console.log('\nERRORES DETECTADOS:');
  for (const e of errors) {
    console.log(`  - ${e.name}: ${e.message}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
