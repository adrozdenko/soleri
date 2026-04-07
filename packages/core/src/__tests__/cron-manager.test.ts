import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
let currentPlatform: 'darwin' | 'linux' | 'win32' = 'darwin';

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
  platform: vi.fn(() => currentPlatform),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn((path: string) => files.has(path)),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((path: string) => {
      if (!files.has(path)) throw new Error('ENOENT');
      return files.get(path)!;
    }),
    writeFileSync: vi.fn((path: string, content: string) => {
      files.set(path, content);
    }),
    rmSync: vi.fn((path: string) => {
      files.delete(path);
    }),
  };
});

vi.mock('../scheduler/platform-macos.js', () => ({
  createMacOSTask: vi.fn(() => 'com.soleri.dream'),
  macOSPlatformIdForName: vi.fn((name: string) => `com.soleri.${name}`),
  macOSTaskExists: vi.fn(() => true),
  removeMacOSTask: vi.fn(),
}));

vi.mock('../scheduler/platform-linux.js', () => ({
  createLinuxTask: vi.fn(() => 'soleri-dream'),
  linuxPlatformIdForName: vi.fn((name: string) => `soleri-${name}`),
  linuxTaskExists: vi.fn(() => true),
  removeLinuxTask: vi.fn(),
}));

import { getSchedule, schedule, unschedule } from '../dream/cron-manager.js';
import { macOSTaskExists, removeMacOSTask } from '../scheduler/platform-macos.js';
import { createLinuxTask, removeLinuxTask } from '../scheduler/platform-linux.js';

const METADATA_PATH = '/home/test/.soleri/dream-schedule.json';
const LOG_PATH = '/home/test/.soleri/logs/scheduler/dream.log';

describe('cron-manager', () => {
  beforeEach(() => {
    files.clear();
    currentPlatform = 'darwin';
    vi.clearAllMocks();
    vi.mocked(macOSTaskExists).mockReturnValue(true);
  });

  describe('getSchedule()', () => {
    it('returns unscheduled when no metadata exists', () => {
      const result = getSchedule();
      expect(result.isScheduled).toBe(false);
      expect(result.time).toBeNull();
      expect(result.projectDir).toBeNull();
    });

    it('returns schedule from metadata when platform task exists', () => {
      files.set(
        METADATA_PATH,
        JSON.stringify({
          version: 1,
          time: '22:03',
          projectDir: '/repo',
          cronExpression: '3 22 * * *',
          platformId: 'com.soleri.dream',
        }),
      );

      const result = getSchedule();
      expect(result.isScheduled).toBe(true);
      expect(result.time).toBe('22:03');
      expect(result.projectDir).toBe('/repo');
      expect(result.logPath).toBe(LOG_PATH);
    });

    it('clears stale metadata when platform task no longer exists', () => {
      files.set(
        METADATA_PATH,
        JSON.stringify({
          version: 1,
          time: '22:03',
          projectDir: '/repo',
          cronExpression: '3 22 * * *',
          platformId: 'com.soleri.dream',
        }),
      );
      vi.mocked(macOSTaskExists).mockReturnValue(false);

      const result = getSchedule();
      expect(result.isScheduled).toBe(false);
      expect(files.has(METADATA_PATH)).toBe(false);
    });
  });

  describe('schedule()', () => {
    it('returns unscheduled for invalid time', () => {
      const result = schedule('invalid', '/repo');
      expect(result.isScheduled).toBe(false);
    });

    it('schedules dream task and persists metadata', () => {
      const result = schedule('22:00', '/repo');
      expect(result.isScheduled).toBe(true);
      expect(result.time).toBe('22:03');
      expect(result.projectDir).toBe('/repo');
      expect(result.logPath).toBe(LOG_PATH);
      expect(files.has(METADATA_PATH)).toBe(true);
      const stored = JSON.parse(files.get(METADATA_PATH)!) as Record<string, string>;
      expect(stored['cronExpression']).toBe('3 22 * * *');
    });

    it('uses linux scheduler helpers on linux', () => {
      currentPlatform = 'linux';
      const result = schedule('08:30', '/repo');
      expect(result.isScheduled).toBe(true);
      expect(createLinuxTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('unschedule()', () => {
    it('removes scheduler task and metadata', () => {
      files.set(
        METADATA_PATH,
        JSON.stringify({
          version: 1,
          time: '22:03',
          projectDir: '/repo',
          cronExpression: '3 22 * * *',
          platformId: 'com.soleri.dream',
        }),
      );

      const result = unschedule();
      expect(result.isScheduled).toBe(false);
      expect(removeMacOSTask).toHaveBeenCalledWith('com.soleri.dream');
      expect(files.has(METADATA_PATH)).toBe(false);
    });

    it('is best-effort when no metadata exists', () => {
      currentPlatform = 'linux';
      const result = unschedule();
      expect(result.isScheduled).toBe(false);
      expect(removeLinuxTask).toHaveBeenCalledWith('soleri-dream');
    });
  });
});
