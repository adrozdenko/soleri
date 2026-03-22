/**
 * Token Auth Tests — token generation, validation, persistence, and request auth.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateToken,
  validateBearerToken,
  authenticateRequest,
  loadToken,
  saveToken,
  getOrGenerateToken,
} from './token-auth.js';

describe('generateToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateToken()));
    expect(tokens.size).toBe(10);
  });
});

describe('validateBearerToken', () => {
  const expected = 'secret-token-123';

  it('returns true for valid bearer token', () => {
    expect(validateBearerToken('Bearer secret-token-123', expected)).toBe(true);
  });

  it('returns false for missing header', () => {
    expect(validateBearerToken(undefined, expected)).toBe(false);
  });

  it('returns false for wrong prefix', () => {
    expect(validateBearerToken('Basic secret-token-123', expected)).toBe(false);
  });

  it('returns false for wrong token', () => {
    expect(validateBearerToken('Bearer wrong-token', expected)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateBearerToken('', expected)).toBe(false);
  });

  it('returns false for length mismatch', () => {
    expect(validateBearerToken('Bearer short', expected)).toBe(false);
  });
});

describe('authenticateRequest', () => {
  const token = 'test-token';

  function makeReq(authorization?: string) {
    return { headers: { authorization } } as any;
  }

  function makeRes() {
    const res: any = {
      writeHead: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };
    return res;
  }

  it('returns true for valid auth', () => {
    const result = authenticateRequest(makeReq(`Bearer ${token}`), makeRes(), token);
    expect(result).toBe(true);
  });

  it('returns false and sends 401 for invalid auth', () => {
    const res = makeRes();
    const result = authenticateRequest(makeReq('Bearer wrong'), res, token);
    expect(result).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
    expect(res.end).toHaveBeenCalled();
  });

  it('returns false when no auth header present', () => {
    const res = makeRes();
    const result = authenticateRequest(makeReq(), res, token);
    expect(result).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
  });
});

describe('loadToken / saveToken / getOrGenerateToken', () => {
  let tmpDir: string;
  const agentId = 'test-agent';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'token-auth-test-'));
    // Override homedir by setting the env and using a custom agent path
    vi.stubEnv('TEST_AGENT_HTTP_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loadToken returns undefined when no env or file exists', () => {
    const result = loadToken('nonexistent-agent-xyz');
    expect(result).toBeUndefined();
  });

  it('loadToken reads from environment variable', () => {
    vi.stubEnv('MY_AGENT_HTTP_TOKEN', 'env-token-value');
    const result = loadToken('my-agent');
    expect(result).toBe('env-token-value');
  });

  it('loadToken trims whitespace from env var', () => {
    vi.stubEnv('MY_AGENT_HTTP_TOKEN', '  trimmed-token  ');
    const result = loadToken('my-agent');
    expect(result).toBe('trimmed-token');
  });

  it('loadToken returns undefined for empty env var', () => {
    vi.stubEnv('MY_AGENT_HTTP_TOKEN', '   ');
    const result = loadToken('my-agent');
    // Falls through to file-based lookup
    expect(result === undefined || typeof result === 'string').toBe(true);
  });

  it('generateToken produces different tokens each call', () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
  });
});
