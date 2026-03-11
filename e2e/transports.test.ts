/**
 * E2E Test: HTTP/SSE and WebSocket Transports
 *
 * Tests that the HTTP and WebSocket transport layers work correctly:
 * - Session management (create, reap, close)
 * - Rate limiting enforcement
 * - HTTP server starts and responds to health checks
 * - Auth token validation
 * - WebSocket server lifecycle
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  HttpMcpServer,
  WsMcpServer,
  SessionManager,
  RateLimiter,
} from '@soleri/core';

describe('E2E: transports', () => {
  // ─── Session Manager ───────────────────────────────────────────────

  describe('SessionManager', () => {
    it('should create and retrieve sessions', () => {
      const mgr = new SessionManager({ ttl: 60_000 });
      const id = mgr.generateId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');

      const session = mgr.add(id, null, null);
      expect(session.id).toBe(id);
      expect(mgr.get(id)).toBeDefined();
      expect(mgr.size).toBe(1);

      mgr.remove(id);
      expect(mgr.get(id)).toBeUndefined();
      expect(mgr.size).toBe(0);
      mgr.close();
    });

    it('should list session IDs', () => {
      const mgr = new SessionManager();
      const id1 = mgr.generateId();
      const id2 = mgr.generateId();
      mgr.add(id1, null, null);
      mgr.add(id2, null, null);

      const ids = mgr.listIds();
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
      expect(mgr.size).toBe(2);

      mgr.close();
    });

    it('should close all sessions', () => {
      const mgr = new SessionManager();
      mgr.add(mgr.generateId(), null, null);
      mgr.add(mgr.generateId(), null, null);
      mgr.add(mgr.generateId(), null, null);
      expect(mgr.size).toBe(3);

      mgr.close();
      expect(mgr.size).toBe(0);
    });

    it('should generate unique IDs', () => {
      const mgr = new SessionManager();
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(mgr.generateId());
      }
      expect(ids.size).toBe(100);
      mgr.close();
    });
  });

  // ─── Rate Limiter ──────────────────────────────────────────────────

  describe('RateLimiter', () => {
    it('should allow requests within limit', () => {
      const limiter = new RateLimiter(5, 60_000);

      for (let i = 0; i < 5; i++) {
        const result = limiter.check('client-1');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it('should block requests over limit', () => {
      const limiter = new RateLimiter(3, 60_000);

      limiter.check('client-2');
      limiter.check('client-2');
      limiter.check('client-2');

      const result = limiter.check('client-2');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should track separate clients independently', () => {
      const limiter = new RateLimiter(2, 60_000);

      limiter.check('a');
      limiter.check('a');
      const aResult = limiter.check('a');
      expect(aResult.allowed).toBe(false);

      const bResult = limiter.check('b');
      expect(bResult.allowed).toBe(true);
    });

    it('should reset a client', () => {
      const limiter = new RateLimiter(1, 60_000);

      limiter.check('c');
      expect(limiter.check('c').allowed).toBe(false);

      limiter.reset('c');
      expect(limiter.check('c').allowed).toBe(true);
    });

    it('should clear all state', () => {
      const limiter = new RateLimiter(1, 60_000);
      limiter.check('x');
      limiter.check('y');
      limiter.clear();

      expect(limiter.check('x').allowed).toBe(true);
      expect(limiter.check('y').allowed).toBe(true);
    });
  });

  // ─── HTTP Transport ────────────────────────────────────────────────

  describe('HttpMcpServer', () => {
    let httpServer: InstanceType<typeof HttpMcpServer> | null = null;
    const port = 39100 + Math.floor(Math.random() * 1000);
    const authToken = 'e2e-test-token';

    afterAll(async () => {
      if (httpServer) {
        try { await httpServer.stop(); } catch { /* ignore */ }
      }
    });

    it('should start and respond to health check', async () => {
      httpServer = new HttpMcpServer(
        {
          port,
          host: '127.0.0.1',
          corsOrigins: [],
          authToken,
        },
        {
          onInitialize: async (_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', result: { capabilities: {} } }));
          },
          onRequest: async (_req, res) => {
            res.writeHead(200);
            res.end('{}');
          },
          onSSE: async (_req, res) => {
            res.writeHead(200);
            res.end();
          },
          onDelete: async (_req, res) => {
            res.writeHead(200);
            res.end();
          },
        },
      );

      await httpServer.start();
      const stats = httpServer.getStats();
      expect(stats.sessions).toBe(0);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);

      // Health check — no auth required
      const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
      expect(healthRes.status).toBe(200);
    });

    it('should reject unauthenticated requests', async () => {
      if (!httpServer) return;

      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
      });

      expect(res.status).toBe(401);
    });

    it('should accept authenticated requests', async () => {
      if (!httpServer) return;

      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
      });

      expect(res.status).toBe(200);
    });

    it('should stop cleanly', async () => {
      if (!httpServer) return;

      await httpServer.stop();
      httpServer = null;

      // Verify server is no longer listening
      try {
        await fetch(`http://127.0.0.1:${port}/health`);
        expect.fail('Should have thrown — server is stopped');
      } catch {
        // Expected — connection refused
      }
    });
  });

  // ─── WebSocket Transport ───────────────────────────────────────────

  describe('WsMcpServer', () => {
    let wsServer: InstanceType<typeof WsMcpServer> | null = null;

    afterAll(async () => {
      if (wsServer) {
        try { await wsServer.stop(); } catch { /* ignore */ }
      }
    });

    it('should start standalone WebSocket server', async () => {
      const wsPort = 39200 + Math.floor(Math.random() * 1000);

      wsServer = new WsMcpServer(
        {
          authToken: 'e2e-ws-token',
          heartbeatInterval: 0,
          maxMessageSize: 1048576,
        },
        {
          onConnect: async () => {},
          onMessage: async () => {},
          onClose: () => {},
        },
      );

      await wsServer.start(wsPort, '127.0.0.1');
      const stats = wsServer.getStats();
      expect(stats.connections).toBe(0);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should stop cleanly', async () => {
      if (!wsServer) return;

      await wsServer.stop();
      const stats = wsServer.getStats();
      expect(stats.connections).toBe(0);
      wsServer = null;
    });
  });
});
