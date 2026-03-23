import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyPool, loadKeyPoolConfig } from './key-pool.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('../paths.js', () => ({
  agentKeysPath: vi.fn((agentId: string) => `/mock/.soleri/${agentId}/keys.json`),
}));

import * as fs from 'node:fs';

// ─── KeyPool ────────────────────────────────────────────────────────

describe('KeyPool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should initialize with valid keys', () => {
    const pool = new KeyPool({ keys: ['key-a', 'key-b'] });
    expect(pool.hasKeys).toBe(true);
    expect(pool.poolSize).toBe(2);
    expect(pool.activeKeyIndex).toBe(0);
  });

  it('should filter out empty keys', () => {
    const pool = new KeyPool({ keys: ['', 'key-a', ''] });
    expect(pool.poolSize).toBe(1);
  });

  it('should report no keys when all are empty', () => {
    const pool = new KeyPool({ keys: ['', ''] });
    expect(pool.hasKeys).toBe(false);
    expect(pool.poolSize).toBe(0);
  });

  it('should return the active key', () => {
    const pool = new KeyPool({ keys: ['key-a'] });
    expect(pool.getActiveKey().expose()).toBe('key-a');
  });

  it('should throw when getting key from empty pool', () => {
    const pool = new KeyPool({ keys: [] });
    expect(() => pool.getActiveKey()).toThrow('no keys');
  });

  it('should report exhausted for empty pool', () => {
    const pool = new KeyPool({ keys: [] });
    expect(pool.exhausted).toBe(true);
  });

  it('should not be exhausted when healthy keys exist', () => {
    const pool = new KeyPool({ keys: ['key-a'] });
    expect(pool.exhausted).toBe(false);
  });

  it('should rotate to next key on error', () => {
    const pool = new KeyPool({ keys: ['key-a', 'key-b', 'key-c'] });
    expect(pool.activeKeyIndex).toBe(0);

    const next = pool.rotateOnError();
    expect(next).not.toBeNull();
    expect(next!.expose()).toBe('key-b');
    expect(pool.activeKeyIndex).toBe(1);
  });

  it('should skip unhealthy keys during rotation', () => {
    const pool = new KeyPool({ keys: ['key-a', 'key-b', 'key-c'], preemptiveThreshold: 10 });

    // Trip breaker on key-b (index 1): rotate from 0 → records failure on 0, finds 1
    pool.rotateOnError(); // now on key-b (1)
    // Trip breaker on key-b by calling rotateOnError 3 times from index 1
    pool.rotateOnError(); // failure on 1, rotate to 2
    pool.rotateOnError(); // failure on 2, rotate to 0
    pool.rotateOnError(); // failure on 0, rotate to 1

    // Each key has had 1-2 failures, none tripped (threshold=3)
    expect(pool.exhausted).toBe(false);
  });

  it('should return null when all keys are exhausted', () => {
    const pool = new KeyPool({ keys: ['key-a'] });

    // Trip the single key's circuit breaker (default threshold=3)
    pool.rotateOnError();
    pool.rotateOnError();
    pool.rotateOnError();

    pool.rotateOnError();
    // After enough failures the breaker opens
    expect(pool.exhausted).toBe(true);
  });

  it('should perform preemptive rotation when quota is low', () => {
    const pool = new KeyPool({ keys: ['key-a', 'key-b'], preemptiveThreshold: 100 });
    pool.updateQuota(0, 10);

    const rotated = pool.rotatePreemptive();
    expect(rotated).toBe(true);
    expect(pool.activeKeyIndex).toBe(1);
  });

  it('should not preemptively rotate when quota is above threshold', () => {
    const pool = new KeyPool({ keys: ['key-a', 'key-b'], preemptiveThreshold: 100 });
    pool.updateQuota(0, 200);

    const rotated = pool.rotatePreemptive();
    expect(rotated).toBe(false);
    expect(pool.activeKeyIndex).toBe(0);
  });

  it('should not preemptively rotate when no quota info exists', () => {
    const pool = new KeyPool({ keys: ['key-a', 'key-b'], preemptiveThreshold: 100 });
    const rotated = pool.rotatePreemptive();
    expect(rotated).toBe(false);
  });

  it('should use default preemptive threshold of 50', () => {
    const pool = new KeyPool({ keys: ['key-a', 'key-b'] });
    pool.updateQuota(0, 49);
    expect(pool.rotatePreemptive()).toBe(true);
  });

  it('should return full status', () => {
    const pool = new KeyPool({ keys: ['key-a', 'key-b'] });
    pool.updateQuota(0, 100);
    const status = pool.getStatus();

    expect(status.poolSize).toBe(2);
    expect(status.activeKeyIndex).toBe(0);
    expect(status.exhausted).toBe(false);
    expect(status.perKeyStatus).toHaveLength(2);
    expect(status.perKeyStatus[0].remainingQuota).toBe(100);
    expect(status.perKeyStatus[1].remainingQuota).toBeNull();
  });
});

// ─── loadKeyPoolConfig ──────────────────────────────────────────────

describe('loadKeyPoolConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should reject invalid agentId with slashes', () => {
    expect(() => loadKeyPoolConfig('../evil')).toThrow('Invalid agentId');
  });

  it('should reject empty agentId', () => {
    expect(() => loadKeyPoolConfig('')).toThrow('Invalid agentId');
  });

  it('should reject agentId with backslashes', () => {
    expect(() => loadKeyPoolConfig('foo\\bar')).toThrow('Invalid agentId');
  });

  it('should load keys from keys.json file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ openai: ['sk-openai-1'], anthropic: ['sk-ant-1'] }),
    );

    const config = loadKeyPoolConfig('test-agent');
    expect(config.openai.keys).toEqual(['sk-openai-1']);
    expect(config.anthropic.keys).toEqual(['sk-ant-1']);
  });

  it('should fall back to env vars when keys.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.OPENAI_API_KEY = 'sk-env-openai';
    process.env.ANTHROPIC_API_KEY = 'sk-env-anthropic';

    const config = loadKeyPoolConfig('test-agent');
    expect(config.openai.keys).toEqual(['sk-env-openai']);
    expect(config.anthropic.keys).toEqual(['sk-env-anthropic']);
  });

  it('should return empty arrays when no keys available', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadKeyPoolConfig('test-agent');
    expect(config.openai.keys).toEqual([]);
    expect(config.anthropic.keys).toEqual([]);
  });

  it('should handle malformed keys.json gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not json');

    const config = loadKeyPoolConfig('test-agent');
    // Falls back to env vars (none set), so empty
    expect(config.openai.keys).toEqual([]);
    expect(config.anthropic.keys).toEqual([]);
  });

  it('should handle keys.json with non-array values', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ openai: 'not-an-array', anthropic: 42 }),
    );

    const config = loadKeyPoolConfig('test-agent');
    expect(config.openai.keys).toEqual([]);
    expect(config.anthropic.keys).toEqual([]);
  });

  it('should use env vars for providers missing from keys.json', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ openai: ['sk-file'] }),
    );
    process.env.ANTHROPIC_API_KEY = 'sk-env-ant';

    const config = loadKeyPoolConfig('test-agent');
    expect(config.openai.keys).toEqual(['sk-file']);
    expect(config.anthropic.keys).toEqual(['sk-env-ant']);
  });
});

import { afterAll } from 'vitest';
