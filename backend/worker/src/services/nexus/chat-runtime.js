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

  shouldStartInterview(message) {
    return this.#interviewRouter.shouldStartInterview(message);
  }

  async hasActiveInterview(sessionId) {
    return this.#interviewRouter.hasActiveInterview(sessionId);
  }

  async handleMessage({ message, sessionId, clientId, conversationId } = {}) {
    if (!message || typeof message !== 'string') {
      return { type: 'error', error: 'message is required' };
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return { type: 'error', error: 'message is required' };
    }

    const intent = this.#interviewRouter.shouldStartInterview(trimmedMessage);
    const hasActiveInterview = sessionId ? await this.#interviewRouter.hasActiveInterview(sessionId) : false;
    if (intent && !hasActiveInterview) {
      const schemaId = this.#interviewRouter.selectSchema(intent);
      if (schemaId) {
        const startResult = await this.#interviewRouter.startInterview(schemaId, trimmedMessage);
        return this.#formatInterviewStart(startResult);
      }
    }

    if (sessionId && hasActiveInterview) {
      const answerResult = await this.#interviewRouter.answerMessage(sessionId, trimmedMessage);
      return this.#formatInterviewAnswer(answerResult);
    }

    const profile = sessionId && this.#hasInterviewSession(sessionId) ? 'interview' : 'customer';

    const result = await this.#engine.process(message, {
      profile,
      sessionId: sessionId || undefined,
      clientId: clientId || undefined,
      conversationId: conversationId || undefined,
    });

    return this.#formatResponse(result, sessionId);
  }

  #hasInterviewSession(sessionId) {
    const context = this.#engine.contextManager.getSession(sessionId);
    if (!context) return false;
    return context.profile === 'interview';
  }

  #formatInterviewStart(result) {
    if (!result || result.interviewComplete) {
      return {
        type: 'completed',
        sessionId: result?.sessionId || null,
        schemaId: result?.schemaId || null,
        message: result?.summary || result?.question?.question || 'Solicitud procesada correctamente.',
        data: result,
      };
    }

    return {
      type: 'interview',
      sessionId: result.sessionId,
      schemaId: result.schemaId || null,
      question: result.question?.question || '',
      fieldId: result.question?.fieldId || null,
      retry: false,
    };
  }

  #formatInterviewAnswer(result) {
    if (result.cancelled) {
      return {
        type: 'chat',
        message: 'Entrevista cancelada. ¿En qué más puedo ayudarte?',
      };
    }

    if (result.help) {
      return {
        type: 'interview',
        sessionId: result.sessionId,
        schemaId: result.schemaId || null,
        question: result.question?.question || '',
        fieldId: result.question?.fieldId || null,
        retry: false,
      };
    }

    if (result.interviewComplete) {
      return {
        type: 'completed',
        sessionId: result.sessionId,
        schemaId: result.schemaId || null,
        message: result.summary || 'Solicitud procesada correctamente.',
        data: result,
      };
    }

    return {
      type: 'interview',
      sessionId: result.sessionId,
      schemaId: result.schemaId || null,
      question: result.question?.question || '',
      fieldId: result.question?.fieldId || null,
      retry: result.validationError !== null && result.validationError !== undefined,
    };
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
            schemaId: lastResult?.data?.schemaId || null,
            message: 'Solicitud procesada correctamente.',
            data: lastResult?.data,
          };
        }
        const questionResult = result.results.find(r => r.toolName === 'questionGenerator');
        const interviewStart = result.results.find(r =>
          r.toolName === 'interviewController' &&
          r.success &&
          r.data?.question?.question
        );
        return {
          type: 'interview',
          sessionId: interviewStart?.data?.sessionId || sessionId,
          schemaId: interviewStart?.data?.schemaId || questionResult?.data?.schemaId || null,
          question: questionResult?.data?.question || interviewStart?.data?.question?.question || result.explanation,
          fieldId: questionResult?.data?.field || interviewStart?.data?.question?.fieldId || null,
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
