/**
 * Colocated contract tests for tier-facade.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTierFacadeOps } from './tier-facade.js';
import type { AgentRuntime } from '../types.js';

function makeRuntime(): AgentRuntime {
  return {
    vaultManager: {
      open: vi.fn(),
      disconnect: vi.fn().mockReturnValue(true),
      listTiers: vi.fn().mockReturnValue([{ name: 'agent', count: 10 }]),
      search: vi.fn().mockReturnValue([{ entry: { id: 'e1' }, score: 0.9 }]),
      connect: vi.fn(),
      disconnectNamed: vi.fn().mockReturnValue(true),
      listConnected: vi.fn().mockReturnValue([{ name: 'team-vault', priority: 2 }]),
    },
    config: { agentId: 'test-agent' },
  } as unknown as AgentRuntime;
}

describe('tier-facade', () => {
  describe('vault_tiers', () => {
    it('returns all vault tiers', async () => {
      const ops = createTierFacadeOps(makeRuntime());
      const op = ops.find((o) => o.name === 'vault_tiers')!;
      const result = (await op.handler({})) as { tiers: unknown[] };
      expect(result.tiers).toHaveLength(1);
    });
  });

  describe('vault_search_all', () => {
    it('returns search results with count', async () => {
      const ops = createTierFacadeOps(makeRuntime());
      const op = ops.find((o) => o.name === 'vault_search_all')!;
      const result = (await op.handler({ query: 'test', limit: 5 })) as {
        results: unknown[];
        count: number;
      };
      expect(result.count).toBe(1);
      expect(result.results).toHaveLength(1);
    });
  });

  describe('vault_list_sources', () => {
    it('returns connected sources', async () => {
      const ops = createTierFacadeOps(makeRuntime());
      const op = ops.find((o) => o.name === 'vault_list_sources')!;
      const result = (await op.handler({})) as { sources: unknown[] };
      expect(result.sources).toHaveLength(1);
    });
  });
});
