/**
 * Colocated contract tests for tier-ops.ts.
 * Tests the 7 multi-vault tier and named source ops extracted from vault-facade.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTierOps } from './tier-ops.js';
import { captureOps, executeOp } from '../engine/test-helpers.js';
import type { CapturedOp } from '../engine/test-helpers.js';
import type { AgentRuntime } from './types.js';

function makeMockVaultManager() {
  return {
    open: vi.fn(),
    disconnect: vi.fn().mockReturnValue(true),
    listTiers: vi.fn().mockReturnValue([{ tier: 'agent', connected: true, entries: 25 }]),
    search: vi.fn().mockReturnValue([{ id: 'e1', tier: 'agent', score: 0.9 }]),
    connect: vi.fn(),
    disconnectNamed: vi.fn().mockReturnValue(true),
    listConnected: vi.fn().mockReturnValue([{ name: 'team-shared', priority: 0.5 }]),
  };
}

function makeRuntime(): AgentRuntime {
  return {
    vaultManager: makeMockVaultManager(),
    config: { agentId: 'test-agent' },
  } as unknown as AgentRuntime;
}

describe('tier-ops', () => {
  let runtime: AgentRuntime;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    runtime = makeRuntime();
    ops = captureOps(createTierOps(runtime));
  });

  // ─── Multi-vault ops ──────────────────────────────────────────────

  describe('vault_connect', () => {
    it('connects a vault tier', async () => {
      const result = await executeOp(ops, 'vault_connect', {
        tier: 'project',
        path: '/tmp/project.db',
      });
      expect(result.success).toBe(true);
      const data = result.data as { connected: boolean; tier: string; path: string };
      expect(data.connected).toBe(true);
      expect(data.tier).toBe('project');
      expect(data.path).toBe('/tmp/project.db');
    });
  });

  describe('vault_disconnect', () => {
    it('disconnects a vault tier', async () => {
      const result = await executeOp(ops, 'vault_disconnect', { tier: 'team' });
      expect(result.success).toBe(true);
      const data = result.data as { disconnected: boolean; tier: string };
      expect(data.disconnected).toBe(true);
      expect(data.tier).toBe('team');
    });
  });

  describe('vault_tiers', () => {
    it('lists vault tiers', async () => {
      const result = await executeOp(ops, 'vault_tiers', {});
      expect(result.success).toBe(true);
      const data = result.data as { tiers: Array<{ tier: string }> };
      expect(data.tiers).toHaveLength(1);
      expect(data.tiers[0].tier).toBe('agent');
    });
  });

  describe('vault_search_all', () => {
    it('searches across all tiers', async () => {
      const result = await executeOp(ops, 'vault_search_all', { query: 'tokens' });
      expect(result.success).toBe(true);
      const data = result.data as { results: unknown[]; count: number };
      expect(data.count).toBe(1);
      const vm = runtime.vaultManager as ReturnType<typeof makeMockVaultManager>;
      expect(vm.search).toHaveBeenCalledWith('tokens', 20);
    });

    it('passes custom limit', async () => {
      await executeOp(ops, 'vault_search_all', { query: 'test', limit: 5 });
      const vm = runtime.vaultManager as ReturnType<typeof makeMockVaultManager>;
      expect(vm.search).toHaveBeenCalledWith('test', 5);
    });
  });

  // ─── Named vault connections ───────────────────────────────────────

  describe('vault_connect_source', () => {
    it('connects with default priority', async () => {
      const result = await executeOp(ops, 'vault_connect_source', {
        name: 'team-kb',
        path: '/tmp/team.db',
      });
      expect(result.success).toBe(true);
      const data = result.data as { connected: boolean; priority: number };
      expect(data.connected).toBe(true);
      expect(data.priority).toBe(0.5);
    });

    it('connects with custom priority', async () => {
      const result = await executeOp(ops, 'vault_connect_source', {
        name: 'primary',
        path: '/tmp/p.db',
        priority: 1.5,
      });
      expect(result.success).toBe(true);
      const vm = runtime.vaultManager as ReturnType<typeof makeMockVaultManager>;
      expect(vm.connect).toHaveBeenCalledWith('primary', '/tmp/p.db', 1.5);
    });
  });

  describe('vault_disconnect_source', () => {
    it('disconnects a named source', async () => {
      const result = await executeOp(ops, 'vault_disconnect_source', { name: 'team-kb' });
      expect(result.success).toBe(true);
      const data = result.data as { disconnected: boolean; name: string };
      expect(data.disconnected).toBe(true);
      expect(data.name).toBe('team-kb');
    });
  });

  describe('vault_list_sources', () => {
    it('lists connected sources', async () => {
      const result = await executeOp(ops, 'vault_list_sources', {});
      expect(result.success).toBe(true);
      const data = result.data as { sources: Array<{ name: string }> };
      expect(data.sources).toHaveLength(1);
      expect(data.sources[0].name).toBe('team-shared');
    });
  });
});
