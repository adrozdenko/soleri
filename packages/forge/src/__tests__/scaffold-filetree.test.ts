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

  it('scaffolded gates.yaml contains schema comment header', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const gatesContent = readFileSync(
      join(result.agentDir, 'workflows', 'feature-dev', 'gates.yaml'),
      'utf-8',
    );
    expect(gatesContent).toContain(
      '# Workflow gates — engine reads these and enforces them during plan execution.',
    );
    expect(gatesContent).toContain(
      '# Format: phase (brainstorming|pre-execution|post-task|completion), requirement, check',
    );

    // Verify all workflow gates have the header
    const bugFixGates = readFileSync(
      join(result.agentDir, 'workflows', 'bug-fix', 'gates.yaml'),
      'utf-8',
    );
    expect(bugFixGates).toContain('# Workflow gates');
  });

  it('scaffolded tools.yaml contains schema comment header', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const toolsContent = readFileSync(
      join(result.agentDir, 'workflows', 'feature-dev', 'tools.yaml'),
      'utf-8',
    );
    expect(toolsContent).toContain('# Workflow tools — engine merges these into plan steps.');
    expect(toolsContent).toContain(
      '# Format: list of operation strings (agentId_facade op:operation_name)',
    );

    // Verify all workflow tools have the header
    const bugFixTools = readFileSync(
      join(result.agentDir, 'workflows', 'bug-fix', 'tools.yaml'),
      'utf-8',
    );
    expect(bugFixTools).toContain('# Workflow tools');
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

  it('generates conventions.md example instruction file', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'instructions', 'conventions.md'), 'utf-8');
    expect(content).toContain('# Conventions');
    expect(content).toContain('Naming Conventions');
    expect(content).toContain('What to Avoid');
    expect(content).toContain('kebab-case');
  });

  it('generates getting-started.md example instruction file', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const content = readFileSync(
      join(result.agentDir, 'instructions', 'getting-started.md'),
      'utf-8',
    );
    expect(content).toContain('Getting Started with Instructions');
    expect(content).toContain('_engine.md');
    expect(content).toContain('soleri dev');
    expect(content).toContain('alphabetical order');
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

  it('generates user.md with placeholder content', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const userMdPath = join(result.agentDir, 'instructions', 'user.md');
    expect(existsSync(userMdPath)).toBe(true);

    const content = readFileSync(userMdPath, 'utf-8');
    expect(content).toContain('# Your Custom Rules');
    expect(content).toContain('priority placement in CLAUDE.md');
    expect(content).toContain('Delete these instructions and replace with your own content.');
  });

  it('includes user.md in filesCreated', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('instructions/user.md');
  });

  it('places user.md content before engine rules ref in CLAUDE.md', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');
    const userPos = claudeMd.indexOf('# Your Custom Rules');
    const enginePos = claudeMd.indexOf('soleri:engine-rules-ref');

    expect(userPos).toBeGreaterThan(-1);
    expect(enginePos).toBeGreaterThan(-1);
    expect(userPos).toBeLessThan(enginePos);
  });

  it('does not duplicate user.md in the alphabetical instructions section', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');
    // user.md content should appear exactly once
    const matches = claudeMd.match(/# Your Custom Rules/g);
    expect(matches).toHaveLength(1);
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
    expect(skillDirs).toContain('soleri-agent-guide');
    expect(skillDirs).toContain('soleri-vault-navigator');
    expect(skillDirs).toContain('soleri-vault-capture');
    expect(skillDirs).toContain('soleri-systematic-debugging');
    expect(skillDirs).toContain('soleri-writing-plans');
    expect(skillDirs).toContain('soleri-context-resume');
    expect(skillDirs).toContain('soleri-agent-persona');

    // Optional skills should NOT be present
    expect(skillDirs).not.toContain('soleri-brainstorming');
    expect(skillDirs).not.toContain('soleri-deep-review');
    expect(skillDirs).not.toContain('soleri-code-patrol');
    expect(skillDirs).not.toContain('soleri-yolo-mode');
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
    expect(skillDirs).toContain('soleri-brainstorming');
    expect(skillDirs).toContain('soleri-deep-review');
    expect(skillDirs).toContain('soleri-yolo-mode');
  });

  it('skillsFilter: explicit array creates exactly those skills', () => {
    const result = scaffoldFileTree(
      {
        ...MINIMAL_CONFIG,
        id: 'custom-skills',
        skillsFilter: ['soleri-vault-navigator', 'soleri-agent-guide'],
      },
      tempDir,
    );
    expect(result.success).toBe(true);

    const skillDirs = readdirSync(join(result.agentDir, 'skills'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    expect(skillDirs).toEqual(['soleri-agent-guide', 'soleri-vault-navigator']);
  });

  it('CLAUDE.md only lists on-disk skills', () => {
    // Default scaffold = essential only
    const result = scaffoldFileTree({ ...MINIMAL_CONFIG, id: 'claude-md-skills' }, tempDir);
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');

    // Essential skills should appear
    expect(claudeMd).toContain('soleri-vault-navigator');
    expect(claudeMd).toContain('soleri-agent-guide');

    // Optional skills should NOT appear (not on disk)
    expect(claudeMd).not.toContain('soleri-brainstorming');
    expect(claudeMd).not.toContain('soleri-yolo-mode');
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

  // ─── Workspace & Routing Tests ─────────────────────────────

  it('creates workspace directories with CONTEXT.md when workspaces defined', () => {
    const result = scaffoldFileTree(
      {
        ...MINIMAL_CONFIG,
        workspaces: [
          { id: 'design', name: 'Design', description: 'Design workspace' },
          { id: 'review', name: 'Review', description: 'Review workspace' },
        ],
      },
      tempDir,
    );
    expect(result.success).toBe(true);

    // Workspace directories and CONTEXT.md files exist
    expect(existsSync(join(result.agentDir, 'workspaces', 'design', 'CONTEXT.md'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'workspaces', 'review', 'CONTEXT.md'))).toBe(true);

    // CONTEXT.md contains workspace name and description
    const content = readFileSync(
      join(result.agentDir, 'workspaces', 'design', 'CONTEXT.md'),
      'utf-8',
    );
    expect(content).toContain('# Design');
    expect(content).toContain('Design workspace');
  });

  it('seeds default workspaces from domains when no explicit workspaces', () => {
    const result = scaffoldFileTree(
      {
        ...MINIMAL_CONFIG,
        domains: ['architecture'],
      },
      tempDir,
    );
    expect(result.success).toBe(true);

    // Architecture domain seeds planning, src, docs workspaces
    expect(existsSync(join(result.agentDir, 'workspaces', 'planning', 'CONTEXT.md'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'workspaces', 'src', 'CONTEXT.md'))).toBe(true);
    expect(existsSync(join(result.agentDir, 'workspaces', 'docs', 'CONTEXT.md'))).toBe(true);
  });

  it('includes routing entries in agent.yaml', () => {
    const result = scaffoldFileTree(
      {
        ...MINIMAL_CONFIG,
        workspaces: [{ id: 'src', name: 'Source', description: 'Source code' }],
        routing: [{ pattern: 'implement feature', workspace: 'src', skills: ['tdd'] }],
      },
      tempDir,
    );
    expect(result.success).toBe(true);

    const content = readFileSync(join(result.agentDir, 'agent.yaml'), 'utf-8');
    const parsed = parseYaml(content);

    expect(parsed.workspaces).toHaveLength(1);
    expect(parsed.workspaces[0].id).toBe('src');
    expect(parsed.routing).toHaveLength(1);
    expect(parsed.routing[0].pattern).toBe('implement feature');
    expect(parsed.routing[0].workspace).toBe('src');
    expect(parsed.routing[0].skills).toEqual(['tdd']);
  });

  it('creates no workspaces directory when no workspaces and no matching domains', () => {
    const result = scaffoldFileTree(
      {
        ...MINIMAL_CONFIG,
        domains: ['testing', 'quality'], // no workspace seeds for these
      },
      tempDir,
    );
    expect(result.success).toBe(true);

    // No workspaces directory
    expect(existsSync(join(result.agentDir, 'workspaces'))).toBe(false);
  });

  it('includes workspaces and routing sections in CLAUDE.md when defined', () => {
    const result = scaffoldFileTree(
      {
        ...MINIMAL_CONFIG,
        workspaces: [{ id: 'design', name: 'Design', description: 'Design patterns' }],
        routing: [
          { pattern: 'design component', workspace: 'design', skills: ['vault-navigator'] },
        ],
      },
      tempDir,
    );
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('## Workspaces');
    expect(claudeMd).toContain('Design patterns');
    expect(claudeMd).toContain('## Task Routing');
    expect(claudeMd).toContain('design component');
  });

  it('omits workspaces and routing sections from CLAUDE.md when not defined', () => {
    // Use domains with no workspace seeds
    const result = scaffoldFileTree(
      {
        ...MINIMAL_CONFIG,
        domains: ['testing', 'quality'],
      },
      tempDir,
    );
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).not.toContain('## Workspaces');
    expect(claudeMd).not.toContain('## Task Routing');
  });

  // ─── Modular CLAUDE.md Pipeline Tests ─────────────────────────

  it('CLAUDE.md contains engine-rules-ref marker instead of full engine rules', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');
    // Should have the reference marker
    expect(claudeMd).toContain('<!-- soleri:engine-rules-ref -->');
    expect(claudeMd).toContain('<!-- /soleri:engine-rules-ref -->');
    // Should NOT have the full engine rules inlined
    expect(claudeMd).not.toContain('<!-- soleri:engine-rules -->');
    expect(claudeMd).not.toContain('<!-- /soleri:engine-rules -->');
  });

  it('CLAUDE.md engine-rules-ref mentions instructions/_engine.md', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('instructions/_engine.md');
  });

  it('_engine.md contains the full engine rules with engine-rules markers', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const engineMd = readFileSync(join(result.agentDir, 'instructions', '_engine.md'), 'utf-8');
    expect(engineMd).toContain('<!-- soleri:engine-rules -->');
    expect(engineMd).toContain('<!-- /soleri:engine-rules -->');
    // Should contain actual engine rules sections
    expect(engineMd).toContain('Vault as Source of Truth');
    expect(engineMd).toContain('Planning');
    expect(engineMd).toContain('Clean Commits');
    expect(engineMd).toContain('Knowledge Capture');
  });

  it('CLAUDE.md does not duplicate engine rules content from _engine.md', () => {
    const result = scaffoldFileTree(MINIMAL_CONFIG, tempDir);
    expect(result.success).toBe(true);

    const claudeMd = readFileSync(join(result.agentDir, 'CLAUDE.md'), 'utf-8');
    // Full engine rules sections should NOT appear in CLAUDE.md
    // (they are in _engine.md, referenced by the ref marker)
    expect(claudeMd).not.toContain('## Memory Quality Gate');
    expect(claudeMd).not.toContain('## Vault as Source of Truth');
    expect(claudeMd).not.toContain('## Intent Detection');
  });
});
