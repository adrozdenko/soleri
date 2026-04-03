import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock @clack/prompts to suppress console output during tests
vi.mock('@clack/prompts', () => ({
  log: {
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('verifyInstall', () => {
  let tempDir: string;
  let agentDir: string;
  let originalHome: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-verify-test-${Date.now()}`);
    agentDir = join(tempDir, 'my-agent');
    mkdirSync(agentDir, { recursive: true });
    originalHome = process.env.HOME ?? '';
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalHome) process.env.USERPROFILE = originalHome;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return failing checks when nothing is installed', async () => {
    const { verifyInstall } = await import('../commands/install.js');
    const checks = verifyInstall('test-agent', agentDir, 'claude');

    // Agent entry in claude config should fail (no config file)
    const configCheck = checks.find((c) => c.label.includes('claude config'));
    expect(configCheck).toBeDefined();
    expect(configCheck!.passed).toBe(false);

    // agent.yaml should fail (not created)
    const yamlCheck = checks.find((c) => c.label.includes('agent.yaml'));
    expect(yamlCheck).toBeDefined();
    expect(yamlCheck!.passed).toBe(false);
  });

  it('should detect agent.yaml when it exists', async () => {
    writeFileSync(join(agentDir, 'agent.yaml'), 'id: test-agent\n');

    const { verifyInstall } = await import('../commands/install.js');
    const checks = verifyInstall('test-agent', agentDir, 'claude');

    const yamlCheck = checks.find((c) => c.label.includes('agent.yaml'));
    expect(yamlCheck).toBeDefined();
    expect(yamlCheck!.passed).toBe(true);
  });

  it('should detect claude config entry after installClaude', async () => {
    writeFileSync(join(agentDir, 'agent.yaml'), 'id: test-agent\n');

    const { installClaude, verifyInstall } = await import('../commands/install.js');
    installClaude('test-agent', agentDir, true);

    const checks = verifyInstall('test-agent', agentDir, 'claude');
    const configCheck = checks.find((c) => c.label.includes('claude config'));
    expect(configCheck).toBeDefined();
    expect(configCheck!.passed).toBe(true);
  });

  it('should include engine binary check', async () => {
    const { verifyInstall } = await import('../commands/install.js');
    const checks = verifyInstall('test-agent', agentDir, 'claude');

    const engineCheck = checks.find((c) => c.label.includes('Engine'));
    expect(engineCheck).toBeDefined();
    // Engine always resolves (local or npx fallback)
    expect(engineCheck!.passed).toBe(true);
  });

  it('should check all targets when target is "all"', async () => {
    const { verifyInstall } = await import('../commands/install.js');
    const checks = verifyInstall('test-agent', agentDir, 'all');

    const configChecks = checks.filter((c) => c.label.includes('config'));
    // Should have entries for claude, codex, and opencode
    expect(configChecks.length).toBe(3);
    expect(configChecks.some((c) => c.label.includes('claude'))).toBe(true);
    expect(configChecks.some((c) => c.label.includes('codex'))).toBe(true);
    expect(configChecks.some((c) => c.label.includes('opencode'))).toBe(true);
  });

  it('should return VerifyCheck[] with correct shape', async () => {
    const { verifyInstall } = await import('../commands/install.js');
    const checks = verifyInstall('test-agent', agentDir, 'claude');

    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) {
      expect(check).toHaveProperty('label');
      expect(check).toHaveProperty('passed');
      expect(typeof check.label).toBe('string');
      expect(typeof check.passed).toBe('boolean');
    }
  });
});
