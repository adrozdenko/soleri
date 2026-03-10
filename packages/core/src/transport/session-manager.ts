/**
 * Session Manager — tracks HTTP transport sessions with TTL-based reaping.
 *
 * Each connected client gets a session entry. Sessions are reaped
 * automatically after their TTL expires.
 */

import { randomUUID } from 'node:crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface Session {
  id: string;
  /** Opaque transport reference — the MCP SDK's StreamableHTTPServerTransport */
  transport: unknown;
  /** Opaque server reference — the MCP SDK's McpServer */
  server: unknown;
  createdAt: number;
}

export interface SessionManagerConfig {
  /** Session TTL in ms. 0 to disable reaping. Default: 3600000 (1 hour). */
  ttl?: number;
  /** Reaper check interval in ms. Default: 60000 (1 minute). */
  reaperInterval?: number;
  /** Callback when a session is reaped. */
  onReap?: (session: Session) => void;
}

// =============================================================================
// SESSION MANAGER
// =============================================================================

const DEFAULT_TTL = 60 * 60 * 1000; // 1 hour
const DEFAULT_REAPER_INTERVAL = 60 * 1000; // 1 minute

export class SessionManager {
  private sessions = new Map<string, Session>();
  private reaperTimer: ReturnType<typeof setInterval> | undefined;
  private config: SessionManagerConfig;

  constructor(config: SessionManagerConfig = {}) {
    this.config = config;
  }

  /** Generate a new session ID. */
  generateId(): string {
    return randomUUID();
  }

  /** Register a new session. */
  add(id: string, transport: unknown, server: unknown): Session {
    const session: Session = { id, transport, server, createdAt: Date.now() };
    this.sessions.set(id, session);
    return session;
  }

  /** Get a session by ID. */
  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /** Remove a session. */
  remove(id: string): boolean {
    return this.sessions.delete(id);
  }

  /** Number of active sessions. */
  get size(): number {
    return this.sessions.size;
  }

  /** List all session IDs. */
  listIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /** Start the periodic session reaper. */
  startReaper(): void {
    const ttl = this.config.ttl ?? DEFAULT_TTL;
    if (ttl <= 0) return;

    const interval = this.config.reaperInterval ?? DEFAULT_REAPER_INTERVAL;
    this.reaperTimer = setInterval(() => {
      this.reap(ttl);
    }, interval);

    // Don't prevent process exit
    if (this.reaperTimer && typeof this.reaperTimer === 'object' && 'unref' in this.reaperTimer) {
      (this.reaperTimer as NodeJS.Timeout).unref();
    }
  }

  /** Stop the reaper. */
  stopReaper(): void {
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = undefined;
    }
  }

  /** Close all sessions and stop reaper. */
  close(): void {
    this.stopReaper();
    this.sessions.clear();
  }

  /** Evict sessions older than TTL. */
  private reap(ttlMs: number): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > ttlMs) {
        this.sessions.delete(id);
        this.config.onReap?.(session);
      }
    }
  }
}
