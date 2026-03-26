/**
 * E2E Test: Flock Guard Hook Pack — Parallel Lock Contention
 *
 * Tests the flock-guard hook pack which prevents lockfile corruption
 * when multiple agents run in worktrees by using atomic mkdir-based locking.
 *
 * - Pack registration via CLI
 * - Lock acquisition / contention / release via direct script execution
 * - Edge cases (non-lockfile commands, reentrant locks)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const CLI_BIN = join(import.meta.dirname, '..', 'packages', 'cli', 'dist', 'main.js');
const REPO_ROOT = join(import.meta.dirname, '..');

const PRE_SCRIPT = join(
  REPO_ROOT,
  'packages',
  'cli',
  'src',
  'hook-packs',
  'flock-guard',
  'scripts',
  'flock-guard-pre.sh',
);
const POST_SCRIPT = join(
  REPO_ROOT,
  'packages',
  'cli',
  'src',
  'hook-packs',
  'flock-guard',
  'scripts',
  'flock-guard-post.sh',
);

/** Compute the lock dir path the same way the scripts do. */
function getLockDir(): string {
  const projectRoot = execSync('git rev-parse --show-toplevel', {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  }).trim();
  const hash = execSync(`printf '%s' "${projectRoot}" | shasum | cut -c1-8`, {
    encoding: 'utf-8',
  }).trim();
  return `/tmp/soleri-guard-${hash}.lock`;
}

function runCli(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}) {
  try {
    const result = execFileSync('node', [CLI_BIN, ...args], {
      cwd: options.cwd ?? process.cwd(),
      stdio: 'pipe',
      timeout: 60_000,
      env: { ...process.env, ...options.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    return { stdout: result.toString(), stderr: '', exitCode: 0 };
  } catch (err) {
    const error = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

/** Pipe JSON payload into a shell script and return stdout + exit code. */
function runScript(
  scriptPath: string,
  payload: Record<string, unknown>,
  sessionId: string,
): { stdout: string; exitCode: number } {
  const json = JSON.stringify(payload);
  try {
    const stdout = execSync(`printf '%s' '${json.replace(/'/g, "'\\''")}' | sh "${scriptPath}"`, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 10_000,
      env: { ...process.env, CLAUDE_SESSION_ID: sessionId },
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (error.stdout ?? '') + (error.stderr ?? ''),
      exitCode: error.status ?? 1,
    };
  }
}

const NPM_INSTALL_PAYLOAD = { tool_input: { command: 'npm install' } };
const ECHO_PAYLOAD = { tool_input: { command: 'echo hello' } };

describe('E2E: flock-guard hook pack', () => {
  let lockDir: string;

  beforeAll(() => {
    lockDir = getLockDir();
  });

  // Clean up lock dir before each test and after all tests
  beforeEach(() => {
    if (existsSync(lockDir)) {
      rmSync(lockDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (existsSync(lockDir)) {
      rmSync(lockDir, { recursive: true, force: true });
    }
  });

  // ─── Pack registration ──────────────────────────────────────────

  describe('pack structure', () => {
    it('manifest.json exists with correct name and lifecycle hooks', () => {
      const manifestPath = join(
        REPO_ROOT,
        'packages',
        'cli',
        'src',
        'hook-packs',
        'flock-guard',
        'manifest.json',
      );
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(manifest.name).toBe('flock-guard');
      expect(manifest.lifecycleHooks).toHaveLength(2);
      expect(manifest.lifecycleHooks[0].event).toBe('PreToolUse');
      expect(manifest.lifecycleHooks[0].matcher).toBe('Bash');
      expect(manifest.lifecycleHooks[1].event).toBe('PostToolUse');
      expect(manifest.lifecycleHooks[1].matcher).toBe('Bash');
    });

    it('pre and post scripts exist and are executable', () => {
      const { statSync } = require('node:fs');
      expect(existsSync(PRE_SCRIPT)).toBe(true);
      expect(existsSync(POST_SCRIPT)).toBe(true);
      // Check execute bit
      expect(statSync(PRE_SCRIPT).mode & 0o111).toBeGreaterThan(0);
      expect(statSync(POST_SCRIPT).mode & 0o111).toBeGreaterThan(0);
    });
  });

  // ─── Lock contention simulation ─────────────────────────────────

  describe('lock contention', () => {
    it('Agent A acquires lock', () => {
      const result = runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockDir)).toBe(true);
      expect(existsSync(join(lockDir, 'lock.json'))).toBe(true);

      const lockData = JSON.parse(readFileSync(join(lockDir, 'lock.json'), 'utf-8'));
      expect(lockData.agentId).toBe('agent-a');
    });

    it('Agent B is blocked while Agent A holds lock', () => {
      // Agent A acquires
      runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      expect(existsSync(lockDir)).toBe(true);

      // Agent B tries to acquire — should be blocked
      const result = runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-b');
      // The script outputs JSON with continue: false when blocked
      expect(result.stdout).toContain('"continue":');
      const output = JSON.parse(result.stdout.trim());
      expect(output.continue).toBe(false);
      expect(output.stopReason).toContain('BLOCKED');
      expect(output.stopReason).toContain('agent-a');
    });

    it('Agent A releases lock', () => {
      // Agent A acquires
      runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      expect(existsSync(lockDir)).toBe(true);

      // Agent A releases
      const result = runScript(POST_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockDir)).toBe(false);
    });

    it('Agent B acquires lock after Agent A releases', () => {
      // Agent A acquires then releases
      runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      runScript(POST_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      expect(existsSync(lockDir)).toBe(false);

      // Agent B acquires
      const result = runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-b');
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockDir)).toBe(true);

      const lockData = JSON.parse(readFileSync(join(lockDir, 'lock.json'), 'utf-8'));
      expect(lockData.agentId).toBe('agent-b');
    });

    it('Agent B releases lock cleanly', () => {
      // Full cycle: A acquires, A releases, B acquires, B releases
      runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      runScript(POST_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-b');
      expect(existsSync(lockDir)).toBe(true);

      const result = runScript(POST_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-b');
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockDir)).toBe(false);
    });
  });

  // ─── Edge cases ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('non-lockfile commands pass through without creating a lock', () => {
      const result = runScript(PRE_SCRIPT, ECHO_PAYLOAD, 'agent-a');
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockDir)).toBe(false);
    });

    it('same agent can re-enter lock (reentrant)', () => {
      // Agent A acquires
      runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      expect(existsSync(lockDir)).toBe(true);

      // Agent A acquires again — should succeed (reentrant)
      const result = runScript(PRE_SCRIPT, NPM_INSTALL_PAYLOAD, 'agent-a');
      expect(result.exitCode).toBe(0);
      // Lock should still be held by agent-a
      const lockData = JSON.parse(readFileSync(join(lockDir, 'lock.json'), 'utf-8'));
      expect(lockData.agentId).toBe('agent-a');
    });
  });
});
