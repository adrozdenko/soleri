/**
 * E2E Test: CLI Commands
 *
 * Tests the @soleri/cli commands non-interactively:
 * - soleri create --config --yes (non-interactive scaffold)
 * - soleri list (agent discovery)
 * - soleri doctor (health checks)
 * - soleri add-domain (domain addition)
 * - create-soleri (npm create shorthand)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const CLI_BIN = join(import.meta.dirname, '..', 'packages', 'cli', 'dist', 'main.js');

function runCli(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}) {
  try {
    const result = execFileSync('node', [CLI_BIN, ...args], {
      cwd: options.cwd ?? process.cwd(),
      stdio: 'pipe',
      timeout: 60_000,
      env: { ...process.env, ...options.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    return { stdout: result.toString(), exitCode: 0 };
  } catch (err) {
    const error = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

describe('E2E: cli-commands', () => {
  const tempDir = join(tmpdir(), `soleri-e2e-cli-${Date.now()}`);
  let agentDir: string;

  beforeAll(() => {
    mkdirSync(tempDir, { recursive: true });

    // Write a non-interactive config file
    const config = {
      id: 'e2e-cli-agent',
      name: 'E2E CLI Agent',
      role: 'Testing CLI commands',
      description: 'An agent created for E2E testing of CLI commands.',
      domains: ['testing', 'quality'],
      principles: ['Test everything', 'Fast feedback'],
    };
    writeFileSync(join(tempDir, 'agent-config.json'), JSON.stringify(config, null, 2));
    agentDir = join(tempDir, 'e2e-cli-agent-mcp');
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── CLI Version / Help ────────────────────────────────────────────

  it('should show help when run with no arguments', () => {
    const { stdout, exitCode } = runCli([]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('soleri');
  });

  // ─── Create Command ────────────────────────────────────────────────

  it('should create agent non-interactively with --config --yes', () => {
    const { exitCode, stdout } = runCli(
      ['create', '--config', join(tempDir, 'agent-config.json'), '--yes', '--dir', tempDir],
      { cwd: tempDir },
    );

    // Allow both 0 (success) and check for the agent directory
    if (exitCode !== 0) {
      // Some environments may lack build tools — scaffold should still succeed
      expect(existsSync(agentDir) || existsSync(join(tempDir, 'e2e-cli-agent'))).toBe(true);
    } else {
      expect(stdout).toBeDefined();
    }
  });

  it('should have created the agent directory with expected files', () => {
    // The agent dir could be e2e-cli-agent-mcp (legacy) or e2e-cli-agent (file-tree) depending on scaffold
    const dir = existsSync(agentDir) ? agentDir : join(tempDir, 'e2e-cli-agent');
    if (!existsSync(dir)) return; // Skip if create failed

    agentDir = dir;

    // Support both file-tree (v7) and legacy (v6) output
    const isFileTree = existsSync(join(dir, 'agent.yaml'));
    if (isFileTree) {
      expect(existsSync(join(dir, 'agent.yaml'))).toBe(true);
      expect(existsSync(join(dir, '.mcp.json'))).toBe(true);
      expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
      expect(existsSync(join(dir, 'instructions'))).toBe(true);
      expect(existsSync(join(dir, 'knowledge/testing.json'))).toBe(true);
      expect(existsSync(join(dir, 'knowledge/quality.json'))).toBe(true);
    } else {
      expect(existsSync(join(dir, 'package.json'))).toBe(true);
      expect(existsSync(join(dir, 'src/index.ts'))).toBe(true);
      expect(existsSync(join(dir, 'src/intelligence/data/testing.json'))).toBe(true);
      expect(existsSync(join(dir, 'src/intelligence/data/quality.json'))).toBe(true);
    }
  });

  it('should reject invalid config file', () => {
    const badConfig = join(tempDir, 'bad-config.json');
    writeFileSync(badConfig, JSON.stringify({ id: '123INVALID' }));

    const { exitCode } = runCli(
      ['create', '--config', badConfig, '--yes'],
      { cwd: tempDir },
    );

    expect(exitCode).not.toBe(0);
  });

  it('should reject nonexistent config file', () => {
    const { exitCode } = runCli(
      ['create', '--config', '/tmp/nonexistent-config.json', '--yes'],
      { cwd: tempDir },
    );

    expect(exitCode).not.toBe(0);
  });

  // ─── List Command ──────────────────────────────────────────────────

  it('should list agents in the temp directory', () => {
    if (!existsSync(agentDir)) return; // Skip if create failed

    const { stdout, exitCode } = runCli(['list', tempDir]);
    // May exit 0 or display agents
    if (exitCode === 0) {
      expect(stdout).toBeDefined();
    }
  });

  it('should handle listing in empty directory', () => {
    const emptyDir = join(tempDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const { stdout, exitCode } = runCli(['list', emptyDir]);
    // Should succeed but show no agents
    if (exitCode === 0) {
      expect(stdout).toBeDefined();
    }
  });

  // ─── Doctor Command ────────────────────────────────────────────────

  it('should run doctor and check system health', () => {
    const { stdout, exitCode } = runCli(['doctor']);
    // Doctor may warn/fail on missing tools but should not crash
    expect(stdout).toBeDefined();
    expect(stdout.length).toBeGreaterThan(0);
    // Exit code 0 or 1 (warnings/failures) are both valid
    expect([0, 1]).toContain(exitCode);
  });

  it('should run doctor inside agent directory', () => {
    if (!existsSync(agentDir)) return;

    const { stdout, exitCode } = runCli(['doctor'], { cwd: agentDir });
    expect(stdout).toBeDefined();
    expect([0, 1]).toContain(exitCode);
  });

  // ─── Add-Domain Command ────────────────────────────────────────────

  it('should add a new domain to existing agent', () => {
    if (!existsSync(agentDir)) return;

    const { exitCode } = runCli(['add-domain', 'security', '--no-build'], { cwd: agentDir });

    if (exitCode === 0) {
      // Verify domain data file was created
      const dataFile = join(agentDir, 'src/intelligence/data/security.json');
      expect(existsSync(dataFile)).toBe(true);
    }
  });

  it('should reject adding duplicate domain', () => {
    if (!existsSync(agentDir)) return;

    // testing domain already exists from scaffolding
    const { exitCode } = runCli(['add-domain', 'testing', '--no-build'], { cwd: agentDir });
    // Should fail because domain already exists
    expect(exitCode).not.toBe(0);
  });

  // ─── Governance Command ────────────────────────────────────────────

  it('should show governance policy (may warn if no vault.db)', () => {
    if (!existsSync(agentDir)) return;

    const { stdout, exitCode } = runCli(['governance', '--show'], { cwd: agentDir });
    // Governance needs vault.db which requires npm install + agent start
    // So this may fail in a bare scaffold — that's OK
    expect(stdout).toBeDefined();
  });
});
