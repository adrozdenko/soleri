/**
 * CogneeClient gap tests — covers behaviors missing from the original test suite.
 *
 * Source of truth: these tests define expected behavior.
 * Code adapts to fulfill them.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { CogneeClient } from '../cognee/client.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Helpers ──────────────────────────────────────────────────────

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern for unit tests.',
    tags: overrides.tags ?? ['testing', 'assertions'],
    ...(overrides.context !== undefined ? { context: overrides.context } : {}),
    ...(overrides.example !== undefined ? { example: overrides.example } : {}),
    ...(overrides.why !== undefined ? { why: overrides.why } : {}),
    ...(overrides.counterExample !== undefined ? { counterExample: overrides.counterExample } : {}),
  };
}

function isHealthCheck(url: string, init?: RequestInit): boolean {
  return url.endsWith(':8000/') || (url.endsWith('/') && (!init?.method || init.method === 'GET'));
}

function isAuthCall(url: string): boolean {
  return url.includes('/api/v1/auth/');
}

function mockWithAuth(apiHandler?: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    if (isHealthCheck(url, init)) return new Response('ok', { status: 200 });
    if (isAuthCall(url)) {
      if (url.includes('/login')) {
        return new Response(JSON.stringify({ access_token: 'test-jwt' }), { status: 200 });
      }
      if (url.includes('/register')) {
        return new Response(JSON.stringify({ id: 'new-user' }), { status: 200 });
      }
    }
    if (apiHandler) return apiHandler(url, init);
    return new Response('ok', { status: 200 });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

// ─── Tests ────────────────────────────────────────────────────────

describe('CogneeClient — gap coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── deleteEntries ────────────────────────────────────────────

  describe('deleteEntries', () => {
    it('should call POST /api/v1/delete with dataset and entryIds', async () => {
      let capturedBody = '';
      mockWithAuth(async (_url, init) => {
        capturedBody = init?.body as string;
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient({ dataset: 'my-ds' });
      await client.healthCheck();
      const result = await client.deleteEntries(['e1', 'e2']);
      expect(result.deleted).toBe(2);
      const parsed = JSON.parse(capturedBody);
      expect(parsed.datasetName).toBe('my-ds');
      expect(parsed.entryIds).toEqual(['e1', 'e2']);
    });

    it('should return 0 when not available', async () => {
      const client = new CogneeClient();
      const result = await client.deleteEntries(['e1']);
      expect(result.deleted).toBe(0);
    });

    it('should return 0 for empty entryIds', async () => {
      mockWithAuth();
      const client = new CogneeClient();
      await client.healthCheck();
      const result = await client.deleteEntries([]);
      expect(result.deleted).toBe(0);
    });

    it('should return 0 on HTTP error without throwing', async () => {
      mockWithAuth(async () => new Response('error', { status: 500 }));
      const client = new CogneeClient();
      await client.healthCheck();
      const result = await client.deleteEntries(['e1']);
      expect(result.deleted).toBe(0);
    });

    it('should return 0 on network error without throwing', async () => {
      mockWithAuth(async () => {
        throw new Error('ECONNRESET');
      });
      const client = new CogneeClient();
      await client.healthCheck();
      const result = await client.deleteEntries(['e1']);
      expect(result.deleted).toBe(0);
    });
  });

  // ─── Entry serialization ──────────────────────────────────────

  describe('entry serialization (via addEntries FormData)', () => {
    it('should include vault-id prefix in serialized text', async () => {
      let capturedText = '';
      mockWithAuth(async (_url, init) => {
        const body = init?.body as FormData;
        if (body instanceof FormData) {
          const file = body.get('data') as File;
          if (file) capturedText = await file.text();
        }
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      await client.addEntries([makeEntry({ id: 'my-entry-42', title: 'My Title' })]);
      expect(capturedText).toContain('[vault-id:my-entry-42]');
      expect(capturedText).toContain('My Title');
      client.resetPendingCognify();
    });

    it('should include description in serialized text', async () => {
      let capturedText = '';
      mockWithAuth(async (_url, init) => {
        const body = init?.body as FormData;
        if (body instanceof FormData) {
          const file = body.get('data') as File;
          if (file) capturedText = await file.text();
        }
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      await client.addEntries([makeEntry({ description: 'Unique description text here' })]);
      expect(capturedText).toContain('Unique description text here');
      client.resetPendingCognify();
    });

    it('should include context when present', async () => {
      let capturedText = '';
      mockWithAuth(async (_url, init) => {
        const body = init?.body as FormData;
        if (body instanceof FormData) {
          const file = body.get('data') as File;
          if (file) capturedText = await file.text();
        }
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      await client.addEntries([makeEntry({ context: 'Apply in production code only' })]);
      expect(capturedText).toContain('Apply in production code only');
      client.resetPendingCognify();
    });

    it('should include tags when present', async () => {
      let capturedText = '';
      mockWithAuth(async (_url, init) => {
        const body = init?.body as FormData;
        if (body instanceof FormData) {
          const file = body.get('data') as File;
          if (file) capturedText = await file.text();
        }
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      await client.addEntries([makeEntry({ tags: ['react', 'performance'] })]);
      expect(capturedText).toContain('Tags: react, performance');
      client.resetPendingCognify();
    });

    it('should not include Tags line when tags are empty', async () => {
      let capturedText = '';
      mockWithAuth(async (_url, init) => {
        const body = init?.body as FormData;
        if (body instanceof FormData) {
          const file = body.get('data') as File;
          if (file) capturedText = await file.text();
        }
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      await client.addEntries([makeEntry({ tags: [] })]);
      expect(capturedText).not.toContain('Tags:');
      client.resetPendingCognify();
    });

    it('should use entry.id as filename', async () => {
      let capturedFilename = '';
      mockWithAuth(async (_url, init) => {
        const body = init?.body as FormData;
        if (body instanceof FormData) {
          const file = body.get('data') as File;
          if (file) capturedFilename = file.name;
        }
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      await client.addEntries([makeEntry({ id: 'pattern-arch-123' })]);
      expect(capturedFilename).toBe('pattern-arch-123.txt');
      client.resetPendingCognify();
    });
  });

  // ─── Debounce sliding window ──────────────────────────────────

  describe('cognify debounce — sliding window', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('should extend debounce window on rapid ingests (sliding, not fixed)', async () => {
      let cognifyCount = 0;
      mockWithAuth(async (url) => {
        if (url.includes('/cognify')) cognifyCount++;
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient({ cognifyDebounceMs: 100 });
      await client.healthCheck();

      // First ingest at t=0
      await client.addEntries([makeEntry({ id: 'e1' })]);
      // Advance 80ms (within window), second ingest resets the timer
      await vi.advanceTimersByTimeAsync(80);
      await client.addEntries([makeEntry({ id: 'e2' })]);
      // Advance 80ms (within the RESET window) — cognify should NOT have fired yet
      await vi.advanceTimersByTimeAsync(80);
      expect(cognifyCount).toBe(0);

      // Advance past the reset window (another 30ms = 110ms from second ingest)
      await vi.advanceTimersByTimeAsync(30);
      expect(cognifyCount).toBe(1);
      client.resetPendingCognify();
    });

    it('should fire separate cognify for different datasets', async () => {
      const cognifyDatasets: string[][] = [];
      mockWithAuth(async (url, init) => {
        if (url.includes('/cognify')) {
          const body = JSON.parse(init?.body as string);
          cognifyDatasets.push(body.datasets);
        }
        return new Response('ok', { status: 200 });
      });
      // Two clients with different datasets
      const client1 = new CogneeClient({ dataset: 'ds-alpha', cognifyDebounceMs: 50 });
      const client2 = new CogneeClient({ dataset: 'ds-beta', cognifyDebounceMs: 50 });
      await client1.healthCheck();
      await client2.healthCheck();

      await client1.addEntries([makeEntry({ id: 'a1' })]);
      await client2.addEntries([makeEntry({ id: 'b1' })]);

      await vi.advanceTimersByTimeAsync(60);

      // Each dataset should cognify independently
      expect(cognifyDatasets).toHaveLength(2);
      const allDatasets = cognifyDatasets.flat();
      expect(allDatasets).toContain('ds-alpha');
      expect(allDatasets).toContain('ds-beta');

      client1.resetPendingCognify();
      client2.resetPendingCognify();
    });

    it('should coalesce multiple ingests to same dataset into one cognify', async () => {
      let cognifyCount = 0;
      mockWithAuth(async (url) => {
        if (url.includes('/cognify')) cognifyCount++;
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient({ cognifyDebounceMs: 50 });
      await client.healthCheck();

      await client.addEntries([makeEntry({ id: 'e1' })]);
      await client.addEntries([makeEntry({ id: 'e2' })]);
      await client.addEntries([makeEntry({ id: 'e3' })]);

      await vi.advanceTimersByTimeAsync(60);

      expect(cognifyCount).toBe(1);
      client.resetPendingCognify();
    });
  });

  // ─── Concurrent operations ────────────────────────────────────

  describe('concurrent operations', () => {
    it('should handle parallel addEntries without interference', async () => {
      mockWithAuth();
      const client = new CogneeClient();
      await client.healthCheck();

      const results = await Promise.all([
        client.addEntries([makeEntry({ id: 'p1' })]),
        client.addEntries([makeEntry({ id: 'p2' })]),
        client.addEntries([makeEntry({ id: 'p3' })]),
        client.addEntries([makeEntry({ id: 'p4' })]),
        client.addEntries([makeEntry({ id: 'p5' })]),
      ]);

      expect(results.every((r) => r.added === 1)).toBe(true);
      client.resetPendingCognify();
    });

    it('should handle parallel search calls', async () => {
      mockWithAuth(
        async () =>
          new Response(JSON.stringify([{ id: 'r1', text: 'Result', score: 0.9 }]), { status: 200 }),
      );
      const client = new CogneeClient();
      await client.healthCheck();

      const results = await Promise.all([
        client.search('query 1'),
        client.search('query 2'),
        client.search('query 3'),
      ]);

      expect(results.every((r) => r.length === 1)).toBe(true);
    });
  });

  // ─── Search edge cases ────────────────────────────────────────

  describe('search edge cases', () => {
    it('should handle empty string query gracefully', async () => {
      mockWithAuth(async () => new Response(JSON.stringify([]), { status: 200 }));
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle results with non-string text field', async () => {
      mockWithAuth(
        async () =>
          new Response(
            JSON.stringify([
              { id: 'r1', text: 42, score: 0.8 },
              { id: 'r2', score: 0.7 },
            ]),
            { status: 200 },
          ),
      );
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query');
      // text should be coerced to string
      expect(typeof results[0].text).toBe('string');
      expect(typeof results[1].text).toBe('string');
    });

    it('should handle null/undefined text field', async () => {
      mockWithAuth(
        async () =>
          new Response(JSON.stringify([{ id: 'r1', text: null, score: 0.5 }]), { status: 200 }),
      );
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query');
      expect(typeof results[0].text).toBe('string');
    });
  });

  // ─── Auth edge cases ──────────────────────────────────────────

  describe('auth edge cases', () => {
    it('should cache auth token across multiple API calls', async () => {
      let loginCount = 0;
      const mock = vi.fn(async (url: string, init?: RequestInit) => {
        if (isHealthCheck(url, init)) return new Response('ok', { status: 200 });
        if (url.includes('/auth/login')) {
          loginCount++;
          return new Response(JSON.stringify({ access_token: 'cached-jwt' }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
      vi.stubGlobal('fetch', mock);

      const client = new CogneeClient();
      await client.healthCheck();

      // Multiple API calls should reuse the same token
      await client.search('q1');
      await client.search('q2');
      await client.cognify();

      expect(loginCount).toBe(1);
    });
  });

  // ─── Position scoring ─────────────────────────────────────────

  describe('position-based scoring', () => {
    it('should give first result score 1.0 and last result score 0.05', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`,
        text: `Result ${i}`,
      }));
      mockWithAuth(async () => new Response(JSON.stringify(items), { status: 200 }));
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query', { limit: 10 });
      expect(results[0].score).toBe(1.0);
      expect(results[results.length - 1].score).toBeCloseTo(0.05, 2);
    });

    it('should produce monotonically decreasing scores', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`,
        text: `Result ${i}`,
      }));
      mockWithAuth(async () => new Response(JSON.stringify(items), { status: 200 }));
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query', { limit: 5 });
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThan(results[i - 1].score);
      }
    });

    it('should give single result score 1.0', async () => {
      mockWithAuth(
        async () =>
          new Response(JSON.stringify([{ id: 'only', text: 'Sole result' }]), { status: 200 }),
      );
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query');
      expect(results[0].score).toBe(1.0);
    });

    it('should prefer explicit Cognee scores over position', async () => {
      mockWithAuth(
        async () =>
          new Response(
            JSON.stringify([
              { id: 'r1', text: 'First', score: 0.3 },
              { id: 'r2', text: 'Second', score: 0.9 },
            ]),
            { status: 200 },
          ),
      );
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query');
      // Explicit scores should be used, not position
      expect(results[0].score).toBe(0.3);
      expect(results[1].score).toBe(0.9);
    });
  });
});
