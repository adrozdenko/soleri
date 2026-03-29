/**
 * Tests for the file-tree scaffolder.
 *
 * Validates that scaffoldFileTree() produces a valid agent folder
 * with all expected files and no TypeScript output.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { scaffoldFileTree } from '../scaffold-filetree.js';

let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `soleri-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const MINIMAL_CONFIG = {
  id: 'test-agent',
  name: 'Test Agent',
  role: 'Testing Advisor',
  description: 'A test agent for validating the file-tree scaffolder output.',
  domains: ['testing', 'quality'],
  principles: ['Test everything', 'Fail fast'],
};

describe('scaffoldFileTree', () => {
  it('creates agent directory with all expected files', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);

    expect(result.success).toBe(true);
    expect(result.agentDir).toBe(join(tempDir, 'test-agent'));
    expect(result.filesCreated.length).toBeGreaterThan(10);

    // Core files exist
    expect(existsSync(join(result.agentDir, 'agent.yaml'))).toBe(true);
    expect(existsSync(join(result.agentDir, '.mcp.json'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'opencode.json'))).toBe(true);
    expect(existsSync(join(result.agentDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'CLAUDE.md'))).toBe(true);

    // Directories exist
    expect(existsSync(join(result.agentDir, 'instructions'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'workflows'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'knowledge'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'skills'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'hooks'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'data'))).toBe(true);
  });

  it('generates NO TypeScript files', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    // No .ts files anywhere
    const tsFiles = result.filesCreated.filter((f) => f.endsWith('.ts'));
    expect(tsFiles).toEqual([]);

    // No package.json
    expect(existsSync(join(result.agentDir, 'package.json'))).toBe(false);

    // No tsconfig.json
    expect(existsSync(join(result.agentDir, 'tsconfig.json'))).toBe(false);

    // No src/ directory
    expect(existsSync(join(result.agentDir, 'src'))).toBe(false);

    // No node_modules
    expect(existsSync(join(result.agentDir, 'node_modules'))).toBe(false);
  });

  it('generates valid agent.yaml', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'agent.yaml'), 'utf-8');
    const parsed = parseYaml(content);

    expect(parsed.id).toBe('test-agent');
    expect(parsed.name).toBe('Test Agent');
    expect(parsed.role).toBe('Testing Advisor');
    expect(parsed.domains).toEqual(['testing', 'quality']);
    expect(parsed.principles).toEqual(['Test everything', 'Fail fast']);
  });

  it('generates valid .mcp.json pointing to soleri-engine', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, '.mcp.json'), 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.mcpServers['soleri-engine']).toBeDefined();
    expect(parsed.mcpServers['soleri-engine'].command).toBe('npx');
    expect(parsed.mcpServers['soleri-engine'].args).toContain('@soleri/engine');
    expect(parsed.mcpServers['soleri-engine'].args).toContain('./agent.yaml');
  });

  it('generates valid opencode.json for OpenCode', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'opencode.json'), 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.$schema).toBe('https://opencode.ai/config.json');
    expect(parsed.mcp['soleri-engine']).toBeDefined();
    expect(parsed.mcp['soleri-engine'].type).toBe('local');
    expect(parsed.instructions).toContain('CLAUDE.md');
  });

  it('generates engine rules in instructions/_engine.md', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'instructions', '_engine.md'), 'utf-8');
    expect(content).toContain('soleri:engine-rules');
    expect(content).toContain('Vault as Source of Truth');
    expect(content).toContain('Planning');
    expect(content).toContain('Clean Commits');
  });

  it('generates domain instruction file', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'instructions', 'domain.md'), 'utf-8');
    expect(content).toContain('testing, quality');
    expect(content).toContain('Test everything');
  });

  it('generates workflow folders with prompt, gates, and tools', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    // Check feature-dev workflow
    const featureDevDir = join(result.agentDir, 'workflows', 'feature-dev');
    expect(existsSync(join(featureDevDir, 'prompt.md'))).toBe(true);
    expect(existsSync(join(featureDevDir, 'gates.yaml'))).toBe(true);
    expect(existsSync(join(featureDevDir, 'tools.yaml'))).toBe(true);

    const prompt = readFileSync(join(featureDevDir, 'prompt.md'), 'utf-8');
    expect(prompt).toContain('Feature Development');
    expect(prompt).toContain('op:search_intelligent');

    // Check bug-fix workflow
    expect(existsSync(join(result.agentDir, 'workflows', 'bug-fix', 'prompt.md'))).toBe(true);

    // Check code-review workflow
    expect(existsSync(join(result.agentDir, 'workflows', 'code-review', 'prompt.md'))).toBe(true);
  });

  it('generates knowledge bundles per domain', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    // One bundle per domain
    expect(existsSync(join(result.agentDir, 'knowledge', 'testing.json'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'knowledge', 'quality.json'))).toBe(true);

    const bundle = JSON.parse(
      readFileSync(join(result.agentDir, 'knowledge', 'testing.json'), 'utf-8'),
    );
    expect(bundle.domain).toBe('testing');
    expect(bundle.version).toBe('1.0.0');
    expect(bundle.entries).toEqual([]);
  });

  it('generates CLAUDE.md with correct agent identity', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('# Test Agent Mode');
    expect(claudeMd).toContain('**Role:** Testing Advisor');
    expect(claudeMd).toContain('test-agent_core op:activate');
    expect(claudeMd).toContain('test-agent_vault');
    expect(claudeMd).toContain('Available Workflows');
    expect(claudeMd).toContain('feature-dev');
  });

  it('.gitignore excludes auto-generated files', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const gitignore = readFileSync(join(result.agentDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('CLAUDE.md');
    expect(gitignore).toContain('AGENTS.md');
    expect(gitignore).toContain('_engine.md');
  });

  it('fails if directory already exists', () => {
    scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    const result2 = scaffoldFileTree(MINIMAL_CONFIG, tempDir);

    expect(result2.success).toBe(false);
    expect(result2.summary).toContain('already exists');
  });

  it('fails on invalid config', () => {
    const result = scaffoldFileTree(
      { id: 'INVALID_ID', name: '', role: '', description: '', domains: [], principles: [] } as any,
      tempDir,
    );
    expect(result.success).toBe(false);
    expect(result.summary).toContain('Invalid config');
  });

  it('omits default values from agent.yaml for clean output', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'agent.yaml'), 'utf-8');

    // tone: pragmatic is the default — should NOT appear
    expect(content).not.toContain('tone:');
    // setup.target: claude is the default — should NOT appear
    expect(content).not.toContain('target:');
    // engine.learning: true is the default — should NOT appear
    expect(content).not.toContain('learning:');
  });

  it('includes non-default values in agent.yaml', () => {
    const result = scaffoldFileTree(
      {
        ...MINIMAL_CONFIG,
        tone: 'precise',
        setup: { target: 'opencode', model: 'claude-code-opus-4' },
      },
      tempDir,
    );
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'agent.yaml'), 'utf-8');
    const parsed = parseYaml(content);

    expect(parsed.tone).toBe('precise');
    expect(parsed.setup.target).toBe('opencode');
    expect(parsed.setup.model).toBe('claude-code-opus-4');
  });

  it('summary says no build step needed', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);
    expect(result.summary).toContain('No build step needed');
  });

  // ─── Skills Filter Tests ─────────────────────────────────────

  it('default scaffold creates only essential skills (~7)', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const skillDirs = readdirSync(join(result.agentDir, 'skills'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    // Should have ~7 essential skills, not 30+
    expect(skillDirs.length).toBeGreaterThanOrEqual(5);
    expect(skillDirs.length).toBeLessThanOrEqual(10);

    // Essential skills should be present
    expect(skillDirs).toContain('agent-guide');
    expect(skillDirs).toContain('vault-navigator');
    expect(skillDirs).toContain('vault-capture');
    expect(skillDirs).toContain('systematic-debugging');
    expect(skillDirs).toContain('writing-plans');
    expect(skillDirs).toContain('context-resume');
    expect(skillDirs).toContain('agent-persona');

    // Optional skills should NOT be present
    expect(skillDirs).not.toContain('brainstorming');
    expect(skillDirs).not.toContain('deep-review');
    expect(skillDirs).not.toContain('code-patrol');
    expect(skillDirs).not.toContain('yolo-mode');
  });

  it('skillsFilter: "all" creates all skills', () => {
    const result = scaffoldFileTree(
      { ...MINIMAL_CONFIG, id: 'all-skills', skillsFilter: 'all' },
      tempDir,
    );
    expect(result.success).toBe(true);

    const skillDirs = readdirSync(join(result.agentDir, 'skills'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    // Should have all 30+ skills
    expect(skillDirs.length).toBeGreaterThanOrEqual(25);
    expect(skillDirs).toContain('brainstorming');
    expect(skillDirs).toContain('deep-review');
    expect(skillDirs).toContain('yolo-mode');
  });

  it('skillsFilter: explicit array creates exactly those skills', () => {
    const result = scaffoldFileTree(
      { ...MINIMAL_CONFIG, id: 'custom-skills', skillsFilter: ['vault-navigator', 'agent-guide'] },
      tempDir,
    );
    expect(result.success).toBe(true);

    const skillDirs = readdirSync(join(result.agentDir, 'skills'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    expect(skillDirs).toEqual(['agent-guide', 'vault-navigator']);
  });

  it('CLAUDE.md only lists on-disk skills', () => {
    // Default scaffold = essential only
    const result = scaffoldFileTree({ ...MINIMAL_CONFIG, id: 'claude-md-skills' }, tempDir);
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');

    // Essential skills should appear
    expect(claudeMd).toContain('vault-navigator');
    expect(claudeMd).toContain('agent-guide');

    // Optional skills should NOT appear (not on disk)
    expect(claudeMd).not.toContain('brainstorming');
    expect(claudeMd).not.toContain('yolo-mode');
  });

  it('skillsFilter default (essential) is not written to agent.yaml', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'agent.yaml'), 'utf-8');
    expect(content).not.toContain('skillsFilter');
  });

  it('skillsFilter: "all" IS written to agent.yaml', () => {
    const result = scaffoldFileTree(
      { ...MINIMAL_CONFIG, id: 'written-filter', skillsFilter: 'all' },
      tempDir,
    );
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'agent.yaml'), 'utf-8');
    const parsed = parseYaml(content);
    expect(parsed.skillsFilter).toBe('all');
  });
});
