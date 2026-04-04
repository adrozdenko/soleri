/**
 * Colocated contract tests for branching-ops.ts.
 * Tests the 5 vault branching ops extracted from vault-facade.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBranchingOps } from './branching-ops.js';
import { captureOps, executeOp } from '../engine/test-helpers.js';
import type { CapturedOp } from '../engine/test-helpers.js';
import type { AgentRuntime } from './types.js';

function makeMockVaultBranching() {
  return {
    branch: vi.fn(),
    addOperation: vi.fn(),
    listBranches: vi.fn().mockReturnValue([{ name: 'experiment', ops: 3 }]),
    merge: vi.fn().mockReturnValue({ merged: true, applied: 3 }),
    deleteBranch: vi.fn().mockReturnValue(true),
  };
}

function makeRuntime(): AgentRuntime {
  return {
    vaultBranching: makeMockVaultBranching(),
    config: { agentId: 'test-agent' },
  } as unknown as AgentRuntime;
}

describe('branching-ops', () => {
  let runtime: AgentRuntime;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    runtime = makeRuntime();
    ops = captureOps(createBranchingOps(runtime));
  });

  describe('vault_branch', () => {
    it('creates a branch', async () => {
      const result = await executeOp(ops, 'vault_branch', { name: 'experiment' });
      expect(result.success).toBe(true);
      const data = result.data as { created: boolean; name: string };
      expect(data.created).toBe(true);
      expect(data.name).toBe('experiment');
    });

    it('returns error on duplicate branch', async () => {
      const vb = runtime.vaultBranching as ReturnType<typeof makeMockVaultBranching>;
      vb.branch.mockImplementation(() => {
        throw new Error('Branch already exists');
      });
      const result = await executeOp(ops, 'vault_branch', { name: 'dup' });
      expect(result.success).toBe(true);
      const data = result.data as { error: string };
      expect(data.error).toBe('Branch already exists');
    });
  });

  describe('vault_branch_add', () => {
    it('adds an operation to a branch', async () => {
      const result = await executeOp(ops, 'vault_branch_add', {
        branchName: 'exp',
        entryId: 'e1',
        action: 'add',
        entryData: { id: 'e1', title: 'New', type: 'pattern', domain: 'test' },
      });
      expect(result.success).toBe(true);
      const data = result.data as { added: boolean; action: string };
      expect(data.added).toBe(true);
      expect(data.action).toBe('add');
    });

    it('returns error on invalid branch', async () => {
      const vb = runtime.vaultBranching as ReturnType<typeof makeMockVaultBranching>;
      vb.addOperation.mockImplementation(() => {
        throw new Error('Branch not found');
      });
      const result = await executeOp(ops, 'vault_branch_add', {
        branchName: 'missing',
        entryId: 'e1',
        action: 'remove',
      });
      expect(result.success).toBe(true);
      expect((result.data as { error: string }).error).toBe('Branch not found');
    });
  });

  describe('vault_branch_list', () => {
    it('lists all branches', async () => {
      const result = await executeOp(ops, 'vault_branch_list', {});
      expect(result.success).toBe(true);
      const data = result.data as { branches: Array<{ name: string }> };
      expect(data.branches).toHaveLength(1);
      expect(data.branches[0].name).toBe('experiment');
    });
  });

  describe('vault_merge_branch', () => {
    it('merges a branch', async () => {
      const result = await executeOp(ops, 'vault_merge_branch', { branchName: 'experiment' });
      expect(result.success).toBe(true);
      const data = result.data as { merged: boolean; applied: number };
      expect(data.merged).toBe(true);
      expect(data.applied).toBe(3);
    });

    it('returns error on merge failure', async () => {
      const vb = runtime.vaultBranching as ReturnType<typeof makeMockVaultBranching>;
      vb.merge.mockImplementation(() => {
        throw new Error('Conflict detected');
      });
      const result = await executeOp(ops, 'vault_merge_branch', { branchName: 'conflict' });
      expect(result.success).toBe(true);
      expect((result.data as { error: string }).error).toBe('Conflict detected');
    });
  });

  describe('vault_delete_branch', () => {
    it('deletes a branch', async () => {
      const result = await executeOp(ops, 'vault_delete_branch', { branchName: 'experiment' });
      expect(result.success).toBe(true);
      const data = result.data as { deleted: boolean; branchName: string };
      expect(data.deleted).toBe(true);
      expect(data.branchName).toBe('experiment');
    });
  });
});
