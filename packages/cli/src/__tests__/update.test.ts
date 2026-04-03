import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @clack/prompts
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  log: {
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock child_process — hoisted, so update.ts always gets the mock
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Import after mocks are hoisted
import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import { registerUpdate } from '../commands/update.js';

/** Helper: capture the action handler from registerUpdate */
function captureAction(): () => Promise<void> {
  let action: (() => Promise<void>) | undefined;
  const mockProgram = {
    command: vi.fn(() => ({
      description: vi.fn().mockReturnThis(),
      action: vi.fn((fn: () => Promise<void>) => {
        action = fn;
        return { description: vi.fn(), action: vi.fn() };
      }),
    })),
  };
  registerUpdate(mockProgram as never);
  if (!action) throw new Error('action not registered');
  return action;
}

describe('update command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports registerUpdate function', () => {
    expect(typeof registerUpdate).toBe('function');
  });

  it('registers a command named "update" on the program', () => {
    const mockCommand = {
      command: vi.fn().mockReturnThis(),
      description: vi.fn().mockReturnThis(),
      action: vi.fn().mockReturnThis(),
    };
    const mockProgram = { command: vi.fn(() => mockCommand) };

    registerUpdate(mockProgram as never);

    expect(mockProgram.command).toHaveBeenCalledWith('update');
    expect(mockCommand.description).toHaveBeenCalledWith(expect.stringContaining('Update'));
    expect(mockCommand.action).toHaveBeenCalledWith(expect.any(Function));
  });

  it('prints already-on-latest when current version matches latest', async () => {
    // getCurrentVersion() reads ../../package.json → packages/cli/package.json.
    // Return the same version from npm view to trigger the "already on latest" branch.
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const { version } = req('../../package.json') as { version: string };
    vi.mocked(execSync).mockReturnValue(Buffer.from(`${version}\n`));

    const action = captureAction();
    await action();

    expect(p.log.success).toHaveBeenCalledWith(expect.stringContaining('Already on latest'));
  });

  it('prints "Updated" when an update is available and install succeeds', async () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(Buffer.from('9.99.0\n')) // npm view latest
      .mockReturnValueOnce(Buffer.from('')) // npm install -g (stdio: inherit path skipped)
      .mockReturnValueOnce(Buffer.from('9.99.0\n')); // npm view verify

    const action = captureAction();
    await action();

    expect(p.log.success).toHaveBeenCalledWith(expect.stringContaining('Updated'));
  });

  it('exits with code 1 when npm registry is unreachable', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('network error');
    });

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const action = captureAction();
    await action();

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
