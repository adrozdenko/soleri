/**
 * Colocated contract tests for archive-facade.ts.
 * Tests the archive facade dispatches to archive-ops correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createArchiveFacadeOps } from './archive-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Mock factories ──────────────────────────────────────────────────

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    type: 'pattern',
    domain: 'testing',
    title: 'Test Pattern',
    severity: 'suggestion',
    description: 'A test pattern',
    tags: ['test'],
    ...overrides,
  };
}

function makeMockVault() {
  return {
    get: vi.fn((id: string) => (id === 'entry-1' ? makeEntry() : null)),
    update: vi.fn((id: string) => (id === 'entry-1' ? makeEntry() : null)),
    remove: vi.fn().mockReturnValue(true),
    list: vi.fn().mockReturnValue([makeEntry()]),
    stats: vi.fn().mockReturnValue({ totalEntries: 10, byDomain: { testing: 5 } }),
    getTags: vi.fn().mockReturnValue([
      { tag: 'test', count: 5 },
      { tag: 'design', count: 3 },
    ]),
    getDomains: vi.fn().mockReturnValue([
      { domain: 'testing', count: 5 },
      { domain: 'design', count: 3 },
    ]),
    exportAll: vi.fn().mockReturnValue({ entries: [makeEntry()], exportedAt: Date.now() }),
    getAgeReport: vi.fn().mockReturnValue({
      buckets: [
        { label: 'today', count: 2 },
        { label: 'this_week', count: 3 },
        { label: 'this_month', count: 2 },
        { label: 'this_quarter', count: 1 },
        { label: 'older', count: 2 },
      ],
      oldestTimestamp: 1700000000,
      newestTimestamp: Date.now(),
    }),
    getDb: vi.fn().mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([{ tag: 'auth', type_count: 2 }]),
      }),
    }),
    setTemporal: vi.fn().mockReturnValue(true),
    findExpiring: vi.fn().mockReturnValue([makeEntry()]),
    findExpired: vi.fn().mockReturnValue([makeEntry()]),
    archive: vi.fn().mockReturnValue({ archived: 3, reason: 'cleanup' }),
    restore: vi.fn().mockReturnValue(true),
    optimize: vi.fn().mockReturnValue({ vacuumed: true, analyzed: true, ftsRebuilt: true }),
  };
}

function makeRuntime(): AgentRuntime {
  return {
    vault: makeMockVault(),
  } as unknown as AgentRuntime;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('archive-facade', () => {
  let runtime: AgentRuntime;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    runtime = makeRuntime();
    ops = captureOps(createArchiveFacadeOps(runtime));
  });

  // ─── Registration ─────────────────────────────────────────────────

  it('registers 12 ops', () => {
    expect(ops.size).toBe(12);
  });

  it('includes all expected op names', () => {
    const expected = [
      'vault_archive',
      'vault_restore',
      'vault_optimize',
      'vault_backup',
      'vault_age_report',
      'vault_set_temporal',
      'vault_find_expiring',
      'vault_find_expired',
      'knowledge_audit',
      'knowledge_health',
      'knowledge_merge',
      'knowledge_reorganize',
    ];
    for (const name of expected) {
      expect(ops.has(name), `missing op: ${name}`).toBe(true);
    }
  });

  // ─── Auth levels ─────────────────────────────────────────────────

  it('has correct auth levels', () => {
    expect(ops.get('vault_archive')!.auth).toBe('write');
    expect(ops.get('vault_restore')!.auth).toBe('write');
    expect(ops.get('vault_optimize')!.auth).toBe('write');
    expect(ops.get('vault_backup')!.auth).toBe('read');
    expect(ops.get('vault_age_report')!.auth).toBe('read');
    expect(ops.get('vault_set_temporal')!.auth).toBe('write');
    expect(ops.get('vault_find_expiring')!.auth).toBe('read');
    expect(ops.get('vault_find_expired')!.auth).toBe('read');
    expect(ops.get('knowledge_audit')!.auth).toBe('read');
    expect(ops.get('knowledge_health')!.auth).toBe('read');
    expect(ops.get('knowledge_merge')!.auth).toBe('write');
    expect(ops.get('knowledge_reorganize')!.auth).toBe('write');
  });

  // ─── vault_archive ──────────────────────────────────────────────

  describe('vault_archive', () => {
    it('archives old entries', async () => {
      const result = await executeOp(ops, 'vault_archive', {
        olderThanDays: 90,
        reason: 'cleanup',
      });
      expect(result.success).toBe(true);
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;
      expect(vault.archive).toHaveBeenCalledWith({ olderThanDays: 90, reason: 'cleanup' });
    });
  });

  // ─── vault_restore ──────────────────────────────────────────────

  describe('vault_restore', () => {
    it('restores archived entry', async () => {
      const result = await executeOp(ops, 'vault_restore', { id: 'entry-1' });
      expect(result.success).toBe(true);
      const data = result.data as { restored: boolean; id: string };
      expect(data.restored).toBe(true);
    });
  });

  // ─── vault_optimize ──────────────────────────────────────────────

  describe('vault_optimize', () => {
    it('optimizes database', async () => {
      const result = await executeOp(ops, 'vault_optimize', {});
      expect(result.success).toBe(true);
      const data = result.data as { vacuumed: boolean };
      expect(data.vacuumed).toBe(true);
    });
  });

  // ─── vault_backup ────────────────────────────────────────────────

  describe('vault_backup', () => {
    it('exports full vault', async () => {
      const result = await executeOp(ops, 'vault_backup', {});
      expect(result.success).toBe(true);
      const data = result.data as { entries: unknown[] };
      expect(data.entries).toBeDefined();
    });
  });

  // ─── vault_age_report ────────────────────────────────────────────

  describe('vault_age_report', () => {
    it('returns age distribution', async () => {
      const result = await executeOp(ops, 'vault_age_report', {});
      expect(result.success).toBe(true);
      const data = result.data as { buckets: unknown[] };
      expect(data.buckets).toBeDefined();
    });
  });

  // ─── vault_set_temporal ──────────────────────────────────────────

  describe('vault_set_temporal', () => {
    it('sets temporal fields', async () => {
      const result = await executeOp(ops, 'vault_set_temporal', {
        id: 'entry-1',
        validFrom: 1000,
        validUntil: 2000,
      });
      expect(result.success).toBe(true);
      const data = result.data as { updated: boolean };
      expect(data.updated).toBe(true);
    });

    it('returns error when entry not found', async () => {
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;
      vault.setTemporal.mockReturnValue(false);
      const result = await executeOp(ops, 'vault_set_temporal', { id: 'x' });
      expect(result.success).toBe(true);
      const data = result.data as { error: string };
      expect(data.error).toContain('not found');
    });
  });

  // ─── vault_find_expiring ─────────────────────────────────────────

  describe('vault_find_expiring', () => {
    it('finds entries expiring within days', async () => {
      const result = await executeOp(ops, 'vault_find_expiring', { withinDays: 7 });
      expect(result.success).toBe(true);
      const data = result.data as { count: number };
      expect(data.count).toBe(1);
    });
  });

  // ─── vault_find_expired ──────────────────────────────────────────

  describe('vault_find_expired', () => {
    it('finds expired entries', async () => {
      const result = await executeOp(ops, 'vault_find_expired', {});
      expect(result.success).toBe(true);
      const data = result.data as { count: number };
      expect(data.count).toBe(1);
    });
  });

  // ─── knowledge_audit ─────────────────────────────────────────────

  describe('knowledge_audit', () => {
    it('returns audit with recommendations', async () => {
      const result = await executeOp(ops, 'knowledge_audit', {});
      expect(result.success).toBe(true);
      const data = result.data as { totalEntries: number; recommendations: string[] };
      expect(data.totalEntries).toBe(10);
      expect(Array.isArray(data.recommendations)).toBe(true);
    });
  });

  // ─── knowledge_health ────────────────────────────────────────────

  describe('knowledge_health', () => {
    it('returns health metrics', async () => {
      const result = await executeOp(ops, 'knowledge_health', {});
      expect(result.success).toBe(true);
      const data = result.data as { totalEntries: number; contradictionSignals: number };
      expect(data.totalEntries).toBe(10);
      expect(data.contradictionSignals).toBe(1);
    });
  });

  // ─── knowledge_merge ─────────────────────────────────────────────

  describe('knowledge_merge', () => {
    it('merges two entries', async () => {
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;
      vault.get
        .mockReturnValueOnce(makeEntry({ id: 'keep', tags: ['a'] }))
        .mockReturnValueOnce(makeEntry({ id: 'remove', tags: ['b'] }));

      const result = await executeOp(ops, 'knowledge_merge', {
        keepId: 'keep',
        removeId: 'remove',
      });
      expect(result.success).toBe(true);
      const data = result.data as { merged: boolean; keptId: string };
      expect(data.merged).toBe(true);
      expect(data.keptId).toBe('keep');
    });

    it('returns error when entry not found', async () => {
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;
      vault.get.mockReturnValue(null);
      const result = await executeOp(ops, 'knowledge_merge', {
        keepId: 'x',
        removeId: 'y',
      });
      expect(result.success).toBe(true);
      const data = result.data as { error: string };
      expect(data.error).toContain('not found');
    });
  });

  // ─── knowledge_reorganize ─────────────────────────────────────────

  describe('knowledge_reorganize', () => {
    it('dry run reports changes', async () => {
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;
      vault.list.mockReturnValue([
        makeEntry({ id: 'e1', domain: 'old-domain', tags: ['old-tag'] }),
      ]);
      const result = await executeOp(ops, 'knowledge_reorganize', {
        dryRun: true,
        domainRules: [{ from: 'old-domain', to: 'new-domain' }],
        retagRules: [{ from: 'old-tag', to: 'new-tag' }],
      });
      expect(result.success).toBe(true);
      const data = result.data as { dryRun: boolean; changesFound: number };
      expect(data.dryRun).toBe(true);
      expect(data.changesFound).toBe(2);
      expect(vault.update).not.toHaveBeenCalled();
    });
  });
});
