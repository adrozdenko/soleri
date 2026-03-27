import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classifyTrust } from './trust-classifier.js';
import { classifySkills, checkSkillCompatibility, ApprovalRequiredError } from './sync-skills.js';
import type { SkillEntry } from './sync-skills.js';

// =============================================================================
// HELPERS
// =============================================================================

let testDir: string;

function setup(): string {
  testDir = join(tmpdir(), `soleri-trust-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function createSkillDir(parentDir: string, name: string, files: Record<string, string>): string {
  const dir = join(parentDir, name);
  mkdirSync(dir, { recursive: true });
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(dir, filePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return dir;
}

// =============================================================================
// TrustClassifier
// =============================================================================

describe('TrustClassifier', () => {
  beforeEach(() => setup());
  afterEach(() => {
    if (testDir) rmSync(testDir, { recursive: true, force: true });
  });

  it('classifies markdown-only directory', () => {
    const dir = createSkillDir(testDir, 'md-skill', {
      'SKILL.md': '---\nname: test\n---\n# Test Skill',
      'reference.md': '# Reference doc',
    });

    const result = classifyTrust(dir);

    expect(result.trust).toBe('markdown_only');
    expect(result.inventory).toHaveLength(2);
    expect(result.inventory.find((i) => i.path === 'SKILL.md')?.kind).toBe('skill');
    expect(result.inventory.find((i) => i.path === 'reference.md')?.kind).toBe('reference');
  });

  it('classifies directory with assets', () => {
    const dir = createSkillDir(testDir, 'asset-skill', {
      'SKILL.md': '# Skill',
      'logo.png': 'fake-png-data',
      'config.json': '{}',
    });

    const result = classifyTrust(dir);

    expect(result.trust).toBe('assets');
    expect(result.inventory.find((i) => i.path === 'logo.png')?.kind).toBe('asset');
    expect(result.inventory.find((i) => i.path === 'config.json')?.kind).toBe('asset');
  });

  it('classifies directory with scripts', () => {
    const dir = createSkillDir(testDir, 'script-skill', {
      'SKILL.md': '# Skill',
      'setup.sh': '#!/bin/bash\necho hi',
      'helper.ts': 'export const x = 1;',
    });

    const result = classifyTrust(dir);

    expect(result.trust).toBe('scripts');
    expect(result.inventory.filter((i) => i.kind === 'script')).toHaveLength(2);
  });

  it('treats .d.ts files as reference, not scripts', () => {
    const dir = createSkillDir(testDir, 'decl-skill', {
      'SKILL.md': '# Skill',
      'types.d.ts': 'export type Foo = string;',
    });

    const result = classifyTrust(dir);

    expect(result.trust).toBe('markdown_only');
    expect(result.inventory.find((i) => i.path === 'types.d.ts')?.kind).toBe('reference');
  });

  it('returns markdown_only for empty directory', () => {
    const dir = join(testDir, 'empty-skill');
    mkdirSync(dir, { recursive: true });

    const result = classifyTrust(dir);

    expect(result.trust).toBe('markdown_only');
    expect(result.inventory).toHaveLength(0);
  });

  it('returns markdown_only for non-existent directory', () => {
    const result = classifyTrust(join(testDir, 'nonexistent'));

    expect(result.trust).toBe('markdown_only');
    expect(result.inventory).toHaveLength(0);
  });

  it('handles nested directories', () => {
    const dir = createSkillDir(testDir, 'nested-skill', {
      'SKILL.md': '# Skill',
      'sub/helper.js': 'module.exports = {};',
      'sub/deep/readme.md': '# Deep',
    });

    const result = classifyTrust(dir);

    expect(result.trust).toBe('scripts');
    expect(result.inventory).toHaveLength(3);
    expect(result.inventory.find((i) => i.path === 'sub/helper.js')?.kind).toBe('script');
  });

  it('skips hidden directories', () => {
    const dir = createSkillDir(testDir, 'hidden-skill', {
      'SKILL.md': '# Skill',
      '.git/config': 'gitconfig',
    });

    const result = classifyTrust(dir);

    expect(result.inventory.some((i) => i.path.includes('.git'))).toBe(false);
  });
});

// =============================================================================
// checkSkillCompatibility
// =============================================================================

describe('checkSkillCompatibility', () => {
  it('returns unknown when no engine version specified', () => {
    expect(checkSkillCompatibility(undefined, '9.6.0')).toBe('unknown');
  });

  it('returns unknown when no current version available', () => {
    expect(checkSkillCompatibility('>=9.0.0', undefined)).toBe('unknown');
  });

  it('returns compatible for matching version', () => {
    expect(checkSkillCompatibility('>=9.0.0', '9.6.0')).toBe('compatible');
  });

  it('returns invalid for incompatible version', () => {
    expect(checkSkillCompatibility('>=10.0.0', '9.6.0')).toBe('invalid');
  });

  it('returns compatible for caret range', () => {
    expect(checkSkillCompatibility('^9.0.0', '9.6.0')).toBe('compatible');
  });

  it('returns invalid for caret range with major mismatch', () => {
    expect(checkSkillCompatibility('^10.0.0', '9.6.0')).toBe('invalid');
  });
});

// =============================================================================
// classifySkills (integration with approval gate)
// =============================================================================

describe('classifySkills', () => {
  beforeEach(() => setup());
  afterEach(() => {
    if (testDir) rmSync(testDir, { recursive: true, force: true });
  });

  it('classifies markdown-only skills without error', () => {
    createSkillDir(testDir, 'safe-skill', {
      'SKILL.md': '---\nname: safe\n---\n# Safe Skill',
    });

    const skills: SkillEntry[] = [
      { name: 'safe-skill', sourcePath: join(testDir, 'safe-skill', 'SKILL.md') },
    ];

    const result = classifySkills(skills);

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.trust).toBe('markdown_only');
    expect(result[0].metadata?.compatibility).toBe('unknown');
    expect(result[0].metadata?.source.type).toBe('local');
  });

  it('throws ApprovalRequiredError for scripts without approval', () => {
    createSkillDir(testDir, 'risky-skill', {
      'SKILL.md': '# Risky',
      'run.sh': '#!/bin/bash\nrm -rf /',
    });

    const skills: SkillEntry[] = [
      { name: 'risky-skill', sourcePath: join(testDir, 'risky-skill', 'SKILL.md') },
    ];

    expect(() => classifySkills(skills)).toThrow(ApprovalRequiredError);
  });

  it('allows scripts when explicitly approved', () => {
    createSkillDir(testDir, 'approved-skill', {
      'SKILL.md': '# Approved',
      'setup.sh': '#!/bin/bash\necho ok',
    });

    const skills: SkillEntry[] = [
      { name: 'approved-skill', sourcePath: join(testDir, 'approved-skill', 'SKILL.md') },
    ];

    const result = classifySkills(skills, {
      approvedScripts: new Set(['approved-skill']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.trust).toBe('scripts');
  });

  it('reads engine version from SKILL.md frontmatter', () => {
    createSkillDir(testDir, 'versioned-skill', {
      'SKILL.md': '---\nname: versioned\nengineVersion: ">=9.0.0"\n---\n# Versioned',
    });

    const skills: SkillEntry[] = [
      { name: 'versioned-skill', sourcePath: join(testDir, 'versioned-skill', 'SKILL.md') },
    ];

    const result = classifySkills(skills, { currentEngineVersion: '9.6.0' });

    expect(result[0].metadata?.engineVersion).toBe('>=9.0.0');
    expect(result[0].metadata?.compatibility).toBe('compatible');
  });

  it('detects npm source type from node_modules path', () => {
    const npmDir = join(testDir, 'node_modules', '@soleri', 'pack-test');
    mkdirSync(npmDir, { recursive: true });
    writeFileSync(join(npmDir, 'SKILL.md'), '---\nname: npm-skill\n---\n# NPM Skill');

    const skills: SkillEntry[] = [{ name: 'npm-skill', sourcePath: join(npmDir, 'SKILL.md') }];

    const result = classifySkills(skills);

    expect(result[0].metadata?.source.type).toBe('npm');
  });
});
