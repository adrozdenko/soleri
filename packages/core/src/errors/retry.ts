/**
 * Retry presets with exponential backoff + jitter.
 *
 * Three presets map to different execution contexts:
 * - fast:    quick API calls, 3 attempts, short waits
 * - normal:  standard operations, 10 attempts, moderate waits
 * - patient: batch/pipeline work, 25 attempts, long waits
 */

import { classifyError } from './classify.js';
import { SoleriError, type Result, ok, err } from './types.js';

// ─── Types ─────────────────────────────────────────────────────────────

export type RetryPreset = 'fast' | 'normal' | 'patient';

export interface RetryConfig {
  initialIntervalMs: number;
  maxIntervalMs: number;
  maxAttempts: number;
  backoffMultiplier: number;
}

export interface RetryOptions {
  onRetry?: (error: SoleriError, attempt: number, delayMs: number) => void;
  signal?: AbortSignal;
}

// ─── Presets ───────────────────────────────────────────────────────────

export const RETRY_PRESETS: Record<RetryPreset, RetryConfig> = {
  fast: { initialIntervalMs: 1_000, maxIntervalMs: 10_000, maxAttempts: 3, backoffMultiplier: 2 },
  normal: {
    initialIntervalMs: 10_000,
    maxIntervalMs: 120_000,
    maxAttempts: 10,
    backoffMultiplier: 2,
  },
  patient: {
    initialIntervalMs: 60_000,
    maxIntervalMs: 900_000,
    maxAttempts: 25,
    backoffMultiplier: 1.5,
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Check if a classified error should be retried at the given attempt.
 */
export function shouldRetry(error: SoleriError, attempt: number, preset: RetryPreset): boolean {
  if (!error.retryable) return false;
  return attempt < RETRY_PRESETS[preset].maxAttempts;
}

/**
 * Calculate retry delay with exponential backoff + jitter.
 * Jitter adds ±25% to prevent thundering herd.
 */
export function getRetryDelay(attempt: number, preset: RetryPreset): number {
  const config = RETRY_PRESETS[preset];
  const base = config.initialIntervalMs * Math.pow(config.backoffMultiplier, attempt);
  const capped = Math.min(base, config.maxIntervalMs);
  // ±25% jitter
  const jitter = capped * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

// ─── Retry Loop ────────────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('Aborted'));
      },
      { once: true },
    );
  });
}

/**
 * Retry an async operation with a named preset.
 *
 * - On success: returns ok(result)
 * - On permanent/fixable error: returns err() immediately
 * - On retryable error: retries up to maxAttempts with backoff
 * - On exhaustion: returns err() with last error
 */
export async function retryWithPreset<T>(
  fn: () => Promise<T>,
  preset: RetryPreset,
  options?: RetryOptions,
): Promise<Result<T>> {
  let lastError: SoleriError | undefined;

  for (let attempt = 0; attempt < RETRY_PRESETS[preset].maxAttempts; attempt++) {
    try {
      // oxlint-disable-next-line eslint(no-await-in-loop)
      const value = await fn();
      return ok(value);
    } catch (thrown: unknown) {
      lastError = classifyError(thrown);

      if (!shouldRetry(lastError, attempt + 1, preset)) {
        return err(lastError);
      }

      const delay = getRetryDelay(attempt, preset);
      options?.onRetry?.(lastError, attempt + 1, delay);

      try {
        // oxlint-disable-next-line eslint(no-await-in-loop)
        await sleep(delay, options?.signal);
      } catch {
        // Aborted during sleep
        return err(lastError);
      }
    }
  }

  return err(lastError ?? new SoleriError('Max retries exceeded', SoleriErrorCode.INTERNAL));
}

// Re-import for the err fallback
import { SoleriErrorCode } from './types.js';
