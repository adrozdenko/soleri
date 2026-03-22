/**
 * Colocated tests for domain-packs/skills-installer.ts
 *
 * Tests: install, skip existing, force overwrite, missing source, empty skills.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSkills } from './skills-installer.js';
import type { DomainPack } from './types.js';

let tempDir: string;
let sourceDir: string;
let targetDir: string;

function mockPack(overrides: Partial<DomainPack> = {}): DomainPack {
  return {
    name: 'test-pack',
    version: '1.0.0',
    domains: ['testing'],
    ops: [],
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'skills-test-'));
  sourceDir = join(tempDir, 'pack-root');
  targetDir = join(tempDir, 'agent-skills');
  mkdirSync(sourceDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('installSkills', () => {
  it('returns zeros when pack has no skills', () => {
    const result = installSkills(mockPack(), targetDir, sourceDir);
    expect(result).toEqual({ installed: 0, skipped: 0 });
  });

  it('returns zeros when skills array is empty', () => {
    const result = installSkills(mockPack({ skills: [] }), targetDir, sourceDir);
    expect(result).toEqual({ installed: 0, skipped: 0 });
  });

  it('installs skill files to target directory', () => {
    const skillPath = join(sourceDir, 'my-skill.md');
    writeFileSync(skillPath, '# My Skill\nDo the thing.');
    const result = installSkills(
      mockPack({ skills: [{ name: 'my-skill', path: 'my-skill.md' }] }),
      targetDir,
      sourceDir,
    );
    expect(result.installed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(existsSync(join(targetDir, 'my-skill.md'))).toBe(true);
    expect(readFileSync(join(targetDir, 'my-skill.md'), 'utf-8')).toContain('# My Skill');
  });

  it('creates target directory if it does not exist', () => {
    const skillPath = join(sourceDir, 'skill.md');
    writeFileSync(skillPath, 'Content.');
    const nestedTarget = join(tempDir, 'deeply', 'nested', 'skills');
    installSkills(
      mockPack({ skills: [{ name: 'skill', path: 'skill.md' }] }),
      nestedTarget,
      sourceDir,
    );
    expect(existsSync(join(nestedTarget, 'skill.md'))).toBe(true);
  });

  it('skips existing skill files by default', () => {
    const skillPath = join(sourceDir, 'existing.md');
    writeFileSync(skillPath, 'New content.');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'existing.md'), 'Old content.');
    const result = installSkills(
      mockPack({ skills: [{ name: 'existing', path: 'existing.md' }] }),
      targetDir,
      sourceDir,
    );
    expect(result.skipped).toBe(1);
    expect(result.installed).toBe(0);
    expect(readFileSync(join(targetDir, 'existing.md'), 'utf-8')).toBe('Old content.');
  });

  it('overwrites existing when force is true', () => {
    const skillPath = join(sourceDir, 'existing.md');
    writeFileSync(skillPath, 'New content.');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'existing.md'), 'Old content.');
    const result = installSkills(
      mockPack({ skills: [{ name: 'existing', path: 'existing.md' }] }),
      targetDir,
      sourceDir,
      true,
    );
    expect(result.installed).toBe(1);
    expect(readFileSync(join(targetDir, 'existing.md'), 'utf-8')).toBe('New content.');
  });

  it('skips when source file does not exist', () => {
    const result = installSkills(
      mockPack({ skills: [{ name: 'missing', path: 'nonexistent.md' }] }),
      targetDir,
      sourceDir,
    );
    expect(result.skipped).toBe(1);
    expect(result.installed).toBe(0);
  });

  it('handles mix of installable and skippable skills', () => {
    writeFileSync(join(sourceDir, 'good.md'), 'Good skill.');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'existing.md'), 'Existing.');
    writeFileSync(join(sourceDir, 'existing.md'), 'New.');
    const result = installSkills(
      mockPack({
        skills: [
          { name: 'good', path: 'good.md' },
          { name: 'existing', path: 'existing.md' },
          { name: 'missing', path: 'no-file.md' },
        ],
      }),
      targetDir,
      sourceDir,
    );
    expect(result.installed).toBe(1);
    expect(result.skipped).toBe(2);
  });
});
