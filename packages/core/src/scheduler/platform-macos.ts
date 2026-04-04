/**
 * macOS platform adapter — uses launchd (LaunchAgents) for scheduling.
 *
 * Plist files are written to ~/Library/LaunchAgents/
 * and loaded/unloaded via launchctl.
 */

import { existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { PlatformAdapter, ScheduledTask } from './types.js';

const LAUNCH_AGENTS_DIR = join(homedir(), 'Library', 'LaunchAgents');

function plistPath(label: string): string {
  return join(LAUNCH_AGENTS_DIR, `${label}.plist`);
}

/** Convert a 5-field cron expression to launchd StartCalendarInterval. */
function cronToCalendarInterval(cron: string): Record<string, number>[] {
  const [minute, hour, day, month, weekday] = cron.split(/\s+/);

  const base: Record<string, number> = {};

  if (minute !== '*' && !minute.includes('/') && !minute.includes(',')) {
    base['Minute'] = Number(minute);
  }

  // Expand comma-separated hours
  const hours =
    hour === '*'
      ? null
      : hour.includes(',')
        ? hour.split(',').map(Number)
        : hour.startsWith('*/')
          ? null
          : [Number(hour)];

  if (!hours) {
    // No specific hours — return single interval with base
    return [base];
  }

  // Generate one calendar interval per hour
  return hours.map((h) => {
    const entry: Record<string, number> = { ...base, Hour: h };
    if (day !== '*' && !day.includes('/') && !day.includes(',')) entry['Day'] = Number(day);
    if (month !== '*' && !month.includes('/') && !month.includes(','))
      entry['Month'] = Number(month);
    if (weekday !== '*' && weekday !== '?' && !weekday.includes('/')) {
      entry['Weekday'] = Number(weekday) % 7; // launchd uses 0-6 (Sunday = 0)
    }
    return entry;
  });
}

function buildPlist(task: ScheduledTask, label: string): string {
  const intervals = cronToCalendarInterval(task.cronExpression);
  const logBase = join(homedir(), '.soleri', 'logs', 'scheduler', task.name);

  const intervalXml = intervals
    .map((interval) => {
      const keys = Object.entries(interval)
        .map(([k, v]) => `\t\t\t<key>${k}</key>\n\t\t\t<integer>${v}</integer>`)
        .join('\n');
      return `\t\t<dict>\n${keys}\n\t\t</dict>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${label}</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>/usr/local/bin/claude</string>
\t\t<string>-p</string>
\t\t<string>${task.prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</string>
\t\t<string>--project-dir</string>
\t\t<string>${task.projectPath}</string>
\t</array>
\t<key>WorkingDirectory</key>
\t<string>${task.projectPath}</string>
\t<key>StartCalendarInterval</key>
\t<array>
${intervalXml}
\t</array>
\t<key>StandardOutPath</key>
\t<string>${logBase}.log</string>
\t<key>StandardErrorPath</key>
\t<string>${logBase}.err</string>
\t<key>TimeOut</key>
\t<integer>600</integer>
\t<key>Disabled</key>
\t<${task.enabled ? 'false' : 'true'}/>
</dict>
</plist>
`;
}

export class MacOSAdapter implements PlatformAdapter {
  async create(task: ScheduledTask): Promise<string> {
    const label = `com.soleri.${task.name}`;
    mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
    mkdirSync(join(homedir(), '.soleri', 'logs', 'scheduler'), { recursive: true });

    const plist = buildPlist(task, label);
    writeFileSync(plistPath(label), plist, 'utf-8');

    try {
      // Unload first if it exists (idempotent update)
      execFileSync('launchctl', ['unload', plistPath(label)], { stdio: 'pipe' });
    } catch {
      // OK — not loaded yet
    }

    if (task.enabled) {
      execFileSync('launchctl', ['load', '-w', plistPath(label)], { stdio: 'pipe' });
    }

    return label;
  }

  async remove(platformId: string): Promise<void> {
    const path = plistPath(platformId);
    try {
      execFileSync('launchctl', ['unload', path], { stdio: 'pipe' });
    } catch {
      // OK — may not be loaded
    }
    if (existsSync(path)) {
      rmSync(path);
    }
  }

  async exists(platformId: string): Promise<boolean> {
    return existsSync(plistPath(platformId));
  }

  async pause(platformId: string): Promise<void> {
    execFileSync('launchctl', ['unload', plistPath(platformId)], { stdio: 'pipe' });
  }

  async resume(platformId: string): Promise<void> {
    execFileSync('launchctl', ['load', '-w', plistPath(platformId)], { stdio: 'pipe' });
  }
}
