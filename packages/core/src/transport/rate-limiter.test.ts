/**
 * Rate Limiter Tests — sliding window rate limiting logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(3, 1000);
  });

  describe('check', () => {
    it('allows requests under the limit', () => {
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.retryAfterMs).toBe(0);
    });

    it('tracks remaining correctly across calls', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('blocks requests at the limit', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('isolates keys from each other', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');
      const result = limiter.check('user-2');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('expires old timestamps after window passes', async () => {
      const shortLimiter = new RateLimiter(2, 50);
      shortLimiter.check('k');
      shortLimiter.check('k');
      expect(shortLimiter.check('k').allowed).toBe(false);

      await new Promise((r) => setTimeout(r, 60));
      const result = shortLimiter.check('k');
      expect(result.allowed).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears rate limit state for a specific key', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.reset('user-1');
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('does not affect other keys', () => {
      limiter.check('user-1');
      limiter.check('user-2');
      limiter.reset('user-1');
      const state = limiter.getKeyState('user-2');
      expect(state.requestCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('clears all keys', () => {
      limiter.check('user-1');
      limiter.check('user-2');
      limiter.clear();
      expect(limiter.getKeyState('user-1').requestCount).toBe(0);
      expect(limiter.getKeyState('user-2').requestCount).toBe(0);
    });
  });

  describe('getKeyState', () => {
    it('returns zero for unknown key', () => {
      const state = limiter.getKeyState('unknown');
      expect(state.requestCount).toBe(0);
      expect(state.remaining).toBe(3);
    });

    it('reflects current request count', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      const state = limiter.getKeyState('user-1');
      expect(state.requestCount).toBe(2);
      expect(state.remaining).toBe(1);
    });
  });

  describe('defaults', () => {
    it('uses 100 max and 60s window by default', () => {
      const defaultLimiter = new RateLimiter();
      for (let i = 0; i < 100; i++) {
        expect(defaultLimiter.check('k').allowed).toBe(true);
      }
      expect(defaultLimiter.check('k').allowed).toBe(false);
    });
  });

  describe('periodic cleanup', () => {
    it('triggers cleanup after 100 checks without errors', () => {
      const bigLimiter = new RateLimiter(200, 1000);
      for (let i = 0; i < 110; i++) {
        expect(bigLimiter.check(`key-${i}`).allowed).toBe(true);
      }
    });
  });
});
