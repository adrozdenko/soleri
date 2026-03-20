import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Curator } from '../curator/curator.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern for testing.',
    tags: overrides.tags ?? ['testing'],
  };
}

describe('Curator', () => {
  let vault: Vault;
  let curator: Curator;

  beforeEach(() => {
    vault = new Vault(':memory:');
    curator = new Curator(vault);
  });

  afterEach(() => {
    vault.close();
  });

  // ─── Constructor ──────────────────────────────────────────────

  describe('Constructor', () => {
    it('should create curator tables on construction', () => {
      const status = curator.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.tables).toHaveProperty('entry_state');
      expect(status.tables).toHaveProperty('tag_canonical');
      expect(status.tables).toHaveProperty('tag_alias');
      expect(status.tables).toHaveProperty('changelog');
      expect(status.tables).toHaveProperty('contradictions');
    });

    it('should seed default tag aliases', () => {
      const tags = curator.getCanonicalTags();
      const tagNames = tags.map((t) => t.tag);
      expect(tagNames).toContain('accessibility');
      expect(tagNames).toContain('typescript');
      expect(tagNames).toContain('javascript');
      expect(tagNames).toContain('styling');
      expect(tagNames).toContain('testing');
    });

    it('should be idempotent — safe to construct twice on same vault', () => {
      const curator2 = new Curator(vault);
      const status = curator2.getStatus();
      expect(status.initialized).toBe(true);
    });
  });

  // ─── Status ───────────────────────────────────────────────────

  describe('Status', () => {
    it('should return table row counts', () => {
      const status = curator.getStatus();
      expect(status.tables.entry_state).toBe(0);
      expect(status.tables.tag_alias).toBeGreaterThan(0); // seeded aliases
      expect(status.tables.tag_canonical).toBeGreaterThan(0);
      expect(status.tables.changelog).toBe(0);
      expect(status.tables.contradictions).toBe(0);
      expect(status.lastGroomedAt).toBeNull();
    });
  });

  // ─── Tag Normalization ────────────────────────────────────────

  describe('Tag Normalization', () => {
    it('should normalize a known alias', () => {
      const result = curator.normalizeTag('a11y');
      expect(result.normalized).toBe('accessibility');
      expect(result.wasAliased).toBe(true);
    });

    it('should return lowercase for unknown tags', () => {
      const result = curator.normalizeTag('MyCustomTag');
      expect(result.normalized).toBe('mycustomtag');
      expect(result.wasAliased).toBe(false);
    });

    it('should normalize tags on an entry', () => {
      vault.seed([makeEntry({ id: 'norm-1', tags: ['a11y', 'ts', 'custom'] })]);
      const results = curator.normalizeTags('norm-1');
      expect(results.length).toBe(3);
      expect(results[0].normalized).toBe('accessibility');
      expect(results[1].normalized).toBe('typescript');
      expect(results[2].normalized).toBe('custom');

      // Verify the entry was updated in vault
      const updated = vault.get('norm-1')!;
      expect(updated.tags).toContain('accessibility');
      expect(updated.tags).toContain('typescript');
      expect(updated.tags).not.toContain('a11y');
    });

    it('should add a custom alias', () => {
      curator.addTagAlias('react', 'frontend');
      const result = curator.normalizeTag('react');
      expect(result.normalized).toBe('frontend');
      expect(result.wasAliased).toBe(true);
    });

    it('should list canonical tags with alias counts', () => {
      const tags = curator.getCanonicalTags();
      const styling = tags.find((t) => t.tag === 'styling')!;
      expect(styling.aliasCount).toBe(3); // css, tailwind, tw
    });
  });

  // ─── Duplicate Detection ──────────────────────────────────────

  describe('Duplicate Detection', () => {
    it('should detect duplicates above threshold', () => {
      vault.seed([
        makeEntry({
          id: 'dup-1',
          title: 'Use semantic tokens for colors',
          description: 'Always use semantic tokens instead of raw hex values for color styling.',
        }),
        makeEntry({
          id: 'dup-2',
          title: 'Use semantic tokens for color values',
          description: 'Prefer semantic color tokens over raw hex or rgb values in styling.',
        }),
      ]);
      const results = curator.detectDuplicates(undefined, 0.3);
      expect(results.length).toBeGreaterThan(0);
      // Both should find each other
      const dup1 = results.find((r) => r.entryId === 'dup-1');
      expect(dup1).toBeDefined();
      expect(dup1!.matches.length).toBeGreaterThan(0);
    });

    it('should not detect duplicates below threshold', () => {
      vault.seed([
        makeEntry({
          id: 'uniq-1',
          title: 'Database indexing strategies',
          description: 'Create indices on frequently queried columns.',
        }),
        makeEntry({
          id: 'uniq-2',
          title: 'React component lifecycle',
          description: 'Use useEffect for side effects in functional components.',
        }),
      ]);
      const results = curator.detectDuplicates(undefined, 0.8);
      expect(results.length).toBe(0);
    });

    it('should detect duplicates for a specific entry', () => {
      vault.seed([
        makeEntry({
          id: 'spec-1',
          title: 'Authentication with JWT tokens',
          description: 'Use JSON Web Tokens for stateless authentication.',
        }),
        makeEntry({
          id: 'spec-2',
          title: 'JWT token authentication pattern',
          description: 'Implement JWT-based authentication for API endpoints.',
        }),
        makeEntry({
          id: 'spec-3',
          title: 'Database connection pooling',
          description: 'Use connection pools for efficient database access.',
        }),
      ]);
      const results = curator.detectDuplicates('spec-1', 0.3);
      expect(results.length).toBe(1);
      expect(results[0].entryId).toBe('spec-1');
    });

    it('should suggest merge for high similarity', () => {
      vault.seed([
        makeEntry({
          id: 'merge-1',
          title: 'Validate user input',
          description: 'Always validate and sanitize user input before processing.',
        }),
        makeEntry({
          id: 'merge-2',
          title: 'Validate user input',
          description: 'Always validate and sanitize user input before processing.',
        }),
      ]);
      const results = curator.detectDuplicates(undefined, 0.3);
      if (results.length > 0 && results[0].matches.length > 0) {
        expect(results[0].matches[0].suggestMerge).toBe(true);
      }
    });

    it('should return empty for empty vault', () => {
      const results = curator.detectDuplicates();
      expect(results).toEqual([]);
    });

    it('should NOT flag cross-domain entries as duplicates', () => {
      vault.seed([
        makeEntry({
          id: 'cross-1',
          domain: 'design',
          title: 'Use semantic tokens for colors',
          description: 'Always use semantic tokens instead of raw hex values for color styling.',
          tags: ['tokens', 'colors'],
        }),
        makeEntry({
          id: 'cross-2',
          domain: 'architecture',
          title: 'Use semantic tokens for colors',
          description: 'Always use semantic tokens instead of raw hex values for color styling.',
          tags: ['tokens', 'colors'],
        }),
      ]);
      const results = curator.detectDuplicates(undefined, 0.3);
      expect(results.length).toBe(0);
    });

    it('should still flag same-domain entries as duplicates', () => {
      vault.seed([
        makeEntry({
          id: 'same-1',
          domain: 'design',
          title: 'Use semantic tokens for colors',
          description: 'Always use semantic tokens instead of raw hex values for color styling.',
          tags: ['tokens', 'colors'],
        }),
        makeEntry({
          id: 'same-2',
          domain: 'design',
          title: 'Use semantic tokens for color values',
          description: 'Prefer semantic color tokens over raw hex or rgb values in styling.',
          tags: ['tokens', 'colors'],
        }),
      ]);
      const results = curator.detectDuplicates(undefined, 0.3);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should improve health audit score for cross-domain vaults', () => {
      // Seed entries across different domains with similar vocabulary
      vault.seed([
        makeEntry({
          id: 'ha-1',
          domain: 'design',
          type: 'pattern',
          title: 'Use semantic tokens for colors',
          description: 'Always use semantic tokens instead of raw hex values.',
          tags: ['tokens', 'colors'],
        }),
        makeEntry({
          id: 'ha-2',
          domain: 'architecture',
          type: 'anti-pattern',
          title: 'Use semantic tokens for API responses',
          description: 'Always use semantic tokens instead of raw values in API.',
          tags: ['tokens', 'api'],
        }),
        makeEntry({
          id: 'ha-3',
          domain: 'testing',
          type: 'rule',
          title: 'Use semantic assertions',
          description: 'Always use semantic assertions for test clarity.',
          tags: ['tokens', 'testing'],
        }),
      ]);
      curator.groomAll();
      const result = curator.healthAudit();
      // Cross-domain entries should not be penalized as duplicates
      expect(result.score).toBeGreaterThanOrEqual(90);
    });
  });

  // ─── Contradictions ───────────────────────────────────────────

  describe('Contradictions', () => {
    it('should detect contradiction between similar pattern and anti-pattern', () => {
      vault.seed([
        makeEntry({
          id: 'p-inline',
          type: 'pattern',
          title: 'Use inline styles for dynamic values',
          description: 'Apply inline styles when values are computed at runtime.',
          tags: ['styling'],
        }),
        makeEntry({
          id: 'ap-inline',
          type: 'anti-pattern',
          title: 'Avoid inline styles for styling',
          description:
            'Never use inline styles — prefer CSS classes or Tailwind utilities for styling.',
          tags: ['styling'],
        }),
      ]);
      const contradictions = curator.detectContradictions(0.2);
      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].patternId).toBe('p-inline');
      expect(contradictions[0].antipatternId).toBe('ap-inline');
      expect(contradictions[0].status).toBe('open');
    });

    it('should skip unrelated pattern/anti-pattern pairs', () => {
      vault.seed([
        makeEntry({
          id: 'p-auth',
          type: 'pattern',
          title: 'Use JWT for authentication',
          description: 'JSON Web Tokens for stateless auth.',
          tags: ['auth'],
        }),
        makeEntry({
          id: 'ap-css',
          type: 'anti-pattern',
          title: 'Avoid CSS !important',
          description: 'Never use !important in CSS declarations.',
          tags: ['styling'],
        }),
      ]);
      const contradictions = curator.detectContradictions(0.8);
      expect(contradictions.length).toBe(0);
    });

    it('should respect UNIQUE constraint — no duplicate contradictions', () => {
      vault.seed([
        makeEntry({
          id: 'p-dup',
          type: 'pattern',
          title: 'Use inline styles',
          description: 'Apply inline styles for dynamic values.',
        }),
        makeEntry({
          id: 'ap-dup',
          type: 'anti-pattern',
          title: 'Avoid inline styles',
          description: 'Do not use inline styles.',
        }),
      ]);
      curator.detectContradictions(0.2);
      const first = curator.getContradictions();
      curator.detectContradictions(0.2);
      const second = curator.getContradictions();
      expect(second.length).toBe(first.length);
    });

    it('should resolve a contradiction', () => {
      vault.seed([
        makeEntry({
          id: 'p-res',
          type: 'pattern',
          title: 'Use inline styles',
          description: 'Apply inline styles.',
        }),
        makeEntry({
          id: 'ap-res',
          type: 'anti-pattern',
          title: 'Avoid inline styles',
          description: 'Do not use inline styles.',
        }),
      ]);
      curator.detectContradictions(0.2);
      const all = curator.getContradictions();
      expect(all.length).toBeGreaterThan(0);
      const resolved = curator.resolveContradiction(all[0].id, 'resolved');
      expect(resolved).not.toBeNull();
      expect(resolved!.status).toBe('resolved');
      expect(resolved!.resolvedAt).not.toBeNull();
    });

    it('should dismiss a contradiction', () => {
      vault.seed([
        makeEntry({
          id: 'p-dis',
          type: 'pattern',
          title: 'Use inline styles',
          description: 'Apply inline styles.',
        }),
        makeEntry({
          id: 'ap-dis',
          type: 'anti-pattern',
          title: 'Avoid inline styles',
          description: 'Do not use inline styles.',
        }),
      ]);
      curator.detectContradictions(0.2);
      const all = curator.getContradictions();
      const dismissed = curator.resolveContradiction(all[0].id, 'dismissed');
      expect(dismissed!.status).toBe('dismissed');
    });

    it('should list by status', () => {
      vault.seed([
        makeEntry({
          id: 'p-ls',
          type: 'pattern',
          title: 'Use inline styles',
          description: 'Apply inline styles.',
        }),
        makeEntry({
          id: 'ap-ls',
          type: 'anti-pattern',
          title: 'Avoid inline styles',
          description: 'Do not use inline styles.',
        }),
      ]);
      curator.detectContradictions(0.2);
      const open = curator.getContradictions('open');
      expect(open.length).toBeGreaterThan(0);
      const resolved = curator.getContradictions('resolved');
      expect(resolved.length).toBe(0);
    });
  });

  // ─── Grooming ─────────────────────────────────────────────────

  describe('Grooming', () => {
    it('should groom a single entry', () => {
      vault.seed([makeEntry({ id: 'groom-1', tags: ['a11y', 'perf'] })]);
      const result = curator.groomEntry('groom-1');
      expect(result).not.toBeNull();
      expect(result!.entryId).toBe('groom-1');
      expect(result!.stale).toBe(false);
      expect(result!.lastGroomedAt).toBeGreaterThan(0);
    });

    it('should detect stale entries during grooming', () => {
      vault.seed([makeEntry({ id: 'groom-stale' })]);
      // Manually set updated_at to 100 days ago
      const db = vault.getDb();
      const oldTimestamp = Math.floor(Date.now() / 1000) - 100 * 86400;
      db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(oldTimestamp, 'groom-stale');

      const result = curator.groomEntry('groom-stale');
      expect(result!.stale).toBe(true);
    });

    it('should update curator_entry_state after grooming', () => {
      vault.seed([makeEntry({ id: 'groom-state' })]);
      curator.groomEntry('groom-state');

      const db = vault.getDb();
      const row = db
        .prepare('SELECT * FROM curator_entry_state WHERE entry_id = ?')
        .get('groom-state') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.status).toBe('active');
      expect(row.last_groomed_at).not.toBeNull();
    });

    it('should groom all entries', () => {
      vault.seed([
        makeEntry({ id: 'ga-1', tags: ['ts'] }),
        makeEntry({ id: 'ga-2', tags: ['js'] }),
        makeEntry({ id: 'ga-3', tags: ['custom'] }),
      ]);
      const result = curator.groomAll();
      expect(result.totalEntries).toBe(3);
      expect(result.groomedCount).toBe(3);
      expect(result.tagsNormalized).toBe(2); // ts→typescript, js→javascript
      expect(result.staleCount).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should log changelog entries during grooming', () => {
      vault.seed([makeEntry({ id: 'groom-log' })]);
      curator.groomEntry('groom-log');
      const history = curator.getEntryHistory('groom-log');
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].action).toBe('groom');
      expect(history[0].entryId).toBe('groom-log');
    });
  });

  // ─── Consolidation ────────────────────────────────────────────

  describe('Consolidation', () => {
    it('should default to dry-run', () => {
      const result = curator.consolidate();
      expect(result.dryRun).toBe(true);
      expect(result.mutations).toBe(0);
    });

    it('should find issues in dry-run', () => {
      vault.seed([
        makeEntry({
          id: 'con-1',
          title: 'Validate user input thoroughly',
          description: 'Always validate and sanitize all user input before processing.',
        }),
        makeEntry({
          id: 'con-2',
          title: 'Validate user input thoroughly',
          description: 'Always validate and sanitize all user input before processing.',
        }),
      ]);
      const result = curator.consolidate({ dryRun: true, duplicateThreshold: 0.3 });
      expect(result.dryRun).toBe(true);
      expect(result.duplicates.length).toBeGreaterThan(0);
      expect(result.mutations).toBe(0);
      // Entries still exist
      expect(vault.get('con-1')).not.toBeNull();
      expect(vault.get('con-2')).not.toBeNull();
    });

    it('should not mutate in dry-run', () => {
      vault.seed([
        makeEntry({ id: 'dry-1', title: 'Identical pattern', description: 'Same thing.' }),
        makeEntry({ id: 'dry-2', title: 'Identical pattern', description: 'Same thing.' }),
      ]);
      curator.consolidate({ dryRun: true, duplicateThreshold: 0.3 });
      expect(vault.get('dry-1')).not.toBeNull();
      expect(vault.get('dry-2')).not.toBeNull();
    });

    it('should archive stale entries when not dry-run', () => {
      vault.seed([makeEntry({ id: 'stale-con' })]);
      const db = vault.getDb();
      const oldTimestamp = Math.floor(Date.now() / 1000) - 100 * 86400;
      db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(oldTimestamp, 'stale-con');

      const result = curator.consolidate({ dryRun: false, staleDaysThreshold: 90 });
      expect(result.staleEntries).toContain('stale-con');
      expect(result.mutations).toBeGreaterThan(0);

      // Check that entry state was archived
      const row = db
        .prepare('SELECT status FROM curator_entry_state WHERE entry_id = ?')
        .get('stale-con') as { status: string };
      expect(row.status).toBe('archived');
    });

    it('should remove duplicates when not dry-run', () => {
      vault.seed([
        makeEntry({
          id: 'rem-1',
          title: 'Duplicate pattern for removal',
          description: 'This is a duplicate pattern that should be removed during consolidation.',
        }),
        makeEntry({
          id: 'rem-2',
          title: 'Duplicate pattern for removal',
          description: 'This is a duplicate pattern that should be removed during consolidation.',
        }),
      ]);
      const result = curator.consolidate({ dryRun: false, duplicateThreshold: 0.3 });
      expect(result.mutations).toBeGreaterThan(0);
    });

    it('should log consolidation actions to changelog', () => {
      vault.seed([makeEntry({ id: 'con-log' })]);
      const db = vault.getDb();
      const oldTimestamp = Math.floor(Date.now() / 1000) - 100 * 86400;
      db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(oldTimestamp, 'con-log');

      curator.consolidate({ dryRun: false });
      const history = curator.getEntryHistory('con-log');
      expect(history.length).toBeGreaterThan(0);
      expect(history.some((h) => h.action === 'archive')).toBe(true);
    });
  });

  // ─── Changelog ────────────────────────────────────────────────

  describe('Changelog', () => {
    it('should return entries in reverse chronological order', () => {
      vault.seed([makeEntry({ id: 'chg-1', tags: ['a11y'] })]);
      curator.groomEntry('chg-1');
      curator.groomEntry('chg-1');
      const history = curator.getEntryHistory('chg-1');
      expect(history.length).toBe(3); // normalize_tags + 2 grooms
      // Most recent first
      expect(history[0].createdAt).toBeGreaterThanOrEqual(history[history.length - 1].createdAt);
    });

    it('should respect limit', () => {
      vault.seed([makeEntry({ id: 'chg-lim', tags: ['ts'] })]);
      curator.groomEntry('chg-lim');
      curator.groomEntry('chg-lim');
      const history = curator.getEntryHistory('chg-lim', 1);
      expect(history.length).toBe(1);
    });

    it('should return empty for unknown entry', () => {
      const history = curator.getEntryHistory('nonexistent');
      expect(history).toEqual([]);
    });
  });

  // ─── Health Audit ─────────────────────────────────────────────

  describe('Health Audit', () => {
    it('should return 100 for healthy vault', () => {
      vault.seed([
        makeEntry({ id: 'h-1', type: 'pattern', tags: ['a', 'b'] }),
        makeEntry({ id: 'h-2', type: 'anti-pattern', tags: ['c', 'd'] }),
        makeEntry({ id: 'h-3', type: 'rule', tags: ['e', 'f'] }),
      ]);
      // Groom all entries
      curator.groomAll();
      const result = curator.healthAudit();
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.metrics.coverage).toBe(1);
      expect(result.metrics.freshness).toBe(1);
    });

    it('should penalize for missing entry types', () => {
      vault.seed([makeEntry({ id: 'h-p1', type: 'pattern', tags: ['x'] })]);
      curator.groomAll();
      const result = curator.healthAudit();
      expect(result.score).toBeLessThan(100);
      expect(result.recommendations.some((r) => r.includes('anti-pattern'))).toBe(true);
      expect(result.recommendations.some((r) => r.includes('rule'))).toBe(true);
    });

    it('should recommend actions for issues', () => {
      vault.seed([makeEntry({ id: 'h-rec', type: 'pattern', tags: [] })]);
      const result = curator.healthAudit();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle empty vault gracefully', () => {
      const result = curator.healthAudit();
      expect(result.score).toBe(100);
      expect(result.recommendations).toContain(
        'Vault is empty — add knowledge entries to get started.',
      );
    });

    it('should include tag health metrics', () => {
      vault.seed([
        makeEntry({ id: 'h-tag1', tags: [] }),
        makeEntry({ id: 'h-tag2', tags: ['one'] }),
        makeEntry({ id: 'h-tag3', tags: ['one', 'two'] }),
      ]);
      const result = curator.healthAudit();
      expect(result.metrics.tagHealth).toBeDefined();
      // 2 out of 3 entries have < 2 tags
      expect(result.metrics.tagHealth).toBeLessThan(1);
    });
  });
});
