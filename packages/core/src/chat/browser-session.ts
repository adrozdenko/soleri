/**
 * Browser Session Manager — per-chat Playwright isolation.
 *
 * Manages a pool of Playwright MCP client sessions, one per chat.
 * Lazy initialization on first use, idle timeout eviction, FIFO
 * eviction when max sessions reached.
 *
 * The actual Playwright MCP server is spawned as a child process
 * via stdio transport. This module manages the lifecycle.
 */

import { spawn, type ChildProcess } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────

export interface BrowserSessionConfig {
  /** Idle timeout before closing a session (ms). Default: 5 minutes. */
  idleTimeoutMs?: number;
  /** Max concurrent browser sessions. Default: 3. */
  maxSessions?: number;
  /** Command to spawn Playwright MCP. Default: 'npx'. */
  command?: string;
  /** Args for the command. Default: ['@playwright/mcp', '--headless']. */
  args?: string[];
}

export interface BrowserSession {
  chatId: string;
  process: ChildProcess;
  lastUsed: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export interface BrowserTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface BrowserToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

// ─── Session Manager ─────────────────────────────────────────────────

const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SESSIONS = 3;

export class BrowserSessionManager {
  private sessions = new Map<string, BrowserSession>();
  private readonly idleTimeoutMs: number;
  private readonly maxSessions: number;
  private readonly command: string;
  private readonly args: string[];

  constructor(config: BrowserSessionConfig = {}) {
    this.idleTimeoutMs = config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT;
    this.maxSessions = config.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.command = config.command ?? 'npx';
    this.args = config.args ?? ['@playwright/mcp', '--headless'];
  }

  /**
   * Get or create a browser session for a chat.
   * Returns the session, spawning a new process if needed.
   */
  acquire(chatId: string): BrowserSession {
    const existing = this.sessions.get(chatId);
    if (existing) {
      // Reset idle timer
      if (existing.idleTimer) clearTimeout(existing.idleTimer);
      existing.lastUsed = Date.now();
      existing.idleTimer = setTimeout(() => this.release(chatId), this.idleTimeoutMs);
      return existing;
    }

    // Evict if at capacity
    if (this.sessions.size >= this.maxSessions) {
      this.evictOldest();
    }

    // Spawn new Playwright MCP process
    const proc = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const session: BrowserSession = {
      chatId,
      process: proc,
      lastUsed: Date.now(),
      idleTimer: setTimeout(() => this.release(chatId), this.idleTimeoutMs),
    };

    proc.on('exit', () => {
      // Clean up if process dies unexpectedly
      const s = this.sessions.get(chatId);
      if (s && s.process === proc) {
        if (s.idleTimer) clearTimeout(s.idleTimer);
        this.sessions.delete(chatId);
      }
    });

    this.sessions.set(chatId, session);
    return session;
  }

  /**
   * Release a browser session (close process, remove from pool).
   */
  release(chatId: string): boolean {
    const session = this.sessions.get(chatId);
    if (!session) return false;

    if (session.idleTimer) clearTimeout(session.idleTimer);

    try {
      session.process.kill();
    } catch {
      // Process may already be dead
    }

    this.sessions.delete(chatId);
    return true;
  }

  /**
   * Check if a chat has an active browser session.
   */
  has(chatId: string): boolean {
    return this.sessions.has(chatId);
  }

  /**
   * Close all browser sessions.
   */
  closeAll(): number {
    let count = 0;
    for (const chatId of this.sessions.keys()) {
      if (this.release(chatId)) count++;
    }
    return count;
  }

  /**
   * Get number of active sessions.
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * List active session chat IDs.
   */
  listSessions(): string[] {
    return [...this.sessions.keys()];
  }

  /**
   * Get session info.
   */
  getInfo(chatId: string): { lastUsed: number; pid: number | null } | null {
    const session = this.sessions.get(chatId);
    if (!session) return null;
    return {
      lastUsed: session.lastUsed,
      pid: session.process.pid ?? null,
    };
  }

  /**
   * Evict the oldest (least recently used) session.
   */
  private evictOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [chatId, session] of this.sessions) {
      if (session.lastUsed < oldestTime) {
        oldestTime = session.lastUsed;
        oldest = chatId;
      }
    }

    if (oldest) this.release(oldest);
  }
}
