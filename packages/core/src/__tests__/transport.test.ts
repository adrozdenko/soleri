/**
 * Transport Module Tests — token-auth, rate-limiter, session-manager, http-server
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateToken,
  validateBearerToken,
  RateLimiter,
  SessionManager,
  HttpMcpServer,
} from '../transport/index.js';
import type { HttpServerCallbacks } from '../transport/index.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

// =============================================================================
// TOKEN AUTH
// =============================================================================

describe('Token Auth', () => {
  test('generateToken returns 64-char hex string', () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  test('generateToken returns unique values', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
  });

  test('validateBearerToken accepts valid token', () => {
    const token = generateToken();
    expect(validateBearerToken(`Bearer ${token}`, token)).toBe(true);
  });

  test('validateBearerToken rejects wrong token', () => {
    const token = generateToken();
    const wrong = generateToken();
    expect(validateBearerToken(`Bearer ${wrong}`, token)).toBe(false);
  });

  test('validateBearerToken rejects missing header', () => {
    expect(validateBearerToken(undefined, 'abc')).toBe(false);
  });

  test('validateBearerToken rejects non-Bearer prefix', () => {
    expect(validateBearerToken('Basic abc', 'abc')).toBe(false);
  });

  test('validateBearerToken rejects empty Bearer', () => {
    expect(validateBearerToken('Bearer ', 'abc')).toBe(false);
  });

  test('validateBearerToken rejects length mismatch', () => {
    expect(validateBearerToken('Bearer short', 'longer-token-here')).toBe(false);
  });
});

// =============================================================================
// RATE LIMITER
// =============================================================================

describe('RateLimiter', () => {
  test('allows requests under limit', () => {
    const limiter = new RateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      const result = limiter.check('key1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  test('blocks requests over limit', () => {
    const limiter = new RateLimiter(3, 60_000);
    limiter.check('key1');
    limiter.check('key1');
    limiter.check('key1');
    const result = limiter.check('key1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test('tracks keys independently', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.check('a');
    limiter.check('a');
    const blocked = limiter.check('a');
    expect(blocked.allowed).toBe(false);

    const allowed = limiter.check('b');
    expect(allowed.allowed).toBe(true);
  });

  test('reset clears a key', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.check('key');
    limiter.check('key');
    expect(limiter.check('key').allowed).toBe(false);

    limiter.reset('key');
    expect(limiter.check('key').allowed).toBe(true);
  });

  test('clear resets all keys', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.check('a');
    limiter.check('b');
    limiter.clear();
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
  });

  test('getKeyState returns correct counts', () => {
    const limiter = new RateLimiter(10, 60_000);
    limiter.check('key');
    limiter.check('key');
    limiter.check('key');

    const state = limiter.getKeyState('key');
    expect(state.requestCount).toBe(3);
    expect(state.remaining).toBe(7);
  });

  test('getKeyState for unknown key returns full capacity', () => {
    const limiter = new RateLimiter(10, 60_000);
    const state = limiter.getKeyState('unknown');
    expect(state.requestCount).toBe(0);
    expect(state.remaining).toBe(10);
  });

  test('expired timestamps are cleaned up', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(2, 1000); // 1s window

    limiter.check('key');
    limiter.check('key');
    expect(limiter.check('key').allowed).toBe(false);

    vi.advanceTimersByTime(1100); // past window
    expect(limiter.check('key').allowed).toBe(true);

    vi.useRealTimers();
  });
});

// =============================================================================
// SESSION MANAGER
// =============================================================================

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.close();
  });

  test('generateId returns UUID format', () => {
    const id = manager.generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('add and get session', () => {
    const id = manager.generateId();
    const session = manager.add(id, 'transport', 'server');
    expect(session.id).toBe(id);
    expect(session.transport).toBe('transport');
    expect(session.server).toBe('server');
    expect(session.createdAt).toBeGreaterThan(0);

    const retrieved = manager.get(id);
    expect(retrieved).toBe(session);
  });

  test('get returns undefined for missing session', () => {
    expect(manager.get('nonexistent')).toBeUndefined();
  });

  test('remove deletes session', () => {
    const id = manager.generateId();
    manager.add(id, 'transport', 'server');
    expect(manager.remove(id)).toBe(true);
    expect(manager.get(id)).toBeUndefined();
  });

  test('remove returns false for missing session', () => {
    expect(manager.remove('nonexistent')).toBe(false);
  });

  test('size tracks count', () => {
    expect(manager.size).toBe(0);
    manager.add('a', null, null);
    manager.add('b', null, null);
    expect(manager.size).toBe(2);
    manager.remove('a');
    expect(manager.size).toBe(1);
  });

  test('listIds returns all IDs', () => {
    manager.add('x', null, null);
    manager.add('y', null, null);
    const ids = manager.listIds();
    expect(ids).toContain('x');
    expect(ids).toContain('y');
  });

  test('close clears all sessions', () => {
    manager.add('a', null, null);
    manager.add('b', null, null);
    manager.close();
    expect(manager.size).toBe(0);
  });

  test('reaper evicts expired sessions', () => {
    vi.useFakeTimers();
    const onReap = vi.fn();
    const mgr = new SessionManager({ ttl: 1000, reaperInterval: 500, onReap });

    mgr.add('old', null, null);
    mgr.startReaper();

    vi.advanceTimersByTime(1500); // past TTL + reaper interval
    expect(mgr.get('old')).toBeUndefined();
    expect(onReap).toHaveBeenCalledTimes(1);
    expect(onReap).toHaveBeenCalledWith(expect.objectContaining({ id: 'old' }));

    mgr.close();
    vi.useRealTimers();
  });

  test('reaper does not evict fresh sessions', () => {
    vi.useFakeTimers();
    const mgr = new SessionManager({ ttl: 5000, reaperInterval: 500 });

    mgr.add('fresh', null, null);
    mgr.startReaper();

    vi.advanceTimersByTime(600); // one reaper cycle but within TTL
    expect(mgr.get('fresh')).toBeDefined();

    mgr.close();
    vi.useRealTimers();
  });

  test('disabled TTL (0) prevents reaper from starting', () => {
    const mgr = new SessionManager({ ttl: 0 });
    mgr.startReaper(); // should be a no-op
    mgr.add('session', null, null);
    // No error, session remains
    expect(mgr.get('session')).toBeDefined();
    mgr.close();
  });
});

// =============================================================================
// HTTP SERVER (unit-level — no real network)
// =============================================================================

describe('HttpMcpServer', () => {
  test('constructs without error', () => {
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: 'test-token',
        corsOrigins: [],
        sessionTTL: 3600000,
        reaperInterval: 60000,
      },
      callbacks,
    );
    expect(server).toBeDefined();
    expect(server.sessionManager).toBeDefined();
  });

  test('getStats returns defaults before start', () => {
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: 'test-token',
        corsOrigins: [],
      },
      callbacks,
    );
    const stats = server.getStats();
    expect(stats.sessions).toBe(0);
    expect(stats.uptime).toBe(0);
  });

  test('start and stop lifecycle', async () => {
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0, // random port
        host: '127.0.0.1',
        authToken: 'test-token',
        corsOrigins: [],
      },
      callbacks,
    );

    await server.start();
    const stats = server.getStats();
    expect(stats.uptime).toBeGreaterThan(0);

    await server.stop();
    // Double stop should not throw
    await server.stop();
  });

  test('health endpoint returns 200', async () => {
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: 'test-token',
        corsOrigins: [],
      },
      callbacks,
    );

    await server.start();

    try {
      // Get the actual port from the underlying server
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('ok');
        expect(typeof body.sessions).toBe('number');
      }
    } finally {
      await server.stop();
    }
  });

  test('POST /mcp without auth returns 401', async () => {
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: 'test-token',
        corsOrigins: [],
      },
      callbacks,
    );

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'initialize' }),
        });
        expect(res.status).toBe(401);
      }
    } finally {
      await server.stop();
    }
  });

  test('POST /mcp with valid auth calls onInitialize', async () => {
    const token = 'test-token-123';
    const onInitialize = vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    const callbacks: HttpServerCallbacks = {
      onInitialize,
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: token,
        corsOrigins: [],
      },
      callbacks,
    );

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ method: 'initialize' }),
        });
        expect(res.status).toBe(200);
        expect(onInitialize).toHaveBeenCalledTimes(1);
      }
    } finally {
      await server.stop();
    }
  });

  test('POST /mcp with session-id calls onRequest', async () => {
    const token = 'test-token-456';
    const onRequest = vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'ok' }));
    });
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest,
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: token,
        corsOrigins: [],
      },
      callbacks,
    );

    // Register a session
    const sessionId = server.sessionManager.generateId();
    server.sessionManager.add(sessionId, null, null);

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'mcp-session-id': sessionId,
          },
          body: JSON.stringify({ method: 'tools/list' }),
        });
        expect(res.status).toBe(200);
        expect(onRequest).toHaveBeenCalledTimes(1);
      }
    } finally {
      await server.stop();
    }
  });

  test('unknown route returns 404', async () => {
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: 'test-token',
        corsOrigins: [],
      },
      callbacks,
    );

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/unknown`);
        expect(res.status).toBe(404);
      }
    } finally {
      await server.stop();
    }
  });

  test('missing session-id on GET /mcp returns 400', async () => {
    const token = 'test-token-789';
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: token,
        corsOrigins: [],
      },
      callbacks,
    );

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/mcp`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(400);
      }
    } finally {
      await server.stop();
    }
  });

  test('invalid session-id returns 404', async () => {
    const token = 'test-token-abc';
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: token,
        corsOrigins: [],
      },
      callbacks,
    );

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'mcp-session-id': 'nonexistent-session',
          },
          body: JSON.stringify({ method: 'tools/list' }),
        });
        expect(res.status).toBe(404);
      }
    } finally {
      await server.stop();
    }
  });

  test('DELETE /mcp calls onDelete for valid session', async () => {
    const token = 'test-token-del';
    const onDelete = vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deleted: true }));
    });
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete,
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: token,
        corsOrigins: [],
      },
      callbacks,
    );

    const sessionId = server.sessionManager.generateId();
    server.sessionManager.add(sessionId, null, null);

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/mcp`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'mcp-session-id': sessionId,
          },
        });
        expect(res.status).toBe(200);
        expect(onDelete).toHaveBeenCalledTimes(1);
      }
    } finally {
      await server.stop();
    }
  });

  test('rate limiter blocks excessive requests', async () => {
    const token = 'test-token-rl';
    const onInitialize = vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    const callbacks: HttpServerCallbacks = {
      onInitialize,
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: token,
        corsOrigins: [],
        rateLimit: 2,
        rateLimitWindow: 60_000,
      },
      callbacks,
    );

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const url = `http://127.0.0.1:${addr.port}/mcp`;
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };
        const body = JSON.stringify({ method: 'initialize' });

        // First two should succeed
        await fetch(url, { method: 'POST', headers, body });
        await fetch(url, { method: 'POST', headers, body });

        // Third should be rate limited
        const res = await fetch(url, { method: 'POST', headers, body });
        expect(res.status).toBe(429);
        const data = await res.json();
        expect(data.error).toBe('Too Many Requests');
      }
    } finally {
      await server.stop();
    }
  });

  test('CORS headers set for allowed origins', async () => {
    const token = 'test-token-cors';
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: token,
        corsOrigins: ['http://localhost:3000'],
      },
      callbacks,
    );

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/health`, {
          headers: { Origin: 'http://localhost:3000' },
        });
        expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      }
    } finally {
      await server.stop();
    }
  });

  test('OPTIONS returns 204 for CORS preflight', async () => {
    const token = 'test-token-opts';
    const callbacks: HttpServerCallbacks = {
      onInitialize: vi.fn(),
      onRequest: vi.fn(),
      onSSE: vi.fn(),
      onDelete: vi.fn(),
    };
    const server = new HttpMcpServer(
      {
        port: 0,
        host: '127.0.0.1',
        authToken: token,
        corsOrigins: ['http://localhost:3000'],
      },
      callbacks,
    );

    await server.start();

    try {
      const addr = (server as any).server?.address();
      if (addr && typeof addr === 'object') {
        const res = await fetch(`http://127.0.0.1:${addr.port}/mcp`, {
          method: 'OPTIONS',
          headers: { Origin: 'http://localhost:3000' },
        });
        expect(res.status).toBe(204);
      }
    } finally {
      await server.stop();
    }
  });
});
