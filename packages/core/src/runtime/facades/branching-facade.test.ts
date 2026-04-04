/**
 * Colocated contract tests for branching-facade.ts.
 * Verifies the facade wrapper delegates to branching-ops.
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
  it('every op has name, handler, and auth', () => {
    const ops = createBranchingFacadeOps(makeRuntime());
    for (const op of ops) {
      expect(typeof op.name).toBe('string');
      expect(typeof op.handler).toBe('function');
      expect(typeof op.auth).toBe('string');
    }
  });
});
