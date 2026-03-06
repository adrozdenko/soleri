import { describe, it, expect, vi } from 'vitest';
import {
  SoleriErrorCode,
  SoleriError,
  ok,
  err,
  isOk,
  isErr,
  classifyError,
  shouldRetry,
  getRetryDelay,
  retryWithPreset,
  RETRY_PRESETS,
} from '../errors/index.js';

// ─── SoleriError ──────────────────────────────────────────────────────

describe('SoleriError', () => {
  it('classifies RATE_LIMIT as retryable', () => {
    const e = new SoleriError('rate limited', SoleriErrorCode.RATE_LIMIT);
    expect(e.code).toBe(SoleriErrorCode.RATE_LIMIT);
    expect(e.classification).toBe('retryable');
    expect(e.retryable).toBe(true);
    expect(e.name).toBe('SoleriError');
  });

  it('classifies AUTH as permanent', () => {
    const e = new SoleriError('unauthorized', SoleriErrorCode.AUTH);
    expect(e.classification).toBe('permanent');
    expect(e.retryable).toBe(false);
  });

  it('classifies VALIDATION as fixable', () => {
    const e = new SoleriError('bad input', SoleriErrorCode.VALIDATION);
    expect(e.classification).toBe('fixable');
    expect(e.retryable).toBe(false);
  });

  it('classifies NETWORK as retryable', () => {
    const e = new SoleriError('connection refused', SoleriErrorCode.NETWORK);
    expect(e.classification).toBe('retryable');
    expect(e.retryable).toBe(true);
  });

  it('classifies RESOURCE_NOT_FOUND as permanent', () => {
    const e = new SoleriError('not found', SoleriErrorCode.RESOURCE_NOT_FOUND);
    expect(e.classification).toBe('permanent');
    expect(e.retryable).toBe(false);
  });

  it('classifies CONFIG_ERROR as permanent', () => {
    const e = new SoleriError('missing key', SoleriErrorCode.CONFIG_ERROR);
    expect(e.classification).toBe('permanent');
    expect(e.retryable).toBe(false);
  });

  it('preserves cause and context', () => {
    const cause = new Error('original');
    const e = new SoleriError('wrapped', SoleriErrorCode.INTERNAL, {
      cause,
      context: { attempt: 3, url: 'http://example.com' },
    });
    expect(e.cause).toBe(cause);
    expect(e.context).toEqual({ attempt: 3, url: 'http://example.com' });
  });

  it('extends Error', () => {
    const e = new SoleriError('test', SoleriErrorCode.INTERNAL);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(SoleriError);
  });
});

// ─── classifyError ────────────────────────────────────────────────────

describe('classifyError', () => {
  it('passes through SoleriError unchanged', () => {
    const original = new SoleriError('test', SoleriErrorCode.AUTH);
    expect(classifyError(original)).toBe(original);
  });

  it('classifies HTTP 429 as RATE_LIMIT', () => {
    const e = classifyError({ status: 429, message: 'Too many requests' });
    expect(e.code).toBe(SoleriErrorCode.RATE_LIMIT);
    expect(e.retryable).toBe(true);
  });

  it('classifies HTTP 401 as AUTH', () => {
    const e = classifyError({ status: 401, message: 'Unauthorized' });
    expect(e.code).toBe(SoleriErrorCode.AUTH);
    expect(e.retryable).toBe(false);
  });

  it('classifies HTTP 403 as AUTH', () => {
    const e = classifyError({ status: 403, message: 'Forbidden' });
    expect(e.code).toBe(SoleriErrorCode.AUTH);
  });

  it('classifies HTTP 404 as RESOURCE_NOT_FOUND', () => {
    const e = classifyError({ status: 404, message: 'Not Found' });
    expect(e.code).toBe(SoleriErrorCode.RESOURCE_NOT_FOUND);
  });

  it('classifies HTTP 503 as INTERNAL (retryable)', () => {
    const e = classifyError({ status: 503, message: 'Service Unavailable' });
    expect(e.code).toBe(SoleriErrorCode.INTERNAL);
    expect(e.retryable).toBe(true);
  });

  it('classifies HTTP 408 as TIMEOUT', () => {
    const e = classifyError({ status: 408, message: 'Request Timeout' });
    expect(e.code).toBe(SoleriErrorCode.TIMEOUT);
  });

  it('classifies HTTP 422 as VALIDATION', () => {
    const e = classifyError({ status: 422, message: 'Unprocessable Entity' });
    expect(e.code).toBe(SoleriErrorCode.VALIDATION);
  });

  it('classifies ECONNREFUSED as NETWORK', () => {
    const error = new Error('connect ECONNREFUSED');
    (error as unknown as Record<string, string>).code = 'ECONNREFUSED';
    const e = classifyError(error);
    expect(e.code).toBe(SoleriErrorCode.NETWORK);
  });

  it('classifies ETIMEDOUT as TIMEOUT', () => {
    const error = new Error('connect ETIMEDOUT');
    (error as unknown as Record<string, string>).code = 'ETIMEDOUT';
    const e = classifyError(error);
    expect(e.code).toBe(SoleriErrorCode.TIMEOUT);
  });

  it('classifies "model overloaded" message as LLM_OVERLOAD', () => {
    const e = classifyError(new Error('model overloaded, please retry'));
    expect(e.code).toBe(SoleriErrorCode.LLM_OVERLOAD);
    expect(e.retryable).toBe(true);
  });

  it('classifies "capacity" message as LLM_OVERLOAD', () => {
    const e = classifyError(new Error('server at capacity'));
    expect(e.code).toBe(SoleriErrorCode.LLM_OVERLOAD);
  });

  it('classifies "vault" message as VAULT_UNREACHABLE', () => {
    const e = classifyError(new Error('vault connection lost'));
    expect(e.code).toBe(SoleriErrorCode.VAULT_UNREACHABLE);
  });

  it('classifies "invalid" message as VALIDATION', () => {
    const e = classifyError(new Error('invalid input format'));
    expect(e.code).toBe(SoleriErrorCode.VALIDATION);
  });

  it('classifies "configuration" message as CONFIG_ERROR', () => {
    const e = classifyError(new Error('missing configuration'));
    expect(e.code).toBe(SoleriErrorCode.CONFIG_ERROR);
  });

  it('defaults unknown error to INTERNAL (permanent)', () => {
    const e = classifyError(new Error('something weird happened'));
    expect(e.code).toBe(SoleriErrorCode.INTERNAL);
  });

  it('handles string input', () => {
    const e = classifyError('plain string error');
    expect(e).toBeInstanceOf(SoleriError);
    expect(e.message).toBe('plain string error');
  });

  it('handles null input', () => {
    const e = classifyError(null);
    expect(e).toBeInstanceOf(SoleriError);
    expect(e.message).toBe('null');
  });

  it('handles undefined input', () => {
    const e = classifyError(undefined);
    expect(e).toBeInstanceOf(SoleriError);
    expect(e.message).toBe('undefined');
  });

  it('prefers HTTP status over message pattern', () => {
    // status=401 should win over "invalid" in message
    const e = classifyError({ status: 401, message: 'invalid credentials' });
    expect(e.code).toBe(SoleriErrorCode.AUTH);
  });

  it('preserves original error as cause', () => {
    const original = new Error('original');
    const e = classifyError(original);
    expect(e.cause).toBe(original);
  });

  it('uses statusCode if status is absent', () => {
    const e = classifyError({ statusCode: 429, message: 'rate limited' });
    expect(e.code).toBe(SoleriErrorCode.RATE_LIMIT);
  });
});

// ─── shouldRetry ──────────────────────────────────────────────────────

describe('shouldRetry', () => {
  it('returns true for retryable error below max attempts', () => {
    const e = new SoleriError('net', SoleriErrorCode.NETWORK);
    expect(shouldRetry(e, 1, 'fast')).toBe(true); // max=3, attempt=1
  });

  it('returns false for retryable error at max attempts', () => {
    const e = new SoleriError('net', SoleriErrorCode.NETWORK);
    expect(shouldRetry(e, 3, 'fast')).toBe(false); // max=3, attempt=3
  });

  it('returns false for permanent error regardless', () => {
    const e = new SoleriError('auth', SoleriErrorCode.AUTH);
    expect(shouldRetry(e, 0, 'patient')).toBe(false);
  });

  it('returns false for fixable error regardless', () => {
    const e = new SoleriError('val', SoleriErrorCode.VALIDATION);
    expect(shouldRetry(e, 0, 'normal')).toBe(false);
  });
});

// ─── getRetryDelay ────────────────────────────────────────────────────

describe('getRetryDelay', () => {
  it('increases with attempt number', () => {
    const delays = Array.from({ length: 5 }, (_, i) => getRetryDelay(i, 'normal'));
    // Check trend is generally increasing (jitter may cause minor inversions)
    const avg0 = getAvgDelay(0, 'normal');
    const avg2 = getAvgDelay(2, 'normal');
    expect(avg2).toBeGreaterThan(avg0);
  });

  it('caps at maxInterval', () => {
    const delay = getRetryDelay(100, 'fast');
    // maxInterval for fast is 10_000, with 25% jitter max = 12_500
    expect(delay).toBeLessThanOrEqual(12_500);
  });

  it('returns non-negative values', () => {
    for (let i = 0; i < 50; i++) {
      expect(getRetryDelay(i, 'patient')).toBeGreaterThanOrEqual(0);
    }
  });
});

// Average over multiple calls to smooth jitter
function getAvgDelay(attempt: number, preset: 'fast' | 'normal' | 'patient'): number {
  let sum = 0;
  const runs = 100;
  for (let i = 0; i < runs; i++) sum += getRetryDelay(attempt, preset);
  return sum / runs;
}

// ─── RETRY_PRESETS ────────────────────────────────────────────────────

describe('RETRY_PRESETS', () => {
  it('has fast preset (1s/10s/3)', () => {
    expect(RETRY_PRESETS.fast).toEqual({
      initialIntervalMs: 1_000,
      maxIntervalMs: 10_000,
      maxAttempts: 3,
      backoffMultiplier: 2,
    });
  });

  it('has normal preset (10s/2min/10)', () => {
    expect(RETRY_PRESETS.normal).toEqual({
      initialIntervalMs: 10_000,
      maxIntervalMs: 120_000,
      maxAttempts: 10,
      backoffMultiplier: 2,
    });
  });

  it('has patient preset (1min/15min/25)', () => {
    expect(RETRY_PRESETS.patient).toEqual({
      initialIntervalMs: 60_000,
      maxIntervalMs: 900_000,
      maxAttempts: 25,
      backoffMultiplier: 1.5,
    });
  });
});

// ─── retryWithPreset ──────────────────────────────────────────────────

describe('retryWithPreset', () => {
  it('succeeds on first try', async () => {
    const result = await retryWithPreset(() => Promise.resolve(42), 'fast');
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('retries and eventually succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      return 'done';
    };
    const result = await retryWithPreset(fn, 'fast', {
      onRetry: vi.fn(),
    });
    expect(result).toEqual({ ok: true, value: 'done' });
    expect(calls).toBe(3);
  }, 30_000);

  it('returns err immediately for permanent error', async () => {
    const fn = async () => {
      throw Object.assign(new Error('forbidden'), { status: 403 });
    };
    const result = await retryWithPreset(fn, 'fast');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(SoleriErrorCode.AUTH);
    }
  });

  it('returns err after exhausting max attempts', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    };
    const result = await retryWithPreset(fn, 'fast');
    expect(result.ok).toBe(false);
    expect(calls).toBe(3); // fast preset has maxAttempts=3
  }, 30_000);

  it('calls onRetry callback', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) throw Object.assign(new Error('net'), { code: 'ECONNRESET' });
      return 'ok';
    };
    await retryWithPreset(fn, 'fast', { onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(SoleriError), 1, expect.any(Number));
  }, 30_000);

  it('respects abort signal', async () => {
    const controller = new AbortController();
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) {
        controller.abort();
        throw Object.assign(new Error('net'), { code: 'ECONNREFUSED' });
      }
      return 'ok';
    };
    const result = await retryWithPreset(fn, 'fast', { signal: controller.signal });
    expect(result.ok).toBe(false);
  });
});

// ─── Result helpers ───────────────────────────────────────────────────

describe('Result helpers', () => {
  it('ok() creates success result', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('err() creates failure result', () => {
    const error = new SoleriError('fail', SoleriErrorCode.INTERNAL);
    const r = err(error);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(error);
  });

  it('isOk() type guard works', () => {
    const r = ok('hello');
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
  });

  it('isErr() type guard works', () => {
    const r = err(new SoleriError('x', SoleriErrorCode.AUTH));
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
  });
});
