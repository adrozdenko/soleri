/**
 * Linux platform adapter — uses systemd user timers for scheduling.
 *
 * Creates ~/.config/systemd/user/{name}.timer and {name}.service units.
 */

import { existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { PlatformAdapter, ScheduledTask } from './types.js';

const SYSTEMD_USER_DIR = join(homedir(), '.config', 'systemd', 'user');

function unitPath(name: string, ext: 'service' | 'timer'): string {
  return join(SYSTEMD_USER_DIR, `soleri-${name}.${ext}`);
}

/** Convert a 5-field cron to systemd OnCalendar format (simplified). */
function cronToOnCalendar(cron: string): string {
  const [minute, hour, day, month, weekday] = cron.split(/\s+/);

  // Simplified: only handle fixed values and */N patterns
  const d = day === '*' ? '*' : day;
  const M = month === '*' ? '*' : month;
  const dow = weekday === '*' ? '*' : weekday;
  const h = hour === '*' ? '*' : hour.startsWith('*/') ? `*/${hour.slice(2)}` : hour;
  const m = minute === '*' ? '*' : minute;

  return `${dow === '*' ? '' : dowName(dow)}*-${M}-${d} ${h}:${m}:00`;
}

function dowName(dow: string): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const n = Number(dow);
  return isNaN(n) ? dow : (names[n % 7] ?? '*');
}

function buildService(task: ScheduledTask, logPath: string): string {
  return `[Unit]
Description=Soleri scheduled task: ${task.name}

[Service]
Type=oneshot
ExecStart=/usr/local/bin/claude -p "${task.prompt.replace(/"/g, '\\"')}" --project-dir ${task.projectPath}
WorkingDirectory=${task.projectPath}
StandardOutput=append:${logPath}.log
StandardError=append:${logPath}.err
TimeoutStartSec=600
`;
}

function buildTimer(task: ScheduledTask): string {
  return `[Unit]
Description=Soleri timer for task: ${task.name}

[Timer]
OnCalendar=${cronToOnCalendar(task.cronExpression)}
Persistent=true

[Install]
WantedBy=timers.target
`;
}

export class LinuxAdapter implements PlatformAdapter {
  async create(task: ScheduledTask): Promise<string> {
    mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
    const logDir = join(homedir(), '.soleri', 'logs', 'scheduler');
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, task.name);

    writeFileSync(unitPath(task.name, 'service'), buildService(task, logPath), 'utf-8');
    writeFileSync(unitPath(task.name, 'timer'), buildTimer(task), 'utf-8');

    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe' });

    if (task.enabled) {
      execFileSync('systemctl', ['--user', 'enable', '--now', `soleri-${task.name}.timer`], {
        stdio: 'pipe',
      });
    }

    return `soleri-${task.name}`;
  }

  async remove(platformId: string): Promise<void> {
    try {
      execFileSync('systemctl', ['--user', 'disable', '--now', `${platformId}.timer`], {
        stdio: 'pipe',
      });
    } catch {
      // OK — may not exist
    }
    const name = platformId.replace(/^soleri-/, '');
    for (const ext of ['service', 'timer'] as const) {
      const path = unitPath(name, ext);
      if (existsSync(path)) rmSync(path);
    }
    try {
      execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe' });
    } catch {
      // Best-effort
    }
  }

  async exists(platformId: string): Promise<boolean> {
    const name = platformId.replace(/^soleri-/, '');
    return existsSync(unitPath(name, 'timer'));
  }

  async pause(platformId: string): Promise<void> {
    execFileSync('systemctl', ['--user', 'disable', `${platformId}.timer`], { stdio: 'pipe' });
    execFileSync('systemctl', ['--user', 'stop', `${platformId}.timer`], { stdio: 'pipe' });
  }

  async resume(platformId: string): Promise<void> {
    execFileSync('systemctl', ['--user', 'enable', '--now', `${platformId}.timer`], {
      stdio: 'pipe',
    });
  }
}
