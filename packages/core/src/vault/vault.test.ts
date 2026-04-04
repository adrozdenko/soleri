import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from './vault.js';
import { computeContentHash } from './content-hash.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-entry-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern for unit tests.',
    context: overrides.context ?? 'Use in test suites.',
    example: overrides.example ?? 'expect(result).toBe(true);',
    counterExample: overrides.counterExample ?? 'assert(result);',
    why: overrides.why ?? 'Tests should be explicit about expectations.',
    tags: overrides.tags ?? ['testing', 'assertions'],
    appliesTo: overrides.appliesTo ?? ['*.test.ts'],
  };
}

describe('Vault', () => {
  let vault: Vault;

  beforeEach(() => {
    vault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
  });

  describe('constructor', () => {
    it('should create an in-memory vault', () => {
      const stats = vault.stats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should expose db via getDb()', () => {
      const db = vault.getDb();
      expect(db).toBeDefined();
      const row = db.prepare('SELECT COUNT(*) as count FROM brain_vocabulary').get() as {
        count: number;
      };
      expect(row.count).toBe(0);
    });
  });

  describe('seed', () => {
    it('should seed entries and return count', () => {
      const entries = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })];
      const count = vault.seed(entries);
      expect(count).toBe(2);
      expect(vault.stats().totalEntries).toBe(2);
    });

    it('should upsert on duplicate id', () => {
      vault.seed([makeEntry({ id: 'e1', title: 'Original' })]);
      vault.seed([makeEntry({ id: 'e1', title: 'Updated' })]);
      expect(vault.stats().totalEntries).toBe(1);
      const entry = vault.get('e1');
      expect(entry?.title).toBe('Updated');
    });

    it('should handle empty array', () => {
      const count = vault.seed([]);
      expect(count).toBe(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      vault.seed([
        makeEntry({
          id: 'search-1',
          title: 'Input validation pattern',
          description: 'Always validate user input at boundaries.',
          domain: 'security',
          tags: ['validation'],
        }),
        makeEntry({
          id: 'search-2',
          title: 'Caching strategy',
          description: 'Use cache-aside for read-heavy workloads.',
          domain: 'performance',
          tags: ['caching'],
        }),
        makeEntry({
          id: 'search-3',
          title: 'Error handling pattern',
          description: 'Use typed errors with context for debugging.',
          domain: 'clean-code',
          tags: ['errors'],
        }),
      ]);
    });

    it('should find entries matching query', () => {
      const results = vault.search('validation input');
      expect(results).toHaveLength(1);
      expect(results[0].entry.id).toBe('search-1');
    });

    it('should return scores with results', () => {
      const results = vault.search('caching');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].entry.id).toBe('search-2');
    });

    it('should filter by domain', () => {
      const results = vault.search('pattern', { domain: 'security' });
      expect(results.every((r) => r.entry.domain === 'security')).toBe(true);
    });

    it('should respect limit', () => {
      const results = vault.search('pattern', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return empty for no matches', () => {
      const results = vault.search('xyznonexistent');
      expect(results).toEqual([]);
    });

    it('should find entries by hyphenated query (smoke-test-entry style)', () => {
      vault.seed([
        makeEntry({
          id: 'hyphen-test-1',
          title: 'smoke-test-entry',
          description: 'Hyphenated title entry for FTS regression.',
          domain: 'testing',
        }),
      ]);
      const results = vault.search('smoke-test-entry');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.id).toBe('hyphen-test-1');
    });
  });

  describe('get', () => {
    it('should return entry by id', () => {
      vault.seed([makeEntry({ id: 'get-1', title: 'Get Test' })]);
      const entry = vault.get('get-1');
      expect(entry).not.toBeNull();
      expect(entry!.title).toBe('Get Test');
    });

    it('should return null for missing id', () => {
      expect(vault.get('nonexistent')).toBeNull();
    });

    it('should preserve all fields', () => {
      const original = makeEntry({ id: 'full-1' });
      vault.seed([original]);
      const entry = vault.get('full-1')!;
      expect(entry.id).toBe(original.id);
      expect(entry.type).toBe(original.type);
      expect(entry.domain).toBe(original.domain);
      expect(entry.tags).toEqual(original.tags);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      vault.seed([
        makeEntry({ id: 'l1', domain: 'api', type: 'pattern', severity: 'critical' }),
        makeEntry({ id: 'l2', domain: 'api', type: 'anti-pattern', severity: 'warning' }),
        makeEntry({ id: 'l3', domain: 'db', type: 'rule', severity: 'suggestion' }),
        makeEntry({
          id: 'l4',
          domain: 'db',
          type: 'pattern',
          severity: 'critical',
          tags: ['indexing', 'query'],
        }),
      ]);
    });

    it('should list all entries', () => {
      const entries = vault.list();
      expect(entries).toHaveLength(4);
    });

    it('should filter by domain', () => {
      const entries = vault.list({ domain: 'api' });
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.domain === 'api')).toBe(true);
    });

    it('should filter by type', () => {
      const entries = vault.list({ type: 'pattern' });
      expect(entries).toHaveLength(2);
    });

    it('should filter by severity', () => {
      const entries = vault.list({ severity: 'critical' });
      expect(entries).toHaveLength(2);
    });

    it('should filter by tags', () => {
      const entries = vault.list({ tags: ['indexing'] });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('l4');
    });

    it('should support limit and offset', () => {
      const page1 = vault.list({ limit: 2, offset: 0 });
      const page2 = vault.list({ limit: 2, offset: 2 });
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('stats', () => {
    it('should return zero counts for empty vault', () => {
      const stats = vault.stats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.byDomain).toEqual({});
      expect(stats.bySeverity).toEqual({});
    });

    it('should return correct breakdowns', () => {
      vault.seed([
        makeEntry({ id: 's1', domain: 'api', type: 'pattern', severity: 'critical' }),
        makeEntry({ id: 's2', domain: 'api', type: 'rule', severity: 'warning' }),
        makeEntry({ id: 's3', domain: 'db', type: 'pattern', severity: 'critical' }),
      ]);
      const stats = vault.stats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.byDomain).toEqual({ api: 2, db: 1 });
      expect(stats.byType).toEqual({ pattern: 2, rule: 1 });
      expect(stats.bySeverity).toEqual({ critical: 2, warning: 1 });
    });
  });

  describe('add', () => {
    it('should add a single entry', () => {
      vault.add(makeEntry({ id: 'add-1' }));
      expect(vault.stats().totalEntries).toBe(1);
      expect(vault.get('add-1')).not.toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove an existing entry', () => {
      vault.seed([makeEntry({ id: 'rm-1' })]);
      const removed = vault.remove('rm-1');
      expect(removed).toBe(true);
      expect(vault.get('rm-1')).toBeNull();
      expect(vault.stats().totalEntries).toBe(0);
    });

    it('should return false for nonexistent id', () => {
      expect(vault.remove('nonexistent')).toBe(false);
    });
  });

  describe('registerProject', () => {
    it('should register a new project', () => {
      const project = vault.registerProject('/home/user/my-project', 'my-project');
      expect(project.path).toBe('/home/user/my-project');
      expect(project.name).toBe('my-project');
      expect(project.sessionCount).toBe(1);
    });

    it('should derive name from path when not provided', () => {
      const project = vault.registerProject('/home/user/cool-app');
      expect(project.name).toBe('cool-app');
    });

    it('should increment session count on re-registration', () => {
      vault.registerProject('/home/user/app');
      const second = vault.registerProject('/home/user/app');
      expect(second.sessionCount).toBe(2);
      const third = vault.registerProject('/home/user/app');
      expect(third.sessionCount).toBe(3);
    });

    it('should update last_seen_at on re-registration', () => {
      const first = vault.registerProject('/home/user/app');
      const second = vault.registerProject('/home/user/app');
      expect(second.lastSeenAt).toBeGreaterThanOrEqual(first.lastSeenAt);
    });
  });

  describe('getProject', () => {
    it('should return null for unregistered project', () => {
      expect(vault.getProject('/nonexistent')).toBeNull();
    });

    it('should return registered project', () => {
      vault.registerProject('/home/user/app', 'app');
      const project = vault.getProject('/home/user/app');
      expect(project).not.toBeNull();
      expect(project!.name).toBe('app');
    });
  });

  describe('listProjects', () => {
    it('should return empty array when no projects', () => {
      expect(vault.listProjects()).toEqual([]);
    });

    it('should list all registered projects', () => {
      vault.registerProject('/home/user/app-a', 'app-a');
      vault.registerProject('/home/user/app-b', 'app-b');
      const projects = vault.listProjects();
      expect(projects).toHaveLength(2);
    });
  });

  describe('captureMemory', () => {
    it('should capture a memory and return it', () => {
      const memory = vault.captureMemory({
        projectPath: '/test',
        type: 'lesson',
        context: 'Debugging session',
        summary: 'Learned about FTS5 tokenizers',
        topics: ['sqlite', 'fts5'],
        filesModified: ['vault.ts'],
        toolsUsed: ['Bash'],
      });
      expect(memory.id).toMatch(/^mem-/);
      expect(memory.type).toBe('lesson');
      expect(memory.summary).toBe('Learned about FTS5 tokenizers');
      expect(memory.topics).toEqual(['sqlite', 'fts5']);
      expect(memory.archivedAt).toBeNull();
    });

    it('should capture session memories', () => {
      const memory = vault.captureMemory({
        projectPath: '/test',
        type: 'session',
        context: 'refactoring vault module',
        summary: 'Refactored vault to use FTS5',
        topics: ['vault'],
        filesModified: [],
        toolsUsed: [],
      });
      expect(memory.type).toBe('session');
      expect(typeof memory.createdAt).toBe('number');
    });

    it('should capture preference memories', () => {
      const memory = vault.captureMemory({
        projectPath: '/test',
        type: 'preference',
        context: 'user prefers bun over npm',
        summary: 'Use bun for package management',
        topics: ['tooling'],
        filesModified: [],
        toolsUsed: [],
      });
      expect(memory.type).toBe('preference');
    });
  });

  describe('searchMemories', () => {
    beforeEach(() => {
      vault.captureMemory({
        projectPath: '/test',
        type: 'lesson',
        context: 'Debugging SQL queries',
        summary: 'Always use parameterized queries to prevent injection',
        topics: ['sql', 'security'],
        filesModified: [],
        toolsUsed: [],
      });
      vault.captureMemory({
        projectPath: '/test',
        type: 'session',
        context: 'Working on API design',
        summary: 'Implemented REST endpoints with pagination',
        topics: ['api', 'rest'],
        filesModified: ['routes.ts'],
        toolsUsed: ['Edit'],
      });
      vault.captureMemory({
        projectPath: '/other',
        type: 'preference',
        context: 'User likes TypeScript strict mode',
        summary: 'Always enable strict mode in tsconfig',
        topics: ['typescript'],
        filesModified: [],
        toolsUsed: [],
      });
    });

    it('should find memories matching query', () => {
      const results = vault.searchMemories('parameterized queries');
      expect(results).toHaveLength(1);
      expect(results[0].summary).toContain('parameterized');
    });

    it('should filter by type', () => {
      const results = vault.searchMemories('queries OR endpoints OR strict', { type: 'lesson' });
      expect(results.every((m) => m.type === 'lesson')).toBe(true);
    });

    it('should filter by project path', () => {
      const results = vault.searchMemories('queries OR endpoints OR strict', {
        projectPath: '/other',
      });
      expect(results.every((m) => m.projectPath === '/other')).toBe(true);
    });

    it('should respect limit', () => {
      const results = vault.searchMemories('queries OR endpoints OR strict', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return empty for no matches', () => {
      const results = vault.searchMemories('xyznonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('listMemories', () => {
    beforeEach(() => {
      vault.captureMemory({
        projectPath: '/proj-a',
        type: 'lesson',
        context: 'ctx',
        summary: 'lesson one',
        topics: [],
        filesModified: [],
        toolsUsed: [],
      });
      vault.captureMemory({
        projectPath: '/proj-a',
        type: 'session',
        context: 'ctx',
        summary: 'session one',
        topics: [],
        filesModified: [],
        toolsUsed: [],
      });
      vault.captureMemory({
        projectPath: '/proj-b',
        type: 'preference',
        context: 'ctx',
        summary: 'pref one',
        topics: [],
        filesModified: [],
        toolsUsed: [],
      });
    });

    it('should list all memories', () => {
      const memories = vault.listMemories();
      expect(memories).toHaveLength(3);
    });

    it('should filter by type', () => {
      const memories = vault.listMemories({ type: 'lesson' });
      expect(memories).toHaveLength(1);
      expect(memories[0].type).toBe('lesson');
    });

    it('should filter by project path', () => {
      const memories = vault.listMemories({ projectPath: '/proj-a' });
      expect(memories).toHaveLength(2);
    });
  });

  describe('memoryStats', () => {
    it('should return zero counts for empty memories', () => {
      const stats = vault.memoryStats();
      expect(stats.total).toBe(0);
      expect(stats.byType).toEqual({});
    });

    it('should return correct breakdown', () => {
      vault.captureMemory({
        projectPath: '/a',
        type: 'lesson',
        context: 'ctx',
        summary: 's',
        topics: [],
        filesModified: [],
        toolsUsed: [],
      });
      vault.captureMemory({
        projectPath: '/a',
        type: 'lesson',
        context: 'ctx',
        summary: 's',
        topics: [],
        filesModified: [],
        toolsUsed: [],
      });
      vault.captureMemory({
        projectPath: '/b',
        type: 'session',
        context: 'ctx',
        summary: 's',
        topics: [],
        filesModified: [],
        toolsUsed: [],
      });
      const stats = vault.memoryStats();
      expect(stats.total).toBe(3);
      expect(stats.byType).toEqual({ lesson: 2, session: 1 });
      expect(stats.byProject).toEqual({ '/a': 2, '/b': 1 });
    });
  });

  describe('Vault archival and optimization', () => {
    it('archive moves old entries', () => {
      const v = new Vault(':memory:');
      v.seed([
        {
          id: 'old-1',
          type: 'pattern',
          domain: 'test',
          title: 'Old Pattern',
          severity: 'suggestion',
          description: 'Old entry',
          tags: ['test'],
        },
      ]);
      // Manually set the updated_at to 200 days ago
      v.getProvider().run('UPDATE entries SET updated_at = ? WHERE id = ?', [
        Math.floor(Date.now() / 1000) - 200 * 86400,
        'old-1',
      ]);
      v.seed([
        {
          id: 'new-1',
          type: 'pattern',
          domain: 'test',
          title: 'New Pattern',
          severity: 'suggestion',
          description: 'New entry',
          tags: ['test'],
        },
      ]);

      const result = v.archive({ olderThanDays: 90 });
      expect(result.archived).toBe(1);
      expect(v.get('old-1')).toBeNull();
      expect(v.get('new-1')).not.toBeNull();
      v.close();
    });

    it('archive respects olderThanDays', () => {
      const v = new Vault(':memory:');
      v.seed([
        {
          id: 'e1',
          type: 'pattern',
          domain: 'test',
          title: 'Entry',
          severity: 'suggestion',
          description: 'Not old enough',
          tags: ['test'],
        },
      ]);
      // Entry is fresh (just created), archive with 1 day threshold
      const result = v.archive({ olderThanDays: 1 });
      expect(result.archived).toBe(0);
      expect(v.get('e1')).not.toBeNull();
      v.close();
    });

    it('archive returns 0 when no candidates', () => {
      const v = new Vault(':memory:');
      const result = v.archive({ olderThanDays: 30 });
      expect(result.archived).toBe(0);
      v.close();
    });

    it('archived entries excluded from search', () => {
      const v = new Vault(':memory:');
      v.seed([
        {
          id: 'search-1',
          type: 'pattern',
          domain: 'test',
          title: 'Searchable Pattern',
          severity: 'suggestion',
          description: 'Should be archived',
          tags: ['search'],
        },
      ]);
      v.getProvider().run('UPDATE entries SET updated_at = ? WHERE id = ?', [
        Math.floor(Date.now() / 1000) - 200 * 86400,
        'search-1',
      ]);

      // Before archive: should appear in search
      const before = v.search('searchable');
      expect(before).toHaveLength(1);

      v.archive({ olderThanDays: 90 });

      // After archive: should not appear
      const after = v.search('searchable');
      expect(after.length).toBe(0);
      v.close();
    });

    it('restore brings entry back', () => {
      const v = new Vault(':memory:');
      v.seed([
        {
          id: 'restore-1',
          type: 'pattern',
          domain: 'test',
          title: 'Restore Me',
          severity: 'suggestion',
          description: 'Will be restored',
          tags: ['test'],
        },
      ]);
      v.getProvider().run('UPDATE entries SET updated_at = ? WHERE id = ?', [
        Math.floor(Date.now() / 1000) - 200 * 86400,
        'restore-1',
      ]);
      v.archive({ olderThanDays: 90 });
      expect(v.get('restore-1')).toBeNull();

      const restored = v.restore('restore-1');
      expect(restored).toBe(true);
      expect(v.get('restore-1')).not.toBeNull();
      expect(v.get('restore-1')!.title).toBe('Restore Me');
      v.close();
    });

    it('restore returns false for missing id', () => {
      const v = new Vault(':memory:');
      const result = v.restore('nonexistent');
      expect(result).toBe(false);
      v.close();
    });

    it('restored entry appears in search', () => {
      const v = new Vault(':memory:');
      v.seed([
        {
          id: 'search-restore',
          type: 'pattern',
          domain: 'test',
          title: 'Unique Findable Pattern',
          severity: 'suggestion',
          description: 'Will be found after restore',
          tags: ['test'],
        },
      ]);
      v.getProvider().run('UPDATE entries SET updated_at = ? WHERE id = ?', [
        Math.floor(Date.now() / 1000) - 200 * 86400,
        'search-restore',
      ]);
      v.archive({ olderThanDays: 90 });
      v.restore('search-restore');

      const results = v.search('unique findable');
      expect(results).toHaveLength(1);
      v.close();
    });

    it('optimize runs without error', () => {
      const v = new Vault(':memory:');
      v.seed([
        {
          id: 'opt-1',
          type: 'pattern',
          domain: 'test',
          title: 'Optimize Test',
          severity: 'suggestion',
          description: 'For optimization',
          tags: ['test'],
        },
      ]);

      expect(() => v.optimize()).not.toThrow();
      v.close();
    });

    it('optimize returns status', () => {
      const v = new Vault(':memory:');
      const status = v.optimize();
      expect(status).toHaveProperty('vacuumed');
      expect(status).toHaveProperty('analyzed');
      expect(status).toHaveProperty('ftsRebuilt');
      // SQLite backend should analyze and rebuild FTS
      expect(status.analyzed).toBe(true);
      v.close();
    });
  });

  describe('Content-addressable hashing', () => {
    it('seed populates content_hash', () => {
      vault.seed([
        {
          id: 'ch-1',
          type: 'pattern',
          domain: 'test',
          title: 'Hash test',
          severity: 'warning',
          description: 'Desc',
          tags: ['a'],
        },
      ]);
      const hash = computeContentHash({
        type: 'pattern',
        domain: 'test',
        title: 'Hash test',
        description: 'Desc',
        tags: ['a'],
      });
      expect(vault.findByContentHash(hash)).toBe('ch-1');
    });

    it('findByContentHash returns null for unknown hash', () => {
      expect(vault.findByContentHash('0000000000000000000000000000000000000000')).toBeNull();
    });

    it('contentHashStats returns correct counts', () => {
      vault.seed([
        {
          id: 'hs-1',
          type: 'pattern',
          domain: 'd',
          title: 'T1',
          severity: 'warning',
          description: 'D1',
          tags: ['a'],
        },
        {
          id: 'hs-2',
          type: 'rule',
          domain: 'd',
          title: 'T2',
          severity: 'warning',
          description: 'D2',
          tags: ['b'],
        },
      ]);
      const stats = vault.contentHashStats();
      expect(stats.total).toBe(2);
      expect(stats.hashed).toBe(2);
      expect(stats.uniqueHashes).toBe(2);
    });

    it('backfill hashes existing entries on re-initialize', () => {
      vault.seed([
        {
          id: 'bf-1',
          type: 'pattern',
          domain: 'd',
          title: 'Backfill',
          severity: 'warning',
          description: 'D',
          tags: [],
        },
      ]);
      const stats = vault.contentHashStats();
      expect(stats.hashed).toBe(stats.total);
    });
  });
});
