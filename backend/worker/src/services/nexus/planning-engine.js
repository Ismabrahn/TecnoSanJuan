export class PlanningEngine {
  #chatFn;

  constructor(options = {}) {
    this.#chatFn = options.chatFn;
    if (!this.#chatFn) throw new Error('PlanningEngine: chatFn is required');
  }

  async createPlan(userInput, context = {}) {
    const tools = context.availableTools || [];
    const systemPrompt = context.systemPrompt || 'You are a planning assistant. Given a user request and available tools, produce a list of tool calls in sequence.';

    const toolDescriptions = tools.map(t => {
      const schema = t.inputSchema || {};
      const params = Object.entries(schema).map(([k, r]) => `${k}${r.required ? ' (required)' : ''}: ${r.type || 'any'}`).join(', ');
      return `${t.name}: ${t.description || 'No description'}${params ? ` [${params}]` : ''}`;
    }).join('\n');

    const planningPrompt = `${systemPrompt}

AVAILABLE TOOLS:
${toolDescriptions || 'No tools available'}

CURRENT CONTEXT:
${JSON.stringify({
  clientId: context.clientId || null,
  currentIntent: context.currentIntent || null,
  workingMemory: context.workingMemory || {},
}, null, 2)}

User request: "${userInput}"

Produce a JSON plan. Each step must be a valid tool call.
Format: {"plan": [{"tool": "toolName", "params": {"key": "value"}}], "explanation": "mensaje amable y natural en español para el usuario final"}

If the request is conversational (no tools needed), respond with:
{"plan": [], "explanation": "respuesta conversacional amable en español para el usuario final"}

The explanation MUST be the actual message shown to the user. It MUST be in Spanish. It MUST NOT describe the internal plan, tools, or reasoning. It MUST NOT start with phrases like "The plan..." or "This plan...".

Respond ONLY with valid JSON.`;

    try {
      const raw = await this.#chatFn(planningPrompt);
      const parsed = this.#parseJSON(raw);
      if (!parsed || !parsed.plan) {
        return { plan: [], explanation: raw || 'Could not create plan' };
      }
      return {
        plan: parsed.plan,
        explanation: parsed.explanation || 'Plan created',
      };
    } catch (err) {
      return { plan: [], explanation: `Planning error: ${err.message}` };
    }
  }

  #parseJSON(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}
