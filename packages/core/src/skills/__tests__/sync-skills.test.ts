import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// =============================================================================
// HELPERS
// =============================================================================

let sourceDir: string;
let fakeHome: string;
let fakeProject: string;

function setup(): void {
  const base = join(tmpdir(), `soleri-sync-test-${Date.now()}`);
  mkdirSync(base, { recursive: true });

  sourceDir = join(base, 'source-skills');
  mkdirSync(sourceDir, { recursive: true });

  fakeHome = join(base, 'fake-home');
  mkdirSync(join(fakeHome, '.claude', 'skills'), { recursive: true });

  fakeProject = join(base, 'fake-project');
  mkdirSync(join(fakeProject, '.claude', 'skills'), { recursive: true });
}

function teardown(): void {
  if (fakeHome) {
    const base = join(fakeHome, '..');
    rmSync(base, { recursive: true, force: true });
  }
}

/** Create a source skill directory with a minimal SKILL.md */
function createSourceSkill(name: string, content?: string): string {
  const dir = join(sourceDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    content ?? `---\nname: ${name}\n---\n\n# ${name}\n\nA test skill.\n`,
  );
  return dir;
}

/** Create a directory in the fake ~/.claude/skills/ target */
function createGlobalSkillDir(name: string): string {
  const dir = join(fakeHome, '.claude', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\n---\n\nStale skill.\n`);
  return dir;
}

function globalSkillsDir(): string {
  return join(fakeHome, '.claude', 'skills');
}

function globalDirExists(name: string): boolean {
  return existsSync(join(globalSkillsDir(), name));
}

function projectSkillsDir(): string {
  return join(fakeProject, '.claude', 'skills');
}

function projectDirExists(name: string): boolean {
  return existsSync(join(projectSkillsDir(), name));
}

// =============================================================================
// TESTS — Global install (orphan cleanup)
// =============================================================================

describe('syncSkillsToClaudeCode — global orphan cleanup', () => {
  beforeEach(() => {
    setup();
    vi.mock('node:os', async (importOriginal) => {
      const original = await importOriginal<typeof import('node:os')>();
      return {
        ...original,
        homedir: () => fakeHome,
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown();
  });

  it('removes orphan directories that match the agent prefix (global)', async () => {
    createSourceSkill('my-skill');
    createGlobalSkillDir('test-agent-old-skill');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Test Agent', { global: true });

    expect(result.removed).toContain('test-agent-old-skill');
    expect(globalDirExists('test-agent-old-skill')).toBe(false);
  });

  it('does NOT remove directories that do not match the agent prefix (global)', async () => {
    createSourceSkill('my-skill');
    createGlobalSkillDir('other-agent-skill');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Test Agent', { global: true });

    expect(globalDirExists('other-agent-skill')).toBe(true);
    expect(result.removed).not.toContain('other-agent-skill');
  });

  it('does NOT remove a skill directory that was just synced (global)', async () => {
    createSourceSkill('active-skill');
    createGlobalSkillDir('test-agent-active-skill');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Test Agent', { global: true });

    const synced = [...result.installed, ...result.updated, ...result.skipped];
    expect(synced).toContain('active-skill');
    expect(result.removed).not.toContain('test-agent-active-skill');
    expect(globalDirExists('test-agent-active-skill')).toBe(true);
  });

  it('returns an empty removed array when there are no orphans (global)', async () => {
    createSourceSkill('only-skill');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Test Agent', { global: true });

    expect(result.removed).toBeDefined();
    expect(Array.isArray(result.removed)).toBe(true);
    expect(result.removed).toHaveLength(0);
  });
});

// =============================================================================
// TESTS — Project-local install (symlinks + canonical names)
// =============================================================================

describe('syncSkillsToClaudeCode — project-local install', () => {
  beforeEach(() => {
    setup();
    vi.mock('node:os', async (importOriginal) => {
      const original = await importOriginal<typeof import('node:os')>();
      return {
        ...original,
        homedir: () => fakeHome,
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown();
  });

  it('creates symlinks with canonical (unprefixed) names', async () => {
    createSourceSkill('soleri-vault-capture');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Ernesto', {
      projectRoot: fakeProject,
    });

    // Should use canonical name, not "ernesto-soleri-vault-capture"
    expect(result.installed).toContain('soleri-vault-capture');
    expect(projectDirExists('soleri-vault-capture')).toBe(true);

    // Should be a symlink
    const stat = lstatSync(join(projectSkillsDir(), 'soleri-vault-capture'));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('does NOT touch ~/.claude/skills/ during project-local install', async () => {
    createSourceSkill('soleri-vault-capture');
    // Global dir has ernesto-soleri-* entries — project-local sync must leave them alone
    createGlobalSkillDir('ernesto-soleri-vault-capture');
    createGlobalSkillDir('ernesto-soleri-vault-navigator');
    createGlobalSkillDir('other-agent-skill');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Ernesto', {
      projectRoot: fakeProject,
    });

    // cleanedGlobal must be empty — project-local sync must not remove global entries
    expect(result.cleanedGlobal).toHaveLength(0);
    expect(globalDirExists('ernesto-soleri-vault-capture')).toBe(true);
    expect(globalDirExists('ernesto-soleri-vault-navigator')).toBe(true);
    expect(globalDirExists('other-agent-skill')).toBe(true);
  });
});
