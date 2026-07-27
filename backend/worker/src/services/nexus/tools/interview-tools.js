export function registerInterviewTools(registry, interviewDeps) {
  const tools = [
    createQuestionGeneratorTool(interviewDeps),
    createInterpreterTool(interviewDeps),
    createInterviewControllerTool(interviewDeps),
  ];
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

function createQuestionGeneratorTool(deps) {
  return {
    name: 'questionGenerator',
    description: 'Generate the next interview question based on schema and answers so far',
    inputSchema: { schema: { type: 'object' }, answers: { type: 'object' } },
    async execute(params) {
      if (deps.questionGenerator) {
        return deps.questionGenerator.generate(params.schema, params.answers);
      }
      return { question: 'What is your name?', field: 'name' };
    },
  };
}

function createInterpreterTool(deps) {
  return {
    name: 'interpreter',
    description: 'Interpret a user response and extract structured data',
    inputSchema: { answer: { type: 'string', required: true }, question: { type: 'string' }, field: { type: 'string' } },
    async execute(params) {
      if (deps.interpreter) {
        return deps.interpreter.interpret(params.answer, { question: params.question, field: params.field });
      }
      return { interpreted: params.answer, field: params.field, confidence: 1.0 };
    },
  };
}

function createInterviewControllerTool(deps) {
  return {
    name: 'interviewController',
    description: 'Control the interview flow: check complete, next steps, summary',
    inputSchema: { action: { type: 'string', required: true }, data: { type: 'object' } },
    async execute(params) {
      if (deps.interviewController) {
        return deps.interviewController[params.action](params.data);
      }
      if (params.action === 'status') {
        return { complete: false, currentQuestion: 'What is your name?' };
      }
      if (params.action === 'summary') {
        return { summary: params.data || {} };
      }
      return { action: params.action, result: 'ok' };
    },
  };
}
