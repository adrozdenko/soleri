import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  computeDelay,
  retry,
  parseRateLimitHeaders,
} from './utils.js';
import { LLMError } from './types.js';

// ─── CircuitOpenError ───────────────────────────────────────────────

describe('CircuitOpenError', () => {
  it('should include the breaker name in the message', () => {
    const err = new CircuitOpenError('test-breaker');
    expect(err.message).toContain('test-breaker');
    expect(err.name).toBe('CircuitOpenError');
  });

  it('should not be retryable', () => {
    const err = new CircuitOpenError('x');
    expect(err.retryable).toBe(false);
  });

  it('should be an instance of CircuitOpenError', () => {
    const err = new CircuitOpenError('x');
    expect(err).toBeInstanceOf(CircuitOpenError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── CircuitBreaker ─────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should start in closed state', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const snap = cb.getState();
    expect(snap.state).toBe('closed');
    expect(snap.failureCount).toBe(0);
  });

  it('should pass through successful calls in closed state', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const result = await cb.call(async () => 42);
    expect(result).toBe(42);
  });

  it('should rethrow errors from the wrapped function', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    await expect(
      cb.call(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('should not count non-retryable errors as failures', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2 });
    const nonRetryable = new Error('not retryable');

    for (let i = 0; i < 5; i++) {
      await expect(
        cb.call(async () => {
          throw nonRetryable;
        }),
      ).rejects.toThrow();
    }
    expect(cb.getState().state).toBe('closed');
  });

  it('should open after reaching failure threshold with retryable errors', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2 });
    const retryableErr = new LLMError('rate limited', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableErr;
      }),
    ).rejects.toThrow();
    await expect(
      cb.call(async () => {
        throw retryableErr;
      }),
    ).rejects.toThrow();
    expect(cb.isOpen()).toBe(true);
  });

  it('should reject calls when open', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 999_999 });
    const retryableErr = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableErr;
      }),
    ).rejects.toThrow();
    await expect(cb.call(async () => 'ok')).rejects.toThrow(CircuitOpenError);
  });

  it('should transition to half-open after reset timeout', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 10 });
    const retryableErr = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableErr;
      }),
    ).rejects.toThrow();
    expect(cb.isOpen()).toBe(true);

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 20));
    expect(cb.isOpen()).toBe(false); // shouldProbe returns true
    expect(cb.getState().state).toBe('half-open');
  });

  it('should close on success after half-open probe', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 10 });
    const retryableErr = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableErr;
      }),
    ).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));

    const result = await cb.call(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.getState().state).toBe('closed');
  });

  it('should re-open on failure in half-open state', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 10 });
    const retryableErr = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableErr;
      }),
    ).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));

    await expect(
      cb.call(async () => {
        throw retryableErr;
      }),
    ).rejects.toThrow();
    expect(cb.getState().state).toBe('open');
  });

  it('should reset state completely via reset()', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 999_999 });
    const retryableErr = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableErr;
      }),
    ).rejects.toThrow();
    expect(cb.isOpen()).toBe(true);

    cb.reset();
    expect(cb.getState().state).toBe('closed');
    expect(cb.getState().failureCount).toBe(0);
    expect(cb.getState().lastFailureAt).toBeNull();
  });

  it('should record failures synchronously via recordFailure()', () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 2 });
    cb.recordFailure();
    expect(cb.getState().failureCount).toBe(1);
    expect(cb.getState().state).toBe('closed');

    cb.recordFailure();
    expect(cb.getState().state).toBe('open');
  });

  it('should use default config values when none provided', () => {
    const cb = new CircuitBreaker();
    const snap = cb.getState();
    expect(snap.state).toBe('closed');
  });
});

// ─── computeDelay ───────────────────────────────────────────────────

describe('computeDelay', () => {
  it('should use retryAfterMs from error when available', () => {
    const error = { retryAfterMs: 5000 };
    const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: 0 };
    expect(computeDelay(error, 0, config)).toBe(5000);
  });

  it('should cap retryAfterMs at maxDelayMs', () => {
    const error = { retryAfterMs: 100_000 };
    const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: 0 };
    expect(computeDelay(error, 0, config)).toBe(30000);
  });

  it('should compute exponential backoff without jitter', () => {
    const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: 0 };
    expect(computeDelay({}, 0, config)).toBe(1000);
    expect(computeDelay({}, 1, config)).toBe(2000);
    expect(computeDelay({}, 2, config)).toBe(4000);
  });

  it('should cap exponential delay at maxDelayMs', () => {
    const config = { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 5000, jitter: 0 };
    expect(computeDelay({}, 10, config)).toBe(5000);
  });

  it('should apply jitter within range', () => {
    const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: 0.5 };
    const delays = Array.from({ length: 50 }, () => computeDelay({}, 0, config));
    expect(delays.every((d) => d >= 500 && d <= 1500)).toBe(true);
  });

  it('should never return negative delay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const config = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 30000, jitter: 1 };
    expect(computeDelay({}, 0, config)).toBeGreaterThanOrEqual(0);
    vi.restoreAllMocks();
  });
});

// ─── retry ──────────────────────────────────────────────────────────

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('should return on first success', async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw if maxAttempts < 1', async () => {
    vi.useRealTimers();
    await expect(retry(async () => 'ok', { maxAttempts: 0 })).rejects.toThrow(
      'maxAttempts must be >= 1',
    );
  });

  it('should throw non-retryable errors immediately', async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    await expect(retry(fn, { maxAttempts: 3 })).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry retryable errors up to maxAttempts', async () => {
    vi.useRealTimers();
    const retryableErr = new LLMError('rate limited', { retryable: true });
    const fn = vi.fn().mockRejectedValue(retryableErr);
    await expect(
      retry(fn, { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1, jitter: 0 }),
    ).rejects.toThrow('rate limited');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should succeed on retry after initial failures', async () => {
    vi.useRealTimers();
    const retryableErr = new LLMError('transient', { retryable: true });
    const fn = vi.fn().mockRejectedValueOnce(retryableErr).mockResolvedValueOnce('recovered');

    const result = await retry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1, jitter: 0 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should call onRetry callback on each retry', async () => {
    vi.useRealTimers();
    const retryableErr = new LLMError('transient', { retryable: true });
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(retryableErr).mockResolvedValueOnce('ok');

    await retry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1, jitter: 0, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(retryableErr, 1, expect.any(Number));
  });

  it('should respect custom shouldRetry predicate', async () => {
    vi.useRealTimers();
    const customErr = new Error('custom');
    const fn = vi.fn().mockRejectedValue(customErr);
    const shouldRetry = vi.fn().mockReturnValue(true);

    await expect(
      retry(fn, { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1, jitter: 0, shouldRetry }),
    ).rejects.toThrow('custom');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(shouldRetry).toHaveBeenCalled();
  });
});

// Need this import for afterAll
import { afterAll } from 'vitest';

// ─── parseRateLimitHeaders ──────────────────────────────────────────

describe('parseRateLimitHeaders', () => {
  function makeHeaders(obj: Record<string, string>): Headers {
    return new Headers(obj);
  }

  it('should parse remaining requests header', () => {
    const info = parseRateLimitHeaders(makeHeaders({ 'x-ratelimit-remaining-requests': '42' }));
    expect(info.remaining).toBe(42);
  });

  it('should return null for missing remaining header', () => {
    const info = parseRateLimitHeaders(makeHeaders({}));
    expect(info.remaining).toBeNull();
  });

  it('should return null for non-numeric remaining header', () => {
    const info = parseRateLimitHeaders(makeHeaders({ 'x-ratelimit-remaining-requests': 'abc' }));
    expect(info.remaining).toBeNull();
  });

  it('should parse retry-after header as seconds', () => {
    const info = parseRateLimitHeaders(makeHeaders({ 'retry-after': '2.5' }));
    expect(info.retryAfterMs).toBe(2500);
  });

  it('should return null for non-numeric retry-after', () => {
    const info = parseRateLimitHeaders(makeHeaders({ 'retry-after': 'invalid' }));
    expect(info.retryAfterMs).toBeNull();
  });

  it('should parse reset duration with minutes and seconds', () => {
    const info = parseRateLimitHeaders(makeHeaders({ 'x-ratelimit-reset-requests': '2m30s' }));
    expect(info.resetMs).toBe(2 * 60_000 + 30 * 1000);
  });

  it('should parse reset duration with milliseconds', () => {
    const info = parseRateLimitHeaders(makeHeaders({ 'x-ratelimit-reset-requests': '500ms' }));
    expect(info.resetMs).toBe(500);
  });

  it('should parse reset duration with seconds only', () => {
    const info = parseRateLimitHeaders(makeHeaders({ 'x-ratelimit-reset-requests': '45s' }));
    expect(info.resetMs).toBe(45000);
  });

  it('should return null for unparseable reset duration', () => {
    const info = parseRateLimitHeaders(makeHeaders({ 'x-ratelimit-reset-requests': 'unknown' }));
    expect(info.resetMs).toBeNull();
  });

  it('should return all nulls when no headers present', () => {
    const info = parseRateLimitHeaders(makeHeaders({}));
    expect(info.remaining).toBeNull();
    expect(info.resetMs).toBeNull();
    expect(info.retryAfterMs).toBeNull();
  });
});
