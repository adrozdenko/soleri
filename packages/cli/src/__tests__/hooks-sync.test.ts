import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockSyncHooksToClaudeSettings = vi.fn();

vi.mock('@soleri/core', () => ({
  syncHooksToClaudeSettings: mockSyncHooksToClaudeSettings,
}));

const mockDetectAgent = vi.fn();

vi.mock('../utils/agent-context.js', () => ({
  detectAgent: mockDetectAgent,
}));

// Silence logger output during tests
vi.mock('../utils/logger.js', () => ({
  pass: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  dim: vi.fn(),
  heading: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

async function runSyncCommand(): Promise<void> {
  // Import after mocks are established
  const { registerHooks } = await import('../commands/hooks.js');
  const program = new Command();
  program.exitOverride(); // prevent process.exit from killing the test runner
  registerHooks(program);
  await program.parseAsync(['node', 'cli', 'hooks', 'sync']);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('hooks sync command', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('calls syncHooksToClaudeSettings with the agentId when detectAgent returns a valid context', async () => {
    mockDetectAgent.mockReturnValue({
      agentId: 'myagent',
      agentPath: '/some/path',
      format: 'typescript',
      packageName: 'myagent-mcp',
      hasBrain: false,
    });

    await runSyncCommand();

    expect(mockSyncHooksToClaudeSettings).toHaveBeenCalledTimes(1);
    expect(mockSyncHooksToClaudeSettings).toHaveBeenCalledWith('myagent');
  });

  it('does NOT call syncHooksToClaudeSettings and exits non-zero when detectAgent returns null', async () => {
    mockDetectAgent.mockReturnValue(null);

    let exitCode: number | undefined;
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: number | string | null) => {
        exitCode = typeof code === 'number' ? code : 1;
        throw new Error(`process.exit(${exitCode})`);
      });

    try {
      await runSyncCommand();
    } catch {
      // Expected — process.exit throws via our mock
    }

    expect(mockSyncHooksToClaudeSettings).not.toHaveBeenCalled();
    expect(exitCode).toBeGreaterThan(0);

    exitSpy.mockRestore();
  });

  it('calls syncHooksToClaudeSettings with correct agentId for a file-tree agent context', async () => {
    mockDetectAgent.mockReturnValue({
      agentId: 'my-filetree-agent',
      agentPath: '/path/to/agent',
      format: 'filetree',
      packageName: 'my-filetree-agent',
      hasBrain: true,
    });

    await runSyncCommand();

    expect(mockSyncHooksToClaudeSettings).toHaveBeenCalledTimes(1);
    expect(mockSyncHooksToClaudeSettings).toHaveBeenCalledWith('my-filetree-agent');
  });
});
