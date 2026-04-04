/**
 * Colocated contract tests for branching-facade.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { createBranchingFacadeOps } from './branching-facade.js';
import type { AgentRuntime } from '../types.js';

function makeRuntime(): AgentRuntime {
  return {
    vaultBranching: {
      branch: vi.fn(),
      addOperation: vi.fn(),
      listBranches: vi.fn().mockReturnValue([]),
      merge: vi.fn().mockReturnValue({ merged: true, applied: 0 }),
      deleteBranch: vi.fn().mockReturnValue(true),
    },
    config: { agentId: 'test-agent' },
  } as unknown as AgentRuntime;
}

describe('branching-facade', () => {
  describe('vault_branch', () => {
    it('creates branch and returns created: true', async () => {
      const runtime = makeRuntime();
      const ops = createBranchingFacadeOps(runtime);
      const op = ops.find((o) => o.name === 'vault_branch')!;
      const result = (await op.handler({ name: 'feature-x' })) as {
        created: boolean;
        name: string;
      };
      expect(result.created).toBe(true);
      expect(result.name).toBe('feature-x');
    });
  });

  describe('vault_branch_list', () => {
    it('returns empty list when no branches exist', async () => {
      const runtime = makeRuntime();
      const ops = createBranchingFacadeOps(runtime);
      const op = ops.find((o) => o.name === 'vault_branch_list')!;
      const result = (await op.handler({})) as { branches: unknown[] };
      expect(result.branches).toEqual([]);
    });
  });

  describe('vault_delete_branch', () => {
    it('returns deleted: true on success', async () => {
      const runtime = makeRuntime();
      const ops = createBranchingFacadeOps(runtime);
      const op = ops.find((o) => o.name === 'vault_delete_branch')!;
      const result = (await op.handler({ name: 'feature-x' })) as { deleted: boolean };
      expect(result.deleted).toBe(true);
    });
  });
});
