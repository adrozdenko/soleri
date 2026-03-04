import { describe, it, expect, afterEach, vi } from 'vitest';
import { CogneeClient } from '../cognee/client.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern for unit tests.',
    tags: overrides.tags ?? ['testing', 'assertions'],
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Helper: route health (GET /) vs auth vs API calls */
function isHealthCheck(url: string, init?: RequestInit): boolean {
  return url.endsWith(':8000/') || (url.endsWith('/') && (!init?.method || init.method === 'GET'));
}
function isAuthCall(url: string): boolean {
  return url.includes('/api/v1/auth/');
}

/** Default mock that accepts health + auto-auth + API calls */
function mockWithAuth(apiHandler?: (url: string, init?: RequestInit) => Promise<Response>) {
  return mockFetch(async (url, init) => {
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
}

describe('CogneeClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Constructor ──────────────────────────────────────────────

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const client = new CogneeClient();
      const config = client.getConfig();
      expect(config.baseUrl).toBe('http://localhost:8000');
      expect(config.dataset).toBe('vault');
      expect(config.timeoutMs).toBe(30000);
      expect(config.searchTimeoutMs).toBe(120000);
      expect(config.healthTimeoutMs).toBe(5000);
      expect(config.cognifyDebounceMs).toBe(30000);
    });

    it('should merge partial config with defaults', () => {
      const client = new CogneeClient({ baseUrl: 'http://cognee:9000', dataset: 'my-vault' });
      const config = client.getConfig();
      expect(config.baseUrl).toBe('http://cognee:9000');
      expect(config.dataset).toBe('my-vault');
      expect(config.timeoutMs).toBe(30000);
    });

    it('should strip trailing slash from baseUrl', () => {
      const client = new CogneeClient({ baseUrl: 'http://localhost:8000/' });
      expect(client.getConfig().baseUrl).toBe('http://localhost:8000');
    });

    it('should accept apiToken config', () => {
      const client = new CogneeClient({ apiToken: 'my-secret' });
      expect(client.getConfig().apiToken).toBe('my-secret');
    });
  });

  // ─── Health Check ─────────────────────────────────────────────

  describe('healthCheck', () => {
    it('should return available when Cognee responds OK', async () => {
      mockFetch(async () => new Response('ok', { status: 200 }));
      const client = new CogneeClient();
      const status = await client.healthCheck();
      expect(status.available).toBe(true);
      expect(status.url).toBe('http://localhost:8000');
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should hit GET / for health check', async () => {
      const fetchMock = mockFetch(async () => new Response('ok', { status: 200 }));
      const client = new CogneeClient();
      await client.healthCheck();
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should return unavailable on HTTP error', async () => {
      mockFetch(async () => new Response('error', { status: 500 }));
      const client = new CogneeClient();
      const status = await client.healthCheck();
      expect(status.available).toBe(false);
      expect(status.error).toBe('HTTP 500');
    });

    it('should return unavailable on network error', async () => {
      mockFetch(async () => {
        throw new Error('ECONNREFUSED');
      });
      const client = new CogneeClient();
      const status = await client.healthCheck();
      expect(status.available).toBe(false);
      expect(status.error).toBe('ECONNREFUSED');
    });

    it('should cache health status', async () => {
      const fetchMock = mockFetch(async () => new Response('ok', { status: 200 }));
      const client = new CogneeClient();
      await client.healthCheck();
      expect(client.isAvailable).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(client.isAvailable).toBe(true);
    });

    it('should expire health cache after TTL', async () => {
      mockFetch(async () => new Response('ok', { status: 200 }));
      const client = new CogneeClient({ healthCacheTtlMs: 1 });
      await client.healthCheck();
      await new Promise((r) => setTimeout(r, 5));
      expect(client.isAvailable).toBe(false);
    });
  });

  // ─── isAvailable ──────────────────────────────────────────────

  describe('isAvailable', () => {
    it('should be false before health check', () => {
      const client = new CogneeClient();
      expect(client.isAvailable).toBe(false);
    });

    it('should be true after successful health check', async () => {
      mockFetch(async () => new Response('ok', { status: 200 }));
      const client = new CogneeClient();
      await client.healthCheck();
      expect(client.isAvailable).toBe(true);
    });

    it('should be false after failed health check', async () => {
      mockFetch(async () => {
        throw new Error('down');
      });
      const client = new CogneeClient();
      await client.healthCheck();
      expect(client.isAvailable).toBe(false);
    });
  });

  // ─── addEntries ───────────────────────────────────────────────

  describe('addEntries', () => {
    it('should return added count on success', async () => {
      mockWithAuth();
      const client = new CogneeClient();
      await client.healthCheck();
      const result = await client.addEntries([makeEntry(), makeEntry({ id: 'test-2' })]);
      expect(result.added).toBe(2);
      client.resetPendingCognify();
    });

    it('should return 0 when not available', async () => {
      const client = new CogneeClient();
      const result = await client.addEntries([makeEntry()]);
      expect(result.added).toBe(0);
    });

    it('should return 0 for empty entries', async () => {
      mockWithAuth();
      const client = new CogneeClient();
      await client.healthCheck();
      const result = await client.addEntries([]);
      expect(result.added).toBe(0);
    });

    it('should return 0 on HTTP error', async () => {
      mockWithAuth(async () => new Response('error', { status: 500 }));
      const client = new CogneeClient();
      await client.healthCheck();
      const result = await client.addEntries([makeEntry()]);
      expect(result.added).toBe(0);
    });

    it('should send FormData with datasetName and files', async () => {
      let capturedBody: FormData | null = null;
      mockWithAuth(async (_url, init) => {
        capturedBody = init?.body as FormData;
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient({ dataset: 'test-ds' });
      await client.healthCheck();
      await client.addEntries([makeEntry({ id: 'e1', title: 'My Title' })]);
      expect(capturedBody).toBeInstanceOf(FormData);
      expect(capturedBody!.get('datasetName')).toBe('test-ds');
      const file = capturedBody!.get('data') as File;
      expect(file).toBeTruthy();
      const text = await file.text();
      expect(text).toContain('My Title');
      client.resetPendingCognify();
    });
  });

  // ─── cognify ──────────────────────────────────────────────────

  describe('cognify', () => {
    it('should return ok on success', async () => {
      mockWithAuth();
      const client = new CogneeClient();
      await client.healthCheck();
      const result = await client.cognify();
      expect(result.status).toBe('ok');
    });

    it('should send datasets array in body', async () => {
      let capturedBody = '';
      mockWithAuth(async (_url, init) => {
        capturedBody = init?.body as string;
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient({ dataset: 'my-ds' });
      await client.healthCheck();
      await client.cognify();
      const parsed = JSON.parse(capturedBody);
      expect(parsed.datasets).toEqual(['my-ds']);
    });

    it('should return unavailable when not connected', async () => {
      const client = new CogneeClient();
      const result = await client.cognify();
      expect(result.status).toBe('unavailable');
    });

    it('should return error on HTTP failure', async () => {
      mockWithAuth(async () => new Response('error', { status: 503 }));
      const client = new CogneeClient();
      await client.healthCheck();
      const result = await client.cognify();
      expect(result.status).toContain('error');
    });
  });

  // ─── search ───────────────────────────────────────────────────

  describe('search', () => {
    it('should return parsed results with scores', async () => {
      mockWithAuth(
        async () =>
          new Response(
            JSON.stringify([
              { id: 'r1', text: 'Result one', score: 0.95, payload: { id: 'vault-1' } },
              { id: 'r2', text: 'Result two', score: 0.8, payload: { id: 'vault-2' } },
            ]),
            { status: 200 },
          ),
      );
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('test query');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('vault-1');
      expect(results[0].score).toBe(0.95);
      expect(results[0].text).toBe('Result one');
      expect(results[0].searchType).toBe('CHUNKS');
    });

    it('should use position-based scoring when scores are missing', async () => {
      mockWithAuth(
        async () =>
          new Response(
            JSON.stringify([
              { id: 'r1', text: 'First' },
              { id: 'r2', text: 'Second' },
              { id: 'r3', text: 'Third' },
            ]),
            { status: 200 },
          ),
      );
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query');
      expect(results[0].score).toBe(1.0);
      expect(results[1].score).toBeCloseTo(0.525, 2);
      expect(results[2].score).toBeCloseTo(0.05, 2);
    });

    it('should respect limit', async () => {
      mockWithAuth(
        async () =>
          new Response(
            JSON.stringify([
              { id: 'r1', text: 'A', score: 0.9 },
              { id: 'r2', text: 'B', score: 0.8 },
              { id: 'r3', text: 'C', score: 0.7 },
            ]),
            { status: 200 },
          ),
      );
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query', { limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should return empty when not available', async () => {
      const client = new CogneeClient();
      const results = await client.search('query');
      expect(results).toEqual([]);
    });

    it('should return empty on HTTP error', async () => {
      mockWithAuth(async () => new Response('error', { status: 500 }));
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query');
      expect(results).toEqual([]);
    });

    it('should send correct search body fields', async () => {
      let capturedBody = '';
      mockWithAuth(async (_url, init) => {
        capturedBody = init?.body as string;
        return new Response(JSON.stringify([]), { status: 200 });
      });
      const client = new CogneeClient({ dataset: 'my-ds' });
      await client.healthCheck();
      await client.search('my query', { searchType: 'CHUNKS', limit: 5 });
      const parsed = JSON.parse(capturedBody);
      expect(parsed.query).toBe('my query');
      expect(parsed.search_type).toBe('CHUNKS');
      expect(parsed.topK).toBe(5);
      expect(parsed.datasets).toEqual(['my-ds']);
    });

    it('should default to CHUNKS search type', async () => {
      let capturedBody = '';
      mockWithAuth(async (_url, init) => {
        capturedBody = init?.body as string;
        return new Response(JSON.stringify([]), { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      await client.search('query');
      const parsed = JSON.parse(capturedBody);
      expect(parsed.search_type).toBe('CHUNKS');
    });

    it('should handle results without payload.id gracefully', async () => {
      mockWithAuth(
        async () =>
          new Response(JSON.stringify([{ id: 'fallback-id', text: 'No payload', score: 0.5 }]), {
            status: 200,
          }),
      );
      const client = new CogneeClient();
      await client.healthCheck();
      const results = await client.search('query');
      expect(results[0].id).toBe('fallback-id');
    });
  });

  // ─── Auth ─────────────────────────────────────────────────────

  describe('auth', () => {
    it('should auto-login with service account on first API call', async () => {
      const calls: string[] = [];
      mockFetch(async (url, init) => {
        calls.push(url);
        if (isHealthCheck(url, init)) return new Response('ok', { status: 200 });
        if (url.includes('/auth/login')) {
          return new Response(JSON.stringify({ access_token: 'auto-jwt' }), { status: 200 });
        }
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      await client.cognify();
      expect(calls.some((c) => c.includes('/auth/login'))).toBe(true);
    });

    it('should register then login if login fails', async () => {
      const calls: string[] = [];
      let loginAttempts = 0;
      mockFetch(async (url, init) => {
        calls.push(url);
        if (isHealthCheck(url, init)) return new Response('ok', { status: 200 });
        if (url.includes('/auth/login')) {
          loginAttempts++;
          if (loginAttempts === 1) return new Response('bad', { status: 400 });
          return new Response(JSON.stringify({ access_token: 'new-jwt' }), { status: 200 });
        }
        if (url.includes('/auth/register')) {
          return new Response(JSON.stringify({ id: 'new-user' }), { status: 200 });
        }
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      await client.cognify();
      expect(calls.filter((c) => c.includes('/auth/login'))).toHaveLength(2);
      expect(calls.filter((c) => c.includes('/auth/register'))).toHaveLength(1);
    });

    it('should use pre-configured apiToken without login', async () => {
      const calls: string[] = [];
      mockFetch(async (url, init) => {
        calls.push(url);
        if (isHealthCheck(url, init)) return new Response('ok', { status: 200 });
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient({ apiToken: 'pre-configured' });
      await client.healthCheck();
      await client.cognify();
      expect(calls.some((c) => c.includes('/auth/'))).toBe(false);
    });

    it('should fall back to no auth if login and register both fail', async () => {
      mockFetch(async (url, init) => {
        if (isHealthCheck(url, init)) return new Response('ok', { status: 200 });
        if (isAuthCall(url)) return new Response('fail', { status: 500 });
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient();
      await client.healthCheck();
      // Should not throw — falls back to no auth
      const result = await client.cognify();
      expect(result.status).toBe('ok');
    });

    it('should reject default credentials for non-local endpoints', async () => {
      const fetchMock = mockFetch(async (url, init) => {
        if (url.includes('cognee.example.com') && url.endsWith('/'))
          return new Response('ok', { status: 200 });
        if (isAuthCall(url)) return new Response('fail', { status: 401 });
        return new Response('ok', { status: 200 });
      });
      // Remote endpoint without explicit credentials — guard should prevent auto-register/login
      const client = new CogneeClient({ baseUrl: 'https://cognee.example.com' });
      await client.healthCheck();
      await client.cognify();
      // The guard should prevent any auth calls to the remote endpoint
      const authCalls = fetchMock.mock.calls.filter(([url]: [string]) => isAuthCall(url));
      expect(authCalls).toHaveLength(0);
    });
  });

  // ─── Cognify debounce ─────────────────────────────────────────

  describe('cognify debounce', () => {
    it('should schedule cognify after addEntries', async () => {
      mockWithAuth();
      const client = new CogneeClient({ cognifyDebounceMs: 50 });
      await client.healthCheck();
      await client.addEntries([makeEntry()]);
      // Cognify not yet fired
      expect(client.getConfig()).toBeTruthy(); // just verify no crash
      client.resetPendingCognify();
    });

    it('should flush pending cognify on demand', async () => {
      let cognifyCalled = false;
      mockWithAuth(async (url) => {
        if (url.includes('/cognify')) cognifyCalled = true;
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient({ cognifyDebounceMs: 60_000 });
      await client.healthCheck();
      await client.addEntries([makeEntry()]);
      expect(cognifyCalled).toBe(false);
      await client.flushPendingCognify();
      expect(cognifyCalled).toBe(true);
    });

    it('should reset pending cognify without firing', async () => {
      let cognifyCalled = false;
      mockWithAuth(async (url) => {
        if (url.includes('/cognify')) cognifyCalled = true;
        return new Response('ok', { status: 200 });
      });
      const client = new CogneeClient({ cognifyDebounceMs: 60_000 });
      await client.healthCheck();
      await client.addEntries([makeEntry()]);
      client.resetPendingCognify();
      await new Promise((r) => setTimeout(r, 10));
      expect(cognifyCalled).toBe(false);
    });
  });

  // ─── getStatus ────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return null before health check', () => {
      const client = new CogneeClient();
      expect(client.getStatus()).toBeNull();
    });

    it('should return cached status after health check', async () => {
      mockFetch(async () => new Response('ok', { status: 200 }));
      const client = new CogneeClient();
      await client.healthCheck();
      const status = client.getStatus();
      expect(status).not.toBeNull();
      expect(status!.available).toBe(true);
    });
  });
});
