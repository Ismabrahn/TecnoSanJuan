import { describe, it, expect, vi } from 'vitest';
import { InterviewRouter } from './interview-router.js';
import { InterviewController } from '../interview/v2/interview-controller.js';
import { SchemaRegistry } from '../interview/v2/schema-registry.js';

function makeTestSchema(overrides = {}) {
  return {
    $schema: 'https://nexus.tecno-sanjuan.com/interview/v2/service-schema.json',
    serviceId: 'test-service',
    serviceVersion: '1.0.0',
    serviceName: 'Test Service',
    description: 'A test service',
    updatedAt: '2026-07-26T00:00:00Z',
    tags: ['test'],
    fieldOrder: ['name'],
    minimumRequired: 1,
    allowConcurrent: false,
    fields: [
      {
        id: 'name',
        type: 'text',
        label: 'Name',
        question: 'What is your name?',
        required: true,
      },
    ],
    summaryTemplate: 'Hello {{name}}',
    whatsappTemplate: '*hello* {{name}}',
    ...overrides,
  };
}

function makeRouter(options = {}) {
  const registry = options.schemaRegistry || new SchemaRegistry();
  const controller = options.interviewController || new InterviewController();
  return new InterviewRouter({ schemaRegistry: registry, interviewController: controller, ...options });
}

function makeMockRouter(options = {}) {
  const mockRegistry = {
    load: vi.fn(),
    register: vi.fn(),
  };
  const mockController = {
    start: vi.fn(),
    hasSession: vi.fn(),
    getSession: vi.fn(),
    answer: vi.fn(),
    next: vi.fn(),
    clearSession: vi.fn(),
  };
  return {
    router: new InterviewRouter({
      schemaRegistry: options.schemaRegistry || mockRegistry,
      interviewController: options.interviewController || mockController,
      patterns: options.patterns,
      schemaMap: options.schemaMap,
    }),
    mockRegistry,
    mockController,
  };
}

describe('InterviewRouter', () => {
  describe('constructor', () => {
    it('rejects missing schemaRegistry', () => {
      expect(() => new InterviewRouter({ interviewController: {} })).toThrow('schemaRegistry is required');
    });

    it('rejects missing interviewController', () => {
      expect(() => new InterviewRouter({ schemaRegistry: {} })).toThrow('interviewController is required');
    });

    it('accepts valid options', () => {
      const router = makeRouter();
      expect(router).toBeInstanceOf(InterviewRouter);
    });
  });

  describe('shouldStartInterview', () => {
    it('returns null for empty message', () => {
      const { router } = makeMockRouter();
      expect(router.shouldStartInterview('')).toBeNull();
    });

    it('returns null for null message', () => {
      const { router } = makeMockRouter();
      expect(router.shouldStartInterview(null)).toBeNull();
    });

    it('returns null for undefined message', () => {
      const { router } = makeMockRouter();
      expect(router.shouldStartInterview(undefined)).toBeNull();
    });

    it('returns null for non-string message', () => {
      const { router } = makeMockRouter();
      expect(router.shouldStartInterview(123)).toBeNull();
    });

    describe('detects repair-request intent', () => {
      const { router } = makeMockRouter();
      const repairMessages = [
        'mi celular no prende',
        'quiero arreglar una notebook',
        'se rompió la pantalla',
        'no funciona mi equipo',
        'la batería dura muy poco',
        'se me mojó el teléfono',
        'quiero reparar mi pc',
        'arreglo de tablet',
        'pantalla rota',
        'mi notebook no arranca',
      ];

      for (const msg of repairMessages) {
        it(`detects: "${msg}"`, () => {
          expect(router.shouldStartInterview(msg)).toBe('repair-request');
        });
      }
    });

    describe('detects budget-request intent', () => {
      const { router } = makeMockRouter();
      const budgetMessages = [
        'cuánto cuesta reparar una pantalla',
        'quiero saber el precio',
        'presupuesto de reparación',
        'me das una cotización',
        'cuánto vale cambiar batería',
        'quiero información de precios',
        'cuánto cobran por arreglar',
        'costo de reparación',
      ];

      for (const msg of budgetMessages) {
        it(`detects: "${msg}"`, () => {
          expect(router.shouldStartInterview(msg)).toBe('budget-request');
        });
      }
    });

    describe('detects print-order intent', () => {
      const { router } = makeMockRouter();
      const printMessages = [
        'quiero imprimir una pieza 3d',
        'necesito un diseño 3d',
        'impresión 3d de figura',
        'me imprimís una pieza',
        'modelo impreso 3d',
        'quiero una impresión 3D',
        'imprimime una figura',
      ];

      for (const msg of printMessages) {
        it(`detects: "${msg}"`, () => {
          expect(router.shouldStartInterview(msg)).toBe('print-order');
        });
      }
    });

    describe('ignores normal chat messages', () => {
      const { router } = makeMockRouter();
      const normalMessages = [
        'hola',
        'buenos días',
        'gracias',
        'cuál es el horario',
        'dónde están ubicados',
        'qué servicios ofrecen',
        'chau',
        'muchas gracias',
      ];

      for (const msg of normalMessages) {
        it(`ignores: "${msg}"`, () => {
          expect(router.shouldStartInterview(msg)).toBeNull();
        });
      }
    });

    it('respects custom patterns', () => {
      const customPatterns = {
        'custom-service': [/\bcustom\s+service\b/i],
      };
      const { router } = makeMockRouter({ patterns: customPatterns });
      expect(router.shouldStartInterview('need custom service')).toBe('custom-service');
      expect(router.shouldStartInterview('mi celular no prende')).toBeNull();
    });
  });

  describe('selectSchema', () => {
    it('returns repair-request schemaId for repair-request intent', () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema('repair-request')).toBe('repair-request');
    });

    it('returns budget-request schemaId for budget-request intent', () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema('budget-request')).toBe('budget-request');
    });

    it('returns print-order schemaId for print-order intent', () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema('print-order')).toBe('print-order');
    });

    it('returns null for unknown intent', () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema('unknown-intent')).toBeNull();
    });

    it('returns null for null intent', () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema(null)).toBeNull();
    });

    it('respects custom schema map', () => {
      const customMap = { 'repair-request': 'custom-repair' };
      const { router } = makeMockRouter({ schemaMap: customMap });
      expect(router.selectSchema('repair-request')).toBe('custom-repair');
    });
  });

  describe('startInterview', () => {
    it('loads schema and starts interview', async () => {
      const { router, mockRegistry, mockController } = makeMockRouter();
      const schema = makeTestSchema();
      mockRegistry.load.mockResolvedValue(schema);
      mockController.start.mockResolvedValue({ sessionId: 'abc', question: { question: 'test?' }, interviewComplete: false });

      const result = await router.startInterview('test-service');

      expect(mockRegistry.load).toHaveBeenCalledWith('test-service');
      expect(mockController.start).toHaveBeenCalledWith(schema);
      expect(result.sessionId).toBe('abc');
      expect(result.question.question).toBe('test?');
    });

    it('propagates registry errors', async () => {
      const { router, mockRegistry } = makeMockRouter();
      mockRegistry.load.mockRejectedValue(new Error('Schema not found'));

      await expect(router.startInterview('nonexistent')).rejects.toThrow('Schema not found');
    });

    it('propagates controller errors', async () => {
      const { router, mockRegistry, mockController } = makeMockRouter();
      mockRegistry.load.mockResolvedValue(makeTestSchema());
      mockController.start.mockRejectedValue(new Error('Controller error'));

      await expect(router.startInterview('test-service')).rejects.toThrow('Controller error');
    });

    it('returns interviewComplete flag', async () => {
      const { router, mockRegistry, mockController } = makeMockRouter();
      mockRegistry.load.mockResolvedValue(makeTestSchema());
      mockController.start.mockResolvedValue({ sessionId: 'abc', question: null, interviewComplete: true });

      const result = await router.startInterview('test-service');

      expect(result.interviewComplete).toBe(true);
      expect(result.question).toBeNull();
    });
  });
});
