import { describe, it, expect, vi } from 'vitest';
import { ChatRuntime } from './chat-runtime.js';
import { NexusAIEngine } from './nexus-ai-engine.js';

function createMockEngine(chatFn) {
  return new NexusAIEngine({ chatFn: chatFn || vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Hello!' })) });
}

function createMockRouter() {
  return {
    shouldStartInterview: vi.fn().mockReturnValue(null),
    hasActiveInterview: vi.fn().mockResolvedValue(false),
    answerMessage: vi.fn().mockResolvedValue({
      sessionId: null,
      question: null,
      interviewComplete: false,
      saved: false,
      validationError: null,
    }),
  };
}

describe('ChatRuntime', () => {
  describe('constructor', () => {
    it('rejects missing engine', () => {
      expect(() => new ChatRuntime({ interviewRouter: {} })).toThrow('engine is required');
    });

    it('rejects missing interviewRouter', () => {
      const engine = createMockEngine();
      expect(() => new ChatRuntime({ engine })).toThrow('interviewRouter is required');
    });

    it('accepts valid options', () => {
      const engine = createMockEngine();
      const router = createMockRouter();
      const runtime = new ChatRuntime({ engine, interviewRouter: router });
      expect(runtime).toBeInstanceOf(ChatRuntime);
    });
  });

  describe('handleMessage', () => {
    it('returns error when message is missing', async () => {
      const engine = createMockEngine();
      const runtime = new ChatRuntime({ engine, interviewRouter: createMockRouter() });
      const result = await runtime.handleMessage({});
      expect(result.type).toBe('error');
      expect(result.error).toBe('message is required');
    });

    it('returns error when message is empty', async () => {
      const runtime = new ChatRuntime({ engine: createMockEngine(), interviewRouter: createMockRouter() });
      const result = await runtime.handleMessage({ message: '' });
      expect(result.type).toBe('error');
      expect(result.error).toBe('message is required');
    });

    it('returns error when message is null', async () => {
      const runtime = new ChatRuntime({ engine: createMockEngine(), interviewRouter: createMockRouter() });
      const result = await runtime.handleMessage({ message: null });
      expect(result.type).toBe('error');
    });
  });

  describe('chat routing (no sessionId)', () => {
    it('routes to chat when no intent detected', async () => {
      const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Echo: hola' }));
      const engine = createMockEngine(chatFn);
      const runtime = new ChatRuntime({ engine, interviewRouter: createMockRouter() });

      const result = await runtime.handleMessage({ message: 'hola' });

      expect(result.type).toBe('chat');
      expect(result.message).toBe('Echo: hola');
    });

    it('routes to chat when engine returns conversation', async () => {
      const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Respuesta genérica' }));
      const engine = createMockEngine(chatFn);
      const runtime = new ChatRuntime({ engine, interviewRouter: createMockRouter() });

      const result = await runtime.handleMessage({ message: 'cuánto cuesta' });

      expect(result.type).toBe('chat');
      expect(chatFn).toHaveBeenCalled();
    });
  });

  describe('interview start flow', () => {
    it('starts interview when intent detected', async () => {
      const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
        plan: [{ tool: 'questionGenerator', params: { fieldId: 'device' } }],
        explanation: 'Iniciando entrevista de reparación',
      }));
      const engine = createMockEngine(chatFn);
      engine.toolRegistry.register({
        name: 'questionGenerator',
        description: 'Generate interview question',
        inputSchema: {},
        execute: async () => ({ question: '¿Qué equipo necesita reparación?', fieldId: 'device' }),
      });
      engine.profileManager.get('customer').allowedTools.push('questionGenerator');

      const runtime = new ChatRuntime({ engine, interviewRouter: createMockRouter() });

      const result = await runtime.handleMessage({ message: 'mi celular no prende' });

      expect(result.type).toBe('interview');
      expect(result.question).toBeTruthy();
    });
  });

  describe('active session continuation', () => {
    it('routes to chat when session does not exist', async () => {
      const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Hola!' }));
      const engine = createMockEngine(chatFn);
      const runtime = new ChatRuntime({ engine, interviewRouter: createMockRouter() });

      const result = await runtime.handleMessage({ message: 'hola', sessionId: 'nonexistent' });

      expect(result.type).toBe('chat');
      expect(chatFn).toHaveBeenCalled();
    });
  });

  describe('full flow integration', () => {
    it('returns completed when tool returns complete:true', async () => {
      const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
        plan: [{ tool: 'completeTool', params: {} }],
        explanation: 'Completando',
      }));
      const engine = createMockEngine(chatFn);
      engine.toolRegistry.register({
        name: 'completeTool',
        description: 'Complete tool',
        inputSchema: {},
        execute: async () => ({ id: 'r1', complete: true }),
      });
      engine.profileManager.get('customer').allowedTools.push('completeTool');

      const runtime = new ChatRuntime({ engine, interviewRouter: createMockRouter() });
      const result = await runtime.handleMessage({ message: 'finalizar', sessionId: 's' });

      expect(result.type).toBe('completed');
    });
  });
});
