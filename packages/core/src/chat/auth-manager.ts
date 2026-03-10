/**
 * Chat Auth Manager — passphrase + allowlist authentication for chat transports.
 *
 * Ported from Salvador's bot.ts auth with improvements:
 * - Configurable passphrase (not hardcoded "Hola Amigo!")
 * - Rate limiting on failed attempts (lockout after N failures)
 * - Allowlist support (optional user ID restriction)
 * - Persistence to disk (survives restarts)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChatAuthConfig, AuthRecord } from './types.js';

const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MS = 300_000; // 5 minutes

interface PersistedAuthState {
  authenticated: AuthRecord[];
}

export class ChatAuthManager {
  private config: Required<ChatAuthConfig>;
  private authenticated = new Map<string, number>(); // userId → timestamp
  private failedAttempts = new Map<string, { count: number; lastAttempt: number }>();

  constructor(config: ChatAuthConfig) {
    this.config = {
      storagePath: config.storagePath,
      passphrase: config.passphrase ?? '',
      allowedUsers: config.allowedUsers ?? [],
      maxFailedAttempts: config.maxFailedAttempts ?? DEFAULT_MAX_FAILED_ATTEMPTS,
      lockoutMs: config.lockoutMs ?? DEFAULT_LOCKOUT_MS,
    };

    this.loadFromDisk();
  }

  /**
   * Whether authentication is enabled (passphrase is set).
   */
  get enabled(): boolean {
    return this.config.passphrase.length > 0;
  }

  /**
   * Check if a user is authenticated.
   */
  isAuthenticated(userId: string | number): boolean {
    if (!this.enabled) return true;
    const key = String(userId);

    // Check allowlist first (if configured)
    if (this.config.allowedUsers.length > 0) {
      const allowed = this.config.allowedUsers.some((u) => String(u) === key);
      if (!allowed) return false;
    }

    return this.authenticated.has(key);
  }

  /**
   * Attempt authentication with a passphrase.
   * Returns true if successful, false otherwise.
   */
  authenticate(userId: string | number, passphrase: string): boolean {
    const key = String(userId);

    // Check allowlist
    if (this.config.allowedUsers.length > 0) {
      const allowed = this.config.allowedUsers.some((u) => String(u) === key);
      if (!allowed) return false;
    }

    // Check lockout
    if (this.isLockedOut(key)) return false;

    // Verify passphrase
    if (passphrase === this.config.passphrase) {
      this.authenticated.set(key, Date.now());
      this.failedAttempts.delete(key);
      this.persistToDisk();
      return true;
    }

    // Record failed attempt
    this.recordFailedAttempt(key);
    return false;
  }

  /**
   * Revoke authentication for a user.
   */
  revoke(userId: string | number): void {
    this.authenticated.delete(String(userId));
    this.persistToDisk();
  }

  /**
   * Check if a user is temporarily locked out.
   */
  isLockedOut(userId: string | number): boolean {
    const key = String(userId);
    const record = this.failedAttempts.get(key);
    if (!record) return false;

    if (record.count >= this.config.maxFailedAttempts) {
      const elapsed = Date.now() - record.lastAttempt;
      if (elapsed < this.config.lockoutMs) return true;
      // Lockout expired — reset
      this.failedAttempts.delete(key);
    }

    return false;
  }

  /**
   * Number of authenticated users.
   */
  get authenticatedCount(): number {
    return this.authenticated.size;
  }

  /**
   * List authenticated user IDs.
   */
  listAuthenticated(): (string | number)[] {
    return [...this.authenticated.keys()];
  }

  // ─── Private ───────────────────────────────────────────────────

  private recordFailedAttempt(key: string): void {
    const existing = this.failedAttempts.get(key);
    if (existing) {
      existing.count++;
      existing.lastAttempt = Date.now();
    } else {
      this.failedAttempts.set(key, { count: 1, lastAttempt: Date.now() });
    }
  }

  private persistToDisk(): void {
    try {
      mkdirSync(dirname(this.config.storagePath), { recursive: true });
      const state: PersistedAuthState = {
        authenticated: [...this.authenticated.entries()].map(([userId, ts]) => ({
          userId,
          authenticatedAt: ts,
        })),
      };
      writeFileSync(this.config.storagePath, JSON.stringify(state), 'utf-8');
    } catch {
      // Persistence failure is non-critical
    }
  }

  private loadFromDisk(): void {
    if (!existsSync(this.config.storagePath)) return;

    try {
      const data = readFileSync(this.config.storagePath, 'utf-8');
      const state = JSON.parse(data) as PersistedAuthState;
      for (const record of state.authenticated) {
        this.authenticated.set(String(record.userId), record.authenticatedAt);
      }
    } catch {
      // Load failure is non-critical — start fresh
    }
  }
}
