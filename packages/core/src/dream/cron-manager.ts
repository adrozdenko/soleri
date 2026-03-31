import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CRON_TAG = '# soleri:dream';
const SOLERI_DIR = join(homedir(), '.soleri');
const LOG_PATH = join(SOLERI_DIR, 'dream-cron.log');

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

function getCurrentCrontab(): string {
  try {
    return execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

function writeCrontab(content: string): void {
  execSync(`echo ${JSON.stringify(content)} | crontab -`, { encoding: 'utf-8' });
}

function resolveClaudePath(): string {
  try {
    const result = execSync('which claude 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (result) return result;
  } catch {
    // fall through to default
  }
  return join(homedir(), '.claude', 'local', 'claude');
}

function parseDreamLine(line: string): { minute: string; hour: string; projectDir: string } | null {
  if (!line.includes(CRON_TAG)) return null;
  const parts = line.trim().split(/\s+/);
  if (parts.length < 6) return null;
  const minute = parts[0];
  const hour = parts[1];
  // Extract --project-dir value from the line
  const projDirMatch = line.match(/--project-dir\s+(\S+)/);
  const projectDir = projDirMatch ? projDirMatch[1] : '';
  return { minute, hour, projectDir };
}

export function getSchedule(): CronSchedule {
  try {
    const crontab = getCurrentCrontab();
    const dreamLine = crontab.split('\n').find((l) => l.includes(CRON_TAG));
    if (!dreamLine) {
      return { isScheduled: false, time: null, logPath: null, projectDir: null };
    }
    const parsed = parseDreamLine(dreamLine);
    if (!parsed) {
      return { isScheduled: false, time: null, logPath: null, projectDir: null };
    }
    const time = `${parsed.hour.padStart(2, '0')}:${parsed.minute.padStart(2, '0')}`;
    return {
      isScheduled: true,
      time,
      logPath: LOG_PATH,
      projectDir: parsed.projectDir || null,
    };
  } catch {
    return { isScheduled: false, time: null, logPath: null, projectDir: null };
  }
}

export function schedule(time: string, projectDir: string): CronSchedule {
  ensureSoleriDir();

  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { isScheduled: false, time: null, logPath: null, projectDir: null };
  }

  const hour = parseInt(match[1], 10);
  let minute = parseInt(match[2], 10);

  // Add a few minutes offset to avoid running exactly on the hour
  if (minute === 0) {
    minute = 3;
  }

  const claudePath = resolveClaudePath();
  const cronLine = `${minute} ${hour} * * * ${claudePath} --dangerously-skip-permissions -p "Run /ernesto-dream" --project-dir ${projectDir} >> ${LOG_PATH} 2>&1 ${CRON_TAG}`;

  try {
    const crontab = getCurrentCrontab();
    // Remove any existing dream lines (idempotent)
    const filtered = crontab
      .split('\n')
      .filter((l) => !l.includes(CRON_TAG))
      .join('\n');

    const newCrontab = filtered.endsWith('\n')
      ? `${filtered}${cronLine}\n`
      : `${filtered}\n${cronLine}\n`;
    writeCrontab(newCrontab);

    const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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
  try {
    const crontab = getCurrentCrontab();
    const filtered = crontab
      .split('\n')
      .filter((l) => !l.includes(CRON_TAG))
      .join('\n');

    writeCrontab(filtered);
  } catch {
    // Graceful degradation — if crontab fails, just return unscheduled
  }
  return { isScheduled: false, time: null, logPath: null, projectDir: null };
}
