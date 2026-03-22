import { describe, it, expect, vi } from 'vitest';
import { TextIngester } from './text-ingester.js';
import type { IngestSource, IngestOptions } from './text-ingester.js';
import type { Vault } from '../vault/vault.js';
import type { LLMClient } from '../llm/llm-client.js';
import type { LLMCallResult } from '../llm/types.js';
import type { ClassifiedItem } from './types.js';

// =============================================================================
// MOCKS
// =============================================================================

function mockLLM(items: ClassifiedItem[]): LLMClient {
  return {
    complete: async (): Promise<LLMCallResult> => ({
      text: JSON.stringify(items.map(i => ({
        type: i.type,
        title: i.title,
        description: i.description,
        tags: i.tags,
        severity: i.severity,
      }))),
      model: 'mock',
      provider: 'openai' as const,
      durationMs: 0,
    }),
    isAvailable: () => ({ openai: true, anthropic: false }),
    getRoutes: () => [],
  } as unknown as LLMClient;
}

function mockVault(existingEntries: Array<{ id: string; title: string; description: string }> = []): Vault {
  const seeded: unknown[] = [];
  return {
    exportAll: () => ({
      entries: existingEntries.map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        type: 'pattern',
        domain: 'test',
        severity: 'suggestion',
        tags: [],
      })),
    }),
    seed: (entries: unknown[]) => { seeded.push(...entries); },
    add: vi.fn(),
    _seeded: seeded,
  } as unknown as Vault & { _seeded: unknown[] };
}

function makeItem(overrides: Partial<ClassifiedItem> = {}): ClassifiedItem {
  return {
    type: 'pattern',
    title: overrides.title ?? 'Test Pattern',
    description: overrides.description ?? 'A test pattern description.',
    tags: overrides.tags ?? ['test'],
    severity: overrides.severity ?? 'suggestion',
    citation: overrides.citation ?? 'test',
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('TextIngester — ingestText', () => {
  it('classifies, deduplicates, and stores unique items in vault', async () => {
    const items = [
      makeItem({ title: 'Pattern A', description: 'Unique pattern about testing.' }),
    ];
    const llm = mockLLM(items);
    const vault = mockVault() as Vault & { _seeded: unknown[] };
    const ingester = new TextIngester(vault, llm);

    const source: IngestSource = { type: 'notes', title: 'My Notes' };
    const result = await ingester.ingestText('Some long text about patterns.', source);

    expect(result.source).toEqual(source);
    expect(result.ingested).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].title).toBe('Pattern A');
    expect(vault._seeded.length).toBeGreaterThan(0);
  });

  it('returns empty result when LLM is null', async () => {
    const vault = mockVault();
    const ingester = new TextIngester(vault, null);

    const result = await ingester.ingestText('text', { type: 'notes', title: 'Test' });

    expect(result.ingested).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.entries).toEqual([]);
  });

  it('returns empty result when classifier extracts no items', async () => {
    const llm = mockLLM([]);
    const vault = mockVault();
    const ingester = new TextIngester(vault, llm);

    const result = await ingester.ingestText('nothing useful', { type: 'notes', title: 'Test' });

    expect(result.ingested).toBe(0);
  });

  it('applies domain and tags from options', async () => {
    const items = [makeItem()];
    const llm = mockLLM(items);
    const vault = mockVault() as Vault & { _seeded: unknown[] };
    const ingester = new TextIngester(vault, llm);

    const opts: IngestOptions = { domain: 'security', tags: ['custom-tag'] };
    const result = await ingester.ingestText('text', { type: 'documentation', title: 'Doc' }, opts);

    expect(result.ingested).toBe(1);
    // Seeded entries should exist
    expect(vault._seeded.length).toBeGreaterThan(0);
  });

  it('splits long text into chunks based on chunkSize option', async () => {
    const callCount = { n: 0 };
    const llm = {
      complete: async (): Promise<LLMCallResult> => {
        callCount.n++;
        return {
          text: JSON.stringify([{
            type: 'pattern',
            title: `Item ${callCount.n}`,
            description: 'A pattern.',
            tags: ['test'],
            severity: 'suggestion',
          }]),
          model: 'mock',
          provider: 'openai' as const,
          durationMs: 0,
        };
      },
      isAvailable: () => ({ openai: true, anthropic: false }),
      getRoutes: () => [],
    } as unknown as LLMClient;

    const vault = mockVault();
    const ingester = new TextIngester(vault, llm);

    // Text longer than chunk size should be split
    const longText = 'A'.repeat(100);
    await ingester.ingestText(longText, { type: 'notes', title: 'Test' }, { chunkSize: 30 });

    expect(callCount.n).toBeGreaterThan(1);
  });
});

describe('TextIngester — ingestUrl', () => {
  it('returns empty result when LLM is null', async () => {
    const vault = mockVault();
    const ingester = new TextIngester(vault, null);

    const result = await ingester.ingestUrl('https://example.com');

    expect(result.ingested).toBe(0);
    expect(result.source.type).toBe('article');
  });
});

describe('TextIngester — ingestBatch', () => {
  it('processes multiple items sequentially', async () => {
    const items = [makeItem({ title: 'Batch Item' })];
    const llm = mockLLM(items);
    const vault = mockVault();
    const ingester = new TextIngester(vault, llm);

    const results = await ingester.ingestBatch([
      { text: 'First item text.', source: { type: 'notes', title: 'Note 1' } },
      { text: 'Second item text.', source: { type: 'transcript', title: 'Talk 1' } },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].source.title).toBe('Note 1');
    expect(results[1].source.title).toBe('Talk 1');
  });

  it('returns empty array for empty batch', async () => {
    const llm = mockLLM([]);
    const vault = mockVault();
    const ingester = new TextIngester(vault, llm);

    const results = await ingester.ingestBatch([]);

    expect(results).toEqual([]);
  });
});
