/**
 * Tests for capture-hook.ts — git context collection and enriched session memory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectSessionGitContext } from './capture-hook.js';
import type { GitSessionContext } from './capture-hook.js';

// Mock child_process.execFileSync
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  mockExecFileSync.mockReset();
});

describe('collectSessionGitContext', () => {
  it('returns branch, commits, and files for a normal repo', () => {
    // 1st call: git rev-parse --abbrev-ref HEAD
    mockExecFileSync.mockReturnValueOnce('feat/session-enrichment\n');
    // 2nd call: git log
    mockExecFileSync.mockReturnValueOnce(
      'abc1234 feat: add git context\ndef5678 fix: handle timeout\n',
    );
    // 3rd call: git diff --name-only
    mockExecFileSync.mockReturnValueOnce(
      'packages/core/src/transcript/capture-hook.ts\npackages/core/src/runtime/session-briefing.ts\n',
    );

    const result = collectSessionGitContext('/project');

    expect(result).not.toBeNull();
    const ctx = result as GitSessionContext;
    expect(ctx.branch).toBe('feat/session-enrichment');
    expect(ctx.commits).toHaveLength(2);
    expect(ctx.commits[0]).toEqual({ hash: 'abc1234', message: 'feat: add git context' });
    expect(ctx.commits[1]).toEqual({ hash: 'def5678', message: 'fix: handle timeout' });
    expect(ctx.filesChanged).toHaveLength(2);
    expect(ctx.filesChanged[0]).toBe('packages/core/src/transcript/capture-hook.ts');
  });

  it('passes --since flag when sessionStartTimestamp is provided', () => {
    mockExecFileSync.mockReturnValueOnce('main\n');
    mockExecFileSync.mockReturnValueOnce('abc1234 feat: something\n');
    mockExecFileSync.mockReturnValueOnce('file.ts\n');

    const timestamp = 1775900000000; // A specific timestamp
    collectSessionGitContext('/project', timestamp);

    // Second call should be git log with --since
    const logCall = mockExecFileSync.mock.calls[1];
    expect(logCall[0]).toBe('git');
    const args = logCall[1] as string[];
    const sinceArg = args.find((a) => a.startsWith('--since='));
    expect(sinceArg).toBeDefined();
    expect(sinceArg).toContain(new Date(timestamp).toISOString());
  });

  it('uses -20 fallback when no sessionStartTimestamp', () => {
    mockExecFileSync.mockReturnValueOnce('main\n');
    mockExecFileSync.mockReturnValueOnce('abc1234 feat: something\n');
    mockExecFileSync.mockReturnValueOnce('file.ts\n');

    collectSessionGitContext('/project');

    const logCall = mockExecFileSync.mock.calls[1];
    const args = logCall[1] as string[];
    expect(args).toContain('-20');
  });

  it('returns null when not a git repo', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });

    const result = collectSessionGitContext('/not-a-repo');
    expect(result).toBeNull();
  });

  it('returns null on git command timeout', () => {
    mockExecFileSync.mockImplementation(() => {
      const err = new Error('Command timed out');
      (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      throw err;
    });

    const result = collectSessionGitContext('/slow-repo');
    expect(result).toBeNull();
  });

  it('returns empty commits and files when no commits in window', () => {
    mockExecFileSync.mockReturnValueOnce('main\n');
    // git log returns empty
    mockExecFileSync.mockReturnValueOnce('');

    const result = collectSessionGitContext('/quiet-repo');

    expect(result).not.toBeNull();
    const ctx = result as GitSessionContext;
    expect(ctx.branch).toBe('main');
    expect(ctx.commits).toHaveLength(0);
    expect(ctx.filesChanged).toHaveLength(0);
  });

  it('handles detached HEAD gracefully', () => {
    // git rev-parse returns HEAD when detached
    mockExecFileSync.mockReturnValueOnce('HEAD\n');
    mockExecFileSync.mockReturnValueOnce('abc1234 fix: hotfix\n');
    mockExecFileSync.mockReturnValueOnce('file.ts\n');

    const result = collectSessionGitContext('/detached');

    expect(result).not.toBeNull();
    const ctx = result as GitSessionContext;
    expect(ctx.branch).toBe('HEAD');
    expect(ctx.commits).toHaveLength(1);
  });

  it('falls back to diff-tree when oldest hash parent fails', () => {
    mockExecFileSync.mockReturnValueOnce('main\n');
    mockExecFileSync.mockReturnValueOnce('abc1234 initial commit\n');
    // First diff call fails (no parent for initial commit)
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('bad revision');
    });
    // Fallback diff-tree call
    mockExecFileSync.mockReturnValueOnce('README.md\nsrc/index.ts\n');

    const result = collectSessionGitContext('/fresh-repo');

    expect(result).not.toBeNull();
    const ctx = result as GitSessionContext;
    expect(ctx.filesChanged).toHaveLength(2);
    expect(ctx.filesChanged).toContain('README.md');
  });

  it('passes cwd and timeout options to all git commands', () => {
    mockExecFileSync.mockReturnValueOnce('main\n');
    mockExecFileSync.mockReturnValueOnce('');

    collectSessionGitContext('/my-project');

    for (const call of mockExecFileSync.mock.calls) {
      const opts = call[2] as { cwd: string; timeout: number };
      expect(opts.cwd).toBe('/my-project');
      expect(opts.timeout).toBe(3000);
      expect(opts).toHaveProperty('encoding', 'utf-8');
    }
  });
});
