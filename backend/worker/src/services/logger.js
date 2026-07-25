class Logger {
  constructor(sessionId = '', serviceId = '') {
    this.sessionId = sessionId;
    this.serviceId = serviceId;
  }

  _log(level, module, data, meta = {}) {
    const latency = meta.latency !== undefined ? `${meta.latency}ms` : '';
    const prefix = `[${module}] [${level}]`;
    const suffix = typeof data === 'object' ? JSON.stringify(data) : data;
    const session = this.sessionId ? ` [session:${this.sessionId}]` : '';
    const service = this.serviceId ? ` [service:${this.serviceId}]` : '';
    const qid = meta.questionId ? ` [q:${meta.questionId}]` : '';
    const lat = latency ? ` [${latency}]` : '';
    console.log(`${prefix}${session}${service}${qid}${lat} ${suffix}`);
  }

  info(module, data, meta = {}) { this._log('INFO', module, data, meta); }
  warn(module, data, meta = {}) { this._log('WARN', module, data, meta); }
  error(module, data, meta = {}) { this._log('ERROR', module, data, meta); }

  withSession(sessionId, serviceId) {
    return new Logger(sessionId, serviceId);
  }
}

export const defaultLogger = new Logger();
