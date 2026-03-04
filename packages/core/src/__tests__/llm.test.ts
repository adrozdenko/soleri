import { describe, it, expect } from 'vitest';
import { SecretString, LLMError } from '../llm/types.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  computeDelay,
  retry,
  parseRateLimitHeaders,
} from '../llm/utils.js';
import { KeyPool, loadKeyPoolConfig } from '../llm/key-pool.js';

// =============================================================================
// SecretString
// =============================================================================

describe('SecretString', () => {
  it('should expose the original value', () => {
    const s = new SecretString('my-secret-key');
    expect(s.expose()).toBe('my-secret-key');
  });

  it('should redact on toString', () => {
    const s = new SecretString('sk-123456');
    expect(String(s)).toBe('[REDACTED]');
    expect(`${s}`).toBe('[REDACTED]');
  });

  it('should redact on JSON.stringify', () => {
    const s = new SecretString('sk-123456');
    const json = JSON.stringify({ key: s });
    expect(json).toContain('[REDACTED]');
    expect(json).not.toContain('sk-123456');
  });

  it('should report isSet correctly', () => {
    expect(new SecretString('value').isSet).toBe(true);
    expect(new SecretString('').isSet).toBe(false);
  });

  it('should redact in console.log via inspect', () => {
    const s = new SecretString('sk-secret');
    const inspectKey = Symbol.for('nodejs.util.inspect.custom');
    expect((s as any)[inspectKey]()).toBe('[REDACTED]');
  });
});

// =============================================================================
// LLMError
// =============================================================================

describe('LLMError', () => {
  it('should create with default non-retryable', () => {
    const err = new LLMError('test error');
    expect(err.message).toBe('test error');
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('LLMError');
  });

  it('should create retryable error', () => {
    const err = new LLMError('rate limited', { retryable: true, statusCode: 429 });
    expect(err.retryable).toBe(true);
    expect(err.statusCode).toBe(429);
  });

  it('should be instanceof Error', () => {
    const err = new LLMError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LLMError);
  });
});

// =============================================================================
// CircuitBreaker
// =============================================================================

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const state = cb.getState();
    expect(state.state).toBe('closed');
    expect(state.failureCount).toBe(0);
  });

  it('should pass through successful calls', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const result = await cb.call(async () => 'ok');
    expect(result).toBe('ok');
    expect(cb.getState().state).toBe('closed');
  });

  it('should count retryable failures', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
    const retryableError = new LLMError('fail', { retryable: true });

    for (let i = 0; i < 2; i++) {
      await expect(
        cb.call(async () => {
          throw retryableError;
        }),
      ).rejects.toThrow();
    }
    expect(cb.getState().failureCount).toBe(2);
    expect(cb.getState().state).toBe('closed');
  });

  it('should open after reaching failure threshold', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3, resetTimeoutMs: 60_000 });
    const retryableError = new LLMError('fail', { retryable: true });

    for (let i = 0; i < 3; i++) {
      await expect(
        cb.call(async () => {
          throw retryableError;
        }),
      ).rejects.toThrow();
    }
    expect(cb.getState().state).toBe('open');
  });

  it('should reject calls when open', async () => {
    const cb = new CircuitBreaker({
      name: 'test-reject',
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    });
    const retryableError = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableError;
      }),
    ).rejects.toThrow();
    await expect(cb.call(async () => 'ok')).rejects.toThrow(CircuitOpenError);
  });

  it('should not count non-retryable failures', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
    const nonRetryable = new LLMError('auth fail', { retryable: false });

    for (let i = 0; i < 5; i++) {
      await expect(
        cb.call(async () => {
          throw nonRetryable;
        }),
      ).rejects.toThrow();
    }
    expect(cb.getState().state).toBe('closed');
    expect(cb.getState().failureCount).toBe(0);
  });

  it('should reset to closed on success', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
    const retryableError = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableError;
      }),
    ).rejects.toThrow();
    await expect(
      cb.call(async () => {
        throw retryableError;
      }),
    ).rejects.toThrow();
    expect(cb.getState().failureCount).toBe(2);

    await cb.call(async () => 'recovered');
    expect(cb.getState().failureCount).toBe(0);
    expect(cb.getState().state).toBe('closed');
  });

  it('should trip synchronously via recordFailure', () => {
    const cb = new CircuitBreaker({ name: 'sync-trip', failureThreshold: 2 });
    cb.recordFailure();
    expect(cb.getState().state).toBe('closed');
    expect(cb.getState().failureCount).toBe(1);
    cb.recordFailure();
    expect(cb.getState().state).toBe('open');
    expect(cb.getState().failureCount).toBe(2);
  });

  it('should transition to half-open after timeout', async () => {
    const cb = new CircuitBreaker({
      name: 'test-halfopen',
      failureThreshold: 1,
      resetTimeoutMs: 10,
    });
    const retryableError = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableError;
      }),
    ).rejects.toThrow();
    expect(cb.getState().state).toBe('open');

    await new Promise((r) => setTimeout(r, 20));

    expect(cb.getState().state).toBe('half-open');
  });

  it('should close on successful probe in half-open', async () => {
    const cb = new CircuitBreaker({ name: 'test-probe', failureThreshold: 1, resetTimeoutMs: 10 });
    const retryableError = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableError;
      }),
    ).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));

    const result = await cb.call(async () => 'probe-success');
    expect(result).toBe('probe-success');
    expect(cb.getState().state).toBe('closed');
  });

  it('should re-open on failed probe in half-open', async () => {
    const cb = new CircuitBreaker({
      name: 'test-reprobe',
      failureThreshold: 1,
      resetTimeoutMs: 10,
    });
    const retryableError = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableError;
      }),
    ).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));

    await expect(
      cb.call(async () => {
        throw retryableError;
      }),
    ).rejects.toThrow();
    expect(cb.getState().state).toBe('open');
  });

  it('should support manual reset', async () => {
    const cb = new CircuitBreaker({
      name: 'test-reset',
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    });
    const retryableError = new LLMError('fail', { retryable: true });

    await expect(
      cb.call(async () => {
        throw retryableError;
      }),
    ).rejects.toThrow();
    expect(cb.getState().state).toBe('open');

    cb.reset();
    expect(cb.getState().state).toBe('closed');
    expect(cb.getState().failureCount).toBe(0);
  });

  it('isOpen should report correctly', async () => {
    const cb = new CircuitBreaker({
      name: 'test-isopen',
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    });
    expect(cb.isOpen()).toBe(false);

    const retryableError = new LLMError('fail', { retryable: true });
    await expect(
      cb.call(async () => {
        throw retryableError;
      }),
    ).rejects.toThrow();
    expect(cb.isOpen()).toBe(true);
  });
});

// =============================================================================
// Retry
// =============================================================================

describe('retry', () => {
  it('should return on first success', async () => {
    const result = await retry(async () => 'ok', { maxAttempts: 3 });
    expect(result).toBe('ok');
  });

  it('should retry on retryable errors', async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 3) {
          const err = new LLMError('fail', { retryable: true });
          throw err;
        }
        return 'ok';
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 10,
        shouldRetry: (e) => (e as any).retryable === true,
      },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('should not retry non-retryable errors', async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new LLMError('auth fail', { retryable: false });
        },
        { maxAttempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('auth fail');
    expect(attempts).toBe(1);
  });

  it('should throw last error after exhausting attempts', async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new LLMError(`fail ${attempts}`, { retryable: true });
        },
        { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5, shouldRetry: () => true },
      ),
    ).rejects.toThrow('fail 2');
    expect(attempts).toBe(2);
  });

  it('should call onRetry callback', async () => {
    const retries: number[] = [];
    let attempts = 0;
    await retry(
      async () => {
        attempts++;
        if (attempts < 2) throw new LLMError('fail', { retryable: true });
        return 'ok';
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 5,
        shouldRetry: () => true,
        onRetry: (_err, attempt) => retries.push(attempt),
      },
    );
    expect(retries).toEqual([1]);
  });
});

// =============================================================================
// computeDelay
// =============================================================================

describe('computeDelay', () => {
  it('should compute exponential backoff', () => {
    const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: 0 };
    expect(computeDelay(null, 0, config)).toBe(1000);
    expect(computeDelay(null, 1, config)).toBe(2000);
    expect(computeDelay(null, 2, config)).toBe(4000);
  });

  it('should cap at maxDelayMs', () => {
    const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 5000, jitter: 0 };
    expect(computeDelay(null, 10, config)).toBe(5000);
  });

  it('should respect retryAfterMs from error', () => {
    const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: 0 };
    const error = { retryAfterMs: 2500 };
    expect(computeDelay(error, 0, config)).toBe(2500);
  });

  it('should apply jitter within range', () => {
    const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: 0.1 };
    const delays = new Set<number>();
    for (let i = 0; i < 20; i++) {
      delays.add(computeDelay(null, 0, config));
    }
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(900);
      expect(d).toBeLessThanOrEqual(1100);
    }
  });
});

// =============================================================================
// parseRateLimitHeaders
// =============================================================================

describe('parseRateLimitHeaders', () => {
  it('should parse remaining requests header', () => {
    const headers = new Headers({
      'x-ratelimit-remaining-requests': '42',
    });
    const info = parseRateLimitHeaders(headers);
    expect(info.remaining).toBe(42);
  });

  it('should parse reset duration (6m0s)', () => {
    const headers = new Headers({
      'x-ratelimit-reset-requests': '6m0s',
    });
    const info = parseRateLimitHeaders(headers);
    expect(info.resetMs).toBe(360000);
  });

  it('should parse reset duration (200ms)', () => {
    const headers = new Headers({
      'x-ratelimit-reset-requests': '200ms',
    });
    const info = parseRateLimitHeaders(headers);
    expect(info.resetMs).toBe(200);
  });

  it('should parse reset duration (1s)', () => {
    const headers = new Headers({
      'x-ratelimit-reset-requests': '1s',
    });
    const info = parseRateLimitHeaders(headers);
    expect(info.resetMs).toBe(1000);
  });

  it('should parse retry-after header (seconds)', () => {
    const headers = new Headers({
      'retry-after': '2.5',
    });
    const info = parseRateLimitHeaders(headers);
    expect(info.retryAfterMs).toBe(2500);
  });

  it('should return nulls for missing headers', () => {
    const headers = new Headers({});
    const info = parseRateLimitHeaders(headers);
    expect(info.remaining).toBeNull();
    expect(info.resetMs).toBeNull();
    expect(info.retryAfterMs).toBeNull();
  });
});

// =============================================================================
// KeyPool
// =============================================================================

describe('KeyPool', () => {
  it('should initialize with keys', () => {
    const pool = new KeyPool({ keys: ['sk-1', 'sk-2'] });
    expect(pool.hasKeys).toBe(true);
    expect(pool.poolSize).toBe(2);
    expect(pool.activeKeyIndex).toBe(0);
  });

  it('should filter empty keys', () => {
    const pool = new KeyPool({ keys: ['sk-1', '', 'sk-2'] });
    expect(pool.poolSize).toBe(2);
  });

  it('should report no keys when empty', () => {
    const pool = new KeyPool({ keys: [] });
    expect(pool.hasKeys).toBe(false);
    expect(pool.exhausted).toBe(true);
  });

  it('should return active key as SecretString', () => {
    const pool = new KeyPool({ keys: ['sk-test-key'] });
    const key = pool.getActiveKey();
    expect(key.expose()).toBe('sk-test-key');
    expect(String(key)).toBe('[REDACTED]');
  });

  it('should rotate on error', () => {
    const pool = new KeyPool({ keys: ['sk-1', 'sk-2', 'sk-3'] });
    expect(pool.activeKeyIndex).toBe(0);

    const newKey = pool.rotateOnError();
    expect(newKey).not.toBeNull();
    expect(pool.activeKeyIndex).toBe(1);
  });

  it('should preemptively rotate when quota low', () => {
    const pool = new KeyPool({ keys: ['sk-1', 'sk-2'], preemptiveThreshold: 50 });
    pool.updateQuota(0, 10);
    const rotated = pool.rotatePreemptive();
    expect(rotated).toBe(true);
    expect(pool.activeKeyIndex).toBe(1);
  });

  it('should not rotate when quota above threshold', () => {
    const pool = new KeyPool({ keys: ['sk-1', 'sk-2'], preemptiveThreshold: 50 });
    pool.updateQuota(0, 100);
    const rotated = pool.rotatePreemptive();
    expect(rotated).toBe(false);
    expect(pool.activeKeyIndex).toBe(0);
  });

  it('should report exhausted when all keys breakers are open', () => {
    const pool = new KeyPool({ keys: ['sk-1'] });
    expect(pool.exhausted).toBe(false);

    pool.rotateOnError();
    pool.rotateOnError();
    pool.rotateOnError();
    expect(pool.exhausted).toBe(true);
  });

  it('should return status with per-key info', () => {
    const pool = new KeyPool({ keys: ['sk-1', 'sk-2'] });
    pool.updateQuota(0, 100);
    const status = pool.getStatus();
    expect(status.poolSize).toBe(2);
    expect(status.activeKeyIndex).toBe(0);
    expect(status.exhausted).toBe(false);
    expect(status.perKeyStatus).toHaveLength(2);
    expect(status.perKeyStatus[0].remainingQuota).toBe(100);
    expect(status.perKeyStatus[1].remainingQuota).toBeNull();
  });

  it('should wrap around when rotating past last key', () => {
    const pool = new KeyPool({ keys: ['sk-1', 'sk-2'] });
    pool.rotateOnError();
    expect(pool.activeKeyIndex).toBe(1);
    pool.rotateOnError();
    expect(pool.activeKeyIndex).toBe(0);
  });
});

// =============================================================================
// loadKeyPoolConfig
// =============================================================================

describe('loadKeyPoolConfig', () => {
  it('should return empty pools when no keys configured', () => {
    const origOpenai = process.env.OPENAI_API_KEY;
    const origAnthropic = process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const config = loadKeyPoolConfig('test-agent-nonexistent');
      expect(config.openai.keys).toBeDefined();
      expect(config.anthropic.keys).toBeDefined();
    } finally {
      if (origOpenai) process.env.OPENAI_API_KEY = origOpenai;
      if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
    }
  });
});
