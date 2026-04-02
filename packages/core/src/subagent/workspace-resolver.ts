/**
 * WorkspaceResolver — Git worktree isolation for subagent tasks.
 *
 * When isolation is requested, creates a dedicated git worktree per task
 * at `<baseDir>/.soleri/worktrees/<taskId>/`. Falls back gracefully to the
 * original workspace if git worktree creation fails.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { WorktreeInfo } from './types.js';

const EXEC_OPTS = { encoding: 'utf-8' as const, timeout: 30_000 };

export class WorkspaceResolver {
  private readonly baseDir: string;
  private readonly worktrees = new Map<string, WorktreeInfo>();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Resolve a workspace path for a task.
   *
   * If `isolate` is true, creates a git worktree at
   * `<baseDir>/.soleri/worktrees/<taskId>/` on branch `subagent/<taskId>`.
   * Returns the worktree path on success, or the original `workspace` on failure.
   *
   * If `isolate` is false, returns `workspace` as-is.
   */
  resolve(taskId: string, workspace: string, isolate: boolean): string {
    if (!isolate) {
      return workspace;
    }

    try {
      const worktreePath = join(this.baseDir, '.soleri', 'worktrees', taskId);
      const branch = `subagent/${taskId}`;

      // Ensure parent directory exists
      const parentDir = join(this.baseDir, '.soleri', 'worktrees');
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      execSync(`git worktree add "${worktreePath}" -b "${branch}"`, {
        ...EXEC_OPTS,
        cwd: this.baseDir,
      });

      const info: WorktreeInfo = {
        taskId,
        path: worktreePath,
        branch,
        createdAt: Date.now(),
      };
      this.worktrees.set(taskId, info);

      return worktreePath;
    } catch (err) {
      // Graceful fallback — log warning and return original workspace
      console.warn(
        `[WorkspaceResolver] Failed to create worktree for task "${taskId}":`,
        err instanceof Error ? err.message : err,
      );
      return workspace;
    }
  }

  /**
   * Remove the worktree for a given task.
   * Deletes the worktree directory and local branch.
   * Worktree branches are local-only — never pushed to remote.
   * Silently handles errors (e.g., worktree already removed).
   */
  cleanup(taskId: string): void {
    const info = this.worktrees.get(taskId);
    if (!info) {
      return;
    }

    try {
      execSync(`git worktree remove "${info.path}" --force`, { ...EXEC_OPTS, cwd: this.baseDir });
    } catch {
      // Silently ignore — worktree may already be gone
    }

    // Clean up the local branch (worktree branches are local-only)
    if (info.branch) {
      try {
        execSync(`git branch -D "${info.branch}"`, { ...EXEC_OPTS, cwd: this.baseDir });
      } catch {
        // Silently ignore — branch may not exist
      }
    }

    this.worktrees.delete(taskId);
  }

  /** Remove all active worktrees. */
  cleanupAll(): void {
    for (const taskId of Array.from(this.worktrees.keys())) {
      this.cleanup(taskId);
    }
  }

  /** Return all currently active worktrees. */
  listActive(): WorktreeInfo[] {
    return [...this.worktrees.values()];
  }

  /** Check whether a worktree exists for the given task. */
  isActive(taskId: string): boolean {
    return this.worktrees.has(taskId);
  }
}
