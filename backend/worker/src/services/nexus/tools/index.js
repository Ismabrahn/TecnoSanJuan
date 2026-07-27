export function registerTools(registry, deps) {
  const tools = [
    createSearchClientTool(deps),
    createSearchRepairTool(deps),
    createSearchBudgetTool(deps),
    createSearchPrintOrderTool(deps),
    createUpdateRepairStatusTool(deps),
    createUpdateBudgetStatusTool(deps),
    createUpdatePrintOrderStatusTool(deps),
    createSendWhatsAppTool(deps),
    createSearchInternetTool(deps),
    createCreateBudgetTool(deps),
    createCreateRepairTool(deps),
    createCreatePrintOrderTool(deps),
    createCreateClientTool(deps),
    createGetConversationTool(deps),
    createSearchNotificationsTool(deps),
  ];
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

function createSearchClientTool(deps) {
  return {
    name: 'searchClient',
    description: 'Search for a client by name, phone, or email',
    inputSchema: { query: { type: 'string', required: true } },
    async execute(params) {
      if (!params.query) throw new Error('query is required');
      const results = await deps.query('clients', { search: params.query });
      return { results: Array.isArray(results) ? results : [] };
    },
  };
}

function createSearchRepairTool(deps) {
  return {
    name: 'searchRepair',
    description: 'Search repairs by client ID or status',
    inputSchema: { clientId: { type: 'string' }, status: { type: 'string' } },
    async execute(params) {
      const opts = {};
      if (params.clientId) opts.eq = { ...opts.eq, client_id: params.clientId };
      if (params.status) opts.eq = { ...opts.eq, status: params.status };
      const results = await deps.query('repairs', opts);
      return { results: Array.isArray(results) ? results : [] };
    },
  };
}

function createSearchBudgetTool(deps) {
  return {
    name: 'searchBudget',
    description: 'Search budgets by client ID or status',
    inputSchema: { clientId: { type: 'string' }, status: { type: 'string' } },
    async execute(params) {
      const opts = {};
      if (params.clientId) opts.eq = { ...opts.eq, client_id: params.clientId };
      if (params.status) opts.eq = { ...opts.eq, status: params.status };
      const results = await deps.query('budgets', opts);
      return { results: Array.isArray(results) ? results : [] };
    },
  };
}

function createSearchPrintOrderTool(deps) {
  return {
    name: 'searchPrintOrder',
    description: 'Search print orders by client ID or status',
    inputSchema: { clientId: { type: 'string' }, status: { type: 'string' } },
    async execute(params) {
      const opts = {};
      if (params.clientId) opts.eq = { ...opts.eq, client_id: params.clientId };
      if (params.status) opts.eq = { ...opts.eq, status: params.status };
      const results = await deps.query('print_orders', opts);
      return { results: Array.isArray(results) ? results : [] };
    },
  };
}

function createUpdateRepairStatusTool(deps) {
  return {
    name: 'updateRepairStatus',
    description: 'Update the status of a repair',
    inputSchema: { id: { type: 'string', required: true }, status: { type: 'string', required: true } },
    async execute(params) {
      await deps.update('repairs', params.id, { status: params.status });
      return { id: params.id, status: params.status, updated: true };
    },
  };
}

function createUpdateBudgetStatusTool(deps) {
  return {
    name: 'updateBudgetStatus',
    description: 'Update the status of a budget',
    inputSchema: { id: { type: 'string', required: true }, status: { type: 'string', required: true } },
    async execute(params) {
      await deps.update('budgets', params.id, { status: params.status });
      return { id: params.id, status: params.status, updated: true };
    },
  };
}

function createUpdatePrintOrderStatusTool(deps) {
  return {
    name: 'updatePrintOrderStatus',
    description: 'Update the status of a print order',
    inputSchema: { id: { type: 'string', required: true }, status: { type: 'string', required: true } },
    async execute(params) {
      await deps.update('print_orders', params.id, { status: params.status });
      return { id: params.id, status: params.status, updated: true };
    },
  };
}

function createSendWhatsAppTool(deps) {
  return {
    name: 'sendWhatsApp',
    description: 'Send a WhatsApp message to a phone number',
    inputSchema: { phone: { type: 'string', required: true }, message: { type: 'string', required: true } },
    async execute(params) {
      if (deps.whatsappChannel) {
        return deps.whatsappChannel.send({ phone: params.phone, message: params.message });
      }
      return { success: true, simulated: true, phone: params.phone };
    },
  };
}

function createSearchInternetTool(deps) {
  return {
    name: 'searchInternet',
    description: 'Search the internet for current information',
    inputSchema: { query: { type: 'string', required: true } },
    async execute(params) {
      if (deps.webSearch) {
        return deps.webSearch(params.query);
      }
      return { results: [], message: 'Web search not available' };
    },
  };
}

function createCreateBudgetTool(deps) {
  return {
    name: 'createBudget',
    description: 'Create a new budget for a client',
    inputSchema: { clientId: { type: 'string', required: true }, description: { type: 'string' }, amount: { type: 'number' } },
    async execute(params) {
      const id = deps.crypto?.randomUUID?.() || crypto.randomUUID();
      await deps.insert('budgets', { id, client_id: params.clientId, description: params.description || '', amount: params.amount || 0, status: 'pending' });
      return { id, clientId: params.clientId, status: 'pending' };
    },
  };
}

function createCreateRepairTool(deps) {
  return {
    name: 'createRepair',
    description: 'Create a new repair record for a client',
    inputSchema: { clientId: { type: 'string', required: true }, device: { type: 'string' }, problem: { type: 'string' } },
    async execute(params) {
      const id = deps.crypto?.randomUUID?.() || crypto.randomUUID();
      await deps.insert('repairs', { id, client_id: params.clientId, device: params.device || '', problem: params.problem || '', status: 'received' });
      return { id, clientId: params.clientId, status: 'received' };
    },
  };
}

function createCreatePrintOrderTool(deps) {
  return {
    name: 'createPrintOrder',
    description: 'Create a new 3D print order',
    inputSchema: { clientId: { type: 'string', required: true }, description: { type: 'string' }, material: { type: 'string' } },
    async execute(params) {
      const id = deps.crypto?.randomUUID?.() || crypto.randomUUID();
      await deps.insert('print_orders', { id, client_id: params.clientId, description: params.description || '', material: params.material || '', status: 'pending' });
      return { id, clientId: params.clientId, status: 'pending' };
    },
  };
}

function createCreateClientTool(deps) {
  return {
    name: 'createClient',
    description: 'Register a new client',
    inputSchema: { name: { type: 'string', required: true }, phone: { type: 'string' }, email: { type: 'string' } },
    async execute(params) {
      const id = deps.crypto?.randomUUID?.() || crypto.randomUUID();
      await deps.insert('clients', { id, name: params.name, phone: params.phone || null, email: params.email || null });
      return { id, name: params.name };
    },
  };
}

function createGetConversationTool(deps) {
  return {
    name: 'getConversation',
    description: 'Retrieve conversation history for a session',
    inputSchema: { sessionId: { type: 'string', required: true } },
    async execute(params) {
      if (deps.contextManager) {
        const session = deps.contextManager.getSession(params.sessionId);
        return { history: session?.conversationHistory || [] };
      }
      return { history: [] };
    },
  };
}

function createSearchNotificationsTool(deps) {
  return {
    name: 'searchNotifications',
    description: 'Search notifications by client ID or status',
    inputSchema: { clientId: { type: 'string' }, status: { type: 'string' } },
    async execute(params) {
      const opts = { order: 'created_at.desc' };
      if (params.clientId) opts.eq = { ...opts.eq, client_id: params.clientId };
      if (params.status) opts.eq = { ...opts.eq, status: params.status };
      const results = await deps.query('notifications', opts);
      return { results: Array.isArray(results) ? results : [] };
    },
  };
}
