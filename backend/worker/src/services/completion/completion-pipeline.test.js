import { describe, it, expect, beforeEach } from 'vitest';

import { CompletionPipeline } from './completion-pipeline.js';
import { CompletionHandler } from '../nexus/interview/completion-handler.js';
import { ClientResolver } from '../nexus/client-resolver.js';
import { StateKeeper } from '../interview/v2/state-keeper.js';
import { BUILT_IN_SCHEMAS } from '../interview/v2/schema-index.js';

function buildState(schema, values) {
  const state = StateKeeper.create(schema.serviceId, schema.serviceVersion);
  for (const [fieldId, value] of Object.entries(values)) {
    state.setUserValue(fieldId, value);
  }
  return state;
}

function fakeClientService(existingByPhone = new Map()) {
  const created = [];
  return {
    created,
    async getClientByPhone(phone) {
      return existingByPhone.get(phone) || null;
    },
    async createClient(data) {
      const client = { id: `client-${created.length + 1}`, ...data };
      created.push(client);
      existingByPhone.set(data.phone, client);
      return client;
    },
  };
}

function fakeBusinessService() {
  const created = [];
  return {
    created,
    async createEntity(data) {
      const entity = { id: `${created.length + 1}`, ...data };
      created.push(entity);
      return entity;
    },
  };
}

function fakeSessionStore(sessions) {
  const completed = new Map();
  return {
    sessions,
    completed,
    async get(sessionId) {
      return sessions.get(sessionId) || null;
    },
    async markCompleted(sessionId) {
      completed.set(sessionId, true);
    },
  };
}

function buildPipeline({ sessionStore, clientService, repairService, budgetService, printService, eventQueue }) {
  const clientResolver = new ClientResolver({ clientService });
  const completionHandler = new CompletionHandler({
    repairService,
    budgetService,
    printService,
    clientResolver,
  });
  return new CompletionPipeline({
    sessionStore,
    clientResolver,
    completionHandler,
    eventQueue,
  });
}

const REPAIR_SCHEMA = BUILT_IN_SCHEMAS['repair-request'];
const BUDGET_SCHEMA = BUILT_IN_SCHEMAS['budget-request'];
const PRINT_SCHEMA = BUILT_IN_SCHEMAS['print-order'];

const REPAIR_COMPLETE = {
  clientName: 'Juan Pérez',
  clientPhone: '2645123456',
  device: 'Samsung A54',
  problem: 'No enciende',
};

const BUDGET_COMPLETE = {
  clientName: 'María López',
  clientPhone: '2645129999',
  serviceType: 'reparacion',
  description: 'Cambio de pantalla Samsung A54',
};

const PRINT_COMPLETE = {
  clientName: 'Carlos Gómez',
  clientPhone: '2645127777',
  objectDescription: 'Soporte para celular',
  material: 'PLA',
  quantity: 2,
};

describe('CompletionPipeline', () => {
  let clientService;
  let repairService;
  let budgetService;
  let printService;
  let eventQueue;

  beforeEach(() => {
    clientService = fakeClientService();
    repairService = fakeBusinessService();
    repairService.createRepair = (data) => repairService.createEntity(data);
    budgetService = fakeBusinessService();
    budgetService.createBudget = (data) => budgetService.createEntity(data);
    printService = fakeBusinessService();
    printService.createPrintOrder = (data) => printService.createEntity(data);
    eventQueue = { enqueued: [], async enqueue(event) { this.enqueued.push(event); } };
  });

  it('repair completo crea client y repair', async () => {
    const sessionId = 'session-repair-1';
    const sessions = new Map([[sessionId, {
      sessionId,
      state: buildState(REPAIR_SCHEMA, REPAIR_COMPLETE),
      schema: REPAIR_SCHEMA,
      status: 'active',
    }]]);
    const sessionStore = fakeSessionStore(sessions);
    const pipeline = buildPipeline({ sessionStore, clientService, repairService, budgetService, printService, eventQueue });

    const result = await pipeline.execute({ sessionId });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.entity.type).toBe('repair');
    expect(repairService.created).toHaveLength(1);
    expect(repairService.created[0].device).toBe('Samsung A54');
    expect(repairService.created[0].problem).toBe('No enciende');
    expect(clientService.created).toHaveLength(1);
    expect(clientService.created[0].phone).toBe('2645123456');
    expect(sessionStore.completed.get(sessionId)).toBe(true);
    const eventTypes = eventQueue.enqueued.map(e => e.type);
    expect(eventTypes).toContain('REPAIR_CREATED');
    expect(eventTypes).toContain('CLIENT_CREATED');
  });

  it('budget completo crea client y budget', async () => {
    const sessionId = 'session-budget-1';
    const sessions = new Map([[sessionId, {
      sessionId,
      state: buildState(BUDGET_SCHEMA, BUDGET_COMPLETE),
      schema: BUDGET_SCHEMA,
      status: 'active',
    }]]);
    const sessionStore = fakeSessionStore(sessions);
    const pipeline = buildPipeline({ sessionStore, clientService, repairService, budgetService, printService, eventQueue });

    const result = await pipeline.execute({ sessionId });

    expect(result.success).toBe(true);
    expect(result.entity.type).toBe('budget');
    expect(budgetService.created).toHaveLength(1);
    expect(budgetService.created[0].serviceType).toBe('reparacion');
    expect(budgetService.created[0].description).toBe('Cambio de pantalla Samsung A54');
    expect(clientService.created).toHaveLength(1);
    expect(sessionStore.completed.get(sessionId)).toBe(true);
    const eventTypes = eventQueue.enqueued.map(e => e.type);
    expect(eventTypes).toContain('BUDGET_CREATED');
    expect(eventTypes).toContain('CLIENT_CREATED');
  });

  it('print completo crea client y print_order', async () => {
    const sessionId = 'session-print-1';
    const sessions = new Map([[sessionId, {
      sessionId,
      state: buildState(PRINT_SCHEMA, PRINT_COMPLETE),
      schema: PRINT_SCHEMA,
      status: 'active',
    }]]);
    const sessionStore = fakeSessionStore(sessions);
    const pipeline = buildPipeline({ sessionStore, clientService, repairService, budgetService, printService, eventQueue });

    const result = await pipeline.execute({ sessionId });

    expect(result.success).toBe(true);
    expect(result.entity.type).toBe('print-order');
    expect(printService.created).toHaveLength(1);
    expect(printService.created[0].objectDescription).toBe('Soporte para celular');
    expect(printService.created[0].material).toBe('PLA');
    expect(printService.created[0].quantity).toBe(2);
    expect(clientService.created).toHaveLength(1);
    expect(sessionStore.completed.get(sessionId)).toBe(true);
    const eventTypes = eventQueue.enqueued.map(e => e.type);
    expect(eventTypes).toContain('PRINT_ORDER_CREATED');
    expect(eventTypes).toContain('CLIENT_CREATED');
  });

  it('sesión inexistente devuelve error controlado', async () => {
    const sessionStore = fakeSessionStore(new Map());
    const pipeline = buildPipeline({ sessionStore, clientService, repairService, budgetService, printService, eventQueue });

    const result = await pipeline.execute({ sessionId: 'no-existe' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('SESSION_NOT_FOUND');
    expect(repairService.created).toHaveLength(0);
    expect(budgetService.created).toHaveLength(0);
    expect(printService.created).toHaveLength(0);
    expect(clientService.created).toHaveLength(0);
    expect(eventQueue.enqueued).toHaveLength(0);
  });

  it('campos faltantes no crean entidades', async () => {
    const sessionId = 'session-incomplete';
    const sessions = new Map([[sessionId, {
      sessionId,
      state: buildState(REPAIR_SCHEMA, {
        clientName: 'Juan Pérez',
        clientPhone: '2645123456',
      }),
      schema: REPAIR_SCHEMA,
      status: 'active',
    }]]);
    const sessionStore = fakeSessionStore(sessions);
    const pipeline = buildPipeline({ sessionStore, clientService, repairService, budgetService, printService, eventQueue });

    const result = await pipeline.execute({ sessionId });

    expect(result.success).toBe(false);
    expect(result.error).toBe('INCOMPLETE_SESSION');
    expect(result.missing).toContain('device');
    expect(repairService.created).toHaveLength(0);
    expect(budgetService.created).toHaveLength(0);
    expect(printService.created).toHaveLength(0);
    expect(clientService.created).toHaveLength(0);
    expect(sessionStore.completed.get(sessionId)).toBeUndefined();
    expect(eventQueue.enqueued).toHaveLength(0);
  });

  it('segunda ejecución con status completed devuelve skipped', async () => {
    const sessionId = 'session-completed';
    const sessions = new Map([[sessionId, {
      sessionId,
      state: buildState(REPAIR_SCHEMA, REPAIR_COMPLETE),
      schema: REPAIR_SCHEMA,
      status: 'completed',
    }]]);
    const sessionStore = fakeSessionStore(sessions);
    const pipeline = buildPipeline({ sessionStore, clientService, repairService, budgetService, printService, eventQueue });

    const result = await pipeline.execute({ sessionId });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(repairService.created).toHaveLength(0);
    expect(clientService.created).toHaveLength(0);
    expect(eventQueue.enqueued).toHaveLength(0);
  });
});
