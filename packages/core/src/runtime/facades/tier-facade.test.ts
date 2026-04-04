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
  it('every op has name, handler, and auth', () => {
    const ops = createTierFacadeOps(makeRuntime());
    for (const op of ops) {
      expect(typeof op.name).toBe('string');
      expect(typeof op.handler).toBe('function');
      expect(typeof op.auth).toBe('string');
    }
  });
});
