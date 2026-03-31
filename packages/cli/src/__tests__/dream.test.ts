import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// Mock @soleri/core before importing the command
vi.mock('@soleri/core', () => {
  const mockDreamEngine = {
    run: vi.fn().mockReturnValue({
      durationMs: 1234,
      duplicatesFound: 3,
      staleArchived: 2,
      contradictionsFound: 1,
      totalDreams: 5,
      timestamp: '2026-03-31T00:00:00.000Z',
    }),
    getStatus: vi.fn().mockReturnValue({
      sessionsSinceLastDream: 7,
      lastDreamAt: '2026-03-30T22:00:00.000Z',
      lastDreamDurationMs: 1234,
      totalDreams: 4,
      gateEligible: true,
    }),
  };

  return {
    DreamEngine: vi.fn().mockImplementation(() => mockDreamEngine),
    Vault: vi.fn().mockImplementation(() => ({
      getProvider: vi.fn().mockReturnValue({}),
      close: vi.fn(),
    })),
    Curator: vi.fn().mockImplementation(() => ({})),
    SOLERI_HOME: '/tmp/soleri-test',
    getSchedule: vi.fn().mockReturnValue({
      isScheduled: true,
      time: '22:00',
      logPath: '/tmp/soleri-test/dream-cron.log',
      projectDir: '/tmp/project',
    }),
    schedule: vi.fn().mockReturnValue({
      isScheduled: true,
      time: '22:03',
      logPath: '/tmp/soleri-test/dream-cron.log',
      projectDir: '/tmp/project',
    }),
    unschedule: vi.fn().mockReturnValue({
      isScheduled: false,
      time: null,
      logPath: null,
      projectDir: null,
    }),
  };
});

describe('dream command', () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    program.exitOverride(); // Prevent process.exit in tests
  });

  it('should register dream command with subcommands', async () => {
    const { registerDream } = await import('../commands/dream.js');
    registerDream(program);

    const dreamCmd = program.commands.find((c) => c.name() === 'dream');
    expect(dreamCmd).toBeDefined();
    expect(dreamCmd!.description()).toBeTruthy();

    // Check subcommands exist
    const subNames = dreamCmd!.commands.map((c) => c.name());
    expect(subNames).toContain('schedule');
    expect(subNames).toContain('unschedule');
    expect(subNames).toContain('status');
  });

  it('should have schedule subcommand with --time option', async () => {
    const { registerDream } = await import('../commands/dream.js');
    registerDream(program);

    const dreamCmd = program.commands.find((c) => c.name() === 'dream');
    const scheduleCmd = dreamCmd!.commands.find((c) => c.name() === 'schedule');
    expect(scheduleCmd).toBeDefined();

    // Verify --time option is registered
    const timeOption = scheduleCmd!.options.find((o) => o.long === '--time' || o.short === '-t');
    expect(timeOption).toBeDefined();
  });

  it('should register status subcommand', async () => {
    const { registerDream } = await import('../commands/dream.js');
    registerDream(program);

    const dreamCmd = program.commands.find((c) => c.name() === 'dream');
    const statusCmd = dreamCmd!.commands.find((c) => c.name() === 'status');
    expect(statusCmd).toBeDefined();
    expect(statusCmd!.description()).toBeTruthy();
  });

  it('should register unschedule subcommand', async () => {
    const { registerDream } = await import('../commands/dream.js');
    registerDream(program);

    const dreamCmd = program.commands.find((c) => c.name() === 'dream');
    const unscheduleCmd = dreamCmd!.commands.find((c) => c.name() === 'unschedule');
    expect(unscheduleCmd).toBeDefined();
    expect(unscheduleCmd!.description()).toBeTruthy();
  });

  it('should have dream as parent command with its own action', async () => {
    const { registerDream } = await import('../commands/dream.js');
    registerDream(program);

    const dreamCmd = program.commands.find((c) => c.name() === 'dream');
    expect(dreamCmd).toBeDefined();
    // The parent dream command should have a description indicating it runs consolidation
    expect(dreamCmd!.description()).toMatch(/dream|consolidat|memory/i);
  });
});
