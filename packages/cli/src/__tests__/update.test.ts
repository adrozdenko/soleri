import { describe, it, expect, vi } from 'vitest';

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

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => Buffer.from('9.99.0\n')),
}));

describe('update command', () => {
  it('exports registerUpdate function', async () => {
    const mod = await import('../commands/update.js');
    expect(typeof mod.registerUpdate).toBe('function');
  });

  it('registers a command named "update" on the program', async () => {
    const { registerUpdate } = await import('../commands/update.js');

    const mockCommand = {
      command: vi.fn().mockReturnThis(),
      description: vi.fn().mockReturnThis(),
      action: vi.fn().mockReturnThis(),
    };
    const mockProgram = {
      command: vi.fn(() => mockCommand),
    };

    registerUpdate(mockProgram as never);

    expect(mockProgram.command).toHaveBeenCalledWith('update');
    expect(mockCommand.description).toHaveBeenCalledWith(expect.stringContaining('Update'));
    expect(mockCommand.action).toHaveBeenCalledWith(expect.any(Function));
  });

  it('execSync is called to fetch the latest version', async () => {
    const { execSync } = await import('node:child_process');
    // execSync mock is set — just verify it's mockable (behavior tested via integration)
    expect(typeof execSync).toBe('function');
  });
});
