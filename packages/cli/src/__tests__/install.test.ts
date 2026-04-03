import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { toPosix, getNextStepMessage, resolveEngineBin } from '../commands/install.js';

// Mock @clack/prompts to suppress console output during tests
vi.mock('@clack/prompts', () => ({
  log: {
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('toPosix', () => {
  it('converts backslashes to forward slashes', () => {
    expect(toPosix('C:\\Users\\foo\\agent.yaml')).toBe('C:/Users/foo/agent.yaml');
  });

  it('leaves forward slashes unchanged', () => {
    expect(toPosix('/home/user/agent.yaml')).toBe('/home/user/agent.yaml');
  });

  it('handles mixed separators', () => {
    expect(toPosix('C:\\Users/foo\\bar/agent.yaml')).toBe('C:/Users/foo/bar/agent.yaml');
  });

  it('handles empty string', () => {
    expect(toPosix('')).toBe('');
  });
});

describe('getNextStepMessage', () => {
  it('returns Claude-specific instruction', () => {
    const msg = getNextStepMessage('claude');
    expect(msg).toContain('Claude Code');
    expect(msg).toContain('/mcp');
  });

  it('returns Codex-specific instruction', () => {
    const msg = getNextStepMessage('codex');
    expect(msg).toContain('Codex');
    expect(msg).toContain('new Codex conversation');
  });

  it('returns OpenCode-specific instruction', () => {
    const msg = getNextStepMessage('opencode');
    expect(msg).toContain('OpenCode');
  });

  it('returns instructions for all targets when target is "all"', () => {
    const msg = getNextStepMessage('all');
    expect(msg).toContain('Claude Code');
    expect(msg).toContain('Codex');
    expect(msg).toContain('OpenCode');
  });

  it('returns instructions for all targets when target is "both"', () => {
    const msg = getNextStepMessage('both');
    expect(msg).toContain('Claude Code');
    expect(msg).toContain('Codex');
    expect(msg).toContain('OpenCode');
  });

  it('falls back to Claude instructions for unknown target', () => {
    const msg = getNextStepMessage('unknown-target');
    expect(msg).toContain('Claude Code');
  });
});

describe('resolveEngineBin', () => {
  it('returns an object with command and bin fields', () => {
    const result = resolveEngineBin();
    expect(result).toHaveProperty('command');
    expect(result).toHaveProperty('bin');
    expect(['node', 'npx']).toContain(result.command);
  });
});

describe('npx fallback warning', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('node:module');
  });

  it('returns npx fallback when core resolution fails', async () => {
    vi.doMock('node:module', async () => {
      const actual = await vi.importActual<typeof import('node:module')>('node:module');
      return {
        ...actual,
        createRequire: () =>
          ({
            resolve: () => {
              throw new Error('MODULE_NOT_FOUND');
            },
          }) as ReturnType<typeof import('node:module').createRequire>,
      };
    });

    const { resolveEngineBin: resolveEngineBinFresh } = await import('../commands/install.js');
    const result = resolveEngineBinFresh();
    expect(result.command).toBe('npx');
    expect(typeof result.bin).toBe('string');
  });
});

describe('installClaude path normalization', () => {
  let tempDir: string;
  let originalHome: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-install-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    originalHome = process.env.HOME ?? '';
    // Point homedir() to our temp dir so ~/.claude.json lands there
    process.env.HOME = tempDir;
    // Windows uses USERPROFILE instead of HOME
    process.env.USERPROFILE = tempDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalHome) process.env.USERPROFILE = originalHome;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should not contain backslashes in written config paths (file-tree agent)', async () => {
    // Dynamic import to pick up the mocked homedir
    const { installClaude } = await import('../commands/install.js');

    // Simulate a Windows-style path
    const fakeAgentDir = 'C:\\Users\\testuser\\my-agent';
    installClaude('test-agent', fakeAgentDir, true);

    const configPath = join(tempDir, '.claude.json');
    const raw = readFileSync(configPath, 'utf-8');

    // The raw JSON should not contain any backslash-based paths
    // (backslashes in JSON would appear as \\ in the raw string)
    const config = JSON.parse(raw);
    const entry = config.mcpServers['test-agent'];
    for (const arg of entry.args as string[]) {
      expect(arg).not.toContain('\\');
    }
  });

  it('should not contain backslashes in written config paths (legacy agent)', async () => {
    const { installClaude } = await import('../commands/install.js');

    const fakeAgentDir = 'C:\\Users\\testuser\\my-agent';
    installClaude('test-agent', fakeAgentDir, false);

    const configPath = join(tempDir, '.claude.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const entry = config.mcpServers['test-agent'];
    for (const arg of entry.args as string[]) {
      expect(arg).not.toContain('\\');
    }
  });
});
