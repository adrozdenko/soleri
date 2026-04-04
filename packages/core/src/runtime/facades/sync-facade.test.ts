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

  describe('vault_git_push', () => {
    it('pushes vault entries and returns pushed count', async () => {
      const op = ops.find((o) => o.name === 'vault_git_push')!;
      const result = (await op.handler({ remote: 'origin', branch: 'main' })) as {
        pushed: number;
      };
      expect(result.pushed).toBe(5);
    });
  });

  describe('vault_git_pull', () => {
    it('pulls from remote and returns imported count', async () => {
      const op = ops.find((o) => o.name === 'vault_git_pull')!;
      const result = (await op.handler({ remote: 'origin', branch: 'main' })) as {
        imported: number;
        conflicts: number;
      };
      expect(result.imported).toBe(3);
      expect(result.conflicts).toBe(0);
    });
  });

  describe('obsidian_export', () => {
    it('exports entries and returns exported count', async () => {
      const op = ops.find((o) => o.name === 'obsidian_export')!;
      const result = (await op.handler({ vaultPath: '/tmp/obsidian' })) as { exported: number };
      expect(result.exported).toBe(10);
    });
  });
});
