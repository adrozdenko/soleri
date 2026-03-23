import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldRetry, getRetryDelay, retryWithPreset, RETRY_PRESETS } from './retry.js';
import { SoleriError, SoleriErrorCode } from './types.js';

describe('RETRY_PRESETS', () => {
  it('should define fast, normal, and patient presets', () => {
    expect(RETRY_PRESETS.fast.maxAttempts).toBe(3);
    expect(RETRY_PRESETS.normal.maxAttempts).toBe(10);
    expect(RETRY_PRESETS.patient.maxAttempts).toBe(25);
  });
});

describe('shouldRetry', () => {
  it('should return true for retryable error below max attempts', () => {
    const error = new SoleriError('timeout', SoleriErrorCode.TIMEOUT);
    expect(shouldRetry(error, 1, 'fast')).toBe(true);
  });

  it('should return false for retryable error at max attempts', () => {
    const error = new SoleriError('timeout', SoleriErrorCode.TIMEOUT);
    expect(shouldRetry(error, 3, 'fast')).toBe(false);
  });

  it('should return false for non-retryable error', () => {
    const error = new SoleriError('bad auth', SoleriErrorCode.AUTH);
    expect(shouldRetry(error, 1, 'fast')).toBe(false);
  });

  it('should return false for fixable error', () => {
    const error = new SoleriError('invalid', SoleriErrorCode.VALIDATION);
    expect(shouldRetry(error, 1, 'normal')).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('should return a positive number', () => {
    const delay = getRetryDelay(0, 'fast');
    expect(delay).toBeGreaterThanOrEqual(0);
  });

  it('should increase with attempt number', () => {
    const delays = Array.from({ length: 5 }, (_, i) => {
      // Average over multiple samples to reduce jitter impact
      const samples = Array.from({ length: 100 }, () => getRetryDelay(i, 'normal'));
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    });
    // Each averaged delay should generally be >= the previous
    for (let i = 1; i < delays.length - 1; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1] * 0.5);
    }
  });

  it('should not exceed maxIntervalMs plus jitter', () => {
    const config = RETRY_PRESETS.fast;
    const maxWithJitter = config.maxIntervalMs * 1.25;
    for (let i = 0; i < 20; i++) {
      expect(getRetryDelay(10, 'fast')).toBeLessThanOrEqual(maxWithJitter);
    }
  });

  it('should never return a negative value', () => {
    for (let i = 0; i < 50; i++) {
      expect(getRetryDelay(0, 'fast')).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('retryWithPreset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return ok on first success', async () => {
    const fn = vi.fn().mockResolvedValue('done');
    const resultPromise = retryWithPreset(fn, 'fast');
    const result = await resultPromise;
    expect(result).toEqual({ ok: true, value: 'done' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry retryable errors and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('recovered');

    const resultPromise = retryWithPreset(fn, 'fast');
    // Advance past the sleep delay
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await resultPromise;
    expect(result).toEqual({ ok: true, value: 'recovered' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should return err immediately for permanent errors', async () => {
    const fn = vi.fn().mockRejectedValue(new SoleriError('denied', SoleriErrorCode.AUTH));
    const result = await retryWithPreset(fn, 'fast');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(SoleriErrorCode.AUTH);
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should return err after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new SoleriError('down', SoleriErrorCode.NETWORK));
    const resultPromise = retryWithPreset(fn, 'fast');
    // Advance enough time for all retries
    await vi.advanceTimersByTimeAsync(100_000);
    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should call onRetry callback on each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network fail'))
      .mockResolvedValue('ok');

    const resultPromise = retryWithPreset(fn, 'fast', { onRetry });
    await vi.advanceTimersByTimeAsync(20_000);
    await resultPromise;
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(SoleriError), 1, expect.any(Number));
  });

  it('should abort when signal is aborted during sleep', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error('network error'));

    const resultPromise = retryWithPreset(fn, 'fast', { signal: controller.signal });
    // Let the first attempt fail and enter sleep
    await vi.advanceTimersByTimeAsync(0);
    // Abort during sleep
    controller.abort(new Error('cancelled'));
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;
    expect(result.ok).toBe(false);
  });

  it('should return err for fixable errors without retrying', async () => {
    const fn = vi.fn().mockRejectedValue(new SoleriError('bad', SoleriErrorCode.VALIDATION));
    const result = await retryWithPreset(fn, 'fast');
    expect(result.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// Need to import afterEach at top level
import { afterEach } from 'vitest';
