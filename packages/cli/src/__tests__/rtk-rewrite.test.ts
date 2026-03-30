import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdtempSync, rmSync, existsSync, symlinkSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SCRIPTS_DIR = join(__dirname, '..', 'hook-packs', 'rtk', 'scripts');
const SCRIPT = join(SCRIPTS_DIR, 'rtk-rewrite.sh').replace(/\\/g, '/');

function makePayload(command: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command, ...extra },
  });
}

function runHook(
  command: string,
  extra?: Record<string, unknown>,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const payload = makePayload(command, extra);
    const result = execSync(`printf '%s' '${payload.replace(/'/g, "'\\''")}' | sh '${SCRIPT}'`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { stdout: result, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.status ?? 1 };
  }
}

// RTK and jq must be installed to run these tests.
const hasRtk = (() => {
  try {
    execSync('command -v rtk', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();

const hasJq = (() => {
  try {
    execSync('command -v jq', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();

const isWindows = process.platform === 'win32';

describe.skipIf(isWindows || !hasRtk || !hasJq)('rtk-rewrite hook script', () => {
  it('rewrites git status to rtk git status', () => {
    const { stdout, exitCode } = runHook('git status');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).not.toBe('');

    const output = JSON.parse(stdout.trim());
    expect(output.hookSpecificOutput).toBeDefined();
    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(output.hookSpecificOutput.updatedInput).toBeDefined();
    expect(output.hookSpecificOutput.updatedInput.command).toBe('rtk git status');
  });

  it('preserves original tool_input fields in updatedInput', () => {
    const { stdout } = runHook('git diff', { description: 'Show diff', timeout: 60000 });
    const output = JSON.parse(stdout.trim());
    expect(output.hookSpecificOutput.updatedInput.description).toBe('Show diff');
    expect(output.hookSpecificOutput.updatedInput.timeout).toBe(60000);
    expect(output.hookSpecificOutput.updatedInput.command).toBe('rtk git diff');
  });

  it('passes through non-rewritable commands (exit 0, no output)', () => {
    const { stdout, exitCode } = runHook('echo hello');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  it('passes through empty command', () => {
    const { stdout, exitCode } = runHook('');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  it('rewrites ls commands', () => {
    const { stdout } = runHook('ls -la');
    const output = JSON.parse(stdout.trim());
    expect(output.hookSpecificOutput.updatedInput.command).toMatch(/^rtk (ls|read)/);
  });

  it('rewrites git log commands', () => {
    const { stdout } = runHook('git log --oneline -5');
    const output = JSON.parse(stdout.trim());
    expect(output.hookSpecificOutput.updatedInput.command).toContain('rtk git log');
  });
});

/**
 * Build a PATH string that excludes specific commands by creating shadow
 * directories with symlinks to everything except the hidden commands.
 */
function buildPathWithout(hide: string[]): string {
  const originalDirs = (process.env.PATH || '').split(':');
  const resultDirs: string[] = [];

  for (const dir of originalDirs) {
    if (!existsSync(dir)) continue;

    // Check if this dir contains any of the commands we want to hide
    const hasHidden = hide.some((cmd) => existsSync(join(dir, cmd)));

    if (!hasHidden) {
      resultDirs.push(dir);
      continue;
    }

    // Create a shadow dir with symlinks to everything except hidden commands
    const shadowDir = mkdtempSync(join(tmpdir(), 'rtk-shadow-'));
    shadowDirsToCleanup.push(shadowDir);

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (hide.includes(entry)) continue;
        const src = join(dir, entry);
        const dst = join(shadowDir, entry);
        try {
          symlinkSync(src, dst);
        } catch {
          // Skip entries that fail (broken symlinks, permission issues)
        }
      }
    } catch {
      // If we can't read the dir, skip it
      continue;
    }

    resultDirs.push(shadowDir);
  }

  return resultDirs.join(':');
}

// Track shadow dirs for cleanup
let shadowDirsToCleanup: string[] = [];

describe.skipIf(isWindows)('rtk-rewrite dependency warnings', () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'rtk-warn-test-'));
    shadowDirsToCleanup = [];
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
    for (const d of shadowDirsToCleanup) {
      rmSync(d, { recursive: true, force: true });
    }
    shadowDirsToCleanup = [];
  });

  function runWithMissingDep(hide: string[]): {
    stdout: string;
    stderr: string;
    exitCode: number;
  } {
    const payload = makePayload('git status');
    const restrictedPath = buildPathWithout(hide);

    const result = spawnSync(
      'sh',
      ['-c', `printf '%s' '${payload.replace(/'/g, "'\\''")}' | sh '${SCRIPT}'`],
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: {
          PATH: restrictedPath,
          HOME: tempHome,
          TERM: process.env.TERM || 'xterm',
        },
      },
    );

    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    };
  }

  it('warns on stderr when jq is missing', () => {
    const { stdout, stderr, exitCode } = runWithMissingDep(['jq']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('');
    expect(stderr).toContain('[soleri:rtk] jq not found');
    expect(stderr).toContain('RTK hook disabled');
  });

  it('warns on stderr when rtk is missing', () => {
    if (!hasJq) return; // jq must be present for the rtk check to be reached
    const { stdout, stderr, exitCode } = runWithMissingDep(['rtk']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('');
    expect(stderr).toContain('[soleri:rtk] rtk not found');
    expect(stderr).toContain('RTK hook disabled');
  });

  it('suppresses warning on second run within same day', () => {
    // First run — should warn
    const first = runWithMissingDep(['jq']);
    expect(first.exitCode).toBe(0);
    expect(first.stderr).toContain('[soleri:rtk] jq not found');

    // Second run — flag file exists and is fresh, should suppress
    const second = runWithMissingDep(['jq']);
    expect(second.exitCode).toBe(0);
    expect(second.stderr.trim()).toBe('');
  });
});
