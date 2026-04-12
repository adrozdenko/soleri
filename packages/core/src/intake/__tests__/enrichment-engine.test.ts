import { describe, it, expect } from 'vitest';
import { enrichExistingEntries, ENRICHMENT_THRESHOLD } from '../enrichment-engine.js';
import { DEDUP_THRESHOLD } from '../dedup-gate.js';
import type { DedupResult } from '../dedup-gate.js';
import type { ClassifiedItem } from '../types.js';
import { Vault } from '../../vault/vault.js';
import type { IntelligenceEntry } from '../../intelligence/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? `entry-${Math.random().toString(36).slice(2, 8)}`,
    type: 'pattern',
    domain: 'testing',
    title: 'Default Title',
    severity: 'suggestion',
    description: 'Default description for testing purposes.',
    tags: ['default'],
    ...overrides,
  };
}

function makeClassifiedItem(overrides: Partial<ClassifiedItem> = {}): ClassifiedItem {
  return {
    type: 'pattern',
    title: 'New Item',
    description: 'New description from ingested source.',
    tags: ['new-tag'],
    severity: 'suggestion',
    citation: 'Page 42, Chapter 3',
    ...overrides,
  };
}

function makeDedupResult(overrides: Partial<DedupResult> = {}): DedupResult {
  return {
    item: makeClassifiedItem(),
    isDuplicate: false,
    similarity: 0.6,
    bestMatchId: undefined,
    ...overrides,
  };
}

function seedVault(vault: Vault, entries: IntelligenceEntry[]): void {
  for (const entry of entries) {
    vault.add(entry);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enrichExistingEntries', () => {
  it('returns empty array when no items are in enrichment zone', () => {
    const vault = new Vault(':memory:');
    const existing = makeEntry({ id: 'e1' });
    seedVault(vault, [existing]);

    // All results are below the enrichment threshold
    const results: DedupResult[] = [
      makeDedupResult({ similarity: 0.1, bestMatchId: 'e1' }),
      makeDedupResult({ similarity: 0.3, bestMatchId: 'e1' }),
    ];

    const enriched = enrichExistingEntries(results, vault);
    expect(enriched).toEqual([]);
  });

  it('returns empty array when all items are exact duplicates (similarity >= 0.85)', () => {
    const vault = new Vault(':memory:');
    const existing = makeEntry({ id: 'e1' });
    seedVault(vault, [existing]);

    const results: DedupResult[] = [
      makeDedupResult({
        isDuplicate: true,
        similarity: DEDUP_THRESHOLD,
        bestMatchId: 'e1',
      }),
      makeDedupResult({
        isDuplicate: true,
        similarity: 0.95,
        bestMatchId: 'e1',
      }),
    ];

    const enriched = enrichExistingEntries(results, vault);
    expect(enriched).toEqual([]);
  });

  it('returns empty array when all items are unrelated (similarity < 0.45)', () => {
    const vault = new Vault(':memory:');
    const existing = makeEntry({ id: 'e1' });
    seedVault(vault, [existing]);

    const results: DedupResult[] = [
      makeDedupResult({ similarity: 0.1, bestMatchId: 'e1' }),
      makeDedupResult({ similarity: ENRICHMENT_THRESHOLD - 0.01, bestMatchId: 'e1' }),
    ];

    const enriched = enrichExistingEntries(results, vault);
    expect(enriched).toEqual([]);
  });

  it('enriches an existing entry when item is in the enrichment zone (0.45-0.85)', () => {
    const vault = new Vault(':memory:');
    const existing = makeEntry({
      id: 'e1',
      title: 'Error Handling',
      description: 'Always use try-catch for async operations.',
      tags: ['errors'],
    });
    seedVault(vault, [existing]);

    const newItem = makeClassifiedItem({
      description: 'Use custom error classes for domain-specific errors.',
      citation: 'Chapter 5',
      tags: ['domain-errors'],
    });

    const results: DedupResult[] = [
      makeDedupResult({
        item: newItem,
        similarity: 0.6,
        bestMatchId: 'e1',
      }),
    ];

    const enriched = enrichExistingEntries(results, vault);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].entryId).toBe('e1');
    expect(enriched[0].entryTitle).toBe('Error Handling');
    expect(enriched[0].similarity).toBe(0.6);
    expect(enriched[0].fieldsUpdated).toContain('description');
  });

  it('appends to description with separator and citation note', () => {
    const vault = new Vault(':memory:');
    const existing = makeEntry({
      id: 'e1',
      description: 'Original description.',
      tags: [],
    });
    seedVault(vault, [existing]);

    const newItem = makeClassifiedItem({
      description: 'Appended description content.',
      citation: 'Source Book, p.10',
      tags: [],
    });

    const results: DedupResult[] = [
      makeDedupResult({
        item: newItem,
        similarity: 0.6,
        bestMatchId: 'e1',
      }),
    ];

    enrichExistingEntries(results, vault);

    const updated = vault.get('e1')!;
    expect(updated.description).toContain('Original description.');
    expect(updated.description).toContain('---');
    expect(updated.description).toContain('[Enriched from: Source Book, p.10]');
    expect(updated.description).toContain('Appended description content.');
  });

  it('appends to context field', () => {
    const vault = new Vault(':memory:');
    const existing = makeEntry({
      id: 'e1',
      description: 'Base description.',
      context: 'Existing context note.',
      tags: [],
    });
    seedVault(vault, [existing]);

    const newItem = makeClassifiedItem({
      description: 'Some new info that differs from base.',
      citation: 'New citation reference',
      tags: [],
    });

    const results: DedupResult[] = [
      makeDedupResult({
        item: newItem,
        similarity: 0.55,
        bestMatchId: 'e1',
      }),
    ];

    const enriched = enrichExistingEntries(results, vault);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].fieldsUpdated).toContain('context');

    const updated = vault.get('e1')!;
    expect(updated.context).toContain('Existing context note.');
    expect(updated.context).toContain('New citation reference');
  });

  it('merges new tags without duplicating existing ones', () => {
    const vault = new Vault(':memory:');
    const existing = makeEntry({
      id: 'e1',
      description: 'Some description.',
      tags: ['typescript', 'patterns'],
    });
    seedVault(vault, [existing]);

    const newItem = makeClassifiedItem({
      description: 'Different description about the same topic.',
      citation: 'Ref A',
      tags: ['typescript', 'best-practices', 'patterns'],
    });

    const results: DedupResult[] = [
      makeDedupResult({
        item: newItem,
        similarity: 0.65,
        bestMatchId: 'e1',
      }),
    ];

    const enriched = enrichExistingEntries(results, vault);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].fieldsUpdated).toContain('tags');

    const updated = vault.get('e1')!;
    // Should have original + only new unique tags
    expect(updated.tags).toContain('typescript');
    expect(updated.tags).toContain('patterns');
    expect(updated.tags).toContain('best-practices');
    // No duplicates
    const uniqueTags = new Set(updated.tags);
    expect(uniqueTags.size).toBe(updated.tags.length);
  });

  it('skips enrichment when bestMatchId entry does not exist in vault', () => {
    const vault = new Vault(':memory:');
    // Seed with one entry, but reference a different ID
    seedVault(vault, [makeEntry({ id: 'e1' })]);

    const results: DedupResult[] = [
      makeDedupResult({
        similarity: 0.6,
        bestMatchId: 'nonexistent-id',
      }),
    ];

    const enriched = enrichExistingEntries(results, vault);
    expect(enriched).toEqual([]);
  });

  it('handles empty vault gracefully', () => {
    const vault = new Vault(':memory:');

    const results: DedupResult[] = [
      makeDedupResult({
        similarity: 0.6,
        bestMatchId: 'e1',
      }),
    ];

    const enriched = enrichExistingEntries(results, vault);
    expect(enriched).toEqual([]);
  });
});
