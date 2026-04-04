/**
 * Embeddings — Unit Tests
 *
 * Covers:
 * 1. OpenAIEmbeddingProvider (mocked fetch)
 * 2. Vector storage CRUD (real in-memory SQLite)
 * 3. EmbeddingPipeline (batch + incremental)
 * 4. Brain hybrid search backward compatibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import { initializeSchema } from '../vault/vault-schema.js';
import {
  storeVector,
  getVector,
  deleteVector,
  getEntriesWithoutVectors,
  cosineSearch,
} from '../vault/vault-entries.js';
import { EmbeddingPipeline } from '../embeddings/pipeline.js';
import { OpenAIEmbeddingProvider } from '../embeddings/openai-provider.js';
import type { EmbeddingProvider, EmbeddingResult } from '../embeddings/types.js';
import type { PersistenceProvider } from '../persistence/types.js';
import { Vault } from '../vault/vault.js';
import { Brain } from '../brain/brain.js';
import { LLMError } from '../llm/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create a normalized vector of given dimensions. */
function makeVector(seed: number, dims: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < dims; i++) {
    v.push(Math.sin(seed * (i + 1)));
  }
  // Normalize
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

/** Insert a minimal vault entry directly via SQL. */
function insertEntry(
  provider: PersistenceProvider,
  id: string,
  title: string,
  description: string,
): void {
  provider.run(
    `INSERT INTO entries (id, type, domain, title, severity, description, tags, applies_to, origin)
     VALUES (@id, 'pattern', 'test', @title, 'suggestion', @description, '[]', '[]', 'user')`,
    { id, title, description },
  );
}

/** Build a mock OpenAI-compatible fetch response. */
function okResponse(vectors: number[][], tokens: number): Response {
  const body = JSON.stringify({
    data: vectors.map((embedding, index) => ({ embedding, index })),
    usage: { prompt_tokens: tokens, total_tokens: tokens },
    model: 'text-embedding-3-small',
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// =============================================================================
// 1. OpenAIEmbeddingProvider
// =============================================================================

describe('OpenAIEmbeddingProvider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when no API key or key pool is provided', () => {
    expect(
      () => new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-small' }),
    ).toThrow(/API key/);
  });

  it('embeds multiple texts successfully', async () => {
    const vec1 = [0.1, 0.2, 0.3];
    const vec2 = [0.4, 0.5, 0.6];
    fetchSpy.mockResolvedValueOnce(okResponse([vec1, vec2], 20));

    const provider = new OpenAIEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-test-key',
    });

    const result = await provider.embed(['hello', 'world']);

    expect(result.vectors).toHaveLength(2);
    expect(result.vectors[0]).toEqual(vec1);
    expect(result.vectors[1]).toEqual(vec2);
    expect(result.tokensUsed).toBe(20);
    expect(result.model).toBe('text-embedding-3-small');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns empty result for empty input', async () => {
    const provider = new OpenAIEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-test-key',
    });

    const result = await provider.embed([]);
    expect(result.vectors).toHaveLength(0);
    expect(result.tokensUsed).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('chunks requests that exceed batchSize', async () => {
    const batchSize = 2;
    const vec1 = [0.1, 0.2];
    const vec2 = [0.3, 0.4];
    const vec3 = [0.5, 0.6];

    fetchSpy
      .mockResolvedValueOnce(okResponse([vec1, vec2], 10))
      .mockResolvedValueOnce(okResponse([vec3], 5));

    const provider = new OpenAIEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-test-key',
      batchSize,
    });

    const result = await provider.embed(['a', 'b', 'c']);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.vectors).toHaveLength(3);
    expect(result.vectors[0]).toEqual(vec1);
    expect(result.vectors[2]).toEqual(vec3);
    expect(result.tokensUsed).toBe(15);
  });

  it('retries on 429 rate limit and succeeds', async () => {
    const vec = [0.1, 0.2, 0.3];
    fetchSpy
      .mockResolvedValueOnce(errorResponse(429, 'Rate limited'))
      .mockResolvedValueOnce(okResponse([vec], 5));

    const provider = new OpenAIEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-test-key',
    });

    const result = await provider.embed(['hello']);
    expect(result.vectors[0]).toEqual(vec);
    // First call fails (429), retry succeeds
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on 401 (not retryable)', async () => {
    fetchSpy.mockResolvedValue(errorResponse(401, 'Unauthorized'));

    const provider = new OpenAIEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-bad-key',
    });

    await expect(provider.embed(['test'])).rejects.toThrow(LLMError);
    // Only one attempt — 401 is not retryable
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 server error', async () => {
    const vec = [0.9, 0.8];
    fetchSpy
      .mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'))
      .mockResolvedValueOnce(okResponse([vec], 3));

    const provider = new OpenAIEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-test-key',
    });

    const result = await provider.embed(['retry me']);
    expect(result.vectors[0]).toEqual(vec);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries on persistent 5xx', async () => {
    // Each retry reads the body, so we need a fresh Response each time
    fetchSpy.mockImplementation(async () => errorResponse(503, 'Service Unavailable'));

    const provider = new OpenAIEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'sk-test-key',
    });

    await expect(provider.embed(['fail'])).rejects.toThrow(/503/);
    // 3 attempts total (default maxAttempts)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// 2. Vector Storage (vault-entries)
// =============================================================================

describe('Vector Storage', () => {
  let provider: SQLitePersistenceProvider;

  beforeEach(() => {
    provider = new SQLitePersistenceProvider(':memory:');
    initializeSchema(provider);
  });

  afterEach(() => {
    provider.close();
  });

  it('storeVector + getVector roundtrip', () => {
    insertEntry(provider, 'e1', 'Test Entry', 'A test');
    const vec = [0.1, 0.2, 0.3, 0.4];

    storeVector(provider, 'e1', vec, 'test-model', 4);

    const stored = getVector(provider, 'e1');
    expect(stored).not.toBeNull();
    expect(stored!.entryId).toBe('e1');
    expect(stored!.model).toBe('test-model');
    expect(stored!.dimensions).toBe(4);
    // Float32 precision — compare with tolerance
    for (let i = 0; i < vec.length; i++) {
      expect(stored!.vector[i]).toBeCloseTo(vec[i], 5);
    }
  });

  it('storeVector upserts — second store overwrites', () => {
    insertEntry(provider, 'e1', 'Test', 'Desc');
    storeVector(provider, 'e1', [0.1, 0.2], 'model-v1', 2);
    storeVector(provider, 'e1', [0.9, 0.8], 'model-v2', 2);

    const stored = getVector(provider, 'e1');
    expect(stored!.model).toBe('model-v2');
    expect(stored!.vector[0]).toBeCloseTo(0.9, 5);
  });

  it('getVector returns null for missing entry', () => {
    expect(getVector(provider, 'nonexistent')).toBeNull();
  });

  it('deleteVector removes stored vector', () => {
    insertEntry(provider, 'e1', 'Test', 'Desc');
    storeVector(provider, 'e1', [0.5, 0.5], 'model', 2);
    expect(getVector(provider, 'e1')).toBeTruthy();

    deleteVector(provider, 'e1');
    const result = getVector(provider, 'e1');
    expect(result).toBeFalsy();
  });

  it('getEntriesWithoutVectors returns only entries missing vectors', () => {
    insertEntry(provider, 'e1', 'Has vector', 'Desc');
    insertEntry(provider, 'e2', 'No vector', 'Desc');
    insertEntry(provider, 'e3', 'Also no vector', 'Desc');

    storeVector(provider, 'e1', [0.1, 0.2], 'model-a', 2);

    const missing = getEntriesWithoutVectors(provider, 'model-a');
    expect(missing).toContain('e2');
    expect(missing).toContain('e3');
    expect(missing).not.toContain('e1');
    expect(missing).toHaveLength(2);
  });

  it('getEntriesWithoutVectors considers model — different model means missing', () => {
    insertEntry(provider, 'e1', 'Test', 'Desc');
    storeVector(provider, 'e1', [0.1, 0.2], 'model-a', 2);

    // Entry has vector for model-a, not model-b
    const missingForB = getEntriesWithoutVectors(provider, 'model-b');
    expect(missingForB).toContain('e1');

    const missingForA = getEntriesWithoutVectors(provider, 'model-a');
    expect(missingForA).not.toContain('e1');
  });

  it('cosineSearch returns results ordered by similarity', () => {
    insertEntry(provider, 'e1', 'First', 'Desc');
    insertEntry(provider, 'e2', 'Second', 'Desc');
    insertEntry(provider, 'e3', 'Third', 'Desc');

    // Store vectors: e1 is close to query, e3 is far
    const dims = 8;
    const query = makeVector(1, dims);
    const closeVec = makeVector(1.05, dims); // very similar to query
    const midVec = makeVector(3, dims); // somewhat different
    const farVec = makeVector(50, dims); // very different

    storeVector(provider, 'e1', closeVec, 'model', dims);
    storeVector(provider, 'e2', midVec, 'model', dims);
    storeVector(provider, 'e3', farVec, 'model', dims);

    const results = cosineSearch(provider, query, 3);

    expect(results).toHaveLength(3);
    // e1 (closeVec) should be most similar
    expect(results[0].entryId).toBe('e1');
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    // Similarities should be in descending order
    expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
    expect(results[1].similarity).toBeGreaterThanOrEqual(results[2].similarity);
  });

  it('cosineSearch respects topK limit', () => {
    const dims = 4;
    for (let i = 1; i <= 5; i++) {
      insertEntry(provider, `e${i}`, `Entry ${i}`, 'Desc');
      storeVector(provider, `e${i}`, makeVector(i, dims), 'model', dims);
    }

    const results = cosineSearch(provider, makeVector(1, dims), 2);
    expect(results).toHaveLength(2);
  });

  it('cosineSearch returns empty for zero-norm query', () => {
    insertEntry(provider, 'e1', 'Test', 'Desc');
    storeVector(provider, 'e1', [0.1, 0.2], 'model', 2);

    const results = cosineSearch(provider, [0, 0], 5);
    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// 3. EmbeddingPipeline
// =============================================================================

describe('EmbeddingPipeline', () => {
  let persistence: SQLitePersistenceProvider;
  let mockProvider: EmbeddingProvider;
  let embedCalls: string[][];

  beforeEach(() => {
    persistence = new SQLitePersistenceProvider(':memory:');
    initializeSchema(persistence);
    embedCalls = [];

    mockProvider = {
      providerName: 'mock',
      model: 'mock-model',
      dimensions: 4,
      embed: vi.fn(async (texts: string[]): Promise<EmbeddingResult> => {
        embedCalls.push(texts);
        return {
          vectors: texts.map((_, i) => makeVector(i + 1, 4)),
          tokensUsed: texts.length * 5,
          model: 'mock-model',
        };
      }),
    };
  });

  afterEach(() => {
    persistence.close();
  });

  it('batchEmbed embeds all entries missing vectors', async () => {
    insertEntry(persistence, 'e1', 'First', 'Description one');
    insertEntry(persistence, 'e2', 'Second', 'Description two');

    const pipeline = new EmbeddingPipeline(mockProvider, persistence);
    const result = await pipeline.batchEmbed();

    expect(result.embedded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.tokensUsed).toBe(10); // mock provider returns texts.length * 5 = 2 * 5

    // Both entries should now have vectors
    expect(getVector(persistence, 'e1')).toBeTruthy();
    expect(getVector(persistence, 'e2')).toBeTruthy();
  });

  it('batchEmbed fires onProgress callback', async () => {
    insertEntry(persistence, 'e1', 'First', 'Desc');
    insertEntry(persistence, 'e2', 'Second', 'Desc');

    const progress: Array<[number, number]> = [];
    const pipeline = new EmbeddingPipeline(mockProvider, persistence);
    await pipeline.batchEmbed({
      onProgress: (completed, total) => progress.push([completed, total]),
    });

    expect(progress.length).toBe(1); // default batchSize=100 processes both entries in one batch, firing onProgress once
    // Last progress call should have completed == total
    const last = progress[progress.length - 1];
    expect(last[0]).toBe(last[1]);
  });

  it('batchEmbed skips entries that already have vectors', async () => {
    insertEntry(persistence, 'e1', 'Has Vector', 'Desc');
    insertEntry(persistence, 'e2', 'No Vector', 'Desc');

    // Pre-store vector for e1
    storeVector(persistence, 'e1', [0.1, 0.2, 0.3, 0.4], 'mock-model', 4);

    const pipeline = new EmbeddingPipeline(mockProvider, persistence);
    const result = await pipeline.batchEmbed();

    expect(result.embedded).toBe(1); // Only e2
    // The mock embed should only have been called with e2's text
    expect(embedCalls).toHaveLength(1);
  });

  it('batchEmbed returns zeros when all entries already embedded', async () => {
    insertEntry(persistence, 'e1', 'Already done', 'Desc');
    storeVector(persistence, 'e1', [0.1, 0.2, 0.3, 0.4], 'mock-model', 4);

    const pipeline = new EmbeddingPipeline(mockProvider, persistence);
    const result = await pipeline.batchEmbed();

    expect(result.embedded).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockProvider.embed).not.toHaveBeenCalled();
  });

  it('embedEntry embeds a single entry', async () => {
    insertEntry(persistence, 'e1', 'Test', 'Desc');

    const pipeline = new EmbeddingPipeline(mockProvider, persistence);
    const embedded = await pipeline.embedEntry('e1', 'Test\nDesc');

    expect(embedded).toBe(true);
    expect(getVector(persistence, 'e1')).toBeTruthy();
    expect(mockProvider.embed).toHaveBeenCalledTimes(1);
  });

  it('embedEntry returns false when vector already exists for same model', async () => {
    insertEntry(persistence, 'e1', 'Test', 'Desc');
    storeVector(persistence, 'e1', [0.1, 0.2, 0.3, 0.4], 'mock-model', 4);

    const pipeline = new EmbeddingPipeline(mockProvider, persistence);
    const embedded = await pipeline.embedEntry('e1', 'Test\nDesc');

    expect(embedded).toBe(false);
    expect(mockProvider.embed).not.toHaveBeenCalled();
  });

  it('embedEntry re-embeds when stored vector is for a different model', async () => {
    insertEntry(persistence, 'e1', 'Test', 'Desc');
    storeVector(persistence, 'e1', [0.1, 0.2, 0.3, 0.4], 'old-model', 4);

    const pipeline = new EmbeddingPipeline(mockProvider, persistence);
    const embedded = await pipeline.embedEntry('e1', 'Test\nDesc');

    expect(embedded).toBe(true);
    const stored = getVector(persistence, 'e1');
    expect(stored!.model).toBe('mock-model');
  });
});

// =============================================================================
// 4. Brain Hybrid Search (backward compatibility)
// =============================================================================

describe('Brain hybrid search compatibility', () => {
  it('Brain constructor accepts optional embeddingProvider', () => {
    const vault = new Vault(':memory:');
    const mockEmb: EmbeddingProvider = {
      providerName: 'mock',
      model: 'mock-model',
      dimensions: 4,
      embed: vi.fn(async () => ({ vectors: [], tokensUsed: 0, model: 'mock-model' })),
    };

    expect(() => new Brain(vault, undefined, mockEmb)).not.toThrow();
  });

  it('Brain works without embeddingProvider (backward compat)', async () => {
    const vault = new Vault(':memory:');

    // Seed an entry so search can find something
    vault.seed([
      {
        id: 'compat-1',
        type: 'pattern',
        domain: 'test',
        title: 'Backward compatibility pattern',
        severity: 'suggestion',
        description: 'This tests that Brain search works without embedding provider',
        tags: ['compat'],
        appliesTo: [],
      },
    ]);

    const brain = new Brain(vault);
    const results = await brain.intelligentSearch('backward compatibility');

    // Should not throw — returns results from FTS only
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1); // single seeded entry matches FTS query 'backward compatibility'
  });

  it('Brain.setEmbeddingProvider can set and clear provider', () => {
    const vault = new Vault(':memory:');
    const brain = new Brain(vault);

    const mockEmb: EmbeddingProvider = {
      providerName: 'mock',
      model: 'mock-model',
      dimensions: 4,
      embed: vi.fn(async () => ({ vectors: [], tokensUsed: 0, model: 'mock-model' })),
    };

    // Set provider
    expect(() => brain.setEmbeddingProvider(mockEmb)).not.toThrow();

    // Clear provider
    expect(() => brain.setEmbeddingProvider(undefined)).not.toThrow();
  });
});
