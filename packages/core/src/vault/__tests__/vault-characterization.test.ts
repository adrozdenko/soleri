/**
 * Characterization tests for vault.ts — pins current behavior of all 45 public methods.
 * Phase A of Wave 0C: vault decomposition.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault.js';
import type { Memory } from '../vault.js';
import type { IntelligenceEntry } from '../../intelligence/types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  const id = overrides.id ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    type: 'pattern',
    domain: 'testing',
    title: 'Test Pattern',
    severity: 'suggestion',
    description: 'A test pattern for characterization',
    tags: ['test'],
    ...overrides,
  };
}

function makeMemoryInput(
  overrides: Partial<Omit<Memory, 'id' | 'createdAt' | 'archivedAt'>> = {},
): Omit<Memory, 'id' | 'createdAt' | 'archivedAt'> {
  return {
    projectPath: '/test/project',
    type: 'session',
    context: 'test context',
    summary: 'test summary',
    topics: ['testing'],
    filesModified: ['file.ts'],
    toolsUsed: ['vault'],
    intent: null,
    decisions: [],
    currentState: null,
    nextSteps: [],
    vaultEntriesReferenced: [],
    ...overrides,
  };
}

describe('Vault Characterization Tests', () => {
  let vault: Vault;
  beforeEach(() => {
    vault = new Vault(':memory:');
  });
  afterEach(() => {
    vault.close();
  });

  describe('constructor', () => {
    it('creates an in-memory vault', () => {
      const v = new Vault(':memory:');
      expect(v).toBeInstanceOf(Vault);
      v.close();
    });
    it('stamps FORMAT_VERSION', () => {
      expect(Vault.FORMAT_VERSION).toBe(1);
    });
    it('createWithSQLite factory', () => {
      const v = Vault.createWithSQLite(':memory:');
      expect(v).toBeInstanceOf(Vault);
      v.close();
    });
  });

  describe('setLinkManager / isAutoLinkEnabled', () => {
    it('defaults to no link manager', () => {
      expect(vault.isAutoLinkEnabled()).toBe(false);
    });
    it('enables auto-link when set', () => {
      vault.setLinkManager({ suggestLinks: () => [], addLink: () => {} } as unknown);
      expect(vault.isAutoLinkEnabled()).toBe(true);
    });
    it('respects enabled:false', () => {
      vault.setLinkManager({ suggestLinks: () => [], addLink: () => {} } as unknown, {
        enabled: false,
      });
      expect(vault.isAutoLinkEnabled()).toBe(false);
    });
  });

  describe('seed', () => {
    it('inserts entries', () => {
      expect(vault.seed([makeEntry({ id: 'seed-1' })])).toBe(1);
    });
    it('upserts on conflict', () => {
      vault.seed([makeEntry({ id: 'u1', title: 'Old' })]);
      vault.seed([makeEntry({ id: 'u1', title: 'New' })]);
      expect(vault.get('u1')?.title).toBe('New');
    });
    it('handles multiple', () => {
      expect(
        vault.seed([makeEntry({ id: 'a1' }), makeEntry({ id: 'a2' }), makeEntry({ id: 'a3' })]),
      ).toBe(3);
    });
  });

  describe('add', () => {
    it('delegates to seed', () => {
      vault.add(makeEntry({ id: 'add-1' }));
      expect(vault.get('add-1')).toBeTruthy();
    });
  });

  describe('get', () => {
    it('returns null for missing', () => {
      expect(vault.get('x')).toBeNull();
    });
    it('returns parsed entry', () => {
      vault.seed([makeEntry({ id: 'g1', tags: ['a', 'b'], appliesTo: ['react'] })]);
      const g = vault.get('g1');
      expect(g!.tags).toEqual(['a', 'b']);
      expect(g!.appliesTo).toEqual(['react']);
    });
  });

  describe('remove', () => {
    it('returns true on delete', () => {
      vault.seed([makeEntry({ id: 'rm-1' })]);
      expect(vault.remove('rm-1')).toBe(true);
    });
    it('returns false if missing', () => {
      expect(vault.remove('x')).toBe(false);
    });
  });

  describe('update', () => {
    it('updates and returns', () => {
      vault.seed([makeEntry({ id: 'up1', title: 'Old' })]);
      expect(vault.update('up1', { title: 'New' })?.title).toBe('New');
    });
    it('returns null if missing', () => {
      expect(vault.update('x', { title: 'X' })).toBeNull();
    });
  });

  describe('bulkRemove', () => {
    it('removes multiple', () => {
      vault.seed([makeEntry({ id: 'b1' }), makeEntry({ id: 'b2' }), makeEntry({ id: 'b3' })]);
      expect(vault.bulkRemove(['b1', 'b3'])).toBe(2);
      expect(vault.get('b2')).toBeTruthy();
    });
  });

  describe('search', () => {
    it('returns empty for no matches', () => {
      expect(vault.search('xyzzy-nonexistent')).toEqual([]);
    });
    it('finds by FTS', () => {
      vault.seed([makeEntry({ id: 's1', title: 'React perf opt', description: 'Memoize' })]);
      const r = vault.search('React perf');
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(typeof r[0].score).toBe('number');
    });
    it('respects domain filter', () => {
      vault.seed([
        makeEntry({ id: 'sf1', domain: 'react', title: 'hooks' }),
        makeEntry({ id: 'sf2', domain: 'css', title: 'hooks for css' }),
      ]);
      expect(
        vault.search('hooks', { domain: 'react' }).every((r) => r.entry.domain === 'react'),
      ).toBe(true);
    });
    it('respects limit', () => {
      for (let i = 0; i < 15; i++)
        vault.seed([makeEntry({ id: `l${i}`, title: `pat ${i}`, description: 'perf' })]);
      expect(vault.search('perf', { limit: 5 }).length).toBeLessThanOrEqual(5);
    });
  });

  describe('list', () => {
    it('returns entries', () => {
      vault.seed([makeEntry({ id: 'l1' }), makeEntry({ id: 'l2' })]);
      expect(vault.list().length).toBe(2);
    });
    it('filters by domain', () => {
      vault.seed([
        makeEntry({ id: 'ld1', domain: 'react' }),
        makeEntry({ id: 'ld2', domain: 'css' }),
      ]);
      expect(vault.list({ domain: 'react' }).length).toBe(1);
    });
    it('filters by type', () => {
      vault.seed([
        makeEntry({ id: 'lt1', type: 'pattern' }),
        makeEntry({ id: 'lt2', type: 'rule' }),
      ]);
      expect(vault.list({ type: 'rule' }).length).toBe(1);
    });
    it('filters by tags', () => {
      vault.seed([
        makeEntry({ id: 'tg1', tags: ['react', 'hooks'] }),
        makeEntry({ id: 'tg2', tags: ['css'] }),
      ]);
      expect(vault.list({ tags: ['react'] }).length).toBe(1);
    });
    it('respects limit/offset', () => {
      for (let i = 0; i < 10; i++) vault.seed([makeEntry({ id: `p${i}` })]);
      expect(vault.list({ limit: 3, offset: 2 }).length).toBe(3);
    });
  });

  describe('stats', () => {
    it('zero for empty', () => {
      const s = vault.stats();
      expect(s.totalEntries).toBe(0);
    });
    it('counts correctly', () => {
      vault.seed([
        makeEntry({ id: 's1', type: 'pattern', domain: 'react', severity: 'warning' }),
        makeEntry({ id: 's2', type: 'rule', domain: 'react', severity: 'critical' }),
        makeEntry({ id: 's3', type: 'pattern', domain: 'css', severity: 'warning' }),
      ]);
      const s = vault.stats();
      expect(s.totalEntries).toBe(3);
      expect(s.byType).toEqual({ pattern: 2, rule: 1 });
    });
  });

  describe('getTags', () => {
    it('returns sorted counts', () => {
      vault.seed([
        makeEntry({ id: 't1', tags: ['react', 'hooks'] }),
        makeEntry({ id: 't2', tags: ['react', 'css'] }),
        makeEntry({ id: 't3', tags: ['css'] }),
      ]);
      const t = vault.getTags();
      expect(t[0].tag).toBe('react');
      expect(t[0].count).toBe(2);
    });
  });
  describe('getDomains', () => {
    it('returns counts', () => {
      vault.seed([
        makeEntry({ id: 'd1', domain: 'react' }),
        makeEntry({ id: 'd2', domain: 'react' }),
        makeEntry({ id: 'd3', domain: 'css' }),
      ]);
      expect(vault.getDomains()).toEqual([
        { domain: 'react', count: 2 },
        { domain: 'css', count: 1 },
      ]);
    });
  });
  describe('getRecent', () => {
    it('returns entries', () => {
      vault.seed([makeEntry({ id: 'r1' })]);
      vault.seed([makeEntry({ id: 'r2' })]);
      expect(vault.getRecent(5).length).toBe(2);
    });
  });

  describe('setTemporal', () => {
    it('sets temporal fields', () => {
      vault.seed([makeEntry({ id: 'tm1' })]);
      expect(vault.setTemporal('tm1', 1000, 2000)).toBe(true);
      const e = vault.get('tm1');
      expect(e?.validFrom).toBe(1000);
      expect(e?.validUntil).toBe(2000);
    });
    it('returns false for empty', () => {
      vault.seed([makeEntry({ id: 'tm2' })]);
      expect(vault.setTemporal('tm2')).toBe(false);
    });
  });

  describe('findExpiring', () => {
    it('finds expiring', () => {
      const now = Math.floor(Date.now() / 1000);
      vault.seed([
        makeEntry({ id: 'e1', validUntil: now + 3600 }),
        makeEntry({ id: 'e2', validUntil: now + 86400 * 100 }),
      ]);
      expect(vault.findExpiring(7).length).toBe(1);
    });
  });
  describe('findExpired', () => {
    it('finds expired', () => {
      const now = Math.floor(Date.now() / 1000);
      vault.seed([makeEntry({ id: 'x1', validUntil: now - 3600 }), makeEntry({ id: 'x2' })]);
      expect(vault.findExpired().length).toBe(1);
    });
  });

  describe('installPack', () => {
    it('installs with origin:pack', () => {
      const r = vault.installPack([
        makeEntry({ id: 'pk1', title: 'Pack one' }),
        makeEntry({ id: 'pk2', title: 'Pack two' }),
      ]);
      expect(r.installed).toBe(2);
      expect(vault.get('pk1')?.origin).toBe('pack');
    });
    it('skips duplicates', () => {
      const e = makeEntry({ id: 'pd1' });
      vault.installPack([e]);
      expect(vault.installPack([{ ...e, id: 'pd2' }]).skipped).toBe(1);
    });
  });

  describe('seedDedup', () => {
    it('inserts new', () => {
      expect(vault.seedDedup([makeEntry({ id: 'sd1' })])[0].action).toBe('inserted');
    });
    it('detects duplicate', () => {
      const e = makeEntry({ id: 'so' });
      vault.seed([e]);
      const r = vault.seedDedup([{ ...e, id: 'sd' }]);
      expect(r[0].action).toBe('duplicate');
      expect(r[0].existingId).toBe('so');
    });
  });

  describe('findByContentHash', () => {
    it('returns null for unknown', () => {
      expect(vault.findByContentHash('x')).toBeNull();
    });
  });
  describe('contentHashStats', () => {
    it('zeros for empty', () => {
      const s = vault.contentHashStats();
      expect(s.total).toBe(0);
    });
    it('counts', () => {
      vault.seed([
        makeEntry({ id: 'c1', title: 'First' }),
        makeEntry({ id: 'c2', title: 'Second' }),
      ]);
      const s = vault.contentHashStats();
      expect(s.total).toBe(2);
      expect(s.uniqueHashes).toBe(2);
    });
  });

  describe('exportAll', () => {
    it('exports all', () => {
      vault.seed([makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })]);
      const r = vault.exportAll();
      expect(r.count).toBe(2);
      expect(typeof r.exportedAt).toBe('number');
    });
  });
  describe('getAgeReport', () => {
    it('empty report', () => {
      const r = vault.getAgeReport();
      expect(r.total).toBe(0);
      expect(r.oldestTimestamp).toBeNull();
      expect(r.buckets.length).toBe(5);
    });
    it('buckets entries', () => {
      vault.seed([makeEntry({ id: 'a1' })]);
      const r = vault.getAgeReport();
      expect(r.total).toBe(1);
      expect(r.buckets[0].label).toBe('today');
      expect(r.buckets[0].count).toBe(1);
    });
  });

  describe('archive', () => {
    it('archives old entries', () => {
      vault.seed([makeEntry({ id: 'ar1' })]);
      vault
        .getProvider()
        .run("UPDATE entries SET updated_at = unixepoch() - 200 * 86400 WHERE id = 'ar1'");
      expect(vault.archive({ olderThanDays: 100 }).archived).toBe(1);
      expect(vault.get('ar1')).toBeNull();
    });
    it('returns 0 if none qualify', () => {
      vault.seed([makeEntry({ id: 'ar2' })]);
      expect(vault.archive({ olderThanDays: 100 }).archived).toBe(0);
    });
  });

  describe('restore', () => {
    it('restores archived', () => {
      vault.seed([makeEntry({ id: 'rs1' })]);
      vault
        .getProvider()
        .run("UPDATE entries SET updated_at = unixepoch() - 200 * 86400 WHERE id = 'rs1'");
      vault.archive({ olderThanDays: 100 });
      expect(vault.restore('rs1')).toBe(true);
      expect(vault.get('rs1')).toBeTruthy();
    });
    it('returns false for missing', () => {
      expect(vault.restore('x')).toBe(false);
    });
  });

  describe('optimize', () => {
    it('returns status', () => {
      const r = vault.optimize();
      expect(typeof r.vacuumed).toBe('boolean');
    });
  });
  describe('rebuildFtsIndex', () => {
    it('does not throw', () => {
      expect(() => vault.rebuildFtsIndex()).not.toThrow();
    });
  });

  describe('registerProject', () => {
    it('registers new', () => {
      const p = vault.registerProject('/t', 'test');
      expect(p.sessionCount).toBe(1);
    });
    it('increments on re-register', () => {
      vault.registerProject('/t');
      expect(vault.registerProject('/t').sessionCount).toBe(2);
    });
    it('derives name', () => {
      expect(vault.registerProject('/home/user/proj').name).toBe('proj');
    });
  });

  describe('getProject', () => {
    it('returns null for unknown', () => {
      expect(vault.getProject('/x')).toBeNull();
    });
    it('returns info', () => {
      vault.registerProject('/t', 'T');
      expect(vault.getProject('/t')!.name).toBe('T');
    });
  });
  describe('listProjects', () => {
    it('lists all', () => {
      vault.registerProject('/a');
      vault.registerProject('/b');
      expect(vault.listProjects().length).toBe(2);
    });
  });

  describe('captureMemory', () => {
    it('creates with id', () => {
      const m = vault.captureMemory(makeMemoryInput());
      expect(m.id).toMatch(/^mem-/);
      expect(m.archivedAt).toBeNull();
    });
  });
  describe('getMemory', () => {
    it('returns null', () => {
      expect(vault.getMemory('x')).toBeNull();
    });
    it('returns parsed', () => {
      const m = vault.captureMemory(makeMemoryInput({ topics: ['a', 'b'] }));
      expect(vault.getMemory(m.id)!.topics).toEqual(['a', 'b']);
    });
  });
  describe('deleteMemory', () => {
    it('deletes', () => {
      const m = vault.captureMemory(makeMemoryInput());
      expect(vault.deleteMemory(m.id)).toBe(true);
    });
    it('returns false', () => {
      expect(vault.deleteMemory('x')).toBe(false);
    });
  });

  describe('searchMemories', () => {
    it('empty for no match', () => {
      expect(vault.searchMemories('xyzzy')).toEqual([]);
    });
    it('finds by FTS', () => {
      vault.captureMemory(makeMemoryInput({ summary: 'React hooks opt' }));
      expect(vault.searchMemories('React hooks').length).toBeGreaterThanOrEqual(1);
    });
    it('filters by project', () => {
      vault.captureMemory(makeMemoryInput({ projectPath: '/a', summary: 'hooks alpha' }));
      vault.captureMemory(makeMemoryInput({ projectPath: '/b', summary: 'hooks beta' }));
      expect(
        vault.searchMemories('hooks', { projectPath: '/a' }).every((m) => m.projectPath === '/a'),
      ).toBe(true);
    });
  });

  describe('listMemories', () => {
    it('lists non-archived', () => {
      vault.captureMemory(makeMemoryInput());
      vault.captureMemory(makeMemoryInput());
      expect(vault.listMemories().length).toBe(2);
    });
    it('filters by type', () => {
      vault.captureMemory(makeMemoryInput({ type: 'session' }));
      vault.captureMemory(makeMemoryInput({ type: 'lesson' }));
      expect(vault.listMemories({ type: 'lesson' }).length).toBe(1);
    });
  });

  describe('memoryStats', () => {
    it('zeros for empty', () => {
      expect(vault.memoryStats().total).toBe(0);
    });
    it('counts', () => {
      vault.captureMemory(makeMemoryInput({ projectPath: '/a', type: 'session' }));
      vault.captureMemory(makeMemoryInput({ projectPath: '/a', type: 'lesson' }));
      vault.captureMemory(makeMemoryInput({ projectPath: '/b', type: 'session' }));
      const s = vault.memoryStats();
      expect(s.total).toBe(3);
      expect(s.byType).toEqual({ session: 2, lesson: 1 });
    });
  });

  describe('memoryStatsDetailed', () => {
    it('includes extended fields', () => {
      vault.captureMemory(makeMemoryInput());
      const s = vault.memoryStatsDetailed();
      expect(typeof s.oldest).toBe('number');
      expect(s.archivedCount).toBe(0);
    });
  });
  describe('exportMemories', () => {
    it('exports', () => {
      vault.captureMemory(makeMemoryInput());
      expect(vault.exportMemories().length).toBe(1);
    });
  });
  describe('importMemories', () => {
    it('imports and deduplicates', () => {
      vault.captureMemory(makeMemoryInput());
      const exp = vault.exportMemories();
      const v2 = new Vault(':memory:');
      expect(v2.importMemories(exp).imported).toBe(1);
      expect(v2.importMemories(exp).skipped).toBe(1);
      v2.close();
    });
  });
  describe('pruneMemories', () => {
    it('removes old', () => {
      vault.captureMemory(makeMemoryInput());
      vault.getProvider().run('UPDATE memories SET created_at = unixepoch() - 200 * 86400');
      expect(vault.pruneMemories(100).pruned).toBe(1);
    });
    it('leaves recent', () => {
      vault.captureMemory(makeMemoryInput());
      expect(vault.pruneMemories(100).pruned).toBe(0);
    });
  });
  describe('deduplicateMemories', () => {
    it('removes dupes', () => {
      vault.captureMemory(makeMemoryInput({ summary: 'same' }));
      vault.captureMemory(makeMemoryInput({ summary: 'same' }));
      expect(vault.deduplicateMemories().removed).toBe(1);
    });
  });
  describe('memoryTopics', () => {
    it('returns frequency', () => {
      vault.captureMemory(makeMemoryInput({ topics: ['react', 'hooks'] }));
      vault.captureMemory(makeMemoryInput({ topics: ['react', 'css'] }));
      expect(vault.memoryTopics()[0]).toEqual({ topic: 'react', count: 2 });
    });
  });
  describe('memoriesByProject', () => {
    it('groups by project', () => {
      vault.captureMemory(makeMemoryInput({ projectPath: '/a' }));
      vault.captureMemory(makeMemoryInput({ projectPath: '/a' }));
      vault.captureMemory(makeMemoryInput({ projectPath: '/b' }));
      expect(vault.memoriesByProject().find((p) => p.project === '/a')?.count).toBe(2);
    });
  });

  describe('getProvider', () => {
    it('returns provider', () => {
      expect(vault.getProvider().backend).toBe('sqlite');
    });
  });
  describe('getDb', () => {
    it('returns db', () => {
      expect(vault.getDb()).toBeTruthy();
    });
  });
  describe('close', () => {
    it('does not throw', () => {
      const v = new Vault(':memory:');
      expect(() => v.close()).not.toThrow();
    });
  });
});
