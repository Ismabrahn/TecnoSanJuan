import { InterviewEngine } from '../src/services/interview/engine.js';
import { validateField, validateAllFields } from '../src/services/interview/validation.js';
import { validateServiceSchema } from '../src/services/interview/catalog-validator.js';
import { buildSummary, buildCompletionMessage, buildStructuredSummary } from '../src/services/interview/summary.js';
import { EventBus, Events } from '../src/services/interview/event-bus.js';
import { getEngine } from '../src/services/interview/definitions.js';
import { detectService } from '../src/services/interview/services/index.js';
import { detectIntent, buildClarifyingQuestion } from '../src/services/interview/intention.js';
import { readFileSync } from 'fs';
import { strict as assert } from 'assert';

const schemaPath = new URL('../src/services/interview/services/impresion_3d.json', import.meta.url);
const ledSchemaPath = new URL('../src/services/interview/services/carteleria_led.json', import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const ledSchema = JSON.parse(readFileSync(ledSchemaPath, 'utf8'));

let passed = 0;
let failed = 0;
const errors = [];

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
  if (actual !== expected) throw new Error(`${msg}: esperado "${expected}", recibido "${JSON.stringify(actual)}"`);
}

// ================================================================
// ENGINE (MOTOR DE ENTREVISTA)
// ================================================================
group('ENGINE: Motor de Entrevista', () => {

  group('createState()', () => {
    test('crea estado con todos los campos en pendiente', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      assertEqual(state.servicio, 'impresion_3d', 'servicio debe coincidir');
      for (const campo of schema.campos) {
        assert.ok(state.campos[campo.nombre], `campo "${campo.nombre}" existe`);
        assertEqual(state.campos[campo.nombre].valor, null, `${campo.nombre}.valor debe ser null`);
        assertEqual(state.campos[campo.nombre].estado, 'pendiente', `${campo.nombre}.estado debe ser pendiente`);
      }
    });

    test('estado inicial: no completada', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      assertEqual(state.completada, false, 'no debe estar completada');
    });

    test('incluye createdAt/updatedAt', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      assert.ok(state.createdAt, 'createdAt presente');
      assert.ok(state.updatedAt, 'updatedAt presente');
    });
  });

  group('getNextField()', () => {
    test('estado vacio retorna primer campo', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const next = eng.getNextField(state);
      assert.ok(next !== null, 'debe retornar un campo');
      assertEqual(next.nombre, schema.campos[0].nombre, 'debe retornar el primer campo');
    });

    test('retorna null cuando todo completo', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      for (const campo of schema.campos) {
        eng.markField(state, campo.nombre, campo.tipo === 'boolean' ? false : 'test');
      }
      const next = eng.getNextField(state);
      assertEqual(next, null, 'todo completo = null');
    });

    test('retorna requeridos primero, luego opcionales', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();

      // First pass: all required fields
      const requiredNames = schema.campos.filter(c => c.requerido !== false).map(c => c.nombre);
      for (const name of requiredNames) {
        assertEqual(eng.getNextField(state)?.nombre, name, `required "${name}" debe ser el siguiente`);
        eng.markField(state, name, 'test');
      }

      // Second pass: all optional fields in order
      const optionalNames = schema.campos.filter(c => c.requerido === false).map(c => c.nombre);
      for (const name of optionalNames) {
        assertEqual(eng.getNextField(state)?.nombre, name, `optional "${name}" debe ser el siguiente`);
        eng.markField(state, name, 'test');
      }

      assertEqual(eng.getNextField(state), null, 'despues de completar todos = null');
    });
  });

  group('markField()', () => {
    test('marca campo como completo con valor', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      eng.markField(state, 'nombre', 'Juan');
      assertEqual(state.campos.nombre.valor, 'Juan', 'valor almacenado');
      assertEqual(state.campos.nombre.estado, 'completo', 'estado = completo');
    });

    test('boolean false es valor valido', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      eng.markField(state, 'archivo_stl', false);
      assertEqual(state.campos.archivo_stl.valor, false, 'false almacenado');
      assertEqual(state.campos.archivo_stl.estado, 'completo', 'estado = completo');
      // After archivo_stl (optional), next should be the first required field
      const next = eng.getNextField(state);
      assert.ok(['nombre', 'pieza', 'medidas', 'cantidad'].includes(next?.nombre),
        `siguiente campo debe ser un required, got: ${next?.nombre}`);
    });

    test('boolean true es valor valido', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      eng.markField(state, 'archivo_stl', true);
      assertEqual(state.campos.archivo_stl.valor, true, 'true almacenado');
      assertEqual(state.campos.archivo_stl.estado, 'completo', 'estado = completo');
    });
  });

  group('getPendingFields()', () => {
    test('estado vacio retorna todos los campos', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const pending = eng.getPendingFields(state);
      assertEqual(pending.length, schema.campos.length, 'todos pendientes');
    });

    test('campos completados no aparecen', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      eng.markField(state, 'nombre', 'Juan');
      eng.markField(state, 'pieza', 'Soporte');
      const pending = eng.getPendingFields(state);
      assert.ok(!pending.some(p => p.nombre === 'nombre'), 'nombre no debe estar pendiente');
      assert.ok(!pending.some(p => p.nombre === 'pieza'), 'pieza no debe estar pendiente');
    });
  });

  group('getPendingRequired()', () => {
    test('solo retorna campos requeridos', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      // Complete all required fields
      for (const campo of schema.campos) {
        if (campo.requerido !== false) {
          eng.markField(state, campo.nombre, 'test');
        }
      }
      const pending = eng.getPendingRequired(state);
      assertEqual(pending.length, 0, 'no debe quedar required pendiente');
    });

    test('opcionales no aparecen en required', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const required = eng.getPendingRequired(state);
      for (const r of required) {
        assert.ok(r.requerido !== false, `"${r.nombre}" debe ser requerido`);
      }
    });
  });

  group('isComplete()', () => {
    test('retorna true cuando todos los requeridos completos', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      for (const campo of schema.campos) {
        if (campo.requerido !== false) {
          eng.markField(state, campo.nombre, 'test');
        }
      }
      assert.ok(eng.isComplete(state), 'debe estar completa');
      assert.ok(state.completada, 'state.completada = true');
    });

    test('retorna false cuando falta required', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      assert.ok(!eng.isComplete(state), 'no debe estar completa');
    });

    test('opcionales incompletos no bloquean finalizacion', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      for (const campo of schema.campos) {
        if (campo.requerido !== false) {
          eng.markField(state, campo.nombre, 'test');
        }
      }
      // Verify some optional campos are still pending
      const optionals = schema.campos.filter(c => c.requerido === false);
      for (const opt of optionals) {
        assertEqual(state.campos[opt.nombre].estado, 'pendiente', `${opt.nombre} sigue pendiente`);
      }
      assert.ok(eng.isComplete(state), 'completa aunque opcionales falten');
    });
  });

  group('getProgress()', () => {
    test('estado vacio: 0%', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const p = eng.getProgress(state);
      assertEqual(p.percent, 0, '0% cuando vacio');
      assertEqual(p.completed, 0, '0 completados');
    });

    test('todo completo: 100%', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      for (const campo of schema.campos) {
        eng.markField(state, campo.nombre, 'test');
      }
      const p = eng.getProgress(state);
      assertEqual(p.percent, 100, '100% cuando todo completo');
      assertEqual(p.completed, schema.campos.length, 'todos completados');
    });

    test('parcial: conteo correcto', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      eng.markField(state, 'nombre', 'Juan');
      eng.markField(state, 'pieza', 'Soporte');
      const p = eng.getProgress(state);
      assertEqual(p.completed, 2, '2 completados');
      assertEqual(p.pending, schema.campos.length - 2, 'pending correcto');
    });
  });

  group('getStatus()', () => {
    test('estado vacio: complete=false', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const status = eng.getStatus(state);
      assertEqual(status.complete, false, 'no completo');
      assertEqual(status.pending, status.total, 'pending = total');
    });

    test('completo completo: complete=true', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      for (const campo of schema.campos) {
        eng.markField(state, campo.nombre, 'test');
      }
      const status = eng.getStatus(state);
      assertEqual(status.complete, true, 'completo');
      assertEqual(status.pending, 0, '0 pendientes');
    });
  });

  group('getCamposCompletos()', () => {
    test('retorna solo campos completos con etiqueta y valor', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      eng.markField(state, 'nombre', 'Juan');
      eng.markField(state, 'pieza', 'Soporte');
      const completos = eng.getCamposCompletos(state);
      assertEqual(completos.length, 2, '2 completos');
      assert.ok(completos.some(c => c.nombre === 'nombre' && c.valor === 'Juan'), 'nombre en completos');
      assert.ok(completos.some(c => c.nombre === 'pieza' && c.valor === 'Soporte'), 'pieza en completos');
    });
  });

  group('addHistory() / getHistory()', () => {
    test('registra cambio', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      eng.addHistory(state, 'color', null, 'Rojo');
      assertEqual(state.history.length, 1, '1 cambio');
      assertEqual(state.history[0].field, 'color');
      assertEqual(state.history[0].old, null);
      assertEqual(state.history[0].new, 'Rojo');
    });

    test('getHistory seguro con state corrupto', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      state.history = null;
      const h = eng.getHistory(state);
      assert.ok(Array.isArray(h), 'retorna array aunque history sea null');
    });
  });
});

// ================================================================
// CATALOG VALIDATOR
// ================================================================
group('CATALOG VALIDATOR (servicios JSON)', () => {
  group('Servicios actuales', () => {
    test('impresion_3d.json es valido', () => {
      const err = validateServiceSchema(schema);
      assertEqual(err.length, 0, `impresion_3d errores: ${err.join(', ')}`);
    });

    test('carteleria_led.json es valido', () => {
      const err = validateServiceSchema(ledSchema);
      assertEqual(err.length, 0, `carteleria_led errores: ${err.join(', ')}`);
    });
  });

  group('Validacion campos requeridos', () => {
    test('falta id -> error', () => {
      const err = validateServiceSchema({ campos: [] });
      assert.ok(err.some(e => e.includes('id')), 'debe detectar falta de id');
    });

    test('falta campos -> error', () => {
      const err = validateServiceSchema({ id: 't', name: 'T' });
      assert.ok(err.some(e => e.includes('campos')), 'debe detectar falta de campos');
    });

    test('nombre duplicado -> error', () => {
      const dup = {
        id: 't', name: 'T', description: 'D',
        welcome: { title: 'H', message: 'M' },
        summaryTemplate: '{{fields}}', completionTemplate: 'done',
        schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['k'],
        campos: [
          { nombre: 'dup', etiqueta: 'A', tipo: 'texto' },
          { nombre: 'dup', etiqueta: 'B', tipo: 'texto' },
        ],
      };
      const err = validateServiceSchema(dup);
      assert.ok(err.some(e => e.includes('duplicado')), 'debe detectar nombre duplicado');
    });

    test('campo sin nombre -> error', () => {
      const s = {
        id: 't', name: 'T', description: 'D',
        welcome: { title: 'H', message: 'M' },
        summaryTemplate: '{{fields}}', completionTemplate: 'done',
        schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['k'],
        campos: [{ etiqueta: 'X', tipo: 'texto' }],
      };
      const err = validateServiceSchema(s);
      assert.ok(err.some(e => e.includes('sin') && e.includes('nombre')), 'debe detectar campo sin nombre');
    });

    test('opciones duplicadas en select -> error', () => {
      const s = {
        id: 't', name: 'T', description: 'D',
        welcome: { title: 'H', message: 'M' },
        summaryTemplate: '{{fields}}', completionTemplate: 'done',
        schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['k'],
        campos: [{ nombre: 'q', etiqueta: 'Q', tipo: 'select', opciones: ['A', 'A'] }],
      };
      const err = validateServiceSchema(s);
      assert.ok(err.some(e => e.includes('opci')), 'debe detectar opciones duplicadas');
    });
  });

  group('Placeholders', () => {
    test('placeholder inexistente en summaryTemplate -> error', () => {
      const s = {
        id: 't', name: 'T', description: 'D',
        welcome: { title: 'H', message: 'M' },
        summaryTemplate: '{{inexistente}}', completionTemplate: 'done',
        schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['k'],
        campos: [{ nombre: 'q', etiqueta: 'Q', tipo: 'texto' }],
      };
      const err = validateServiceSchema(s);
      assert.ok(err.some(e => e.includes('placeholder')), 'debe detectar placeholder inexistente');
    });

    test('placeholder conocido no da error', () => {
      const s = {
        id: 't', name: 'T', description: 'D',
        welcome: { title: 'H', message: 'M' },
        summaryTemplate: '{{fields}} {{nombre}}', completionTemplate: 'done',
        schemaVersion: 1, serviceVersion: '1.0.0', keywords: ['k'],
        campos: [{ nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto' }],
      };
      const err = validateServiceSchema(s);
      assert.ok(!err.some(e => e.includes('placeholder')), 'placeholders conocidos no deben dar error');
    });
  });
});

// ================================================================
// VALIDATION
// ================================================================
group('VALIDATION', () => {
  group('validateField()', () => {
    test('sin validacion retorna vacio', () => {
      const err = validateField('cualquier cosa', {});
      assertEqual(err.length, 0, 'sin rules = sin errores');
    });

    test('minLength: texto corto genera error', () => {
      const err = validateField('AB', { nombre: 'nombre', validacion: { minLength: 3 } });
      assertEqual(err.length, 1, 'debe tener 1 error');
      assertEqual(err[0].rule, 'minLength');
    });

    test('minLength: texto largo NO genera error', () => {
      const err = validateField('Juan', { nombre: 'nombre', validacion: { minLength: 3 } });
      assertEqual(err.length, 0, 'texto valido sin errores');
    });

    test('maxLength: texto largo genera error', () => {
      const err = validateField('A'.repeat(101), { nombre: 'nombre', validacion: { maxLength: 100 } });
      assertEqual(err.length, 1, 'debe tener 1 error');
    });

    test('regex: formato incorrecto genera error', () => {
      const err = validateField('abc', { nombre: 'medidas', validacion: { regex: '^[0-9]+x[0-9]+$' } });
      assertEqual(err.length, 1, 'regex sin match debe dar error');
    });

    test('regex: formato correcto NO genera error', () => {
      const err = validateField('100x50', { nombre: 'medidas', validacion: { regex: '^[0-9]+x[0-9]+$' } });
      assertEqual(err.length, 0, 'regex match sin errores');
    });

    test('min: valor numerico bajo genera error', () => {
      const err = validateField(0, { nombre: 'cantidad', validacion: { min: 1 } });
      assertEqual(err.length, 1, '0 menor que min=1 debe dar error');
    });

    test('max: valor numerico alto genera error', () => {
      const err = validateField(100, { nombre: 'cantidad', validacion: { max: 50 } });
      assertEqual(err.length, 1, '100 mayor que max=50 debe dar error');
    });
  });

  group('validateAllFields()', () => {
    test('estado valido sin errores', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      eng.markField(state, 'nombre', 'Juan');
      const err = validateAllFields(state, schema);
      assertEqual(err.length, 0, 'estado valido sin errores');
    });

    test('estado vacio sin validacion no da error', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const err = validateAllFields(state, schema);
      assertEqual(err.length, 0, 'vacio sin validacion no es error');
    });
  });
});

// ================================================================
// SUMMARY BUILDER
// ================================================================
group('SUMMARY BUILDER', () => {
  function makeCompleteState() {
    const eng = new InterviewEngine(schema);
    const state = eng.createState();
    eng.markField(state, 'nombre', 'Juan');
    eng.markField(state, 'pieza', 'Soporte');
    eng.markField(state, 'archivo_stl', false);
    eng.markField(state, 'medidas', '10x10cm');
    eng.markField(state, 'cantidad', '3');
    eng.markField(state, 'material', 'PLA');
    eng.markField(state, 'color', 'Rojo');
    eng.markField(state, 'plazo', '1 semana');
    eng.markField(state, 'observaciones', 'Ninguna');
    return state;
  }

  group('buildSummary()', () => {
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
    });

    test('NO incluye campo nombre en fields (va en header)', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      assert.ok(summary.includes('Cliente:\nJuan'), 'nombre debe estar en header');
    });

    test('estado vacio no causa error', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();
      const summary = buildSummary(schema, state);
      assert.ok(typeof summary === 'string', 'debe retornar string');
    });
  });

  group('buildCompletionMessage()', () => {
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

    test('menciona WhatsApp o archivos', () => {
      const s = makeCompleteState();
      const summary = buildSummary(schema, s);
      const msg = buildCompletionMessage(schema, s, summary);
      assert.ok(msg.includes('WhatsApp') || msg.includes('archivos'), 'debe mencionar WhatsApp o archivos');
    });
  });

  group('buildStructuredSummary()', () => {
    test('retorna array de strings con campo: valor', () => {
      const s = makeCompleteState();
      const result = buildStructuredSummary(schema, s);
      assert.ok(Array.isArray(result), 'debe retornar array');
      assert.ok(result.some(line => line.includes('nombre: Juan')), 'debe incluir nombre');
    });

    test('estado vacio sin errores', () => {
      const eng = new InterviewEngine(schema);
      const s = eng.createState();
      const result = buildStructuredSummary(schema, s);
      assert.ok(Array.isArray(result), 'debe retornar array aunque vacio');
    });
  });
});

// ================================================================
// EVENT BUS
// ================================================================
group('EVENT BUS', () => {
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
// INTENTION DETECTION
// ================================================================
group('INTENTION DETECTION', () => {
  group('detectIntent()', () => {
    test('cartel LED detecta carteleria_led', () => {
      const result = detectIntent('Necesito un cartel LED');
      assertEqual(result.service, 'carteleria_led', 'debe detectar carteleria_led');
      assert.ok(result.confidence > 0.4, 'confianza > 0.4');
      assertEqual(result.needsClarification, false, 'no necesita aclaracion');
    });

    test('pieza impresa detecta impresion_3d', () => {
      const result = detectIntent('Necesito una pieza impresa en 3D');
      assertEqual(result.service, 'impresion_3d', 'debe detectar impresion_3d');
      assert.ok(result.confidence > 0.4, 'confianza > 0.4');
    });

    test('saludo no detecta servicio', () => {
      const result = detectIntent('Hola, cómo estás?');
      assertEqual(result.service, null, 'saludo = sin servicio');
    });

    test('mensaje vacio no detecta servicio', () => {
      const result = detectIntent('');
      assertEqual(result.service, null, 'vacio = sin servicio');
    });
  });

  group('buildClarifyingQuestion()', () => {
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
// SERVICIOS (SCHEMA)
// ================================================================
group('SERVICIOS (SCHEMA)', () => {
  group('detectService()', () => {
    test('detecta impresion_3d por keyword "soporte"', () => {
      assertEqual(detectService('Necesito un soporte para teléfono'), 'impresion_3d');
    });

    test('detecta carteleria_led por keyword "cartel"', () => {
      assertEqual(detectService('Quiero un cartel LED'), 'carteleria_led');
    });

    test('retorna null para texto sin keywords', () => {
      assertEqual(detectService('Hola, cómo estás?'), null);
    });
  });

  group('Schema campos', () => {
    test('archivo_stl existe en impresion_3d y es boolean', () => {
      const campo = schema.campos.find(c => c.nombre === 'archivo_stl');
      assert.ok(campo, 'archivo_stl existe');
      assertEqual(campo.tipo, 'boolean', 'es tipo boolean');
      assertEqual(campo.requerido, false, 'es opcional');
    });

    test('carteleria_led no tiene campo archivo_stl', () => {
      const campo = ledSchema.campos.find(c => c.nombre === 'archivo_stl');
      assert.ok(!campo, 'carteleria_led no debe tener archivo_stl');
    });

    test('interior_exterior es select con opciones', () => {
      const campo = ledSchema.campos.find(c => c.nombre === 'interior_exterior');
      assert.ok(campo, 'interior_exterior existe');
      assertEqual(campo.tipo, 'select', 'es select');
      assert.ok(Array.isArray(campo.opciones), 'tiene opciones');
    });
  });
});

// ================================================================
// INTEGRACION: CONVERSACIONES COMPLETAS
// ================================================================
group('INTEGRACION: Conversaciones', () => {
  group('Caso STL: Usuario dice "No" a archivo_stl', () => {
    test('Engine: archivo_stl=false lo completa y no se repite', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();

      // Completar todos los requeridos primero
      eng.markField(state, 'nombre', 'Ismael');
      eng.markField(state, 'pieza', 'soporte para telefono');
      eng.markField(state, 'medidas', '10x10');
      eng.markField(state, 'cantidad', '1');

      // Siguiente campo debe ser archivo_stl (primer optional)
      assertEqual(eng.getNextField(state)?.nombre, 'archivo_stl', 'archivo_stl es el siguiente optional');

      // Usuario dice "No" a STL
      eng.markField(state, 'archivo_stl', false);

      // archivo_stl debe estar completo
      assertEqual(state.campos.archivo_stl.valor, false, 'archivo_stl = false');
      assertEqual(state.campos.archivo_stl.estado, 'completo', 'archivo_stl completo');

      // Siguiente campo NO debe ser archivo_stl
      const next = eng.getNextField(state);
      assert.notEqual(next?.nombre, 'archivo_stl', 'NO debe preguntar archivo_stl otra vez');
    });
  });

  group('Caso: Flujo completo requeridos', () => {
    test('Engine avanza por todos los campos requeridos en orden', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();

      const requiredFields = schema.campos.filter(c => c.requerido !== false).map(c => c.nombre);

      for (const fieldName of requiredFields) {
        const next = eng.getNextField(state);
        assertEqual(next.nombre, fieldName, `El campo "${fieldName}" debe ser el siguiente`);
        eng.markField(state, fieldName, 'test');
      }

      // Despues de todos los required, isComplete=true (opcionales no bloquean)
      assert.ok(eng.isComplete(state), 'isComplete=true aunque falten opcionales');

      // Completar opcionales
      const optionalFields = schema.campos.filter(c => c.requerido === false).map(c => c.nombre);
      for (const fieldName of optionalFields) {
        const next = eng.getNextField(state);
        assertEqual(next.nombre, fieldName, `El campo optional "${fieldName}" debe ser el siguiente`);
        eng.markField(state, fieldName, 'test');
      }

      assert.ok(eng.isComplete(state), 'todo completo = isComplete true');
      assert.ok(state.completada, 'state.completada = true');
    });
  });

  group('Caso: Opcionales no bloquean', () => {
    test('isComplete=true aunque falten opcionales', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();

      // Completar solo los requeridos
      for (const campo of schema.campos) {
        if (campo.requerido !== false) {
          eng.markField(state, campo.nombre, 'test');
        }
      }

      assert.ok(eng.isComplete(state), 'completo aunque opcionales falten');
      assert.ok(state.completada, 'state.completada = true');

      // getNextField debe retornar el primer opcional pendiente
      const next = eng.getNextField(state);
      const firstOptional = schema.campos.find(c => c.requerido === false);
      if (firstOptional) {
        assertEqual(next?.nombre, firstOptional.nombre, 'opcional debe ser el siguiente');
      }
    });
  });
});

// ================================================================
// EDGE CASES
// ================================================================
group('EDGE CASES', () => {
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

  test('createState con campos vacio', () => {
    const emptyEng = new InterviewEngine({ id: 'empty', name: 'Empty', campos: [] });
    const state = emptyEng.createState();
    assertEqual(Object.keys(state.campos).length, 0, 'sin campos = campos vacio');
    const next = emptyEng.getNextField(state);
    assertEqual(next, null, 'sin campos no debe tener siguiente');
  });

  test('getHistory retorna array aunque history sea null', () => {
    const eng = new InterviewEngine(schema);
    const state = eng.createState();
    state.history = null;
    const h = eng.getHistory(state);
    assert.ok(Array.isArray(h), 'retorna array');
  });
});

// ================================================================
// REGRESSION: ERRORES HISTORICOS
// ================================================================
group('REGRESSION: Errores historicos', () => {
  test('REGRESSION: Engine nunca llama a OpenRouter', () => {
    const engineContent = readFileSync(new URL('../src/services/interview/engine.js', import.meta.url), 'utf8');
    assert.ok(!engineContent.includes('openrouter'), 'engine no debe importar openrouter');
    assert.ok(!engineContent.includes('chat('), 'engine no debe llamar a chat');
  });

  test('REGRESSION: Summary no usa OpenRouter', () => {
    const summaryContent = readFileSync(new URL('../src/services/interview/summary.js', import.meta.url), 'utf8');
    assert.ok(!summaryContent.includes('openrouter'), 'summary no debe importar openrouter');
    assert.ok(!summaryContent.includes('chat('), 'summary no debe llamar a chat');
  });

  test('REGRESSION: getNextField no muta estado', () => {
    const eng = new InterviewEngine(schema);
    const state = eng.createState();
    // getNextField should NOT modify anything
    const before = JSON.stringify(state);
    eng.getNextField(state);
    const after = JSON.stringify(state);
    assertEqual(before, after, 'getNextField no debe mutar estado');
  });

  test('REGRESSION: Progress total nunca es 0', () => {
    const eng = new InterviewEngine(schema);
    const state = eng.createState();
    const p = eng.getProgress(state);
    assert.ok(p.total > 0, 'total debe ser > 0');
  });

  test('REGRESSION: Catálogo de cartelería prohíbe animaciones', () => {
    const forbidden = ledSchema.catalog.forbidden;
    assert.ok(forbidden.some(f => f.includes('animación')), 'animacion debe estar en forbidden');
    assert.ok(forbidden.some(f => f.includes('USB')), 'USB debe estar en forbidden');
  });

  test('REGRESSION: engine.js NO tiene getMissingField (API vieja eliminada)', () => {
    const engineContent = readFileSync(new URL('../src/services/interview/engine.js', import.meta.url), 'utf8');
    assert.ok(!engineContent.includes('getMissingField'), 'getMissingField debe haber sido eliminado');
  });

  test('REGRESSION: handler.js NO importa resolver.js ni interpreter.js', () => {
    const handlerContent = readFileSync(new URL('../src/services/interview/handler.js', import.meta.url), 'utf8');
    assert.ok(!handlerContent.includes('resolver'), 'handler no debe importar resolver.js');
    assert.ok(!handlerContent.includes('interpreter'), 'handler no debe importar interpreter.js');
    assert.ok(!handlerContent.includes('anti-loop'), 'handler no debe importar anti-loop.js');
  });

  test('REGRESSION: chat.js NO usa getMissingField', () => {
    const chatContent = readFileSync(new URL('../src/handlers/chat.js', import.meta.url), 'utf8');
    assert.ok(!chatContent.includes('getMissingField'), 'chat.js no debe usar getMissingField');
  });
});

// ================================================================
// INTEGRACION: FLUJO COMPLETO VÍA ENGINE
// ================================================================
group('INTEGRACION: Flujo completo via Engine', () => {

  group('Flujo normal: requeridos primero, opcionales despues', () => {
    test('Engine avanza nombre→pieza→medidas→cantidad→archivo_stl→...', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();

      const expected = [
        { nombre: 'nombre', valor: 'Ismael' },
        { nombre: 'pieza', valor: 'soporte para telefono' },
        { nombre: 'medidas', valor: '10x10cm' },
        { nombre: 'cantidad', valor: '3' },
        { nombre: 'archivo_stl', valor: false },
      ];

      for (const step of expected) {
        const field = eng.getNextField(state);
        assertEqual(field.nombre, step.nombre, `Siguiente debe ser "${step.nombre}"`);
        eng.markField(state, step.nombre, step.valor);
      }

      assert.ok(eng.isComplete(state), 'isComplete=true (opcionales no bloquean)');

      const remaining = ['material', 'color', 'plazo', 'observaciones'];
      for (const name of remaining) {
        const field = eng.getNextField(state);
        assertEqual(field.nombre, name, `Siguiente opcional debe ser "${name}"`);
        eng.markField(state, name, 'test');
      }

      assert.ok(eng.isComplete(state), 'Completo despues de todos los campos');
      assert.ok(state.completada, 'state.completada = true');
    });
  });

  group('Caso critico: STL bug - usuario dice "no"', () => {
    test('archivo_stl=false completa el campo y no se repite', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();

      // Avanzar hasta archivo_stl (despues de todos los requeridos)
      eng.markField(state, 'nombre', 'Ismael');
      eng.markField(state, 'pieza', 'soporte');
      eng.markField(state, 'medidas', '10x10');
      eng.markField(state, 'cantidad', '1');

      // archivo_stl es el siguiente
      assertEqual(eng.getNextField(state).nombre, 'archivo_stl', 'archivo_stl debe ser el siguiente');

      // Usuario dice "No" → false
      eng.markField(state, 'archivo_stl', false);
      assertEqual(state.campos.archivo_stl.valor, false, 'valor = false');
      assertEqual(state.campos.archivo_stl.estado, 'completo', 'estado = completo');

      // archivo_stl NO debe aparecer de nuevo
      const next = eng.getNextField(state);
      assert.notEqual(next?.nombre, 'archivo_stl', 'NUNCA debe repetir archivo_stl');
      assertEqual(next?.nombre, 'material', 'Siguiente debe ser el proximo opcional');
    });
  });

  group('Caso critico: usuario dice "no tengo STL" desde el inicio', () => {
    test('Engine procesa en orden correcto sin saltos', () => {
      const eng = new InterviewEngine(schema);
      const state = eng.createState();

      // El usuario nunca menciona STL voluntariamente
      // El engine avanza en orden natural
      const fields = eng.getPendingFields(state);
      const first = fields[0];
      assertEqual(first.nombre, 'nombre', 'Primero debe ser nombre (requerido)');

      // Completar en orden
      eng.markField(state, 'nombre', 'Ismael');
      eng.markField(state, 'pieza', 'soporte');

      // medidas es el siguiente (requerido, viene antes que archivo_stl)
      assertEqual(eng.getNextField(state).nombre, 'medidas', 'medidas antes que archivo_stl');
    });
  });
});

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
