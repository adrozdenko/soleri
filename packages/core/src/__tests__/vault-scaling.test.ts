/**
 * Vault Scaling Tests — performance at 10K+ entries.
 *
 * Measures: write throughput, search latency, FTS performance,
 * archive/compaction, and memory footprint at scale.
 */

import { describe, test, expect, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Brain } from '../brain/brain.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

const DOMAINS = ['design', 'a11y', 'performance', 'security', 'architecture', 'testing', 'ux'];
const TYPES: IntelligenceEntry['type'][] = ['pattern', 'anti-pattern', 'rule', 'playbook'];
const SEVERITIES: IntelligenceEntry['severity'][] = ['critical', 'warning', 'suggestion'];

function generateEntries(count: number): IntelligenceEntry[] {
  const entries: IntelligenceEntry[] = [];
  for (let i = 0; i < count; i++) {
    const domain = DOMAINS[i % DOMAINS.length];
    const type = TYPES[i % TYPES.length];
    const severity = SEVERITIES[i % SEVERITIES.length];
    entries.push({
      id: `entry-${i}`,
      type,
      domain,
      title: `${type} ${i}: ${domain} best practice for component ${i % 100}`,
      severity,
      description: `Detailed description for ${type} ${i} in the ${domain} domain. This entry covers component patterns, accessibility requirements, and performance considerations for item ${i}.`,
      tags: [domain, type, `component-${i % 50}`, `category-${i % 20}`],
      context: `When building ${domain} components, this ${type} applies to scenarios involving layout, state management, and user interaction patterns.`,
    });
  }
  return entries;
}

describe('Vault Scaling — 10K entries', () => {
  let vault: Vault;

  afterEach(() => {
    vault?.close();
  });

  // ─── Write throughput ─────────────────────────────────

  test('seed 10K entries in under 5 seconds', () => {
    vault = new Vault(':memory:');
    const entries = generateEntries(10_000);

    const start = performance.now();
    const seeded = vault.seed(entries);
    const elapsed = performance.now() - start;

    expect(seeded).toBe(10_000);
    expect(elapsed).toBeLessThan(5_000);

    const stats = vault.stats();
    expect(stats.totalEntries).toBe(10_000);
  });

  // ─── Search latency ──────────────────────────────────

  test('FTS search over 10K entries under 50ms', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(10_000));

    // Warm up
    vault.search('design pattern');

    // FTS5 queries: use simple terms that exist in the generated data
    const queries = ['design', 'performance', 'security', 'architecture', 'testing'];

    for (const query of queries) {
      const start = performance.now();
      const results = vault.search(query, { limit: 20 });
      const elapsed = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(50);
    }
  });

  test('search with domain filter under 50ms at 10K', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(10_000));

    const start = performance.now();
    const results = vault.search('pattern', { domain: 'design', limit: 20 });
    const elapsed = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });

  test('list with filters under 20ms at 10K', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(10_000));

    const start = performance.now();
    const entries = vault.list({ domain: 'a11y', type: 'rule', limit: 50 });
    const elapsed = performance.now() - start;

    expect(entries.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(20);
  });

  // ─── Stats performance ───────────────────────────────

  test('stats() under 20ms at 10K', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(10_000));

    const start = performance.now();
    const stats = vault.stats();
    const elapsed = performance.now() - start;

    expect(stats.totalEntries).toBe(10_000);
    expect(Object.keys(stats.byDomain).length).toBe(DOMAINS.length);
    expect(elapsed).toBeLessThan(20);
  });

  // ─── Archive / compaction ─────────────────────────────

  test('archive old entries reduces active count', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(1_000));

    const before = vault.stats().totalEntries;
    expect(before).toBe(1_000);

    // Archive everything (entries were just created, so use 0 days threshold)
    // First, backdate some entries
    const provider = vault.getProvider();
    const cutoff = Math.floor(Date.now() / 1000) - 100 * 86400; // 100 days ago
    provider.run('UPDATE entries SET updated_at = ? WHERE rowid <= 500', [cutoff]);

    const result = vault.archive({ olderThanDays: 90, reason: 'test compaction' });
    expect(result.archived).toBe(500);

    const after = vault.stats().totalEntries;
    expect(after).toBe(500);
  });

  test('restore archived entry', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(100));

    const provider = vault.getProvider();
    const cutoff = Math.floor(Date.now() / 1000) - 100 * 86400;
    provider.run("UPDATE entries SET updated_at = ? WHERE id = 'entry-0'", [cutoff]);

    vault.archive({ olderThanDays: 90 });
    expect(vault.get('entry-0')).toBeNull();

    const restored = vault.restore('entry-0');
    expect(restored).toBe(true);
    expect(vault.get('entry-0')).not.toBeNull();
  });

  // ─── Optimize / vacuum ────────────────────────────────

  test('optimize() completes without error at 10K', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(10_000));

    const result = vault.optimize();
    expect(result.analyzed).toBe(true);
    expect(result.ftsRebuilt).toBe(true);
  });

  // ─── Brain TF-IDF at scale ────────────────────────────

  test('Brain search over 10K entries under 200ms', async () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(10_000));

    // Brain uses TF-IDF scoring on top of vault search
    const brain = new Brain(vault);

    const start = performance.now();
    const results = await brain.intelligentSearch('design', { limit: 20 });
    const elapsed = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });

  // ─── Bulk operations ──────────────────────────────────

  test('bulk remove 1K entries under 500ms', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(5_000));

    const ids = Array.from({ length: 1_000 }, (_, i) => `entry-${i}`);

    const start = performance.now();
    const removed = vault.bulkRemove(ids);
    const elapsed = performance.now() - start;

    expect(removed).toBe(1_000);
    expect(vault.stats().totalEntries).toBe(4_000);
    expect(elapsed).toBeLessThan(500);
  });

  // ─── Content hash dedup at scale ──────────────────────

  test('seedDedup detects duplicates with different IDs at scale', () => {
    vault = new Vault(':memory:');
    const entries = generateEntries(1_000);
    vault.seed(entries);

    // Create entries with DIFFERENT IDs but SAME content (triggers content-hash dedup)
    const dupeEntries = entries.map((e) => ({ ...e, id: `dupe-${e.id}` }));

    const start = performance.now();
    const results = vault.seedDedup(dupeEntries);
    const elapsed = performance.now() - start;

    const dupes = results.filter((r) => r.action === 'duplicate');
    expect(dupes.length).toBe(1_000);
    expect(elapsed).toBeLessThan(2_000);
  });

  // ─── Tags and domains at scale ────────────────────────

  test('getTags under 100ms at 10K', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(10_000));

    const start = performance.now();
    const tags = vault.getTags();
    const elapsed = performance.now() - start;

    expect(tags.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });

  test('getDomains under 10ms at 10K', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(10_000));

    const start = performance.now();
    const domains = vault.getDomains();
    const elapsed = performance.now() - start;

    expect(domains.length).toBe(DOMAINS.length);
    expect(elapsed).toBeLessThan(10);
  });

  // ─── FTS rebuild at scale ─────────────────────────────

  test('FTS rebuild under 2s at 10K', () => {
    vault = new Vault(':memory:');
    vault.seed(generateEntries(10_000));

    const start = performance.now();
    vault.rebuildFtsIndex();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2_000);

    // Verify search still works after rebuild
    const results = vault.search('design pattern');
    expect(results.length).toBeGreaterThan(0);
  });

  // ─── Memory profile ──────────────────────────────────

  test('memory usage stays under 100MB for 10K entries', () => {
    vault = new Vault(':memory:');
    const before = process.memoryUsage().heapUsed;

    vault.seed(generateEntries(10_000));

    const after = process.memoryUsage().heapUsed;
    const delta = after - before;

    // 10K entries should use well under 100MB
    expect(delta).toBeLessThan(100 * 1024 * 1024);
  });
});
