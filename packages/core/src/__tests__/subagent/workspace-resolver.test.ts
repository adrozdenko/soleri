import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
}));

import { WorkspaceResolver } from '../../subagent/workspace-resolver.js';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

/** Normalize path separators to forward slashes for cross-platform assertions. */
const norm = (p: string): string => p.replace(/\\/g, '/');

describe('WorkspaceResolver', () => {
  let resolver: WorkspaceResolver;
  const baseDir = '/projects/test-repo';

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new WorkspaceResolver(baseDir);
  });

  it('resolve() returns original workspace when isolate=false', () => {
    const result = resolver.resolve('task-1', '/original/workspace', false);
    expect(result).toBe('/original/workspace');
    expect(execSync).not.toHaveBeenCalled();
  });

  it('resolve() creates a worktree when isolate=true', () => {
    (execSync as ReturnType<typeof vi.fn>).mockReturnValue('');

    const result = resolver.resolve('task-1', '/original/workspace', true);
    expect(norm(result)).toBe(`${baseDir}/.soleri/worktrees/task-1`);
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree add'),
      expect.objectContaining({ cwd: baseDir }),
    );
  });

  it('resolve() falls back to original workspace when git fails', () => {
    (execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('git worktree failed');
    });

    // Suppress console.warn from the fallback
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = resolver.resolve('task-fail', '/original/workspace', true);
    expect(result).toBe('/original/workspace');
    warnSpy.mockRestore();
  });

  it('cleanup() calls git worktree remove, git branch -D, and git push origin --delete', () => {
    (execSync as ReturnType<typeof vi.fn>).mockReturnValue('');

    // First create a worktree
    resolver.resolve('task-1', '/original', true);
    vi.clearAllMocks();

    // Now clean it up
    resolver.cleanup('task-1');
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree remove'),
      expect.objectContaining({ cwd: baseDir }),
    );
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('git branch -D'),
      expect.objectContaining({ cwd: baseDir }),
    );
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('git push origin --delete'),
      expect.objectContaining({ cwd: baseDir }),
    );
  });

  it('cleanup() silently handles errors', () => {
    (execSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce('') // worktree add succeeds
      .mockImplementation(() => {
        throw new Error('worktree already removed');
      });

    resolver.resolve('task-err', '/original', true);

    // Should not throw
    expect(() => resolver.cleanup('task-err')).not.toThrow();
  });

  it('cleanup() is a no-op for unknown task IDs', () => {
    resolver.cleanup('nonexistent');
    expect(execSync).not.toHaveBeenCalled();
  });

  it('listActive() tracks created worktrees', () => {
    (execSync as ReturnType<typeof vi.fn>).mockReturnValue('');

    resolver.resolve('task-a', '/ws', true);
    resolver.resolve('task-b', '/ws', true);

    const active = resolver.listActive();
    expect(active).toHaveLength(2);
    expect(active.map((w) => w.taskId).sort()).toEqual(['task-a', 'task-b']);
    expect(norm(active[0].path)).toContain('.soleri/worktrees/');
    expect(active[0].branch).toContain('subagent/');
    expect(active[0].createdAt).toBeGreaterThan(0);
  });

  it('cleanupAll() removes all worktrees', () => {
    (execSync as ReturnType<typeof vi.fn>).mockReturnValue('');

    resolver.resolve('task-a', '/ws', true);
    resolver.resolve('task-b', '/ws', true);
    expect(resolver.listActive()).toHaveLength(2);

    resolver.cleanupAll();
    expect(resolver.listActive()).toHaveLength(0);
  });

  it('isActive() returns correct state', () => {
    (execSync as ReturnType<typeof vi.fn>).mockReturnValue('');

    expect(resolver.isActive('task-1')).toBe(false);
    resolver.resolve('task-1', '/ws', true);
    expect(resolver.isActive('task-1')).toBe(true);
  });

  it('resolve() creates parent directory if it does not exist', () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (execSync as ReturnType<typeof vi.fn>).mockReturnValue('');

    resolver.resolve('task-mkdir', '/ws', true);
    const calledPath = (mkdirSync as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(norm(calledPath)).toContain('.soleri/worktrees');
    expect((mkdirSync as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual(
      expect.objectContaining({ recursive: true }),
    );
  });
});
