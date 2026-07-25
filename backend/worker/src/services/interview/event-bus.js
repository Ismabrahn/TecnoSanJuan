export class EventBus {
  constructor() {
    this._handlers = {};
  }

  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
    return () => this.off(event, handler);
  }

  emit(event, data) {
    const handlers = this._handlers[event] || [];
    for (const handler of handlers) {
      try { handler(data); } catch (e) {
        console.error(`[EVENT] Error en handler para ${event}:`, e);
      }
    }
  }

  off(event, handler) {
    if (!this._handlers[event]) return;
    this._handlers[event] = this._handlers[event].filter(h => h !== handler);
  }

  clear() { this._handlers = {}; }

  once(event, handler) {
    const wrapper = (data) => { handler(data); this.off(event, wrapper); };
    this.on(event, wrapper);
  }
}

export const eventBus = new EventBus();

export const Events = {
  InterviewStarted: 'interview:started',
  QuestionAnswered: 'question:answered',
  FieldUpdated: 'field:updated',
  QuestionSkipped: 'question:skipped',
  InterviewCompleted: 'interview:completed',
  SummaryGenerated: 'summary:generated',
  WhatsAppRendered: 'whatsapp:rendered',
  WhatsAppOpened: 'whatsapp:opened',
  AnalyticsUpdated: 'analytics:updated',
};
