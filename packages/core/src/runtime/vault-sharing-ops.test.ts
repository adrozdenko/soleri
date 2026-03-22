import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVaultSharingOps } from './vault-sharing-ops.js';
import type { AgentRuntime } from './types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../vault/scope-detector.js', () => ({
  detectScope: vi.fn().mockReturnValue({
    tier: 'project',
    confidence: 'HIGH',
    reason: 'project-specific pattern',
    signals: [],
  }),
}));

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
    knowledgeReview: {
      submit: vi.fn().mockReturnValue({ entryId: 'e1', status: 'pending_review' }),
      approve: vi.fn().mockReturnValue({ entryId: 'e1', status: 'approved' }),
      reject: vi.fn().mockReturnValue({ entryId: 'e1', status: 'rejected' }),
      listPending: vi.fn().mockReturnValue([]),
      stats: vi.fn().mockReturnValue({ pending: 0, approved: 5, rejected: 1 }),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: ReturnType<typeof createVaultSharingOps>, name: string) {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createVaultSharingOps', () => {
  let rt: AgentRuntime;
  let ops: ReturnType<typeof createVaultSharingOps>;

  beforeEach(() => {
    vi.clearAllMocks();
    rt = mockRuntime();
    ops = createVaultSharingOps(rt);
  });

  it('returns 13 ops', () => {
    expect(ops.length).toBe(13);
  });

  // ─── vault_detect_scope ───────────────────────────────────────

  describe('vault_detect_scope', () => {
    it('returns scope detection result', async () => {
      const op = findOp(ops, 'vault_detect_scope');
      const result = (await op.handler({
        title: 'Test pattern',
        description: 'A project-specific pattern',
      })) as Record<string, unknown>;
      expect(result.tier).toBe('project');
      expect(result.confidence).toBe('HIGH');
    });
  });

  // ─── vault_set_scope ──────────────────────────────────────────

  describe('vault_set_scope', () => {
    it('returns error when entry not found', async () => {
      const op = findOp(ops, 'vault_set_scope');
      vi.mocked(rt.vault.get).mockReturnValue(undefined as never);
      const result = (await op.handler({ id: 'missing', tier: 'team' })) as Record<
        string,
        unknown
      >;
      expect(result.error).toContain('not found');
    });

    it('updates scope tier on existing entry', async () => {
      const op = findOp(ops, 'vault_set_scope');
      vi.mocked(rt.vault.get).mockReturnValue({
        id: 'e1',
        title: 'Entry',
        tier: 'agent',
      } as never);
      const result = (await op.handler({ id: 'e1', tier: 'team' })) as Record<string, unknown>;
      expect(result.updated).toBe(true);
      expect(result.tier).toBe('team');
      expect(rt.vault.seed).toHaveBeenCalled();
    });
  });

  // ─── vault_list_by_scope ──────────────────────────────────────

  describe('vault_list_by_scope', () => {
    it('queries entries filtered by tier', async () => {
      const op = findOp(ops, 'vault_list_by_scope');
      const provider = rt.vault.getProvider();
      vi.mocked(provider.all).mockReturnValue([
        {
          id: 'e1',
          type: 'pattern',
          domain: 'general',
          title: 'Entry 1',
          severity: 'suggestion',
          description: 'desc',
          tier: 'team',
          tags: '["a"]',
        },
      ]);
      const result = (await op.handler({ tier: 'team' })) as Record<string, unknown>;
      expect(result.count).toBe(1);
      expect(result.tier).toBe('team');
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

  // ─── vault_submit_review ──────────────────────────────────────

  describe('vault_submit_review', () => {
    it('submits entry for review', async () => {
      const op = findOp(ops, 'vault_submit_review');
      const result = (await op.handler({ entryId: 'e1' })) as Record<string, unknown>;
      expect(result.status).toBe('pending_review');
    });

    it('returns error on failure', async () => {
      const op = findOp(ops, 'vault_submit_review');
      vi.mocked(rt.knowledgeReview.submit).mockImplementation(() => {
        throw new Error('Not found');
      });
      const result = (await op.handler({ entryId: 'missing' })) as Record<string, unknown>;
      expect(result.error).toContain('Not found');
    });
  });

  // ─── vault_approve ────────────────────────────────────────────

  describe('vault_approve', () => {
    it('approves a pending entry', async () => {
      const op = findOp(ops, 'vault_approve');
      const result = (await op.handler({ entryId: 'e1' })) as Record<string, unknown>;
      expect(result.status).toBe('approved');
    });
  });

  // ─── vault_reject ─────────────────────────────────────────────

  describe('vault_reject', () => {
    it('rejects a pending entry with comment', async () => {
      const op = findOp(ops, 'vault_reject');
      const result = (await op.handler({
        entryId: 'e1',
        comment: 'Needs more detail',
      })) as Record<string, unknown>;
      expect(result.status).toBe('rejected');
    });
  });

  // ─── vault_pending_reviews ────────────────────────────────────

  describe('vault_pending_reviews', () => {
    it('lists pending reviews', async () => {
      const op = findOp(ops, 'vault_pending_reviews');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.count).toBe(0);
    });
  });

  // ─── vault_review_stats ───────────────────────────────────────

  describe('vault_review_stats', () => {
    it('returns review statistics', async () => {
      const op = findOp(ops, 'vault_review_stats');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.approved).toBe(5);
    });
  });
});
