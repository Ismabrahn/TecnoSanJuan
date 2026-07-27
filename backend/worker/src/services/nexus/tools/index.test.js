import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { registerTools } from './index.js';

function makeDeps(overrides = {}) {
  return {
    query: overrides.query || vi.fn().mockResolvedValue([]),
    update: overrides.update || vi.fn().mockResolvedValue(undefined),
    insert: overrides.insert || vi.fn().mockResolvedValue({ id: 'new-id' }),
    delete: overrides.delete || vi.fn().mockResolvedValue(undefined),
    webSearch: overrides.webSearch,
    formatSearchResults: overrides.formatSearchResults,
    whatsappChannel: overrides.whatsappChannel,
    contextManager: overrides.contextManager,
    crypto: overrides.crypto,
  };
}

describe('registerTools', () => {
  it('registers all tools', () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.count()).toBe(15);
  });

  it('searchClient tool exists', () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists('searchClient')).toBe(true);
  });

  it('searchClient executes query', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 1, name: 'Juan' }]);
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ query }));
    const tool = registry.get('searchClient');
    const result = await tool.execute({ query: 'Juan' });
    expect(query).toHaveBeenCalledWith('clients', { search: 'Juan' });
    expect(result.results).toHaveLength(1);
  });

  it('searchClient requires query param', async () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    const tool = registry.get('searchClient');
    await expect(tool.execute({})).rejects.toThrow('query is required');
  });

  it('updateRepairStatus tool exists and executes', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ update }));
    const tool = registry.get('updateRepairStatus');
    const result = await tool.execute({ id: 'r1', status: 'completed' });
    expect(update).toHaveBeenCalledWith('repairs', 'r1', { status: 'completed' });
    expect(result.status).toBe('completed');
  });

  it('sendWhatsApp tool exists', () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists('sendWhatsApp')).toBe(true);
  });

  it('sendWhatsApp simulates when no channel', async () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    const tool = registry.get('sendWhatsApp');
    const result = await tool.execute({ phone: '123', message: 'Hola' });
    expect(result.simulated).toBe(true);
  });

  it('sendWhatsApp uses channel when available', async () => {
    const whatsappChannel = { send: vi.fn().mockResolvedValue({ success: true }) };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ whatsappChannel }));
    const tool = registry.get('sendWhatsApp');
    await tool.execute({ phone: '123', message: 'Hola' });
    expect(whatsappChannel.send).toHaveBeenCalledWith({ phone: '123', message: 'Hola' });
  });

  it('createBudget tool exists and executes', async () => {
    const insert = vi.fn().mockResolvedValue({ id: 'b1' });
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ insert }));
    const tool = registry.get('createBudget');
    const result = await tool.execute({ clientId: 'c1', amount: 500 });
    expect(insert).toHaveBeenCalled();
    expect(result.clientId).toBe('c1');
  });

  it('createClient tool exists and executes', async () => {
    const insert = vi.fn().mockResolvedValue({ id: 'c-new' });
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ insert }));
    const tool = registry.get('createClient');
    const result = await tool.execute({ name: 'Pedro', phone: '264555' });
    expect(insert).toHaveBeenCalled();
    expect(result.name).toBe('Pedro');
  });

  it('getConversation returns history via contextManager', async () => {
    const cm = { getSession: vi.fn().mockReturnValue({ conversationHistory: [{ role: 'user', content: 'Hi' }] }) };
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ contextManager: cm }));
    const tool = registry.get('getConversation');
    const result = await tool.execute({ sessionId: 's1' });
    expect(result.history).toHaveLength(1);
  });

  it('searchInternet tool uses webSearch when available', async () => {
    const webSearch = vi.fn().mockResolvedValue({ results: [] });
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps({ webSearch }));
    const tool = registry.get('searchInternet');
    await tool.execute({ query: 'test' });
    expect(webSearch).toHaveBeenCalledWith('test');
  });

  it('searchNotifications tool exists', () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists('searchNotifications')).toBe(true);
  });

  it('createRepair tool exists', () => {
    const registry = new ToolRegistry();
    registerTools(registry, makeDeps());
    expect(registry.exists('createRepair')).toBe(true);
  });
});
