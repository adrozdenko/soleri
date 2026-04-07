import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import {
  createMacOSTask,
  macOSPlatformIdForName,
  macOSTaskExists,
  removeMacOSTask,
} from '../scheduler/platform-macos.js';
import {
  createLinuxTask,
  linuxPlatformIdForName,
  linuxTaskExists,
  removeLinuxTask,
} from '../scheduler/platform-linux.js';
import type { ScheduledTask } from '../scheduler/types.js';

const DREAM_TASK_NAME = 'dream';
const SOLERI_DIR = join(homedir(), '.soleri');
const LOG_PATH = join(SOLERI_DIR, 'logs', 'scheduler', `${DREAM_TASK_NAME}.log`);
const METADATA_PATH = join(SOLERI_DIR, 'dream-schedule.json');

interface DreamScheduleMetadata {
  version: 1;
  time: string;
  projectDir: string;
  cronExpression: string;
  platformId: string;
}

export interface CronSchedule {
  isScheduled: boolean;
  time: string | null;
  logPath: string | null;
  projectDir: string | null;
}

function ensureSoleriDir(): void {
  if (!existsSync(SOLERI_DIR)) {
    mkdirSync(SOLERI_DIR, { recursive: true });
  }
}

function readMetadata(): DreamScheduleMetadata | null {
  if (!existsSync(METADATA_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(METADATA_PATH, 'utf-8')) as Partial<DreamScheduleMetadata>;
    if (
      raw.version !== 1 ||
      typeof raw.time !== 'string' ||
      typeof raw.projectDir !== 'string' ||
      typeof raw.cronExpression !== 'string' ||
      typeof raw.platformId !== 'string'
    ) {
      return null;
    }
    return {
      version: 1,
      time: raw.time,
      projectDir: raw.projectDir,
      cronExpression: raw.cronExpression,
      platformId: raw.platformId,
    };
  } catch {
    return null;
  }
}

function writeMetadata(data: DreamScheduleMetadata): void {
  ensureSoleriDir();
  writeFileSync(METADATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function clearMetadata(): void {
  if (existsSync(METADATA_PATH)) rmSync(METADATA_PATH);
}

function parseTime(time: string): { hour: number; minute: number } | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function toCronExpression(hour: number, minute: number): string {
  return `${minute} ${hour} * * *`;
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function buildDreamTask(cronExpression: string, projectDir: string): ScheduledTask {
  return {
    id: `sched-dream-${Date.now()}`,
    name: DREAM_TASK_NAME,
    cronExpression,
    prompt: 'Run /ernesto-dream',
    dangerouslySkipPermissions: true,
    projectPath: projectDir,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

function platformIdForDream(): string | null {
  const os = platform();
  if (os === 'darwin') return macOSPlatformIdForName(DREAM_TASK_NAME);
  if (os === 'linux') return linuxPlatformIdForName(DREAM_TASK_NAME);
  return null;
}

function createDreamTask(task: ScheduledTask): string | null {
  const os = platform();
  if (os === 'darwin') return createMacOSTask(task);
  if (os === 'linux') return createLinuxTask(task);
  return null;
}

function removeDreamTask(platformId: string): void {
  const os = platform();
  if (os === 'darwin') {
    removeMacOSTask(platformId);
    return;
  }
  if (os === 'linux') {
    removeLinuxTask(platformId);
  }
}

function dreamTaskExists(platformId: string): boolean {
  const os = platform();
  if (os === 'darwin') return macOSTaskExists(platformId);
  if (os === 'linux') return linuxTaskExists(platformId);
  return false;
}

export function getSchedule(): CronSchedule {
  const meta = readMetadata();
  if (!meta) {
    return { isScheduled: false, time: null, logPath: null, projectDir: null };
  }

  if (!dreamTaskExists(meta.platformId)) {
    clearMetadata();
    return { isScheduled: false, time: null, logPath: null, projectDir: null };
  }

  return {
    isScheduled: true,
    time: meta.time,
    logPath: LOG_PATH,
    projectDir: meta.projectDir,
  };
}

export function schedule(time: string, projectDir: string): CronSchedule {
  const parsed = parseTime(time);
  if (!parsed) return { isScheduled: false, time: null, logPath: null, projectDir: null };

  // Keep historical behavior: avoid :00 to reduce top-of-hour contention.
  const minute = parsed.minute === 0 ? 3 : parsed.minute;
  const formattedTime = formatTime(parsed.hour, minute);
  const cronExpression = toCronExpression(parsed.hour, minute);

  const platformId = platformIdForDream();
  if (!platformId) return { isScheduled: false, time: null, logPath: null, projectDir: null };

  // Idempotent replace.
  try {
    removeDreamTask(platformId);
  } catch {
    // Best effort
  }

  try {
    const task = buildDreamTask(cronExpression, projectDir);
    const createdPlatformId = createDreamTask(task);
    if (!createdPlatformId) {
      return { isScheduled: false, time: null, logPath: null, projectDir: null };
    }

    writeMetadata({
      version: 1,
      time: formattedTime,
      projectDir,
      cronExpression,
      platformId: createdPlatformId,
    });

    return {
      isScheduled: true,
      time: formattedTime,
      logPath: LOG_PATH,
      projectDir,
    };
  } catch {
    return { isScheduled: false, time: null, logPath: null, projectDir: null };
  }
}

export function unschedule(): CronSchedule {
  const meta = readMetadata();
  const platformId = meta?.platformId ?? platformIdForDream();

  if (platformId) {
    try {
      removeDreamTask(platformId);
    } catch {
      // Best effort
    }
  }

  clearMetadata();
  return { isScheduled: false, time: null, logPath: null, projectDir: null };
}
