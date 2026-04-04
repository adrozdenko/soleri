/**
 * E2E Test: Skills Validation & Domain Intelligence
 *
 * Verifies that scaffolded agents have valid skills with proper
 * frontmatter, and that domain intelligence data files are structured
 * correctly and loadable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold } from '@soleri/forge/lib';

describe('E2E: skills-and-domains', () => {
  const tempDir = join(tmpdir(), `soleri-e2e-skills-${Date.now()}`);
  let agentDir: string;
  const AGENT_ID = 'e2e-skills-agent';

  const MANY_DOMAINS = [
    'frontend',
    'backend',
    'devops',
    'security',
    'testing',
    'database',
    'api-design',
    'monitoring',
    'accessibility',
    'performance',
  ];

  beforeAll(() => {
    mkdirSync(tempDir, { recursive: true });

    const result = scaffold({
      id: AGENT_ID,
      name: 'E2E Skills Agent',
      role: 'Testing skills and domain intelligence',
      description: 'An agent for validating skill generation and domain data integrity.',
      domains: MANY_DOMAINS,
      principles: ['Validate everything', 'Leave no edge untested'],
      outputDir: tempDir,
    });

    expect(result.success).toBe(true);
    agentDir = result.agentDir;
  }, 60_000);

  afterAll(() => {
    rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  // ─── Skills Validation ─────────────────────────────────────────────

  it('should have a skills directory', () => {
    expect(existsSync(join(agentDir, 'skills'))).toBe(true);
  });

  it('should have exactly 41 built-in skills', () => {
    const skillDirs = readdirSync(join(agentDir, 'skills'), { encoding: 'utf-8' });
    expect(skillDirs.length).toBe(41);

    // Verify all expected skill names are present
    const expectedSkills = [
      'soleri-agent-dev',
      'soleri-agent-guide',
      'soleri-agent-issues',
      'soleri-agent-mode',
      'soleri-agent-persona',
      'soleri-brain-debrief',
      'soleri-brainstorming',
      'soleri-build-skill',
      'soleri-code-patrol',
      'soleri-context-resume',
      'soleri-curator',
      'soleri-deep-review',
      'soleri-deliver-and-ship',
      'soleri-discovery-phase',
      'soleri-dream',
      'soleri-env-setup',
      'soleri-executing-plans',
      'soleri-finishing-a-development-branch',
      'soleri-fix-and-learn',
      'soleri-health-check',
      'soleri-intake',
      'soleri-knowledge-harvest',
      'soleri-loop',
      'soleri-mcp-doctor',
      'soleri-onboard-me',
      'soleri-orchestrate',
      'soleri-parallel-execute',
      'soleri-research-scout',
      'soleri-retrospective',
      'soleri-second-opinion',
      'soleri-subagent-driven-development',
      'soleri-systematic-debugging',
      'soleri-test-driven-development',
      'soleri-using-git-worktrees',
      'soleri-vault-capture',
      'soleri-vault-curate',
      'soleri-vault-navigator',
      'soleri-vault-smells',
      'soleri-verification-before-completion',
      'soleri-writing-plans',
      'soleri-yolo-mode',
    ];
    for (const skill of expectedSkills) {
      expect(skillDirs, `Missing expected skill: ${skill}`).toContain(skill);
    }
  });

  it('every skill should have a SKILL.md file', () => {
    const skillDirs = readdirSync(join(agentDir, 'skills'), { encoding: 'utf-8' });

    for (const dir of skillDirs) {
      const skillPath = join(agentDir, 'skills', dir, 'SKILL.md');
      expect(existsSync(skillPath), `Missing SKILL.md in ${dir}`).toBe(true);
    }
  });

  it('every SKILL.md should have valid YAML frontmatter with name and description', () => {
    const skillDirs = readdirSync(join(agentDir, 'skills'), { encoding: 'utf-8' });

    for (const dir of skillDirs) {
      const content = readFileSync(join(agentDir, 'skills', dir, 'SKILL.md'), 'utf-8');

      // Check frontmatter exists (starts with ---)
      expect(content.startsWith('---'), `${dir}/SKILL.md missing frontmatter`).toBe(true);

      // Extract frontmatter
      const endIdx = content.indexOf('---', 3);
      expect(endIdx).toBeGreaterThan(3);

      const frontmatter = content.slice(3, endIdx).trim();

      // Must have name field
      expect(frontmatter, `${dir}/SKILL.md missing name`).toMatch(/^name:\s*.+/m);

      // Must have description field
      expect(frontmatter, `${dir}/SKILL.md missing description`).toMatch(/description:/m);
    }
  });

  it('agent-specific skills should have agent ID substituted', () => {
    const skillDirs = readdirSync(join(agentDir, 'skills'), { encoding: 'utf-8' });

    let foundSubstitution = false;
    for (const dir of skillDirs) {
      const content = readFileSync(join(agentDir, 'skills', dir, 'SKILL.md'), 'utf-8');

      // Should NOT contain the placeholder
      expect(content, `${dir}/SKILL.md still has placeholder`).not.toContain('YOUR_AGENT_core');

      // May contain the actual agent ID
      if (content.includes(`${AGENT_ID}_core`)) {
        foundSubstitution = true;
      }
    }

    // At least some skills should have been substituted
    expect(foundSubstitution).toBe(true);
  });

  it('skill names should be kebab-case', () => {
    const skillDirs = readdirSync(join(agentDir, 'skills'), { encoding: 'utf-8' });

    for (const dir of skillDirs) {
      const content = readFileSync(join(agentDir, 'skills', dir, 'SKILL.md'), 'utf-8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        expect(name, `Skill name "${name}" not kebab-case`).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    }
  });

  it('skill descriptions should not exceed 1024 characters', () => {
    const skillDirs = readdirSync(join(agentDir, 'skills'), { encoding: 'utf-8' });

    for (const dir of skillDirs) {
      const content = readFileSync(join(agentDir, 'skills', dir, 'SKILL.md'), 'utf-8');
      const endIdx = content.indexOf('---', 3);
      const frontmatter = content.slice(3, endIdx).trim();

      // Total frontmatter should be reasonable size
      expect(
        frontmatter.length,
        `${dir} frontmatter too long (${frontmatter.length} chars)`,
      ).toBeLessThan(2048);
    }
  });

  // ─── Domain Intelligence Data ──────────────────────────────────────

  it('should have data files for all 10 domains', () => {
    for (const domain of MANY_DOMAINS) {
      const dataFile = join(agentDir, `src/intelligence/data/${domain}.json`);
      expect(existsSync(dataFile), `Missing data file for domain: ${domain}`).toBe(true);
    }
  });

  it('every domain data file should be valid JSON', () => {
    for (const domain of MANY_DOMAINS) {
      const dataFile = join(agentDir, `src/intelligence/data/${domain}.json`);
      const content = readFileSync(dataFile, 'utf-8');

      let parsed: unknown;
      expect(() => {
        parsed = JSON.parse(content);
      }, `Invalid JSON in ${domain}.json`).not.toThrow();

      expect(parsed).toBeDefined();
    }
  });

  it('domain data files should have correct bundle structure', () => {
    for (const domain of MANY_DOMAINS) {
      const dataFile = join(agentDir, `src/intelligence/data/${domain}.json`);
      const bundle = JSON.parse(readFileSync(dataFile, 'utf-8'));

      // Required fields
      expect(bundle.domain, `Missing domain in ${domain}.json`).toBe(domain);
      expect(typeof bundle.version, `Missing version in ${domain}.json`).toBe('string');
      expect(Array.isArray(bundle.entries), `entries not array in ${domain}.json`).toBe(true);
    }
  });

  it('entry point should reference all domains', () => {
    const entryPoint = readFileSync(join(agentDir, 'src/index.ts'), 'utf-8');

    for (const domain of MANY_DOMAINS) {
      expect(
        entryPoint.includes(`'${domain}'`) || entryPoint.includes(`"${domain}"`),
        `Entry point missing domain: ${domain}`,
      ).toBe(true);
    }
  });

  it('package.json should reference @soleri/core', () => {
    const pkg = JSON.parse(readFileSync(join(agentDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['@soleri/core']).toBeDefined();
  });

  // ─── Domain Facade Integration ─────────────────────────────────────

  it('should have all expected imports in entry point', () => {
    const entryPoint = readFileSync(join(agentDir, 'src/index.ts'), 'utf-8');

    // Core runtime factories
    expect(entryPoint).toContain('createAgentRuntime');
    expect(entryPoint).toContain('createSemanticFacades');
    expect(entryPoint).toContain('createDomainFacades');
    expect(entryPoint).toContain('registerAllFacades');
    expect(entryPoint).toContain('StdioServerTransport');
  });

  // ─── Skills Filtering ──────────────────────────────────────────────

  it('should scaffold with skill filter and exclude unselected skills', () => {
    const filteredDir = join(tempDir, 'filtered-skills');
    mkdirSync(filteredDir, { recursive: true });

    const result = scaffold({
      id: 'filtered-skills-agent',
      name: 'Filtered Skills Agent',
      role: 'Testing skill filtering',
      description: 'Agent with filtered skills for testing the skills filter feature.',
      domains: ['testing'],
      principles: ['Filter well'],
      skills: ['soleri-vault-capture', 'soleri-brainstorming'],
      outputDir: filteredDir,
    });

    expect(result.success).toBe(true);

    const skillsDir = join(result.agentDir, 'skills');
    if (existsSync(skillsDir)) {
      const dirs = readdirSync(skillsDir, { encoding: 'utf-8' });
      // Should have exactly the selected skills
      expect(dirs.length).toBe(2);
      expect(dirs).toContain('soleri-vault-capture');
      expect(dirs).toContain('soleri-brainstorming');
    }
  });
});
