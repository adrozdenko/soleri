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

  it('returns 8 ops matching sync-ops', () => {
    expect(ops.length).toBe(8);
  });

  it('includes all expected op names', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('vault_git_push');
    expect(names).toContain('vault_git_pull');
    expect(names).toContain('vault_git_sync');
    expect(names).toContain('obsidian_export');
    expect(names).toContain('obsidian_import');
    expect(names).toContain('obsidian_sync');
    expect(names).toContain('vault_export_pack');
    expect(names).toContain('vault_import_pack');
  });

  it('all ops have required fields', () => {
    for (const op of ops) {
      expect(op.name).toBeDefined();
      expect(op.description).toBeDefined();
      expect(op.auth).toBeDefined();
      expect(typeof op.handler).toBe('function');
    }
  });

  it('git ops use write auth', () => {
    const gitOps = ops.filter((o) => o.name.startsWith('vault_git_'));
    for (const op of gitOps) {
      expect(op.auth).toBe('write');
    }
  });

  it('obsidian_export uses read auth', () => {
    const op = ops.find((o) => o.name === 'obsidian_export');
    expect(op!.auth).toBe('read');
  });

  it('vault_export_pack uses read auth', () => {
    const op = ops.find((o) => o.name === 'vault_export_pack');
    expect(op!.auth).toBe('read');
  });

  it('vault_import_pack uses write auth', () => {
    const op = ops.find((o) => o.name === 'vault_import_pack');
    expect(op!.auth).toBe('write');
  });
});
