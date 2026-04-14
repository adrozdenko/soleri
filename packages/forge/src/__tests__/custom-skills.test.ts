import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateSkills } from '../templates/skills.js';

// =============================================================================
// HELPERS
// =============================================================================

let testDir: string;

function setup(): string {
  testDir = join(tmpdir(), `forge-custom-skills-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function createSkill(parentDir: string, name: string, content?: string): void {
  const dir = join(parentDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    content ??
      `---\nname: ${name}\ndescription: Test skill for ${name}\n---\n\nContent for ${name}.\n`,
  );
}

// =============================================================================
// generateSkills — custom skill discovery via targetDir
// =============================================================================

describe('generateSkills with targetDir', () => {
  beforeEach(() => setup());
  afterEach(() => {
    if (testDir) rmSync(testDir, { recursive: true, force: true });
  });

  it('includes custom skills from targetDir', () => {
    // Create a target directory with a custom skill
    const targetDir = join(testDir, 'skills');
    createSkill(
      targetDir,
      'my-custom-skill',
      `---\nname: my-custom-skill\ndescription: My custom skill\n---\n\nCustom content.\n`,
    );

    const files = generateSkills({ id: 'test', targetDir });

    // Find the custom skill in the output
    const customEntry = files.find(([path]) => path.includes('my-custom-skill'));
    expect(customEntry).toBeDefined();
    expect(customEntry![1]).toContain('Custom content.');
  });

  it('does not transform custom skills (no YOUR_AGENT_ replacement)', () => {
    const targetDir = join(testDir, 'skills');
    createSkill(
      targetDir,
      'my-tool',
      `---\nname: my-tool\ndescription: Uses YOUR_AGENT_core\n---\n\nCall YOUR_AGENT_vault.\n`,
    );

    const files = generateSkills({ id: 'test', targetDir });
    const entry = files.find(([path]) => path.includes('my-tool'));
    expect(entry).toBeDefined();
    // Custom skills are pass-through: YOUR_AGENT_ should NOT be replaced
    expect(entry![1]).toContain('YOUR_AGENT_core');
    expect(entry![1]).toContain('YOUR_AGENT_vault');
  });

  it('does not inject feedback blocks into custom skills', () => {
    const targetDir = join(testDir, 'skills');
    createSkill(targetDir, 'my-plain-skill');

    const files = generateSkills({ id: 'test', targetDir });
    const entry = files.find(([path]) => path.includes('my-plain-skill'));
    expect(entry).toBeDefined();
    // No announce/completion injection for custom skills
    expect(entry![1]).not.toContain('## Announce');
    expect(entry![1]).not.toContain('## Completion');
  });

  it('skips soleri-* prefixed entries in targetDir (forge handles those)', () => {
    const targetDir = join(testDir, 'skills');
    createSkill(targetDir, 'soleri-fake-forge');
    createSkill(targetDir, 'my-real-custom');

    const files = generateSkills({ id: 'test', targetDir });

    // The soleri-* skill from targetDir should not appear (forge source handles those)
    // Only forge's own soleri-* skills + the custom skill should be in output
    const targetCustom = files.find(([path]) => path.includes('my-real-custom'));
    expect(targetCustom).toBeDefined();

    // soleri-fake-forge from targetDir should not appear as a duplicate
    // (it would only appear if forge has it in its source, which it doesn't)
    const fakeForge = files.filter(([path]) => path.includes('soleri-fake-forge'));
    expect(fakeForge).toHaveLength(0);
  });

  it('works without targetDir (backward compatible)', () => {
    const files = generateSkills({ id: 'test' });

    // Should return forge skills only
    expect(files.length).toBeGreaterThan(0);
    for (const [path] of files) {
      const skillName = path.split('/')[1] ?? '';
      expect(skillName.startsWith('soleri-')).toBe(true);
    }
  });

  it('handles nonexistent targetDir gracefully', () => {
    const files = generateSkills({
      id: 'test',
      targetDir: join(testDir, 'nonexistent'),
    });

    // Should still return forge skills
    expect(files.length).toBeGreaterThan(0);
  });
});
