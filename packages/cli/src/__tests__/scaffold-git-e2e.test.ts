import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { scaffoldFileTree } from '@soleri/forge/lib';
import { gitInit, gitInitialCommit } from '../utils/git.js';
import type { AgentYamlInput } from '@soleri/forge/lib';

// ─── Helpers ─────────────────────────────────────────────────────────

const MINIMAL_AGENT: AgentYamlInput = {
  id: 'test-agent',
  name: 'Test Agent',
  role: 'Testing assistant',
  description: 'A minimal agent used for scaffold + git E2E tests',
};

function gitCommand(dir: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: dir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('scaffold + git init (E2E)', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'soleri-git-e2e-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('scaffold with git init produces a valid git repo', async () => {
    const outputDir = makeTempDir();
    const result = scaffoldFileTree(MINIMAL_AGENT, outputDir);
    expect(result.success).toBe(true);

    const agentDir = result.agentDir;

    // Initialize git and create initial commit
    const initResult = await gitInit(agentDir);
    expect(initResult.ok).toBe(true);

    const commitResult = await gitInitialCommit(agentDir, 'feat: scaffold agent "test-agent"');
    expect(commitResult.ok).toBe(true);

    // .git directory exists
    expect(existsSync(join(agentDir, '.git'))).toBe(true);

    // Exactly 1 commit
    const log = gitCommand(agentDir, 'log', '--oneline');
    const commits = log.split('\n').filter(Boolean);
    expect(commits).toHaveLength(1);

    // Commit message contains expected text
    expect(commits[0]).toContain('feat: scaffold agent');

    // Working tree is clean — no untracked files
    const status = gitCommand(agentDir, 'status', '--porcelain');
    expect(status).toBe('');
  });

  it('.gitignore exclusions are respected', async () => {
    const outputDir = makeTempDir();
    const result = scaffoldFileTree(MINIMAL_AGENT, outputDir);
    expect(result.success).toBe(true);

    const agentDir = result.agentDir;

    await gitInit(agentDir);
    await gitInitialCommit(agentDir, 'feat: scaffold agent "test-agent"');

    const trackedFiles = gitCommand(agentDir, 'ls-files');

    // Auto-generated files must NOT be tracked
    expect(trackedFiles).not.toContain('CLAUDE.md');
    expect(trackedFiles).not.toContain('AGENTS.md');
    expect(trackedFiles).not.toContain('instructions/_engine.md');

    // Important source-of-truth files MUST be tracked
    expect(trackedFiles).toContain('agent.yaml');
    expect(trackedFiles).toContain('.gitignore');
  });

  it('scaffold without git does not create a .git directory', () => {
    const outputDir = makeTempDir();
    const result = scaffoldFileTree(MINIMAL_AGENT, outputDir);
    expect(result.success).toBe(true);

    // No git init called — .git must not exist
    expect(existsSync(join(result.agentDir, '.git'))).toBe(false);
  });
});
