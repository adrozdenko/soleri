import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});

import { execSync } from 'node:child_process';
import { getSchedule, schedule, unschedule } from '../dream/cron-manager.js';

const mockExecSync = vi.mocked(execSync);

describe('cron-manager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getSchedule()', () => {
    it('returns isScheduled: false when no soleri:dream entry exists', () => {
      mockExecSync.mockReturnValue('0 * * * * /usr/bin/some-other-job\n' as never);
      const result = getSchedule();
      expect(result.isScheduled).toBe(false);
      expect(result.time).toBeNull();
    });

    it('returns isScheduled: false when crontab is empty', () => {
      mockExecSync.mockReturnValue('' as never);
      const result = getSchedule();
      expect(result.isScheduled).toBe(false);
    });

    it('parses existing soleri:dream entry correctly', () => {
      mockExecSync.mockReturnValue(
        '3 22 * * * /path/to/claude --dangerously-skip-permissions -p "Run /ernesto-dream" --project-dir /home/user/project >> /home/user/.soleri/dream-cron.log 2>&1 # soleri:dream\n' as never,
      );
      const result = getSchedule();
      expect(result.isScheduled).toBe(true);
      expect(result.time).toBe('22:03');
      expect(result.projectDir).toBe('/home/user/project');
    });

    it('handles crontab -l failure gracefully', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('no crontab for user');
      });
      const result = getSchedule();
      expect(result.isScheduled).toBe(false);
      expect(result.time).toBeNull();
    });
  });

  describe('schedule()', () => {
    it('adds entry to empty crontab', () => {
      mockExecSync
        .mockReturnValueOnce('' as never) // crontab -l
        .mockReturnValueOnce('/usr/local/bin/claude\n' as never) // which claude
        .mockReturnValueOnce('' as never); // echo ... | crontab -

      const result = schedule('22:00', '/home/user/project');
      expect(result.isScheduled).toBe(true);
      expect(result.time).toBe('22:03'); // :00 gets offset to :03
      expect(result.projectDir).toBe('/home/user/project');
    });

    it('replaces existing entry (idempotent)', () => {
      mockExecSync
        .mockReturnValueOnce(
          '3 22 * * * /old/claude --project-dir /old/path # soleri:dream\n' as never,
        )
        .mockReturnValueOnce('/usr/local/bin/claude\n' as never) // which claude
        .mockReturnValueOnce('' as never); // write crontab

      const result = schedule('08:30', '/new/project');
      expect(result.isScheduled).toBe(true);
      expect(result.time).toBe('08:30');
    });

    it('preserves other crontab entries', () => {
      mockExecSync
        .mockReturnValueOnce('0 8 * * 1-5 /usr/bin/backup # backup\n' as never)
        .mockReturnValueOnce('/usr/local/bin/claude\n' as never)
        .mockReturnValueOnce('' as never);

      schedule('22:00', '/home/user/project');

      // Third call is the echo ... | crontab - write
      expect(mockExecSync).toHaveBeenCalledTimes(3);
      const writeArg = String(mockExecSync.mock.calls[2][0]);
      expect(writeArg).toContain('backup');
      expect(writeArg).toContain('soleri:dream');
    });

    it('returns isScheduled: false on invalid time format', () => {
      const result = schedule('invalid', '/home/user/project');
      expect(result.isScheduled).toBe(false);
    });
  });

  describe('unschedule()', () => {
    it('removes only soleri:dream entries', () => {
      const crontab =
        '0 8 * * 1-5 /usr/bin/backup # backup\n3 22 * * * /path/claude # soleri:dream\n';
      mockExecSync
        .mockReturnValueOnce(crontab as never) // crontab -l
        .mockReturnValueOnce('' as never); // write crontab

      unschedule();

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const writeArg = String(mockExecSync.mock.calls[1][0]);
      expect(writeArg).toContain('backup');
      expect(writeArg).not.toContain('soleri:dream');
    });

    it('is safe when no entry exists', () => {
      mockExecSync.mockReturnValueOnce('' as never).mockReturnValueOnce('' as never);
      expect(() => unschedule()).not.toThrow();
    });

    it('is safe when crontab -l fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('no crontab for user');
      });
      expect(() => unschedule()).not.toThrow();
    });
  });
});
