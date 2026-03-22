import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVaultExtraOps } from './vault-extra-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

// ─── Mock content-hash module ─────────────────────────────────────────

vi.mock('../vault/content-hash.js', () => ({
  computeContentHash: vi.fn(() => 'abc123hash'),
}));

// ─── Mock Runtime Factory ──────────────────────────────────────────────

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    type: 'pattern',
    domain: 'testing',
    title: 'Test Pattern',
    severity: 'suggestion',
    description: 'A test pattern',
    tags: ['test'],
    context: undefined,
    example: undefined,
    counterExample: undefined,
    why: undefined,
    appliesTo: undefined,
    ...overrides,
  };
}

function createMockRuntime(): AgentRuntime {
  return {
    vault: {
      get: vi.fn((id: string) => (id === 'entry-1' ? makeEntry() : null)),
      add: vi.fn(),
      update: vi.fn((id: string) => (id === 'entry-1' ? makeEntry() : null)),
      remove: vi.fn(() => true),
      list: vi.fn(() => [makeEntry()]),
      seed: vi.fn((entries: any[]) => entries.length),
      bulkRemove: vi.fn((ids: string[]) => ids.length),
      stats: vi.fn(() => ({ totalEntries: 10, byDomain: { testing: 5 } })),
      getTags: vi.fn(() => [
        { tag: 'test', count: 5 },
        { tag: 'design', count: 3 },
      ]),
      getDomains: vi.fn(() => [
        { domain: 'testing', count: 5 },
        { domain: 'design', count: 3 },
      ]),
      getRecent: vi.fn((limit: number) => [makeEntry()]),
      exportAll: vi.fn(() => ({ entries: [makeEntry()], exportedAt: Date.now() })),
      getAgeReport: vi.fn(() => ({
        buckets: [
          { label: 'today', count: 2 },
          { label: 'this_week', count: 3 },
          { label: 'this_month', count: 2 },
          { label: 'this_quarter', count: 1 },
          { label: 'older', count: 2 },
        ],
        oldestTimestamp: 1700000000,
        newestTimestamp: Date.now(),
      })),
      getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
          all: vi.fn(() => [{ tag: 'auth', type_count: 2 }]),
        })),
      })),
      setTemporal: vi.fn(() => true),
      findExpiring: vi.fn(() => [makeEntry()]),
      findExpired: vi.fn(() => [makeEntry()]),
      archive: vi.fn(() => ({ archived: 3, reason: 'cleanup' })),
      restore: vi.fn(() => true),
      optimize: vi.fn(() => ({ vacuumed: true, analyzed: true, ftsRebuilt: true })),
      findByContentHash: vi.fn(() => null),
      contentHashStats: vi.fn(() => ({
        total: 10,
        hashed: 9,
        uniqueHashes: 8,
      })),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op not found: ${name}`);
  return op;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('createVaultExtraOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  beforeEach(() => {
    runtime = createMockRuntime();
    ops = createVaultExtraOps(runtime);
  });

  it('returns 25 ops', () => {
    expect(ops).toHaveLength(25);
  });

  it('all ops have required fields', () => {
    for (const op of ops) {
      expect(op.name).toBeTruthy();
      expect(op.handler).toBeDefined();
      expect(['read', 'write', 'admin']).toContain(op.auth);
    }
  });

  describe('vault_get', () => {
    it('returns entry by ID', async () => {
      const result = (await findOp(ops, 'vault_get').handler({ id: 'entry-1' })) as Record<string, unknown>;
      expect(result.id).toBe('entry-1');
    });

    it('returns error for missing entry', async () => {
      const result = (await findOp(ops, 'vault_get').handler({ id: 'missing' })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });
  });

  describe('vault_update', () => {
    it('updates entry fields', async () => {
      const result = (await findOp(ops, 'vault_update').handler({
        id: 'entry-1',
        title: 'Updated Title',
      })) as Record<string, unknown>;
      expect(result.updated).toBe(true);
      expect(runtime.vault.update).toHaveBeenCalledWith('entry-1', { title: 'Updated Title' });
    });

    it('returns error when no fields provided', async () => {
      const result = (await findOp(ops, 'vault_update').handler({ id: 'entry-1' })) as Record<string, unknown>;
      expect(result.error).toBe('No fields to update');
    });

    it('returns error for missing entry', async () => {
      vi.mocked(runtime.vault.update).mockReturnValue(null as any);
      const result = (await findOp(ops, 'vault_update').handler({
        id: 'missing',
        title: 'X',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });
  });

  describe('vault_remove', () => {
    it('removes entry by ID', async () => {
      const result = (await findOp(ops, 'vault_remove').handler({ id: 'entry-1' })) as Record<string, unknown>;
      expect(result.removed).toBe(true);
      expect(result.id).toBe('entry-1');
    });
  });

  describe('vault_bulk_add', () => {
    it('seeds multiple entries', async () => {
      const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];
      const result = (await findOp(ops, 'vault_bulk_add').handler({ entries })) as Record<string, unknown>;
      expect(result.added).toBe(2);
      expect(result.total).toBe(10);
    });
  });

  describe('vault_bulk_remove', () => {
    it('removes multiple entries', async () => {
      const result = (await findOp(ops, 'vault_bulk_remove').handler({
        ids: ['a', 'b', 'c'],
      })) as Record<string, unknown>;
      expect(result.removed).toBe(3);
      expect(result.requested).toBe(3);
    });
  });

  describe('vault_tags', () => {
    it('returns all tags with counts', async () => {
      const result = (await findOp(ops, 'vault_tags').handler({})) as Record<string, unknown>;
      expect(result.count).toBe(2);
    });
  });

  describe('vault_domains', () => {
    it('returns all domains with counts', async () => {
      const result = (await findOp(ops, 'vault_domains').handler({})) as Record<string, unknown>;
      expect(result.count).toBe(2);
    });
  });

  describe('vault_recent', () => {
    it('returns recent entries with default limit', async () => {
      const result = (await findOp(ops, 'vault_recent').handler({})) as Record<string, unknown>;
      expect(runtime.vault.getRecent).toHaveBeenCalledWith(20);
      expect(result.count).toBe(1);
    });

    it('respects custom limit', async () => {
      await findOp(ops, 'vault_recent').handler({ limit: 5 });
      expect(runtime.vault.getRecent).toHaveBeenCalledWith(5);
    });
  });

  describe('vault_import', () => {
    it('imports entries and reports new vs updated', async () => {
      vi.mocked(runtime.vault.stats)
        .mockReturnValueOnce({ totalEntries: 10 } as any)
        .mockReturnValueOnce({ totalEntries: 12 } as any);
      const entries = [makeEntry({ id: 'x' }), makeEntry({ id: 'y' })];
      const result = (await findOp(ops, 'vault_import').handler({ entries })) as Record<string, unknown>;
      expect(result.imported).toBe(2);
      expect(result.newEntries).toBe(2);
      expect(result.total).toBe(12);
    });
  });

  describe('vault_seed', () => {
    it('seeds entries idempotently', async () => {
      const entries = [makeEntry()];
      const result = (await findOp(ops, 'vault_seed').handler({ entries })) as Record<string, unknown>;
      expect(result.seeded).toBe(1);
    });
  });

  describe('vault_backup', () => {
    it('exports full vault', async () => {
      const result = (await findOp(ops, 'vault_backup').handler({})) as Record<string, unknown>;
      expect(result.entries).toBeDefined();
      expect(result.exportedAt).toBeDefined();
    });
  });

  describe('vault_age_report', () => {
    it('returns age distribution', async () => {
      const result = (await findOp(ops, 'vault_age_report').handler({})) as Record<string, unknown>;
      expect(result).toHaveProperty('buckets');
    });
  });

  describe('vault_seed_canonical', () => {
    it('returns error for non-existent directory', async () => {
      const result = (await findOp(ops, 'vault_seed_canonical').handler({
        directory: '/tmp/nonexistent_dir_xyz',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });
  });

  describe('knowledge_audit', () => {
    it('returns audit with recommendations', async () => {
      const result = (await findOp(ops, 'knowledge_audit').handler({})) as Record<string, unknown>;
      expect(result.totalEntries).toBe(10);
      expect(result.domainCount).toBe(2);
      expect(result.tagCount).toBe(2);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('handles errors gracefully', async () => {
      vi.mocked(runtime.vault.stats).mockImplementation(() => {
        throw new Error('DB error');
      });
      const result = (await findOp(ops, 'knowledge_audit').handler({})) as Record<string, unknown>;
      expect(result.error).toBeDefined();
    });
  });

  describe('knowledge_health', () => {
    it('returns health metrics including contradiction signals', async () => {
      const result = (await findOp(ops, 'knowledge_health').handler({})) as Record<string, unknown>;
      expect(result.totalEntries).toBe(10);
      expect(result.contradictionSignals).toBe(1);
      expect(result.contradictionTags).toEqual(['auth']);
    });
  });

  describe('knowledge_merge', () => {
    it('merges two entries and removes duplicate', async () => {
      vi.mocked(runtime.vault.get)
        .mockReturnValueOnce(makeEntry({ id: 'keep', tags: ['a'] }) as any)
        .mockReturnValueOnce(makeEntry({ id: 'remove', tags: ['b'], context: 'extra' }) as any);
      const result = (await findOp(ops, 'knowledge_merge').handler({
        keepId: 'keep',
        removeId: 'remove',
      })) as Record<string, unknown>;
      expect(result.merged).toBe(true);
      expect(result.keptId).toBe('keep');
      expect(result.removedId).toBe('remove');
      expect((result.mergedTags as string[]).sort()).toEqual(['a', 'b']);
    });

    it('returns error when keep entry not found', async () => {
      vi.mocked(runtime.vault.get).mockReturnValue(null as any);
      const result = (await findOp(ops, 'knowledge_merge').handler({
        keepId: 'x',
        removeId: 'y',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });
  });

  describe('knowledge_reorganize', () => {
    it('dry run reports changes without applying', async () => {
      vi.mocked(runtime.vault.list).mockReturnValue([
        makeEntry({ id: 'e1', domain: 'old-domain', tags: ['old-tag'] }),
      ] as any);
      const result = (await findOp(ops, 'knowledge_reorganize').handler({
        dryRun: true,
        domainRules: [{ from: 'old-domain', to: 'new-domain' }],
        retagRules: [{ from: 'old-tag', to: 'new-tag' }],
      })) as Record<string, unknown>;
      expect(result.dryRun).toBe(true);
      expect(result.changesFound).toBe(2);
      expect(runtime.vault.update).not.toHaveBeenCalled();
    });

    it('applies changes when dryRun is false', async () => {
      vi.mocked(runtime.vault.list).mockReturnValue([
        makeEntry({ id: 'e1', domain: 'old-domain', tags: ['old-tag'] }),
      ] as any);
      const result = (await findOp(ops, 'knowledge_reorganize').handler({
        dryRun: false,
        domainRules: [{ from: 'old-domain', to: 'new-domain' }],
      })) as Record<string, unknown>;
      expect(result.dryRun).toBe(false);
      expect(runtime.vault.update).toHaveBeenCalled();
    });
  });

  describe('vault_set_temporal', () => {
    it('sets temporal fields on entry', async () => {
      const result = (await findOp(ops, 'vault_set_temporal').handler({
        id: 'entry-1',
        validFrom: 1000,
        validUntil: 2000,
      })) as Record<string, unknown>;
      expect(result.updated).toBe(true);
    });

    it('returns error when entry not found', async () => {
      vi.mocked(runtime.vault.setTemporal).mockReturnValue(false as any);
      const result = (await findOp(ops, 'vault_set_temporal').handler({
        id: 'x',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });
  });

  describe('vault_find_expiring', () => {
    it('finds entries expiring within days', async () => {
      const result = (await findOp(ops, 'vault_find_expiring').handler({
        withinDays: 7,
      })) as Record<string, unknown>;
      expect(result.count).toBe(1);
    });
  });

  describe('vault_find_expired', () => {
    it('finds expired entries', async () => {
      const result = (await findOp(ops, 'vault_find_expired').handler({})) as Record<string, unknown>;
      expect(result.count).toBe(1);
    });
  });

  describe('vault_archive', () => {
    it('archives old entries', async () => {
      const result = await findOp(ops, 'vault_archive').handler({
        olderThanDays: 90,
        reason: 'cleanup',
      });
      expect(runtime.vault.archive).toHaveBeenCalledWith({ olderThanDays: 90, reason: 'cleanup' });
    });
  });

  describe('vault_restore', () => {
    it('restores archived entry', async () => {
      const result = (await findOp(ops, 'vault_restore').handler({
        id: 'entry-1',
      })) as Record<string, unknown>;
      expect(result.restored).toBe(true);
    });
  });

  describe('vault_optimize', () => {
    it('optimizes vault database', async () => {
      const result = (await findOp(ops, 'vault_optimize').handler({})) as Record<string, unknown>;
      expect(result.vacuumed).toBe(true);
    });
  });

  describe('vault_content_hash', () => {
    it('computes content hash and checks for duplicates', async () => {
      const result = (await findOp(ops, 'vault_content_hash').handler({
        type: 'pattern',
        domain: 'test',
        title: 'Test',
        description: 'A test',
      })) as Record<string, unknown>;
      expect(result.hash).toBe('abc123hash');
      expect(result.duplicate).toBe(false);
    });

    it('detects duplicate when hash exists', async () => {
      vi.mocked(runtime.vault.findByContentHash).mockReturnValue('existing-id' as any);
      const result = (await findOp(ops, 'vault_content_hash').handler({
        type: 'pattern',
        domain: 'test',
        title: 'Test',
        description: 'A test',
      })) as Record<string, unknown>;
      expect(result.duplicate).toBe(true);
      expect(result.existingId).toBe('existing-id');
    });
  });

  describe('vault_dedup_status', () => {
    it('reports dedup statistics with coverage', async () => {
      const result = (await findOp(ops, 'vault_dedup_status').handler({})) as Record<string, unknown>;
      expect(result.total).toBe(10);
      expect(result.duplicates).toBe(2);
      expect(result.coverage).toBe(90);
    });
  });
});
