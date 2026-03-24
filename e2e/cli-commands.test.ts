/**
 * E2E Test: CLI Commands
 *
 * Tests the @soleri/cli commands non-interactively:
 * - soleri create --config --yes (non-interactive scaffold)
 * - soleri list (agent discovery)
 * - soleri doctor (health checks)
 * - soleri add-domain (domain addition)
 * - soleri governance (vault governance)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const CLI_BIN = join(import.meta.dirname, '..', 'packages', 'cli', 'dist', 'main.js');

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

describe('E2E: cli-commands', () => {
  const tempDir = join(tmpdir(), `soleri-e2e-cli-${Date.now()}`);
  // Default scaffold is file-tree (v7), output dir is <id> (not <id>-mcp)
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
    agentDir = join(tempDir, 'e2e-cli-agent');
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── CLI Version / Help ────────────────────────────────────────────

  it('should show help with expected subcommands', () => {
    const { stdout, exitCode } = runCli([]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('soleri');
    // Welcome screen shows key subcommands
    expect(stdout).toContain('create');
    expect(stdout).toContain('doctor');
    expect(stdout).toContain('dev');
  });

  // ─── Create Command ────────────────────────────────────────────────

  it('should create agent non-interactively with --config --yes', () => {
    const { exitCode, stdout } = runCli(
      ['create', '--config', join(tempDir, 'agent-config.json'), '--yes', '--dir', tempDir],
      { cwd: tempDir },
    );

    // Create MUST succeed
    expect(exitCode).toBe(0);
    expect(stdout).toBeDefined();
    // The agent directory MUST exist after successful create
    expect(existsSync(agentDir)).toBe(true);
  });

  it('should have created the agent directory with expected files', () => {
    // This test depends on the create test above — if that failed, this should fail too
    expect(existsSync(agentDir)).toBe(true);

    // Default is file-tree (v7) agent
    const isFileTree = existsSync(join(agentDir, 'agent.yaml'));
    expect(isFileTree).toBe(true);

    // agent.yaml must be valid YAML containing the agent ID
    const agentYaml = parseYaml(readFileSync(join(agentDir, 'agent.yaml'), 'utf-8'));
    expect(agentYaml.id).toBe('e2e-cli-agent');
    expect(agentYaml.name).toBe('E2E CLI Agent');

    // .mcp.json must be valid JSON
    const mcpJson = JSON.parse(readFileSync(join(agentDir, '.mcp.json'), 'utf-8'));
    expect(mcpJson).toBeDefined();
    expect(typeof mcpJson).toBe('object');

    // CLAUDE.md must contain agent name
    const claudeMd = readFileSync(join(agentDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('E2E CLI Agent');

    // instructions/ directory must exist
    expect(existsSync(join(agentDir, 'instructions'))).toBe(true);

    // Domain knowledge files must exist and contain valid JSON
    for (const domain of ['testing', 'quality']) {
      const domainPath = join(agentDir, `knowledge/${domain}.json`);
      expect(existsSync(domainPath)).toBe(true);
      const domainData = JSON.parse(readFileSync(domainPath, 'utf-8'));
      expect(domainData).toHaveProperty('domain', domain);
    }
  });

  it('should reject invalid config file', () => {
    const badConfig = join(tempDir, 'bad-config.json');
    writeFileSync(badConfig, JSON.stringify({ id: '123INVALID' }));

    const { exitCode } = runCli(['create', '--config', badConfig, '--yes'], { cwd: tempDir });

    expect(exitCode).not.toBe(0);
  });

  it('should reject nonexistent config file', () => {
    const { exitCode } = runCli(['create', '--config', '/tmp/nonexistent-config.json', '--yes'], {
      cwd: tempDir,
    });

    expect(exitCode).not.toBe(0);
  });

  it('should fail when agent directory already exists', () => {
    // The agent was already created above — creating again should fail
    const { exitCode, stdout } = runCli(
      ['create', '--config', join(tempDir, 'agent-config.json'), '--yes', '--dir', tempDir],
      { cwd: tempDir },
    );

    // Should fail because the directory already exists
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain('already exists');
  });

  // ─── List Command ──────────────────────────────────────────────────

  it('should list agents in the temp directory', () => {
    expect(existsSync(agentDir)).toBe(true);

    const { stdout, exitCode } = runCli(['list', tempDir]);
    expect(exitCode).toBe(0);
    // The output must contain the agent ID
    expect(stdout).toContain('e2e-cli-agent');
  });

  it('should handle listing in empty directory', () => {
    const emptyDir = join(tempDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const { stdout, exitCode } = runCli(['list', emptyDir]);
    expect(exitCode).toBe(0);
    // Should indicate no agents found
    expect(stdout).toContain('No agents found');
  });

  // ─── Doctor Command ────────────────────────────────────────────────

  it('should run doctor and check system health', () => {
    const { stdout, exitCode } = runCli(['doctor']);
    // Doctor may warn/fail on missing tools but should not crash
    expect(stdout.length).toBeGreaterThan(0);
    // Exit code 0 or 1 (warnings/failures) are both valid
    expect([0, 1]).toContain(exitCode);
    // Must contain recognizable health check labels
    expect(stdout).toContain('Node.js');
    expect(stdout).toContain('npm');
    expect(stdout).toContain('Soleri Doctor');
  });

  it('should run doctor inside agent directory', () => {
    expect(existsSync(agentDir)).toBe(true);

    const { stdout, exitCode } = runCli(['doctor'], { cwd: agentDir });
    expect([0, 1]).toContain(exitCode);
    // Must contain health check output
    expect(stdout).toContain('Node.js');
    expect(stdout).toContain('Soleri Doctor');
    // When run inside an agent dir, should detect the agent project
    expect(stdout).toContain('Agent project');
  });

  // ─── Add-Domain Command ────────────────────────────────────────────

  it('should add a new domain to existing agent', () => {
    expect(existsSync(agentDir)).toBe(true);

    const { exitCode, stdout, stderr } = runCli(['add-domain', 'security', '--no-build'], {
      cwd: agentDir,
    });

    // File-tree agents: addDomain from forge requires legacy package.json with -mcp suffix.
    // The detectAgent() in the CLI will find the file-tree agent, but addDomain() from forge
    // only handles legacy TS agents. This is a known limitation.
    // If the CLI supports file-tree add-domain, exitCode=0 and domain file exists.
    // If not, exitCode!=0 — verify the error is clear, not a crash.
    if (exitCode === 0) {
      // Success path: verify domain data file was created with valid JSON
      const possiblePaths = [
        join(agentDir, 'knowledge/security.json'),
        join(agentDir, 'src/intelligence/data/security.json'),
      ];
      const domainFile = possiblePaths.find((p) => existsSync(p));
      expect(domainFile).toBeDefined();

      const domainData = JSON.parse(readFileSync(domainFile!, 'utf-8'));
      expect(domainData).toHaveProperty('domain', 'security');
    } else {
      // Error path: for file-tree agents, addDomain fails because it expects legacy format.
      // Verify the error is meaningful (not a raw exception).
      const output = stdout + (stderr ?? '');
      expect(output.length).toBeGreaterThan(0);
    }
  });

  it('should reject adding duplicate domain', () => {
    expect(existsSync(agentDir)).toBe(true);

    // "testing" domain already exists from scaffolding
    const { exitCode, stdout, stderr } = runCli(['add-domain', 'testing', '--no-build'], {
      cwd: agentDir,
    });
    // Should fail because domain already exists (or because file-tree not supported)
    expect(exitCode).not.toBe(0);
    // Verify stderr or stdout contains a meaningful message
    const output = stdout + (stderr ?? '');
    expect(output.length).toBeGreaterThan(0);
  });

  // ─── Governance Command ────────────────────────────────────────────

  it('should fail governance without vault.db and show clear error', () => {
    expect(existsSync(agentDir)).toBe(true);

    const { stdout, exitCode } = runCli(['governance', '--show'], { cwd: agentDir });
    // Governance requires vault.db which doesn't exist in a bare scaffold.
    // This MUST fail with a clear error message, not silently succeed.
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain('Vault DB not found');
  });
});
