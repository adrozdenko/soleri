import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSyncFacadeOps } from './sync-facade.js';
import type { AgentRuntime } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks (same as sync-ops — facade delegates to createSyncOps)
// ---------------------------------------------------------------------------

vi.mock('../../vault/git-vault-sync.js', () => ({
  GitVaultSync: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.init = vi.fn().mockResolvedValue(undefined);
    this.syncAll = vi.fn().mockResolvedValue({ pushed: 5 });
    this.pull = vi.fn().mockResolvedValue({ imported: 3, conflicts: 0 });
    this.sync = vi.fn().mockResolvedValue({ pushed: 2, pulled: 1 });
  }),
}));

vi.mock('../../vault/linking.js', () => ({
  LinkManager: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.getAllLinksForEntries = vi.fn().mockReturnValue([]);
    this.addLink = vi.fn();
  }),
}));

vi.mock('../../vault/obsidian-sync.js', () => ({
  ObsidianSync: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.export = vi.fn().mockResolvedValue({ exported: 10 });
    this.import = vi.fn().mockResolvedValue({ imported: 5 });
    this.sync = vi.fn().mockResolvedValue({ pushed: 3, pulled: 2 });
  }),
}));

// ---------------------------------------------------------------------------
// Mock runtime
// ---------------------------------------------------------------------------

function mockRuntime(): AgentRuntime {
  return {
    config: { agentId: 'test-agent' },
    vault: {
      get: vi.fn(),
      seed: vi.fn(),
      seedDedup: vi.fn().mockReturnValue([]),
      list: vi.fn().mockReturnValue([]),
      exportAll: vi.fn().mockReturnValue({ entries: [] }),
      getProvider: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        run: vi.fn(),
      }),
    },
  } as unknown as AgentRuntime;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSyncFacadeOps', () => {
  let ops: ReturnType<typeof createSyncFacadeOps>;

  beforeEach(() => {
    vi.clearAllMocks();
    ops = createSyncFacadeOps(mockRuntime());
  });

  it('all ops have required fields', () => {
    for (const op of ops) {
      expect(op.name).toBeDefined();
      expect(op.description).toBeDefined();
      expect(op.auth).toBeDefined();
      expect(typeof op.handler).toBe('function');
    }
  });
});
