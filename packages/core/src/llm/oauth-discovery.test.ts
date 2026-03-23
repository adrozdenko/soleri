import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ─── Mocks (must be before import) ──────────────────────────────────

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock/home'),
  platform: vi.fn(() => 'darwin'),
}));

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { platform } from 'node:os';
import './oauth-discovery.js';

// ─── discoverAnthropicToken ─────────────────────────────────────────

describe('discoverAnthropicToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset module-level cache by re-importing would be ideal, but
    // since the cache is module-scoped, we use resetModules + re-require.
    // Instead we'll work with the cache: first test sets it, subsequent
    // tests use the cached value. We use resetModules to clear between tests.
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('{}');
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });
    vi.mocked(platform).mockReturnValue('darwin');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // Since module cache persists across tests in the same file with vi.mock,
  // we need to re-import after resetModules. Use a helper.
  async function freshDiscover(): Promise<() => string | null> {
    const mod = await import('./oauth-discovery.js');
    return mod.discoverAnthropicToken;
  }

  it('should return env var when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    const discover = await freshDiscover();
    expect(discover()).toBe('sk-ant-test-key');
  });

  it('should return token from credentials file with claudeAiOauth format', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: 'oauth-token-123' } }),
    );
    const discover = await freshDiscover();
    expect(discover()).toBe('oauth-token-123');
  });

  it('should return token from credentials file with direct accessToken', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ accessToken: 'direct-token' }));
    const discover = await freshDiscover();
    expect(discover()).toBe('direct-token');
  });

  it('should return token from credentials file with apiKey field', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ apiKey: 'api-key-field' }));
    const discover = await freshDiscover();
    expect(discover()).toBe('api-key-field');
  });

  it('should try macOS keychain on darwin platform', async () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(execFileSync).mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: 'keychain-token' } }),
    );
    const discover = await freshDiscover();
    expect(discover()).toBe('keychain-token');
    expect(execFileSync).toHaveBeenCalledWith(
      'security',
      expect.arrayContaining(['find-generic-password']),
      expect.any(Object),
    );
  });

  it('should handle keychain returning non-JSON with regex fallback', async () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(execFileSync).mockReturnValue('{ truncated "accessToken": "regex-token" garbage');
    const discover = await freshDiscover();
    expect(discover()).toBe('regex-token');
  });

  it('should try Linux keyring on linux platform', async () => {
    vi.mocked(platform).mockReturnValue('linux');
    vi.mocked(execFileSync).mockReturnValue(
      JSON.stringify({ claudeAiOauth: { accessToken: 'linux-token' } }),
    );
    const discover = await freshDiscover();
    expect(discover()).toBe('linux-token');
    expect(execFileSync).toHaveBeenCalledWith(
      'secret-tool',
      expect.arrayContaining(['lookup', 'service', 'Claude Code']),
      expect.any(Object),
    );
  });

  it('should treat long raw string from Linux keyring as token', async () => {
    vi.mocked(platform).mockReturnValue('linux');
    vi.mocked(execFileSync).mockReturnValue(
      'a-long-raw-token-string-that-is-definitely-over-twenty-chars',
    );
    const discover = await freshDiscover();
    expect(discover()).toBe('a-long-raw-token-string-that-is-definitely-over-twenty-chars');
  });

  it('should return null when no token source is available', async () => {
    const discover = await freshDiscover();
    expect(discover()).toBeNull();
  });

  it('should return null on unsupported platform', async () => {
    vi.mocked(platform).mockReturnValue('win32');
    const discover = await freshDiscover();
    expect(discover()).toBeNull();
  });

  it('should handle credentials file read errors gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('permission denied');
    });
    const discover = await freshDiscover();
    expect(discover()).toBeNull();
  });

  it('should handle keychain errors gracefully', async () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('no keychain entry');
    });
    const discover = await freshDiscover();
    expect(discover()).toBeNull();
  });

  it('should handle empty keychain response', async () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(execFileSync).mockReturnValue('   ');
    const discover = await freshDiscover();
    expect(discover()).toBeNull();
  });

  it('should prioritize env var over credentials file', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ apiKey: 'file-key' }));
    const discover = await freshDiscover();
    expect(discover()).toBe('env-key');
  });

  it('should skip short raw strings from Linux keyring', async () => {
    vi.mocked(platform).mockReturnValue('linux');
    vi.mocked(execFileSync).mockReturnValue('short');
    const discover = await freshDiscover();
    expect(discover()).toBeNull();
  });
});
