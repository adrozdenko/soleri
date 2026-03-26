/**
 * HTTP/SSE MCP Server — lightweight wrapper around node:http.
 *
 * Provides the HTTP routing, auth, rate limiting, CORS, and session management.
 * The actual MCP protocol handling is delegated to user-provided callbacks
 * (typically using the MCP SDK's StreamableHTTPServerTransport).
 *
 * Routes:
 *   POST   /mcp    — JSON-RPC requests (initialize creates session)
 *   GET    /mcp    — SSE stream for server notifications
 *   DELETE /mcp    — Session termination
 *   GET    /health — Health check (no auth)
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { HttpTransportConfig } from './types.js';
import { validateBearerToken } from './token-auth.js';
import { RateLimiter } from './rate-limiter.js';
import { SessionManager, type Session } from './session-manager.js';

// =============================================================================
// TYPES
// =============================================================================

export interface HttpServerCallbacks {
  /** Called on POST /mcp with an initialize request (no session yet). Must create session. */
  onInitialize: (req: IncomingMessage, res: ServerResponse, body: unknown) => Promise<void>;
  /** Called on POST /mcp for an existing session. */
  onRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
    session: Session,
  ) => Promise<void>;
  /** Called on GET /mcp (SSE stream) for an existing session. */
  onSSE: (req: IncomingMessage, res: ServerResponse, session: Session) => Promise<void>;
  /** Called on DELETE /mcp for an existing session. */
  onDelete: (req: IncomingMessage, res: ServerResponse, session: Session) => Promise<void>;
  /** Optional: check if a request body is an initialize request. Default: checks for method === 'initialize'. */
  isInitializeRequest?: (body: unknown) => boolean;
}

export interface HttpServerStats {
  sessions: number;
  uptime: number;
}

// =============================================================================
// HTTP SERVER
// =============================================================================

export class HttpMcpServer {
  private server: Server | undefined;
  private sessions: SessionManager;
  private rateLimiter: RateLimiter;
  private config: HttpTransportConfig;
  private callbacks: HttpServerCallbacks;
  private startedAt = 0;

  constructor(config: HttpTransportConfig, callbacks: HttpServerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.sessions = new SessionManager({
      ttl: config.sessionTTL,
      reaperInterval: config.reaperInterval,
    });
    this.rateLimiter = new RateLimiter(config.rateLimit ?? 100, config.rateLimitWindow ?? 60_000);
  }

  /** Get the session manager (for registering sessions from callbacks). */
  get sessionManager(): SessionManager {
    return this.sessions;
  }

  /** Start listening. */
  async start(): Promise<void> {
    this.startedAt = Date.now();

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.port, this.config.host, () => resolve());
    });

    this.sessions.startReaper();
  }

  /** Stop server and close all sessions. */
  async stop(): Promise<void> {
    this.sessions.close();

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err) => (err ? reject(err) : resolve()));
      });
      this.server = undefined;
    }
  }

  /** Get server stats. */
  getStats(): HttpServerStats {
    return {
      sessions: this.sessions.size,
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
    };
  }

  // ─── Request Handling ─────────────────────────────────────────────────

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // CORS
    if (this.handleCORS(req, res)) return;

    // Health — no auth
    if (url === '/health' && method === 'GET') {
      this.sendJSON(res, 200, {
        status: 'ok',
        sessions: this.sessions.size,
        uptime: Date.now() - this.startedAt,
      });
      return;
    }

    // All /mcp routes require auth
    if (url === '/mcp' || url.startsWith('/mcp?')) {
      // Auth
      if (!validateBearerToken(req.headers.authorization, this.config.authToken)) {
        this.sendJSON(res, 401, { error: 'Unauthorized' });
        return;
      }

      // Rate limit
      const key = (req.headers['mcp-session-id'] as string) || this.getClientIP(req) || 'unknown';
      const limit = this.rateLimiter.check(key);
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(Math.ceil(limit.retryAfterMs / 1000)));
        this.sendJSON(res, 429, { error: 'Too Many Requests', retryAfterMs: limit.retryAfterMs });
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (method === 'POST') {
        let body: unknown;
        try {
          body = await this.readBody(req);
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 413) {
            this.sendJSON(res, 413, { error: 'Request body too large' });
            return;
          }
          this.sendJSON(res, 400, { error: 'Failed to read request body' });
          return;
        }

        if (sessionId) {
          const session = this.sessions.get(sessionId);
          if (!session) {
            this.sendJSON(res, 404, { error: 'Session not found' });
            return;
          }
          await this.callbacks.onRequest(req, res, body, session);
          return;
        }

        // No session — must be initialize
        const isInit = this.callbacks.isInitializeRequest
          ? this.callbacks.isInitializeRequest(body)
          : this.defaultIsInitialize(body);

        if (isInit) {
          await this.callbacks.onInitialize(req, res, body);
          return;
        }

        this.sendJSON(res, 400, { error: 'Missing mcp-session-id header' });
        return;
      }

      if (method === 'GET') {
        if (!sessionId) {
          this.sendJSON(res, 400, { error: 'Missing mcp-session-id header' });
          return;
        }
        const session = this.sessions.get(sessionId);
        if (!session) {
          this.sendJSON(res, 404, { error: 'Session not found' });
          return;
        }
        await this.callbacks.onSSE(req, res, session);
        return;
      }

      if (method === 'DELETE') {
        if (!sessionId) {
          this.sendJSON(res, 400, { error: 'Missing mcp-session-id header' });
          return;
        }
        const session = this.sessions.get(sessionId);
        if (!session) {
          this.sendJSON(res, 404, { error: 'Session not found' });
          return;
        }
        await this.callbacks.onDelete(req, res, session);
        return;
      }

      this.sendJSON(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    this.sendJSON(res, 404, { error: 'Not Found' });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private handleCORS(req: IncomingMessage, res: ServerResponse): boolean {
    const { corsOrigins } = this.config;
    if (corsOrigins.length === 0) return false;

    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    return false;
  }

  private sendJSON(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private readBody(req: IncomingMessage): Promise<unknown> {
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
    const BODY_TIMEOUT = 30_000; // 30 seconds

    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          req.destroy();
          reject(new Error('Request body timeout'));
        }
      }, BODY_TIMEOUT);

      const cleanup = () => clearTimeout(timer);

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
          if (!settled) {
            settled = true;
            cleanup();
            req.destroy();
            reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
          }
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          const text = Buffer.concat(chunks).toString('utf-8');
          resolve(text.length > 0 ? JSON.parse(text) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', (e) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(e);
      });
    });
  }

  private getClientIP(req: IncomingMessage): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.socket.remoteAddress;
  }

  private defaultIsInitialize(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    return (body as Record<string, unknown>).method === 'initialize';
  }
}
