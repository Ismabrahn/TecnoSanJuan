export class ToolExecutor {
  #registry;
  #metrics;
  #metricsCollector;

  constructor(options = {}) {
    this.#registry = options.toolRegistry;
    if (!this.#registry) throw new Error('ToolExecutor: toolRegistry is required');
    this.#metrics = { executed: 0, succeeded: 0, failed: 0, byTool: {} };
    this.#metricsCollector = options.metricsCollector || null;
  }

  async execute(toolName, params = {}, context = {}) {
    const start = Date.now();
    const tool = this.#registry.get(toolName);
    if (!tool) {
      this.#track(toolName, start, false, `Tool "${toolName}" not found`);
      return { success: false, error: `Tool "${toolName}" not found`, toolName };
    }

    const validation = this.#validateParams(tool, params);
    if (!validation.valid) {
      this.#track(toolName, start, false, validation.error);
      return { success: false, error: validation.error, toolName };
    }

    this.#metrics.executed++;
    this.#metrics.byTool[toolName] = this.#metrics.byTool[toolName] || { executed: 0, succeeded: 0, failed: 0 };
    this.#metrics.byTool[toolName].executed++;

    try {
      const result = await tool.execute(params, context);
      this.#metrics.succeeded++;
      this.#metrics.byTool[toolName].succeeded++;
      this.#track(toolName, start, true);
      return { success: true, data: result, toolName };
    } catch (err) {
      this.#metrics.failed++;
      this.#metrics.byTool[toolName].failed++;
      this.#track(toolName, start, false, err.message);
      return { success: false, error: err.message, toolName };
    }
  }

  #track(toolName, start, success, error) {
    const duration = Date.now() - start;
    this.#metricsCollector?.recordToolExecution(toolName, duration, success, error);
  }

  getMetrics() {
    return { ...this.#metrics, byTool: { ...this.#metrics.byTool } };
  }

  resetMetrics() {
    this.#metrics = { executed: 0, succeeded: 0, failed: 0, byTool: {} };
  }

  #validateParams(tool, params) {
    if (!tool.inputSchema) return { valid: true };
    const schema = tool.inputSchema;
    for (const [key, rule] of Object.entries(schema)) {
      if (rule.required && (params[key] === undefined || params[key] === null)) {
        return { valid: false, error: `Missing required parameter: ${key}` };
      }
      if (params[key] !== undefined && rule.type) {
        const actual = typeof params[key];
        if (actual !== rule.type) {
          return { valid: false, error: `Parameter "${key}" expected ${rule.type}, got ${actual}` };
        }
      }
    }
    return { valid: true };
  }
}
