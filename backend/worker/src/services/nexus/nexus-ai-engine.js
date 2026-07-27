import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';
import { ProfileManager } from './profile-manager.js';
import { ContextManager } from './context-manager.js';
import { PlanningEngine } from './planning-engine.js';
import { MetricsCollector } from './observability.js';

export class NexusAIEngine {
  #toolRegistry;
  #toolExecutor;
  #profileManager;
  #contextManager;
  #planningEngine;
  #chatFn;
  #metrics;

  constructor(options = {}) {
    this.#metrics = options.metricsCollector || new MetricsCollector();
    this.#toolRegistry = options.toolRegistry || new ToolRegistry();
    this.#toolExecutor = options.toolExecutor || new ToolExecutor({
      toolRegistry: this.#toolRegistry,
      metricsCollector: this.#metrics,
    });
    this.#profileManager = options.profileManager || new ProfileManager();
    this.#contextManager = options.contextManager || new ContextManager();
    this.#chatFn = options.chatFn;
    this.#planningEngine = options.planningEngine || (this.#chatFn ? new PlanningEngine({ chatFn: this.#chatFn }) : null);

    if (!this.#chatFn) throw new Error('NexusAIEngine: chatFn is required');
  }

  get toolRegistry() { return this.#toolRegistry; }
  get toolExecutor() { return this.#toolExecutor; }
  get profileManager() { return this.#profileManager; }
  get contextManager() { return this.#contextManager; }
  get planningEngine() { return this.#planningEngine; }
  get metrics() { return this.#metrics; }

  async process(input, options = {}) {
    const profileId = options.profile || 'customer';
    const sessionId = options.sessionId || `session-${Date.now()}`;
    const profile = this.#profileManager.get(profileId);
    if (!profile) {
      this.#metrics.recordError(profileId, new Error(`Profile "${profileId}" not found`));
      return { type: 'error', error: `Profile "${profileId}" not found` };
    }

    this.#metrics.recordEngineCall(profileId, sessionId);

    if (!this.#contextManager.hasSession(sessionId)) {
      this.#contextManager.createSession(sessionId, {
        profile: profileId,
        clientId: options.clientId || null,
        conversationId: options.conversationId || null,
        repairId: options.repairId || null,
        budgetId: options.budgetId || null,
        printOrderId: options.printOrderId || null,
        currentIntent: options.currentIntent || null,
        entities: options.entities || {},
        workingMemory: options.workingMemory || {},
      });
    }

    this.#contextManager.addMessage(sessionId, 'user', input);

    const allowedTools = this.#getAllowedTools(profile);
    const context = this.#contextManager.getSession(sessionId);

    if (this.#planningEngine) {
      try {
        const planResult = await this.#planningEngine.createPlan(input, {
          availableTools: allowedTools,
          systemPrompt: profile.systemPrompt,
          sessionId,
          clientId: context?.clientId || null,
          currentIntent: context?.currentIntent || null,
          workingMemory: context?.workingMemory || {},
          conversationHistory: context?.conversationHistory || [],
        });

        if (planResult.plan.length === 0) {
          this.#contextManager.addMessage(sessionId, 'assistant', planResult.explanation);
          return {
            type: 'conversation',
            sessionId,
            message: planResult.explanation,
            explanation: planResult.explanation,
          };
        }

        this.#metrics.recordPlan(profileId, planResult.plan);

        const results = [];
        for (const step of planResult.plan) {
          if (!profile.allowedTools.includes(step.tool)) {
            results.push({ toolName: step.tool, success: false, error: 'Tool not allowed by profile' });
            continue;
          }
          const result = await this.#toolExecutor.execute(step.tool, step.params || {}, context);
          this.#contextManager.addToolCall(sessionId, step.tool, step.params, result);
          results.push(result);
        }

        const explanation = planResult.explanation || this.#buildExplanation(results);
        this.#contextManager.addMessage(sessionId, 'assistant', explanation);

        return {
          type: 'execution',
          sessionId,
          plan: planResult.plan,
          results,
          explanation,
          conversationId: context?.conversationId,
          clientId: context?.clientId,
          workingMemory: context?.workingMemory,
          metrics: this.#toolExecutor.getMetrics(),
        };
      } catch (err) {
        this.#metrics.recordError(profileId, err);
        return {
          type: 'error',
          sessionId,
          error: err.message,
        };
      }
    }

    return {
      type: 'conversation',
      sessionId,
      message: 'Planning engine not available',
    };
  }

  resetMetrics() {
    this.#metrics.reset();
    this.#toolExecutor.resetMetrics();
  }

  #buildExplanation(results) {
    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const parts = [];
    if (succeeded.length) parts.push(`${succeeded.length} tool(s) executed successfully`);
    if (failed.length) parts.push(`${failed.length} tool(s) failed: ${failed.map(f => f.toolName).join(', ')}`);
    return parts.join('. ') || 'Execution completed';
  }

  #getAllowedTools(profile) {
    return profile.allowedTools
      .map(name => this.#toolRegistry.get(name))
      .filter(Boolean);
  }
}
