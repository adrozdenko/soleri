import { describe, it, expect } from 'vitest';
import { dedupItems, DEDUP_THRESHOLD } from './dedup-gate.js';
import type { Vault } from '../vault/vault.js';
import type { ClassifiedItem } from './types.js';

// =============================================================================
// MOCK VAULT
// =============================================================================

function mockVault(entries: Array<{ id: string; title: string; description: string }> = []): Vault {
  return {
    exportAll: () => ({
      entries: entries.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        type: 'pattern',
        domain: 'test',
        severity: 'suggestion',
        tags: [],
      })),
    }),
  } as unknown as Vault;
}

function makeItem(title: string, description: string): ClassifiedItem {
  return {
    type: 'pattern',
    title,
    description,
    tags: ['test'],
    severity: 'suggestion',
    citation: 'test',
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('dedupItems — colocated', () => {
  it('marks all items as non-duplicate when vault is empty', () => {
    const vault = mockVault([]);
    const items = [
      makeItem('New Pattern', 'A completely new pattern.'),
      makeItem('Another New', 'Something else entirely.'),
    ];

    const results = dedupItems(items, vault);

    expect(results).toHaveLength(2);
    expect(results.every((r) => !r.isDuplicate)).toBe(true);
    expect(results.every((r) => r.similarity === 0)).toBe(true);
    expect(results.every((r) => r.bestMatchId === undefined)).toBe(true);
  });

  it('detects exact duplicate text as duplicate', () => {
    const vault = mockVault([
      {
        id: 'existing-1',
        title: 'Singleton Pattern',
        description: 'The singleton pattern ensures a class has only one instance.',
      },
    ]);

    const items = [
      makeItem('Singleton Pattern', 'The singleton pattern ensures a class has only one instance.'),
    ];

    const results = dedupItems(items, vault);

    expect(results).toHaveLength(1);
    expect(results[0].isDuplicate).toBe(true);
    expect(results[0].bestMatchId).toBe('existing-1');
    expect(results[0].similarity).toBeGreaterThanOrEqual(DEDUP_THRESHOLD);
  });

  it('does not flag dissimilar items as duplicates', () => {
    const vault = mockVault([
      {
        id: 'existing-2',
        title: 'Observer Pattern',
        description: 'Observer defines one-to-many dependency for event-driven communication.',
      },
    ]);

    const items = [
      makeItem(
        'Circuit Breaker',
        'A resilience pattern that prevents cascading failures in distributed systems.',
      ),
    ];

    const results = dedupItems(items, vault);

    expect(results[0].isDuplicate).toBe(false);
    expect(results[0].similarity).toBeLessThan(DEDUP_THRESHOLD);
  });

  it('returns per-item results with correct structure', () => {
    const vault = mockVault([]);
    const items = [makeItem('Test', 'Description')];

    const results = dedupItems(items, vault);

    expect(results[0]).toHaveProperty('item');
    expect(results[0]).toHaveProperty('isDuplicate');
    expect(results[0]).toHaveProperty('similarity');
    expect(results[0].item).toBe(items[0]);
  });

  it('handles multiple items — some duplicate, some not', () => {
    const vault = mockVault([
      {
        id: 'v1',
        title: 'Factory Method Pattern',
        description:
          'Factory method pattern provides interface for creating objects in a superclass.',
      },
    ]);

    const items = [
      // Near-duplicate
      makeItem(
        'Factory Method Pattern',
        'Factory method pattern provides interface for creating objects in a superclass.',
      ),
      // Different
      makeItem(
        'Adapter Pattern',
        'Adapter pattern allows incompatible interfaces to work together via a wrapper.',
      ),
    ];

    const results = dedupItems(items, vault);

    expect(results).toHaveLength(2);
    // First should be a high-similarity match (near-exact duplicate)
    expect(results[0].similarity).toBeGreaterThanOrEqual(DEDUP_THRESHOLD);
    // Second should be non-duplicate
    expect(results[1].isDuplicate).toBe(false);
  });
});
