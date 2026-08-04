import { CompletionHandler } from '../nexus/interview/completion-handler.js';
import { FlowEvaluator } from '../interview/v2/flow-evaluator.js';
import {
  CLIENT_CREATED,
  REPAIR_CREATED,
  BUDGET_CREATED,
  PRINT_ORDER_CREATED,
} from '../events/event-types.js';

export class CompletionPipeline {
  #sessionStore;
  #clientResolver;
  #completionHandler;
  #eventQueue;

  constructor(options = {}) {
    this.#sessionStore = options.sessionStore;
    this.#clientResolver = options.clientResolver;
    this.#eventQueue = options.eventQueue;

    this.#completionHandler = options.completionHandler || new CompletionHandler({
      repairService: options.repairService,
      budgetService: options.budgetService,
      printService: options.printService,
      clientResolver: options.clientResolver,
    });

    if (!this.#sessionStore) {
      throw new Error('CompletionPipeline: sessionStore is required');
    }
    if (!this.#clientResolver) {
      throw new Error('CompletionPipeline: clientResolver is required');
    }
    if (!this.#completionHandler) {
      throw new Error('CompletionPipeline: completionHandler is required');
    }
  }

  async execute({ sessionId } = {}) {
    if (!sessionId || typeof sessionId !== 'string') {
      return { success: false, error: 'INVALID_SESSION_ID' };
    }

    const session = await this.#sessionStore.get(sessionId);
    if (!session) {
      return { success: false, error: 'SESSION_NOT_FOUND' };
    }

    if (session.status === 'completed') {
      return { success: true, skipped: true };
    }

    const schema = session.schema;
    const state = session.state;
    if (!schema || !state) {
      return { success: false, error: 'INVALID_SESSION_DATA' };
    }

    const evaluation = FlowEvaluator.evaluate(schema, state);
    if (!evaluation.isComplete) {
      return {
        success: false,
        error: 'INCOMPLETE_SESSION',
        missing: evaluation.pendingFields,
      };
    }

    const completedFields = state.getCompletedFields();

    const result = await this.#completionHandler.handle(session, completedFields);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    try {
      await this.#sessionStore.markCompleted(sessionId);
    } catch (err) {
      return {
        success: false,
        error: `Failed to mark session completed: ${err.message}`,
      };
    }

    const events = this.#buildEvents(sessionId, result);
    if (this.#eventQueue) {
      for (const event of events) {
        try {
          await this.#eventQueue.enqueue(event);
        } catch {
          // Event emission never breaks the completion flow
        }
      }
    }

    return {
      success: true,
      skipped: false,
      entity: result,
      client: {
        clientId: result.clientId || null,
        isNew: result.clientCreated || false,
      },
      events: events.map(e => e.type),
    };
  }

  #buildEvents(sessionId, result) {
    const events = [];
    const entityEventType = {
      repair: REPAIR_CREATED,
      budget: BUDGET_CREATED,
      'print-order': PRINT_ORDER_CREATED,
    }[result.type];

    if (entityEventType) {
      events.push({
        type: entityEventType,
        entityId: result.entityId,
        clientId: result.clientId || null,
        metadata: { sessionId },
      });
    }

    if (result.clientCreated && result.clientId) {
      events.push({
        type: CLIENT_CREATED,
        entityId: result.clientId,
        clientId: result.clientId,
        metadata: { sessionId },
      });
    }

    return events;
  }
}
