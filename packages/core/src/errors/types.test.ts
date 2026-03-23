import { describe, it, expect } from 'vitest';
import { SoleriError, SoleriErrorCode, ok, err, isOk, isErr } from './types.js';

describe('SoleriError', () => {
  it('should set name to SoleriError', () => {
    const error = new SoleriError('test', SoleriErrorCode.NETWORK);
    expect(error.name).toBe('SoleriError');
  });

  it('should store code and message', () => {
    const error = new SoleriError('something broke', SoleriErrorCode.TIMEOUT);
    expect(error.message).toBe('something broke');
    expect(error.code).toBe(SoleriErrorCode.TIMEOUT);
  });

  it('should classify retryable codes correctly', () => {
    const retryable = [
      SoleriErrorCode.NETWORK,
      SoleriErrorCode.TIMEOUT,
      SoleriErrorCode.RATE_LIMIT,
      SoleriErrorCode.LLM_OVERLOAD,
      SoleriErrorCode.VAULT_UNREACHABLE,
      SoleriErrorCode.INTERNAL,
    ];
    for (const code of retryable) {
      const error = new SoleriError('x', code);
      expect(error.classification).toBe('retryable');
      expect(error.retryable).toBe(true);
    }
  });

  it('should classify fixable codes correctly', () => {
    const error = new SoleriError('bad input', SoleriErrorCode.VALIDATION);
    expect(error.classification).toBe('fixable');
    expect(error.retryable).toBe(false);
  });

  it('should classify permanent codes correctly', () => {
    const permanent = [
      SoleriErrorCode.AUTH,
      SoleriErrorCode.RESOURCE_NOT_FOUND,
      SoleriErrorCode.CONFIG_ERROR,
    ];
    for (const code of permanent) {
      const error = new SoleriError('x', code);
      expect(error.classification).toBe('permanent');
      expect(error.retryable).toBe(false);
    }
  });

  it('should store cause when provided', () => {
    const cause = new Error('root cause');
    const error = new SoleriError('wrapped', SoleriErrorCode.INTERNAL, { cause });
    expect(error.cause).toBe(cause);
  });

  it('should store context when provided', () => {
    const error = new SoleriError('x', SoleriErrorCode.NETWORK, {
      context: { httpStatus: 503 },
    });
    expect(error.context).toEqual({ httpStatus: 503 });
  });

  it('should be an instance of Error', () => {
    const error = new SoleriError('x', SoleriErrorCode.INTERNAL);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SoleriError);
  });
});

describe('Result helpers', () => {
  describe('ok', () => {
    it('should create a success result', () => {
      const result = ok(42);
      expect(result).toEqual({ ok: true, value: 42 });
    });
  });

  describe('err', () => {
    it('should create a failure result', () => {
      const error = new SoleriError('fail', SoleriErrorCode.INTERNAL);
      const result = err(error);
      expect(result).toEqual({ ok: false, error });
    });
  });

  describe('isOk', () => {
    it('should return true for ok results', () => {
      expect(isOk(ok('value'))).toBe(true);
    });

    it('should return false for err results', () => {
      const error = new SoleriError('x', SoleriErrorCode.INTERNAL);
      expect(isOk(err(error))).toBe(false);
    });
  });

  describe('isErr', () => {
    it('should return true for err results', () => {
      const error = new SoleriError('x', SoleriErrorCode.INTERNAL);
      expect(isErr(err(error))).toBe(true);
    });

    it('should return false for ok results', () => {
      expect(isErr(ok('value'))).toBe(false);
    });
  });
});
