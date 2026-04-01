import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// =============================================================================
// HELPERS
// =============================================================================

let sourceDir: string;
let fakeHome: string;

function setup(): void {
  const base = join(tmpdir(), `soleri-sync-test-${Date.now()}`);
  mkdirSync(base, { recursive: true });

  sourceDir = join(base, 'source-skills');
  mkdirSync(sourceDir, { recursive: true });

  fakeHome = join(base, 'fake-home');
  mkdirSync(join(fakeHome, '.claude', 'skills'), { recursive: true });
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
function createTargetSkillDir(name: string): string {
  const dir = join(fakeHome, '.claude', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\n---\n\nStale skill.\n`);
  return dir;
}

function targetSkillsDir(): string {
  return join(fakeHome, '.claude', 'skills');
}

function targetDirExists(name: string): boolean {
  return existsSync(join(targetSkillsDir(), name));
}

// =============================================================================
// TESTS
// =============================================================================

describe('syncSkillsToClaudeCode — orphan cleanup', () => {
  beforeEach(() => {
    setup();
    // Mock homedir() so syncSkillsToClaudeCode writes to our temp directory
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

  it('removes orphan directories that match the agent prefix', async () => {
    // Source has "my-skill", target has stale "test-agent-old-skill"
    createSourceSkill('my-skill');
    createTargetSkillDir('test-agent-old-skill');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Test Agent');

    // The orphan should be reported as removed
    expect(result.removed).toContain('test-agent-old-skill');
    // The orphan directory should be gone
    expect(targetDirExists('test-agent-old-skill')).toBe(false);
  });

  it('does NOT remove directories that do not match the agent prefix', async () => {
    createSourceSkill('my-skill');
    // "other-agent-skill" does NOT start with "test-agent-"
    createTargetSkillDir('other-agent-skill');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Test Agent');

    // Should still exist — not our prefix
    expect(targetDirExists('other-agent-skill')).toBe(true);
    expect(result.removed).not.toContain('other-agent-skill');
  });

  it('does NOT remove a skill directory that was just synced', async () => {
    createSourceSkill('active-skill');
    // This directory matches the prefix AND is a current skill
    createTargetSkillDir('test-agent-active-skill');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Test Agent');

    // "active-skill" should be synced (installed/updated/skipped), not removed
    const synced = [...result.installed, ...result.updated, ...result.skipped];
    expect(synced).toContain('active-skill');
    expect(result.removed).not.toContain('test-agent-active-skill');
    expect(targetDirExists('test-agent-active-skill')).toBe(true);
  });

  it('returns an empty removed array when there are no orphans', async () => {
    createSourceSkill('only-skill');

    const { syncSkillsToClaudeCode } = await import('../sync-skills.js');
    const result = syncSkillsToClaudeCode([sourceDir], 'Test Agent');

    expect(result.removed).toBeDefined();
    expect(Array.isArray(result.removed)).toBe(true);
    expect(result.removed).toHaveLength(0);
  });
});
