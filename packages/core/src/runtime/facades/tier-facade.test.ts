/**
 * Colocated contract tests for tier-facade.ts.
 * Verifies the facade wrapper delegates to tier-ops.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTierFacadeOps } from './tier-facade.js';
import type { AgentRuntime } from '../types.js';

function makeRuntime(): AgentRuntime {
  return {
    vaultManager: {
      open: vi.fn(),
      disconnect: vi.fn().mockReturnValue(true),
      listTiers: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
      connect: vi.fn(),
      disconnectNamed: vi.fn().mockReturnValue(true),
      listConnected: vi.fn().mockReturnValue([]),
    },
    config: { agentId: 'test-agent' },
  } as unknown as AgentRuntime;
}

describe('tier-facade', () => {
  it('returns all 7 tier/source ops', () => {
    const ops = createTierFacadeOps(makeRuntime());
    expect(ops).toHaveLength(7);
    const names = ops.map((o) => o.name);
    expect(names).toContain('vault_connect');
    expect(names).toContain('vault_disconnect');
    expect(names).toContain('vault_tiers');
    expect(names).toContain('vault_search_all');
    expect(names).toContain('vault_connect_source');
    expect(names).toContain('vault_disconnect_source');
    expect(names).toContain('vault_list_sources');
  });

  it('every op has name, handler, and auth', () => {
    const ops = createTierFacadeOps(makeRuntime());
    for (const op of ops) {
      expect(typeof op.name).toBe('string');
      expect(typeof op.handler).toBe('function');
      expect(typeof op.auth).toBe('string');
    }
  });
});
