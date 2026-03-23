import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSyncOps } from './sync-ops.js';
import type { AgentRuntime } from './types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../vault/git-vault-sync.js', () => ({
  GitVaultSync: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.init = vi.fn().mockResolvedValue(undefined);
    this.syncAll = vi.fn().mockResolvedValue({ pushed: 5 });
    this.pull = vi.fn().mockResolvedValue({ imported: 3, conflicts: 0 });
    this.sync = vi.fn().mockResolvedValue({ pushed: 2, pulled: 1 });
  }),
}));

vi.mock('../vault/linking.js', () => ({
  LinkManager: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.getAllLinksForEntries = vi.fn().mockReturnValue([]);
    this.addLink = vi.fn();
  }),
}));

vi.mock('../vault/obsidian-sync.js', () => ({
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

function findOp(ops: ReturnType<typeof createSyncOps>, name: string) {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSyncOps', () => {
  let rt: AgentRuntime;
  let ops: ReturnType<typeof createSyncOps>;

  beforeEach(() => {
    vi.clearAllMocks();
    rt = mockRuntime();
    ops = createSyncOps(rt);
  });

  it('returns 8 ops', () => {
    expect(ops.length).toBe(8);
  });

  it('has the expected op names', () => {
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'vault_git_push',
      'vault_git_pull',
      'vault_git_sync',
      'obsidian_export',
      'obsidian_import',
      'obsidian_sync',
      'vault_export_pack',
      'vault_import_pack',
    ]);
  });

  // ─── vault_git_push ───────────────────────────────────────────

  describe('vault_git_push', () => {
    it('initializes sync and pushes entries', async () => {
      const op = findOp(ops, 'vault_git_push');
      const result = (await op.handler({ repoDir: '/tmp/vault-repo' })) as Record<
        string,
        unknown
      >;
      expect(result.pushed).toBe(5);
    });
  });

  // ─── vault_git_pull ───────────────────────────────────────────

  describe('vault_git_pull', () => {
    it('pulls entries from git directory', async () => {
      const op = findOp(ops, 'vault_git_pull');
      const result = (await op.handler({ repoDir: '/tmp/vault-repo' })) as Record<
        string,
        unknown
      >;
      expect(result.imported).toBe(3);
    });
  });

  // ─── vault_git_sync ───────────────────────────────────────────

  describe('vault_git_sync', () => {
    it('performs bidirectional sync', async () => {
      const op = findOp(ops, 'vault_git_sync');
      const result = (await op.handler({ repoDir: '/tmp/vault-repo' })) as Record<
        string,
        unknown
      >;
      expect(result.pushed).toBe(2);
      expect(result.pulled).toBe(1);
    });
  });

  // ─── obsidian_export ──────────────────────────────────────────

  describe('obsidian_export', () => {
    it('exports entries to Obsidian format', async () => {
      const op = findOp(ops, 'obsidian_export');
      const result = (await op.handler({ obsidianDir: '/tmp/obsidian' })) as Record<
        string,
        unknown
      >;
      expect(result.exported).toBe(10);
    });
  });

  // ─── obsidian_import ──────────────────────────────────────────

  describe('obsidian_import', () => {
    it('imports from Obsidian directory', async () => {
      const op = findOp(ops, 'obsidian_import');
      const result = (await op.handler({ obsidianDir: '/tmp/obsidian' })) as Record<
        string,
        unknown
      >;
      expect(result.imported).toBe(5);
    });
  });

  // ─── obsidian_sync ────────────────────────────────────────────

  describe('obsidian_sync', () => {
    it('performs bidirectional Obsidian sync', async () => {
      const op = findOp(ops, 'obsidian_sync');
      const result = (await op.handler({ obsidianDir: '/tmp/obsidian' })) as Record<
        string,
        unknown
      >;
      expect(result.pushed).toBe(3);
      expect(result.pulled).toBe(2);
    });
  });

  // ─── vault_export_pack ────────────────────────────────────────

  describe('vault_export_pack', () => {
    it('exports entries as intelligence bundles', async () => {
      const op = findOp(ops, 'vault_export_pack');
      vi.mocked(rt.vault.list).mockReturnValue([
        { id: 'e1', domain: 'testing', tier: 'team', tags: [] },
        { id: 'e2', domain: 'testing', tier: 'team', tags: [] },
      ] as never);
      const result = (await op.handler({ tier: 'team' })) as Record<string, unknown>;
      expect(result.totalEntries).toBe(2);
      expect(result.name).toBe('test-agent');
    });

    it('excludes specified IDs', async () => {
      const op = findOp(ops, 'vault_export_pack');
      vi.mocked(rt.vault.list).mockReturnValue([
        { id: 'e1', domain: 'd', tier: 'team', tags: [] },
        { id: 'e2', domain: 'd', tier: 'team', tags: [] },
      ] as never);
      const result = (await op.handler({ excludeIds: ['e1'] })) as Record<string, unknown>;
      expect(result.totalEntries).toBe(1);
    });
  });

  // ─── vault_import_pack ────────────────────────────────────────

  describe('vault_import_pack', () => {
    it('imports bundles and returns counts', async () => {
      const op = findOp(ops, 'vault_import_pack');
      vi.mocked(rt.vault.seedDedup).mockReturnValue([
        { id: 'new-1', action: 'inserted' },
        { id: 'dup-1', action: 'skipped', existingId: 'existing-1' },
      ] as never);
      const result = (await op.handler({
        bundles: [
          {
            domain: 'testing',
            version: '1.0.0',
            entries: [{ id: 'e1' }, { id: 'e2' }],
          },
        ],
      })) as Record<string, unknown>;
      expect(result.imported).toBe(1);
      expect(result.duplicates).toBe(1);
      expect(result.total).toBe(2);
    });
  });
});
