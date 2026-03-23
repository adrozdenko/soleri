import { describe, it, expect } from 'vitest';
import { classifyError } from './classify.js';
import { SoleriError, SoleriErrorCode } from './types.js';

describe('classifyError', () => {
  describe('passthrough', () => {
    it('should return a SoleriError as-is', () => {
      const original = new SoleriError('already classified', SoleriErrorCode.TIMEOUT);
      const result = classifyError(original);
      expect(result).toBe(original);
    });
  });

  describe('HTTP status classification', () => {
    it('should classify 401 as AUTH', () => {
      const result = classifyError({ status: 401, message: 'Unauthorized' });
      expect(result.code).toBe(SoleriErrorCode.AUTH);
      expect(result.context).toEqual({ httpStatus: 401 });
    });

    it('should classify 403 as AUTH', () => {
      const result = classifyError({ status: 403, message: 'Forbidden' });
      expect(result.code).toBe(SoleriErrorCode.AUTH);
    });

    it('should classify 404 as RESOURCE_NOT_FOUND', () => {
      const result = classifyError({ statusCode: 404, message: 'Not found' });
      expect(result.code).toBe(SoleriErrorCode.RESOURCE_NOT_FOUND);
    });

    it('should classify 408 as TIMEOUT', () => {
      const result = classifyError({ status: 408, message: 'Request Timeout' });
      expect(result.code).toBe(SoleriErrorCode.TIMEOUT);
    });

    it('should classify 429 as RATE_LIMIT', () => {
      const result = classifyError({ status: 429, message: 'Too Many Requests' });
      expect(result.code).toBe(SoleriErrorCode.RATE_LIMIT);
    });

    it('should classify 422 as VALIDATION', () => {
      const result = classifyError({ status: 422, message: 'Unprocessable' });
      expect(result.code).toBe(SoleriErrorCode.VALIDATION);
    });

    it('should classify 500 as INTERNAL', () => {
      const result = classifyError({ status: 500, message: 'Server Error' });
      expect(result.code).toBe(SoleriErrorCode.INTERNAL);
    });

    it('should classify 503 as INTERNAL', () => {
      const result = classifyError({ status: 503, message: 'Service Unavailable' });
      expect(result.code).toBe(SoleriErrorCode.INTERNAL);
    });

    it('should prefer statusCode when status is absent', () => {
      const result = classifyError({ statusCode: 429, message: 'throttled' });
      expect(result.code).toBe(SoleriErrorCode.RATE_LIMIT);
    });
  });

  describe('Node.js error code classification', () => {
    it('should classify ECONNREFUSED as NETWORK', () => {
      const err = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
      const result = classifyError(err);
      expect(result.code).toBe(SoleriErrorCode.NETWORK);
      expect(result.context).toEqual({ errorCode: 'ECONNREFUSED' });
    });

    it('should classify ENOTFOUND as NETWORK', () => {
      const err = Object.assign(new Error('dns fail'), { code: 'ENOTFOUND' });
      expect(classifyError(err).code).toBe(SoleriErrorCode.NETWORK);
    });

    it('should classify ECONNRESET as NETWORK', () => {
      const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
      expect(classifyError(err).code).toBe(SoleriErrorCode.NETWORK);
    });

    it('should classify ETIMEDOUT as TIMEOUT', () => {
      const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
      expect(classifyError(err).code).toBe(SoleriErrorCode.TIMEOUT);
    });

    it('should classify ESOCKETTIMEDOUT as TIMEOUT', () => {
      const err = Object.assign(new Error('socket'), { code: 'ESOCKETTIMEDOUT' });
      expect(classifyError(err).code).toBe(SoleriErrorCode.TIMEOUT);
    });

    it('should classify UND_ERR_CONNECT_TIMEOUT as TIMEOUT', () => {
      const err = Object.assign(new Error('undici'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
      expect(classifyError(err).code).toBe(SoleriErrorCode.TIMEOUT);
    });
  });

  describe('message pattern classification', () => {
    it('should classify "overloaded" as LLM_OVERLOAD', () => {
      expect(classifyError(new Error('server is overloaded')).code).toBe(SoleriErrorCode.LLM_OVERLOAD);
    });

    it('should classify "model busy" as LLM_OVERLOAD', () => {
      expect(classifyError(new Error('model is busy')).code).toBe(SoleriErrorCode.LLM_OVERLOAD);
    });

    it('should classify "timeout" message as TIMEOUT', () => {
      expect(classifyError(new Error('operation timed out')).code).toBe(SoleriErrorCode.TIMEOUT);
    });

    it('should classify "sqlite" as VAULT_UNREACHABLE', () => {
      expect(classifyError(new Error('sqlite error')).code).toBe(SoleriErrorCode.VAULT_UNREACHABLE);
    });

    it('should classify "validation" as VALIDATION', () => {
      expect(classifyError(new Error('validation failed')).code).toBe(SoleriErrorCode.VALIDATION);
    });

    it('should classify "missing key" as CONFIG_ERROR', () => {
      expect(classifyError(new Error('missing key FOO')).code).toBe(SoleriErrorCode.CONFIG_ERROR);
    });

    it('should classify "unauthorized" as AUTH', () => {
      expect(classifyError(new Error('unauthorized access')).code).toBe(SoleriErrorCode.AUTH);
    });

    it('should classify "not found" as RESOURCE_NOT_FOUND', () => {
      expect(classifyError(new Error('resource not found')).code).toBe(SoleriErrorCode.RESOURCE_NOT_FOUND);
    });

    it('should classify "rate limit" as RATE_LIMIT', () => {
      expect(classifyError(new Error('rate limit exceeded')).code).toBe(SoleriErrorCode.RATE_LIMIT);
    });

    it('should classify "network" as NETWORK', () => {
      expect(classifyError(new Error('network failure')).code).toBe(SoleriErrorCode.NETWORK);
    });
  });

  describe('fallback classification', () => {
    it('should default to INTERNAL for unknown errors', () => {
      const result = classifyError(new Error('something weird'));
      expect(result.code).toBe(SoleriErrorCode.INTERNAL);
    });

    it('should handle string thrown values', () => {
      const result = classifyError('a string error');
      expect(result).toBeInstanceOf(SoleriError);
      expect(result.message).toBe('a string error');
    });

    it('should handle number thrown values', () => {
      const result = classifyError(42);
      expect(result).toBeInstanceOf(SoleriError);
      expect(result.message).toBe('42');
    });

    it('should handle null thrown values', () => {
      const result = classifyError(null);
      expect(result).toBeInstanceOf(SoleriError);
    });

    it('should handle undefined thrown values', () => {
      const result = classifyError(undefined);
      expect(result).toBeInstanceOf(SoleriError);
    });

    it('should handle plain objects with no message', () => {
      const result = classifyError({});
      expect(result).toBeInstanceOf(SoleriError);
      expect(result.message).toBe('Unknown error');
      expect(result.code).toBe(SoleriErrorCode.INTERNAL);
    });
  });

  describe('priority order', () => {
    it('should prefer HTTP status over message pattern', () => {
      const result = classifyError({ status: 404, message: 'network error not found' });
      expect(result.code).toBe(SoleriErrorCode.RESOURCE_NOT_FOUND);
    });

    it('should prefer error code over message pattern', () => {
      const err = Object.assign(new Error('timeout in database'), { code: 'ECONNREFUSED' });
      const result = classifyError(err);
      expect(result.code).toBe(SoleriErrorCode.NETWORK);
    });
  });

  describe('cause preservation', () => {
    it('should preserve original Error as cause', () => {
      const original = new Error('root');
      const result = classifyError(original);
      expect(result.cause).toBe(original);
    });

    it('should not set cause for non-Error values', () => {
      const result = classifyError('string error');
      expect(result.cause).toBeUndefined();
    });
  });
});
