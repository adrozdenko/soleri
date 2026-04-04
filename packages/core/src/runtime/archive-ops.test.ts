import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createArchiveOps } from './archive-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

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
      update: vi.fn((id: string) => (id === 'entry-1' ? makeEntry() : null)),
      remove: vi.fn(() => true),
      list: vi.fn(() => [makeEntry()]),
      stats: vi.fn(() => ({ totalEntries: 10, byDomain: { testing: 5 } })),
      getTags: vi.fn(() => [
        { tag: 'test', count: 5 },
        { tag: 'design', count: 3 },
      ]),
      getDomains: vi.fn(() => [
        { domain: 'testing', count: 5 },
        { domain: 'design', count: 3 },
      ]),
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
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op not found: ${name}`);
  return op;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('createArchiveOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  beforeEach(() => {
    runtime = createMockRuntime();
    ops = createArchiveOps(runtime);
  });

  describe('vault_archive', () => {
    it('archives old entries', async () => {
      await findOp(ops, 'vault_archive').handler({
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
      vi.mocked(runtime.vault.setTemporal).mockReturnValue(false as unknown);
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
      const result = (await findOp(ops, 'vault_find_expired').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.count).toBe(1);
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
        .mockReturnValueOnce(makeEntry({ id: 'keep', tags: ['a'] }) as unknown)
        .mockReturnValueOnce(makeEntry({ id: 'remove', tags: ['b'], context: 'extra' }) as unknown);
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
      vi.mocked(runtime.vault.get).mockReturnValue(null as unknown);
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
      ] as unknown);
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
      ] as unknown);
      const result = (await findOp(ops, 'knowledge_reorganize').handler({
        dryRun: false,
        domainRules: [{ from: 'old-domain', to: 'new-domain' }],
      })) as Record<string, unknown>;
      expect(result.dryRun).toBe(false);
      expect(runtime.vault.update).toHaveBeenCalled();
    });
  });
});
