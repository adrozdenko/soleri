import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args) as unknown,
}));

import { probeClaudeCLI, resetClaudeCLIProbeCache } from './probe.js';

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

beforeEach(() => {
  spawnMock.mockReset();
  resetClaudeCLIProbeCache();
  delete process.env.SOLERI_DISABLE_CLAUDE_CLI;
  delete process.env.CLAUDE_CLI_PATH;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetClaudeCLIProbeCache();
});

describe('probeClaudeCLI', () => {
  it('returns unavailable immediately when SOLERI_DISABLE_CLAUDE_CLI=1, no spawn', async () => {
    process.env.SOLERI_DISABLE_CLAUDE_CLI = '1';

    const result = await probeClaudeCLI();

    expect(result.available).toBe(false);
    expect(result.error).toContain('SOLERI_DISABLE_CLAUDE_CLI');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns available with version when claude --version exits 0', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('1.2.3 (Claude Code)\n'));
      child.emit('close', 0);
    });

    const result = await probeClaudeCLI('/opt/bin/claude');

    expect(result.available).toBe(true);
    expect(result.version).toBe('1.2.3 (Claude Code)');
    expect(result.path).toBe('/opt/bin/claude');
    expect(spawnMock.mock.calls[0][0]).toBe('/opt/bin/claude');
    expect(spawnMock.mock.calls[0][1]).toEqual(['--version']);
  });

  it('returns unavailable with stderr when claude exits non-zero', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    setImmediate(() => {
      child.stderr.emit('data', Buffer.from('not authenticated'));
      child.emit('close', 2);
    });

    const result = await probeClaudeCLI('claude');

    expect(result.available).toBe(false);
    expect(result.error).toBe('not authenticated');
  });

  it('returns unavailable when spawn errors with ENOENT', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    setImmediate(() => child.emit('error', new Error('spawn claude ENOENT')));

    const result = await probeClaudeCLI('claude');

    expect(result.available).toBe(false);
    expect(result.error).toContain('ENOENT');
  });

  it('caches the result across calls (only one spawn)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('1.0\n'));
      child.emit('close', 0);
    });

    await probeClaudeCLI('claude');
    await probeClaudeCLI('claude');
    await probeClaudeCLI('claude');

    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('warns once with MCP PATH hint when claude is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    setImmediate(() => child.emit('error', new Error('ENOENT')));

    await probeClaudeCLI('claude');
    await probeClaudeCLI('claude');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('CLAUDE_CLI_PATH');
  });

  it('uses CLAUDE_CLI_PATH env var when binary arg omitted', async () => {
    process.env.CLAUDE_CLI_PATH = '/custom/path/claude';
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('1.0\n'));
      child.emit('close', 0);
    });

    await probeClaudeCLI();

    expect(spawnMock.mock.calls[0][0]).toBe('/custom/path/claude');
  });
});
