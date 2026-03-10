/**
 * Sliding Window Rate Limiter
 *
 * Per-key tracking (session ID or IP) with periodic self-cleanup.
 * Returns Retry-After hint for 429 responses.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Milliseconds until the client can retry (0 if allowed) */
  retryAfterMs: number;
}

// =============================================================================
// RATE LIMITER
// =============================================================================

export class RateLimiter {
  private windows = new Map<string, number[]>();
  private maxRequests: number;
  private windowMs: number;
  private cleanupCounter = 0;
  private static readonly CLEANUP_INTERVAL = 100;

  constructor(maxRequests = 100, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /** Check if a request from the given key is allowed. Records timestamp if allowed. */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (++this.cleanupCounter >= RateLimiter.CLEANUP_INTERVAL) {
      this.cleanupCounter = 0;
      this.cleanup(windowStart);
    }

    let timestamps = this.windows.get(key);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(key, timestamps);
    }

    // Remove expired timestamps
    const filtered = timestamps.filter((t) => t > windowStart);
    this.windows.set(key, filtered);

    if (filtered.length >= this.maxRequests) {
      const retryAfterMs = filtered[0] + this.windowMs - now;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 1) };
    }

    filtered.push(now);
    return { allowed: true, remaining: this.maxRequests - filtered.length, retryAfterMs: 0 };
  }

  /** Reset rate limit state for a key. */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /** Clear all rate limit state. */
  clear(): void {
    this.windows.clear();
  }

  /** Get current state for a key. */
  getKeyState(key: string): { requestCount: number; remaining: number } {
    const timestamps = this.windows.get(key);
    const windowStart = Date.now() - this.windowMs;

    if (!timestamps) return { requestCount: 0, remaining: this.maxRequests };

    const active = timestamps.filter((t) => t > windowStart).length;
    return { requestCount: active, remaining: Math.max(0, this.maxRequests - active) };
  }

  private cleanup(windowStart: number): void {
    for (const [key, timestamps] of this.windows) {
      const filtered = timestamps.filter((t) => t > windowStart);
      if (filtered.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, filtered);
      }
    }
  }
}
