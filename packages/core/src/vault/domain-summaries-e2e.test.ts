/**
 * Integration test: domain summary lifecycle — end-to-end.
 *
 * Verifies: create entries → stale → rebuild → fresh → add entry → re-stale
 * → query all 3 tiers → verify token estimates decrease tier 3 → tier 1.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Vault } from './vault.js';
import { Brain } from '../brain/brain.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeEntry(
  overrides: Partial<IntelligenceEntry> & { id: string; domain: string },
): IntelligenceEntry {
  return {
    type: 'pattern',
    title: `Pattern: ${overrides.id}`,
    severity: 'suggestion',
    description: `Detailed description for ${overrides.id}. This is a comprehensive pattern covering best practices, common pitfalls, and recommended approaches for handling this specific concern in production systems.`,
    context: `Context: when working with ${overrides.domain} in a TypeScript monorepo`,
    example: `// Good: follow ${overrides.id} pattern\nconst result = doTheThing();`,
    why: `This pattern reduces complexity and improves maintainability.`,
    tags: ['best-practice', overrides.domain],
    ...overrides,
  } as IntelligenceEntry;
}

describe('Domain Summary Lifecycle — E2E', () => {
  let vault: Vault;
  let brain: Brain;

  beforeEach(() => {
    vault = Vault.createWithSQLite(':memory:');
    brain = new Brain(vault);
  });

  it('full lifecycle: create → stale → rebuild → fresh → add → re-stale → tiered query', async () => {
    // Step 1: Create entries across 3 domains
    const entries = [
      makeEntry({ id: 'test-1', domain: 'testing', title: 'Use TDD for business logic' }),
      makeEntry({
        id: 'test-2',
        domain: 'testing',
        title: 'Mock-free integration tests',
        type: 'anti-pattern',
      }),
      makeEntry({ id: 'test-3', domain: 'testing', title: 'Arrange-act-assert structure' }),
      makeEntry({ id: 'arch-1', domain: 'architecture', title: 'Two-layer split: shell + brain' }),
      makeEntry({ id: 'arch-2', domain: 'architecture', title: 'Zero new dependencies in core' }),
      makeEntry({ id: 'ts-1', domain: 'typescript', title: 'Prefer type narrowing over casting' }),
      makeEntry({ id: 'ts-2', domain: 'typescript', title: 'Use branded types for IDs' }),
    ];
    vault.seed(entries);

    // Step 2: Verify all domains are stale (seed triggers markStale)
    const stats1 = vault.domainSummaries.stats();
    expect(stats1.staleDomains).toBeGreaterThanOrEqual(3);

    // Step 3: Rebuild all
    const rebuilt = vault.domainSummaries.rebuildAll();
    expect(rebuilt).toBe(3);

    // Step 4: Verify all are fresh
    const stats2 = vault.domainSummaries.stats();
    expect(stats2.freshDomains).toBe(3);
    expect(stats2.staleDomains).toBe(0);

    // Verify summary content quality
    const testingSummary = vault.domainSummaries.get('testing');
    expect(testingSummary).not.toBeNull();
    expect(testingSummary!.entryCount).toBe(3);
    expect(testingSummary!.topPatterns.length).toBeGreaterThan(0);
    expect(testingSummary!.topAntipatterns.length).toBeGreaterThan(0);
    expect(testingSummary!.stale).toBe(false);

    // Step 5: Add a new entry → verify domain gets re-staled
    vault.add(
      makeEntry({ id: 'test-4', domain: 'testing', title: 'Snapshot testing for UI components' }),
    );

    // testing should be stale now, others fresh
    const stats3 = vault.domainSummaries.stats();
    expect(stats3.staleDomains).toBeGreaterThanOrEqual(1);

    // But get() rebuilds lazily
    const refreshed = vault.domainSummaries.get('testing');
    expect(refreshed!.entryCount).toBe(4);
    expect(refreshed!.stale).toBe(false);

    // Step 6: Query via tiered context API — verify token estimates decrease
    // Rebuild brain vocabulary first
    brain.rebuildVocabulary();

    const tier3 = await brain.getContextTier('testing patterns', 3, { limit: 5 });
    const tier2 = await brain.getContextTier('testing patterns', 2, { limit: 5 });
    const tier1 = await brain.getContextTier('testing patterns', 1, { limit: 5 });

    // Tier 3 should have the most tokens (full entry bodies)
    // Tier 2 should have fewer (titles + snippets)
    // Tier 1 should have the fewest (domain summaries only)
    expect(tier3.totalTokenEstimate).toBeGreaterThan(0);
    expect(tier2.totalTokenEstimate).toBeGreaterThan(0);
    expect(tier1.totalTokenEstimate).toBeGreaterThan(0);

    // Token cost should decrease from tier 3 → tier 1
    expect(tier3.totalTokenEstimate).toBeGreaterThanOrEqual(tier2.totalTokenEstimate);
    expect(tier2.totalTokenEstimate).toBeGreaterThanOrEqual(tier1.totalTokenEstimate);

    // Tier metadata should be correct
    expect(tier1.tier).toBe(1);
    expect(tier2.tier).toBe(2);
    expect(tier3.tier).toBe(3);

    // Tier 1 should return domain-level items
    for (const item of tier1.items) {
      expect(item.id).toMatch(/^domain:/);
    }

    // Tier 2 and 3 should return entry-level items
    if (tier2.items.length > 0) {
      expect(tier2.items[0].id).not.toMatch(/^domain:/);
    }
    if (tier3.items.length > 0) {
      expect(tier3.items[0].id).not.toMatch(/^domain:/);
    }
  });

  it('token budget is respected across tiers', async () => {
    vault.seed([
      makeEntry({ id: 'p1', domain: 'testing', title: 'Pattern one' }),
      makeEntry({ id: 'p2', domain: 'testing', title: 'Pattern two' }),
      makeEntry({ id: 'p3', domain: 'testing', title: 'Pattern three' }),
      makeEntry({ id: 'p4', domain: 'architecture', title: 'Arch pattern one' }),
      makeEntry({ id: 'p5', domain: 'architecture', title: 'Arch pattern two' }),
    ]);
    brain.rebuildVocabulary();

    // Request with a very tight token budget
    const result = await brain.getContextTier('testing', 3, { limit: 10, maxTokens: 100 });
    // Should respect the budget — not all entries returned
    expect(result.totalTokenEstimate).toBeLessThanOrEqual(200); // some slack for single-entry min
  });

  it('progressive sufficiency with high confidence', async () => {
    // Create entries where one is clearly more relevant
    vault.seed([
      makeEntry({
        id: 'exact-match',
        domain: 'testing',
        title: 'testing patterns for vitest',
        description: 'Comprehensive testing patterns for vitest test runner',
        severity: 'critical',
      }),
      makeEntry({ id: 'p2', domain: 'testing', title: 'Generic testing advice' }),
      makeEntry({ id: 'p3', domain: 'testing', title: 'More testing things' }),
      makeEntry({ id: 'p4', domain: 'testing', title: 'Yet another pattern' }),
      makeEntry({ id: 'p5', domain: 'testing', title: 'Testing utilities' }),
    ]);
    brain.rebuildVocabulary();

    // Search with confidence threshold — should return fewer results when top is confident
    const withBudget = await brain.intelligentSearch('testing patterns vitest', {
      limit: 10,
      maxTokens: 5000,
      confidenceThreshold: 0.1, // low threshold so progressive sufficiency kicks in
    });

    const withoutBudget = await brain.intelligentSearch('testing patterns vitest', {
      limit: 10,
    });

    // With budget + threshold, should return same or fewer results
    expect(withBudget.length).toBeLessThanOrEqual(withoutBudget.length);
  });

  it('domain summary invalidation across operations', () => {
    vault.seed([
      makeEntry({ id: 'p1', domain: 'testing' }),
      makeEntry({ id: 'p2', domain: 'testing' }),
    ]);
    vault.domainSummaries.rebuildAll();

    // update with domain change
    vault.update('p1', { domain: 'architecture' });

    // Both domains should have been invalidated
    const testing = vault.domainSummaries.get('testing');
    expect(testing!.entryCount).toBe(1); // p2 remains

    const arch = vault.domainSummaries.get('architecture');
    expect(arch!.entryCount).toBe(1); // p1 moved here
  });
});
