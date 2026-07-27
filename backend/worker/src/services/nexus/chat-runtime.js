export class ChatRuntime {
  #engine;
  #interviewRouter;

  constructor(options = {}) {
    this.#engine = options.engine;
    this.#interviewRouter = options.interviewRouter;

    if (!this.#engine) throw new Error('ChatRuntime: engine is required');
    if (!this.#interviewRouter) throw new Error('ChatRuntime: interviewRouter is required');
  }

  get engine() { return this.#engine; }

  async handleMessage({ message, sessionId } = {}) {
    if (!message || typeof message !== 'string') {
      return { type: 'error', error: 'message is required' };
    }

    const profile = sessionId && this.#hasInterviewSession(sessionId) ? 'interview' : 'customer';

    const result = await this.#engine.process(message, {
      profile,
      sessionId: sessionId || undefined,
    });

    return this.#formatResponse(result, sessionId);
  }

  #hasInterviewSession(sessionId) {
    const context = this.#engine.contextManager.getSession(sessionId);
    if (!context) return false;
    return context.profile === 'interview';
  }

  #formatResponse(result, sessionId) {
    if (result.type === 'error') {
      if (result.error?.includes('not found')) {
        return { type: 'chat', message: result.error };
      }
      return { type: 'chat', message: 'Ocurrió un error al procesar tu mensaje.' };
    }

    if (result.type === 'conversation') {
      return { type: 'chat', message: result.message };
    }

    if (result.type === 'execution') {
      const executedTools = result.results.filter(r => r.success).map(r => r.toolName);
      const failedTools = result.results.filter(r => !r.success).map(r => r.toolName);
      const executedInterview = executedTools.includes('interviewController') || executedTools.includes('questionGenerator');
      const completedInterview = result.results.some(r =>
        r.success && r.data?.complete === true
      );

      if (executedInterview) {
        const lastResult = result.results[result.results.length - 1];
        if (completedInterview) {
          return {
            type: 'completed',
            sessionId,
            message: 'Solicitud procesada correctamente.',
            data: lastResult?.data,
          };
        }
        const questionResult = result.results.find(r => r.toolName === 'questionGenerator');
        return {
          type: 'interview',
          sessionId,
          question: questionResult?.data?.question || result.explanation,
          retry: failedTools.length > 0,
        };
      }

      if (completedInterview) {
        const lastResult = result.results[result.results.length - 1];
        return {
          type: 'completed',
          sessionId,
          message: 'Solicitud procesada correctamente.',
          data: lastResult?.data,
        };
      }

      return { type: 'chat', message: result.explanation };
    }

    return { type: 'chat', message: result.message || result.explanation || 'Respuesta generada.' };
  }
}
