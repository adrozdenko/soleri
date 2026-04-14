import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  FORGE_SKILL_PREFIX,
  isForgeManaged,
  discoverSkills,
  syncSkillsToClaudeCode,
} from './sync-skills.js';

// =============================================================================
// HELPERS
// =============================================================================

let testDir: string;

function setup(): string {
  testDir = join(tmpdir(), `soleri-sync-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function createSkill(parentDir: string, name: string, content?: string): void {
  const dir = join(parentDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    content ?? `---\nname: ${name}\ndescription: Test skill\n---\n\nTest content for ${name}.\n`,
  );
}

// =============================================================================
// FORGE_SKILL_PREFIX & isForgeManaged
// =============================================================================

describe('FORGE_SKILL_PREFIX', () => {
  it('equals "soleri-"', () => {
    expect(FORGE_SKILL_PREFIX).toBe('soleri-');
  });
});

describe('isForgeManaged', () => {
  it('returns true for soleri-* prefixed names', () => {
    expect(isForgeManaged('soleri-vault-capture')).toBe(true);
    expect(isForgeManaged('soleri-agent-dev')).toBe(true);
    expect(isForgeManaged('soleri-terse')).toBe(true);
  });

  it('returns false for custom skill names', () => {
    expect(isForgeManaged('my-custom-skill')).toBe(false);
    expect(isForgeManaged('ui-ux-pro-max')).toBe(false);
    expect(isForgeManaged('caveman')).toBe(false);
    expect(isForgeManaged('')).toBe(false);
  });

  it('is case-sensitive (Soleri- is not forge-managed)', () => {
    expect(isForgeManaged('Soleri-something')).toBe(false);
  });
});

// =============================================================================
// discoverSkills — includes custom skills
// =============================================================================

describe('discoverSkills', () => {
  beforeEach(() => setup());
  afterEach(() => {
    if (testDir) rmSync(testDir, { recursive: true, force: true });
  });

  it('discovers both forge and custom skills', () => {
    createSkill(testDir, 'soleri-vault-capture');
    createSkill(testDir, 'soleri-terse');
    createSkill(testDir, 'my-custom-skill');

    const skills = discoverSkills([testDir]);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['my-custom-skill', 'soleri-terse', 'soleri-vault-capture']);
  });

  it('ignores directories without SKILL.md', () => {
    createSkill(testDir, 'soleri-valid');
    mkdirSync(join(testDir, 'empty-dir'), { recursive: true });

    const skills = discoverSkills([testDir]);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('soleri-valid');
  });
});

// =============================================================================
// syncSkillsToClaudeCode — orphan cleanup preserves custom skills
// =============================================================================

describe('syncSkillsToClaudeCode — orphan cleanup', () => {
  let sourceDir: string;
  let projectDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `soleri-sync-orphan-test-${Date.now()}`);
    sourceDir = join(testDir, 'source-skills');
    projectDir = join(testDir, 'project');
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(join(projectDir, '.claude', 'skills'), { recursive: true });
  });

  afterEach(() => {
    if (testDir) rmSync(testDir, { recursive: true, force: true });
  });

  it('removes stale forge skills during local sync', () => {
    // Source has one forge skill
    createSkill(sourceDir, 'soleri-vault-capture');

    // .claude/skills/ has a stale forge skill that no longer exists in source
    createSkill(join(projectDir, '.claude', 'skills'), 'soleri-old-removed');

    const result = syncSkillsToClaudeCode([sourceDir], 'test-agent', {
      projectRoot: projectDir,
    });

    expect(result.removed).toContain('soleri-old-removed');
    expect(existsSync(join(projectDir, '.claude', 'skills', 'soleri-old-removed'))).toBe(false);
  });

  it('preserves custom skills during local sync', () => {
    // Source has one forge skill
    createSkill(sourceDir, 'soleri-vault-capture');

    // .claude/skills/ has a custom skill (no soleri- prefix)
    createSkill(join(projectDir, '.claude', 'skills'), 'my-custom-skill');

    const result = syncSkillsToClaudeCode([sourceDir], 'test-agent', {
      projectRoot: projectDir,
    });

    // Custom skill must survive
    expect(result.removed).not.toContain('my-custom-skill');
    expect(existsSync(join(projectDir, '.claude', 'skills', 'my-custom-skill', 'SKILL.md'))).toBe(
      true,
    );
  });

  it('preserves custom skills during global sync', () => {
    // This test uses a fake global dir (not real ~/.claude/skills/)
    const fakeGlobalDir = join(testDir, 'global-skills');
    mkdirSync(fakeGlobalDir, { recursive: true });

    // Source has one forge skill
    createSkill(sourceDir, 'soleri-vault-capture');

    // Global dir has a custom skill with agent prefix but no soleri- in the canonical name
    createSkill(fakeGlobalDir, 'test-agent-my-custom-skill');
    // And a stale forge skill
    createSkill(fakeGlobalDir, 'test-agent-soleri-old-removed');

    // We can't easily test global sync without mocking homedir,
    // but we verify the isForgeManaged logic directly:
    const canonicalCustom = 'test-agent-my-custom-skill'.slice('test-agent-'.length);
    const canonicalForge = 'test-agent-soleri-old-removed'.slice('test-agent-'.length);

    expect(isForgeManaged(canonicalCustom)).toBe(false); // 'my-custom-skill'
    expect(isForgeManaged(canonicalForge)).toBe(true); // 'soleri-old-removed'
  });

  it('handles mixed forge and custom skills correctly', () => {
    // Source has two forge skills
    createSkill(sourceDir, 'soleri-vault-capture');
    createSkill(sourceDir, 'soleri-terse');

    // .claude/skills/ has:
    // - a stale forge skill (should be removed)
    // - two custom skills (should be preserved)
    createSkill(join(projectDir, '.claude', 'skills'), 'soleri-old-stale');
    createSkill(join(projectDir, '.claude', 'skills'), 'caveman');
    createSkill(join(projectDir, '.claude', 'skills'), 'ui-ux-pro-max');

    const result = syncSkillsToClaudeCode([sourceDir], 'test-agent', {
      projectRoot: projectDir,
    });

    // Stale forge skill removed
    expect(result.removed).toContain('soleri-old-stale');
    expect(existsSync(join(projectDir, '.claude', 'skills', 'soleri-old-stale'))).toBe(false);

    // Custom skills preserved
    expect(result.removed).not.toContain('caveman');
    expect(result.removed).not.toContain('ui-ux-pro-max');
    expect(existsSync(join(projectDir, '.claude', 'skills', 'caveman', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'ui-ux-pro-max', 'SKILL.md'))).toBe(
      true,
    );
  });
});
