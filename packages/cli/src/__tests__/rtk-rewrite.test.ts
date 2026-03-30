import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

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
): { stdout: string; exitCode: number } {
  try {
    const payload = makePayload(command, extra);
    const stdout = execSync(`printf '%s' '${payload.replace(/'/g, "'\\''")}' | sh '${SCRIPT}'`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', exitCode: err.status ?? 1 };
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
