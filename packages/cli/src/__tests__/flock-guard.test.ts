import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const SCRIPTS_DIR = join(__dirname, '..', 'hook-packs', 'flock-guard', 'scripts');
const PRE_SCRIPT = join(SCRIPTS_DIR, 'flock-guard-pre.sh');
const POST_SCRIPT = join(SCRIPTS_DIR, 'flock-guard-post.sh');

// The scripts use `git rev-parse --show-toplevel` which resolves to the repo root.
// Compute the same hash the scripts will produce.
const PROJECT_ROOT = execSync('git rev-parse --show-toplevel', {
  cwd: join(__dirname, '..'),
  encoding: 'utf-8',
}).trim();
const PROJECT_HASH = execSync(`printf '%s' '${PROJECT_ROOT}' | shasum | cut -c1-8`, {
  encoding: 'utf-8',
}).trim();
const LOCK_DIR = `/tmp/soleri-guard-${PROJECT_HASH}.lock`;

function makePayload(command: string): string {
  return JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
}

function runPre(
  command: string,
  env?: Record<string, string>,
): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(
      `printf '%s' '${escapeShell(makePayload(command))}' | sh '${PRE_SCRIPT}'`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        cwd: PROJECT_ROOT,
        env: { ...process.env, ...env },
      },
    );
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', exitCode: err.status ?? 1 };
  }
}

function runPost(
  command: string,
  env?: Record<string, string>,
): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(
      `printf '%s' '${escapeShell(makePayload(command))}' | sh '${POST_SCRIPT}'`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        cwd: PROJECT_ROOT,
        env: { ...process.env, ...env },
      },
    );
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', exitCode: err.status ?? 1 };
  }
}

function escapeShell(s: string): string {
  // Escape single quotes for use inside single-quoted shell string
  return s.replace(/'/g, "'\\''");
}

function cleanLock(): void {
  if (existsSync(LOCK_DIR)) {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}

describe('flock-guard hook pack', () => {
  afterEach(() => {
    cleanLock();
  });

  // 1. Pre: allows non-lockfile commands
  it('pre: allows non-lockfile commands (exit 0, no output)', () => {
    const { stdout, exitCode } = runPre('echo hello');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('');
    expect(existsSync(LOCK_DIR)).toBe(false);
  });

  // 2. Pre: acquires lock on npm install
  it('pre: acquires lock on npm install', () => {
    const sessionId = `test-acquire-${Date.now()}`;
    const { exitCode } = runPre('npm install', { CLAUDE_SESSION_ID: sessionId });
    expect(exitCode).toBe(0);
    expect(existsSync(LOCK_DIR)).toBe(true);
  });

  // 3. Pre: lock dir contains valid JSON with agentId and timestamp
  it('pre: lock dir contains valid JSON with agentId and timestamp', () => {
    const sessionId = `test-json-${Date.now()}`;
    runPre('npm install', { CLAUDE_SESSION_ID: sessionId });

    const lockJson = JSON.parse(readFileSync(join(LOCK_DIR, 'lock.json'), 'utf-8'));
    expect(lockJson).toHaveProperty('agentId', sessionId);
    expect(lockJson).toHaveProperty('timestamp');
    expect(typeof lockJson.timestamp).toBe('number');
    expect(lockJson.timestamp).toBeGreaterThan(0);
  });

  // 4. Post: releases lock after npm install
  it('post: releases lock after npm install', () => {
    const sessionId = `test-release-${Date.now()}`;
    runPre('npm install', { CLAUDE_SESSION_ID: sessionId });
    expect(existsSync(LOCK_DIR)).toBe(true);

    const { exitCode } = runPost('npm install', { CLAUDE_SESSION_ID: sessionId });
    expect(exitCode).toBe(0);
    expect(existsSync(LOCK_DIR)).toBe(false);
  });

  // 5. Pre: blocks when lock held by another agent
  it('pre: blocks when lock held by another agent', () => {
    // Manually create lock with a different agentId
    mkdirSync(LOCK_DIR, { recursive: true });
    const now = Math.floor(Date.now() / 1000);
    writeFileSync(
      join(LOCK_DIR, 'lock.json'),
      JSON.stringify({ agentId: 'other-agent-999', timestamp: now, command: 'npm install' }),
    );

    const mySession = `test-blocked-${Date.now()}`;
    const { stdout, exitCode } = runPre('npm install', { CLAUDE_SESSION_ID: mySession });

    // Script exits 0 but outputs JSON with continue: false
    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.trim());
    expect(output.continue).toBe(false);
    expect(output.stopReason).toContain('BLOCKED');
    expect(output.stopReason).toContain('other-agent-999');
  });

  // 6. Pre: cleans stale lock (timestamp older than 30s)
  it('pre: cleans stale lock and acquires', () => {
    mkdirSync(LOCK_DIR, { recursive: true });
    const staleTime = Math.floor(Date.now() / 1000) - 60; // 60s ago
    writeFileSync(
      join(LOCK_DIR, 'lock.json'),
      JSON.stringify({ agentId: 'stale-agent', timestamp: staleTime, command: 'npm install' }),
    );

    const mySession = `test-stale-${Date.now()}`;
    const { stdout, exitCode } = runPre('npm install', { CLAUDE_SESSION_ID: mySession });
    expect(exitCode).toBe(0);
    // Should not contain "continue: false" — lock was stale and cleaned
    if (stdout.trim()) {
      const output = JSON.parse(stdout.trim());
      expect(output.continue).not.toBe(false);
    }
    // Lock should now be held by our session
    expect(existsSync(LOCK_DIR)).toBe(true);
    const lockJson = JSON.parse(readFileSync(join(LOCK_DIR, 'lock.json'), 'utf-8'));
    expect(lockJson.agentId).toBe(mySession);
  });

  // 7. Pre: allows same agent reentry
  it('pre: allows same agent reentry', () => {
    const sessionId = `test-reentry-${Date.now()}`;
    const env = { CLAUDE_SESSION_ID: sessionId };

    // First acquisition
    const first = runPre('npm install', env);
    expect(first.exitCode).toBe(0);
    expect(existsSync(LOCK_DIR)).toBe(true);

    // Second acquisition with same session — should succeed (reentry)
    const second = runPre('npm install', env);
    expect(second.exitCode).toBe(0);
    // No "continue: false" in output
    if (second.stdout.trim()) {
      const output = JSON.parse(second.stdout.trim());
      expect(output.continue).not.toBe(false);
    }
  });

  // 8. Post: only releases own lock (does not release lock held by other agent)
  it('post: only releases own lock — does not remove lock held by another agent', () => {
    // Create lock with a different agent
    mkdirSync(LOCK_DIR, { recursive: true });
    const now = Math.floor(Date.now() / 1000);
    writeFileSync(
      join(LOCK_DIR, 'lock.json'),
      JSON.stringify({ agentId: 'other-agent-777', timestamp: now, command: 'npm install' }),
    );

    const mySession = `test-norelease-${Date.now()}`;
    const { exitCode } = runPost('npm install', { CLAUDE_SESSION_ID: mySession });
    expect(exitCode).toBe(0);
    // Lock dir should still exist — we don't own it
    expect(existsSync(LOCK_DIR)).toBe(true);
    const lockJson = JSON.parse(readFileSync(join(LOCK_DIR, 'lock.json'), 'utf-8'));
    expect(lockJson.agentId).toBe('other-agent-777');
  });

  // 9. Pre: detects other lockfile commands (yarn, pnpm, cargo, pip)
  it('pre: detects yarn, pnpm install, cargo build, pip install', () => {
    const commands = ['yarn', 'yarn install', 'pnpm install', 'cargo build', 'pip install'];
    for (const cmd of commands) {
      cleanLock();
      const sessionId = `test-detect-${Date.now()}`;
      const { exitCode } = runPre(cmd, { CLAUDE_SESSION_ID: sessionId });
      expect(exitCode).toBe(0);
      expect(existsSync(LOCK_DIR)).toBe(true);
      cleanLock();
    }
  });

  // 10. Post: ignores non-lockfile commands
  it('post: ignores non-lockfile commands (no crash, no lock interaction)', () => {
    const { exitCode, stdout } = runPost('echo hello');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('');
  });
});
