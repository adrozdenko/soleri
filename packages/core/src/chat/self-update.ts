/**
 * Self-Update Manager — restart context persistence for chat-driven updates.
 *
 * Manages the restart lifecycle: save context before exit, load on startup,
 * confirm success or trigger rollback. The actual process exit and rebuild
 * are handled by the supervisor — this module only manages the context.
 *
 * Exit code 75 signals the supervisor to rebuild before restarting.
 */

import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Exit code that tells the supervisor to rebuild before restart. */
export const RESTART_EXIT_CODE = 75;

export interface RestartContext {
  /** Why the restart was requested. */
  reason: 'self-update' | 'rebuild' | 'manual';
  /** Chat ID to send confirmation to after restart. */
  chatId: string;
  /** Git commit SHA that triggered the update (if applicable). */
  commitSha?: string;
  /** Unix timestamp ms when restart was requested. */
  requestedAt: number;
}

export interface RestartResult {
  /** Whether the restart was initiated. */
  initiated: boolean;
  /** The saved context. */
  context?: RestartContext;
  /** Error message if failed. */
  error?: string;
}

export class SelfUpdateManager {
  constructor(private readonly contextPath: string) {}

  /**
   * Save restart context and exit with code 75.
   * The supervisor handles rebuild + restart.
   * Returns the context (useful for testing — in production, process.exit fires).
   */
  requestRestart(
    chatId: string,
    reason: RestartContext['reason'] = 'manual',
    commitSha?: string,
  ): RestartResult {
    const context: RestartContext = {
      reason,
      chatId,
      commitSha,
      requestedAt: Date.now(),
    };

    try {
      this.saveContext(context);
      return { initiated: true, context };
    } catch (e) {
      return {
        initiated: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Save restart context to disk.
   */
  saveContext(context: RestartContext): void {
    mkdirSync(dirname(this.contextPath), { recursive: true });
    writeFileSync(this.contextPath, JSON.stringify(context, null, 2), 'utf-8');
  }

  /**
   * Load restart context from disk (if any).
   * Returns null if no pending restart context exists.
   */
  loadContext(): RestartContext | null {
    try {
      const raw = readFileSync(this.contextPath, 'utf-8');
      return JSON.parse(raw) as RestartContext;
    } catch {
      return null;
    }
  }

  /**
   * Clear restart context (call after successful startup confirmation).
   */
  clearContext(): void {
    try {
      unlinkSync(this.contextPath);
    } catch {
      // File doesn't exist — that's fine
    }
  }

  /**
   * Check if there's a pending restart context.
   */
  hasPendingRestart(): boolean {
    return this.loadContext() !== null;
  }

  /**
   * Sanitize a commit message for safe shell usage.
   * Allows alphanumeric, spaces, basic punctuation. Max 120 chars.
   */
  static sanitizeCommitMessage(msg: string): string {
    return msg
      .replace(/[^\w\s.,!?:;()\-/'"#@]/g, '')
      .trim()
      .slice(0, 120);
  }
}
