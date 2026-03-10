/**
 * Chat Session Manager — per-conversation history with disk persistence.
 *
 * Ported from Salvador's session-manager.ts with improvements:
 * - Transport-agnostic (no Telegram coupling)
 * - Synchronous persistence (matches Soleri's better-sqlite3 heritage)
 * - Simpler compaction (no personality tracking)
 * - TTL-based reaping with unref'd timer
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatSession, ChatSessionConfig, ChatMessage } from './types.js';

const DEFAULT_TTL_MS = 7_200_000; // 2 hours
const DEFAULT_COMPACTION_THRESHOLD = 100;
const DEFAULT_COMPACTION_KEEP = 40;
const REAPER_INTERVAL_MS = 60_000; // 1 minute

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>();
  private config: Required<ChatSessionConfig>;
  private reaperTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: ChatSessionConfig) {
    this.config = {
      storageDir: config.storageDir,
      ttlMs: config.ttlMs ?? DEFAULT_TTL_MS,
      compactionThreshold: config.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD,
      compactionKeep: config.compactionKeep ?? DEFAULT_COMPACTION_KEEP,
    };

    mkdirSync(this.config.storageDir, { recursive: true });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  /**
   * Get or create a session. Loads from disk if not in memory.
   */
  getOrCreate(sessionId: string): ChatSession {
    let session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
      return session;
    }

    // Try loading from disk
    session = this.loadFromDisk(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
      this.sessions.set(sessionId, session);
      return session;
    }

    // Create new
    const now = Date.now();
    session = {
      id: sessionId,
      messages: [],
      createdAt: now,
      lastActiveAt: now,
    };
    this.sessions.set(sessionId, session);
    this.persistToDisk(session);
    return session;
  }

  /**
   * Get a session without creating one.
   */
  get(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId) ?? this.loadFromDisk(sessionId);
  }

  /**
   * Check if a session exists (memory or disk).
   */
  has(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) return true;
    return existsSync(this.sessionPath(sessionId));
  }

  // ─── Message Management ─────────────────────────────────────────

  /**
   * Append a message and persist.
   */
  appendMessage(sessionId: string, message: ChatMessage): void {
    const session = this.getOrCreate(sessionId);
    session.messages.push(message);
    session.lastActiveAt = Date.now();

    // Auto-compact if threshold exceeded
    if (session.messages.length > this.config.compactionThreshold) {
      this.compact(session);
    }

    this.persistToDisk(session);
  }

  /**
   * Append multiple messages (e.g. assistant response + tool blocks).
   */
  appendMessages(sessionId: string, messages: ChatMessage[]): void {
    const session = this.getOrCreate(sessionId);
    session.messages.push(...messages);
    session.lastActiveAt = Date.now();

    if (session.messages.length > this.config.compactionThreshold) {
      this.compact(session);
    }

    this.persistToDisk(session);
  }

  /**
   * Get message count for a session.
   */
  messageCount(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    return session?.messages.length ?? 0;
  }

  // ─── Session Operations ─────────────────────────────────────────

  /**
   * Clear session history (keep session alive, wipe messages).
   */
  clear(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      session.lastActiveAt = Date.now();
      this.persistToDisk(session);
    } else {
      // Remove from disk
      this.removeFromDisk(sessionId);
    }
  }

  /**
   * Delete a session entirely (memory + disk).
   */
  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.removeFromDisk(sessionId);
  }

  /**
   * List all active session IDs (memory only — disk sessions not loaded).
   */
  listActive(): string[] {
    return [...this.sessions.keys()];
  }

  /**
   * List all session IDs (memory + disk).
   */
  listAll(): string[] {
    const memoryIds = new Set(this.sessions.keys());
    try {
      const files = readdirSync(this.config.storageDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          memoryIds.add(f.replace('.json', ''));
        }
      }
    } catch {
      // Directory may not exist yet
    }
    return [...memoryIds];
  }

  /**
   * Number of active (in-memory) sessions.
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Update session metadata.
   */
  setMeta(sessionId: string, meta: Record<string, unknown>): void {
    const session = this.getOrCreate(sessionId);
    session.meta = { ...session.meta, ...meta };
    this.persistToDisk(session);
  }

  // ─── Reaping (TTL cleanup) ─────────────────────────────────────

  /**
   * Start periodic TTL-based session cleanup.
   */
  startReaper(): void {
    if (this.reaperTimer) return;
    this.reaperTimer = setInterval(() => this.reap(), REAPER_INTERVAL_MS);
    this.reaperTimer.unref();
  }

  /**
   * Stop the reaper.
   */
  stopReaper(): void {
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }
  }

  /**
   * Reap expired sessions. Returns number of sessions reaped.
   */
  reap(): number {
    if (this.config.ttlMs <= 0) return 0;

    const now = Date.now();
    const cutoff = now - this.config.ttlMs;
    let reaped = 0;

    for (const [id, session] of this.sessions) {
      if (session.lastActiveAt < cutoff) {
        this.sessions.delete(id);
        this.removeFromDisk(id);
        reaped++;
      }
    }

    return reaped;
  }

  /**
   * Close all sessions and stop reaper.
   */
  close(): void {
    this.stopReaper();
    this.sessions.clear();
  }

  // ─── Private ───────────────────────────────────────────────────

  private compact(session: ChatSession): void {
    const keep = this.config.compactionKeep;
    if (session.messages.length <= keep) return;
    session.messages = session.messages.slice(-keep);
  }

  private sessionPath(sessionId: string): string {
    // Sanitize ID for filesystem safety
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.config.storageDir, `${safe}.json`);
  }

  private persistToDisk(session: ChatSession): void {
    try {
      writeFileSync(this.sessionPath(session.id), JSON.stringify(session), 'utf-8');
    } catch {
      // Disk write failure is non-critical — session lives in memory
    }
  }

  private loadFromDisk(sessionId: string): ChatSession | null {
    const path = this.sessionPath(sessionId);
    if (!existsSync(path)) return null;

    try {
      const data = readFileSync(path, 'utf-8');
      return JSON.parse(data) as ChatSession;
    } catch {
      return null;
    }
  }

  private removeFromDisk(sessionId: string): void {
    const path = this.sessionPath(sessionId);
    try {
      rmSync(path, { force: true });
    } catch {
      // Removal failure is non-critical
    }
  }
}
