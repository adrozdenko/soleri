import { describe, it, expect, afterEach } from 'vitest';
import { createAgentRuntime } from '../runtime/runtime.js';
import type { AgentRuntime } from '../runtime/types.js';

describe('createAgentRuntime', () => {
  let runtime: AgentRuntime | null = null;

  afterEach(() => {
    runtime?.close();
    runtime = null;
  });

  it('should create a runtime with all modules initialized', () => {
    runtime = createAgentRuntime({
      agentId: 'test-agent',
      vaultPath: ':memory:',
    });

    expect(runtime.config.agentId).toBe('test-agent');
    expect(runtime.vault).toBeDefined();
    expect(runtime.brain).toBeDefined();
    expect(runtime.planner).toBeDefined();
    expect(runtime.curator).toBeDefined();
    expect(runtime.keyPool.openai).toBeDefined();
    expect(runtime.keyPool.anthropic).toBeDefined();
    expect(runtime.llmClient).toBeDefined();
  });

  it('should use :memory: vault when specified', () => {
    runtime = createAgentRuntime({
      agentId: 'test-mem',
      vaultPath: ':memory:',
    });

    const stats = runtime.vault.stats();
    expect(stats.totalEntries).toBe(0);
  });

  it('should preserve config on runtime', () => {
    runtime = createAgentRuntime({
      agentId: 'test-cfg',
      vaultPath: ':memory:',
      dataDir: '/nonexistent',
    });

    expect(runtime.config.agentId).toBe('test-cfg');
    expect(runtime.config.vaultPath).toBe(':memory:');
    expect(runtime.config.dataDir).toBe('/nonexistent');
  });

  it('close() should not throw', () => {
    runtime = createAgentRuntime({
      agentId: 'test-close',
      vaultPath: ':memory:',
    });

    expect(() => runtime!.close()).not.toThrow();
    runtime = null; // already closed
  });

  it('brain should be wired to vault', () => {
    runtime = createAgentRuntime({
      agentId: 'test-brain-wire',
      vaultPath: ':memory:',
    });

    // Seed some data through vault
    runtime.vault.seed([
      {
        id: 'rt-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Runtime test pattern',
        severity: 'warning',
        description: 'A test.',
        tags: ['test'],
      },
    ]);

    // Brain should find it
    runtime.brain.rebuildVocabulary();
    const results = runtime.brain.intelligentSearch('runtime test', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
  });

  it('curator should be wired to vault', () => {
    runtime = createAgentRuntime({
      agentId: 'test-curator-wire',
      vaultPath: ':memory:',
    });

    const status = runtime.curator.getStatus();
    expect(status.initialized).toBe(true);
  });
});
