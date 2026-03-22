import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { previewScaffold, scaffold } from '@soleri/forge/lib';
import type { AgentConfig } from '@soleri/forge/lib';
import { installPack } from '../hook-packs/installer.js';

describe('create command', { timeout: 30_000 }, () => {
  let tempDir: string;

  const testConfig: AgentConfig = {
    id: 'test-agent',
    name: 'TestAgent',
    role: 'A test agent',
    description: 'This agent is used for testing the CLI create command.',
    domains: ['testing', 'quality'],
    principles: ['Test everything', 'Quality first'],
    greeting: 'Hello! I am TestAgent, here to help with testing.',
    outputDir: '',
  };

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-create-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    testConfig.outputDir = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should preview scaffold without creating files', () => {
    const preview = previewScaffold(testConfig);

    expect(preview.agentDir).toBe(join(tempDir, 'test-agent'));
    expect(preview.persona.name).toBe('TestAgent');
    expect(preview.domains).toEqual(['testing', 'quality']);
    expect(preview.files.length).toBeGreaterThan(10);
    expect(existsSync(preview.agentDir)).toBe(false);
  });

  it('should scaffold agent successfully', () => {
    const result = scaffold(testConfig);

    expect(result.success).toBe(true);
    expect(result.agentDir).toBe(join(tempDir, 'test-agent'));
    expect(result.filesCreated.length).toBeGreaterThan(10);
    expect(existsSync(join(tempDir, 'test-agent', 'package.json'))).toBe(true);
    expect(existsSync(join(tempDir, 'test-agent', 'src', 'index.ts'))).toBe(true);
  });

  it('should fail if directory already exists', () => {
    scaffold(testConfig);
    const result = scaffold(testConfig);

    expect(result.success).toBe(false);
    expect(result.summary).toContain('already exists');
  });

  it('should not create facade files (v5.0 uses runtime factories from @soleri/core)', () => {
    scaffold(testConfig);

    // v5.0: facades are created at runtime by createDomainFacades() — no generated files
    expect(existsSync(join(tempDir, 'test-agent', 'src', 'facades'))).toBe(false);

    // Entry point should reference createDomainFacades
    const entry = readFileSync(join(tempDir, 'test-agent', 'src', 'index.ts'), 'utf-8');
    expect(entry).toContain('createDomainFacades');
    expect(entry).toContain('"testing"');
    expect(entry).toContain('"quality"');
  });

  it('should create intelligence data files for each domain', () => {
    scaffold(testConfig);

    const testingBundle = JSON.parse(
      readFileSync(
        join(tempDir, 'test-agent', 'src', 'intelligence', 'data', 'testing.json'),
        'utf-8',
      ),
    );
    expect(testingBundle.domain).toBe('testing');
    expect(testingBundle.entries.length).toBeGreaterThanOrEqual(0);
    if (testingBundle.entries.length > 0) {
      expect(testingBundle.entries[0].id).toBe('testing-seed');
      expect(testingBundle.entries[0].tags).toContain('seed');
    }
  });

  it('should read config from file for non-interactive mode', () => {
    const configPath = join(tempDir, 'agent.json');
    writeFileSync(configPath, JSON.stringify(testConfig), 'utf-8');

    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(raw.id).toBe('test-agent');
    expect(raw.domains).toEqual(['testing', 'quality']);
  });

  // ─── Hook pack integration tests ──────────────────────────────

  it('should create .claude/ directory when hookPacks specified', () => {
    const configWithHooks: AgentConfig = {
      ...testConfig,
      hookPacks: ['typescript-safety'],
    };
    const result = scaffold(configWithHooks);

    expect(result.success).toBe(true);
    expect(existsSync(join(tempDir, 'test-agent', '.claude'))).toBe(true);
  });

  it('should install hookify files to agent .claude/ via installPack', () => {
    const configWithHooks: AgentConfig = {
      ...testConfig,
      hookPacks: ['typescript-safety'],
    };
    const result = scaffold(configWithHooks);
    expect(result.success).toBe(true);

    // Simulate what create.ts does: install packs into agent dir
    const { installed } = installPack('typescript-safety', { projectDir: result.agentDir });
    expect(installed.length).toBeGreaterThan(0);

    // Verify hookify files exist in agent .claude/
    const claudeDir = join(result.agentDir, '.claude');
    const hookFiles = readdirSync(claudeDir).filter(
      (f) => f.startsWith('hookify.') && f.endsWith('.local.md'),
    );
    expect(hookFiles.length).toBeGreaterThan(0);
    expect(hookFiles.some((f) => f.includes('no-any-types'))).toBe(true);
  });

  it('should not create .claude/ when hookPacks is empty or undefined', () => {
    const result = scaffold(testConfig);

    expect(result.success).toBe(true);
    expect(existsSync(join(tempDir, 'test-agent', '.claude'))).toBe(false);
  });

  it('should include hook packs in preview when hookPacks specified', () => {
    const configWithHooks: AgentConfig = {
      ...testConfig,
      hookPacks: ['typescript-safety'],
    };
    const preview = previewScaffold(configWithHooks);

    const hookEntry = preview.files.find((f) => f.path === '.claude/');
    expect(hookEntry).toBeDefined();
    expect(hookEntry!.description).toContain('typescript-safety');
  });

  it('should include Hook Packs section in CLAUDE.md when hookPacks specified', () => {
    const configWithHooks: AgentConfig = {
      ...testConfig,
      hookPacks: ['typescript-safety'],
    };
    scaffold(configWithHooks);

    const claudeMd = readFileSync(
      join(tempDir, 'test-agent', 'src', 'activation', 'claude-md-content.ts'),
      'utf-8',
    );
    expect(claudeMd).toContain('Hook Packs');
    expect(claudeMd).toContain('typescript-safety');
  });

  it('should not include Hook Packs section in CLAUDE.md when hookPacks undefined', () => {
    scaffold(testConfig);

    const claudeMd = readFileSync(
      join(tempDir, 'test-agent', 'src', 'activation', 'claude-md-content.ts'),
      'utf-8',
    );
    expect(claudeMd).not.toContain('Hook Packs');
  });

  it('should include hook copy logic in setup.sh when hookPacks specified', () => {
    const configWithHooks: AgentConfig = {
      ...testConfig,
      hookPacks: ['typescript-safety'],
    };
    scaffold(configWithHooks);

    const setupSh = readFileSync(join(tempDir, 'test-agent', 'scripts', 'setup.sh'), 'utf-8');
    expect(setupSh).toContain('Installing hook packs');
    expect(setupSh).toContain('hookify.');
    expect(setupSh).toContain('GLOBAL_CLAUDE_DIR');
  });

  it('should not include hook copy logic in setup.sh when hookPacks undefined', () => {
    scaffold(testConfig);

    const setupSh = readFileSync(join(tempDir, 'test-agent', 'scripts', 'setup.sh'), 'utf-8');
    expect(setupSh).not.toContain('Installing hook packs');
  });

  it('should mention hook packs in scaffold summary', () => {
    const configWithHooks: AgentConfig = {
      ...testConfig,
      hookPacks: ['typescript-safety', 'a11y'],
    };
    const result = scaffold(configWithHooks);

    expect(result.summary).toContain('2 hook pack(s) bundled in .claude/');
  });
});
