/**
 * Worktree reaper — cleans up stale .claude/worktrees/ entries left by subagent execution.
 *
 * Claude Code creates worktrees via `isolation: "worktree"` for parallel subagent runs.
 * If the agent commits changes, the worktree persists — nobody reaps it automatically.
 *
 * Usage: call worktreeReap() at session start and after plan completion (best-effort).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ReapReport {
  /** Number of worktrees successfully reaped */
  reaped: number;
  /** Paths of stale worktrees found */
  found: string[];
  /** Any errors encountered (non-fatal) */
  errors: string[];
  /** Whether git worktree prune ran successfully */
  pruned: boolean;
}

export interface WorktreeStatus {
  /** All .claude/worktrees/ entries found */
  stale: Array<{ path: string; branch: string; commit: string }>;
  /** Total count */
  total: number;
}

/**
 * Parse `git worktree list --porcelain` output into structured entries.
 */
function parseWorktreeList(
  output: string,
): Array<{ path: string; branch: string; commit: string }> {
  const entries: Array<{ path: string; branch: string; commit: string }> = [];
  const blocks = output.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    let path = '';
    let branch = '';
    let commit = '';

    for (const line of lines) {
      if (line.startsWith('worktree ')) path = line.slice(9).trim();
      else if (line.startsWith('HEAD ')) commit = line.slice(5).trim();
      else if (line.startsWith('branch ')) branch = line.slice(7).trim();
    }

    if (path) entries.push({ path, branch, commit });
  }

  return entries;
}

/**
 * Get status of stale worktrees under .claude/worktrees/ without removing them.
 */
export function worktreeStatus(projectPath: string): WorktreeStatus {
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: projectPath,
    encoding: 'utf-8',
  });

  if (result.status !== 0 || !result.stdout) {
    return { stale: [], total: 0 };
  }

  const all = parseWorktreeList(result.stdout);
  const worktreeBase = join(projectPath, '.claude', 'worktrees');
  const stale = all.filter((e) => e.path.startsWith(worktreeBase) && existsSync(e.path));

  return { stale, total: stale.length };
}

/**
 * Reap stale worktrees under .claude/worktrees/.
 * Best-effort — errors are collected but never thrown.
 */
export function worktreeReap(projectPath: string): ReapReport {
  const report: ReapReport = { reaped: 0, found: [], errors: [], pruned: false };

  try {
    const { stale } = worktreeStatus(projectPath);

    for (const { path } of stale) {
      report.found.push(path);
      const rm = spawnSync('git', ['worktree', 'remove', '--force', path], {
        cwd: projectPath,
        encoding: 'utf-8',
      });
      if (rm.status === 0) {
        report.reaped++;
      } else {
        report.errors.push(`Failed to remove ${path}: ${rm.stderr?.trim() ?? 'unknown error'}`);
      }
    }

    // Prune dangling refs
    const prune = spawnSync('git', ['worktree', 'prune'], {
      cwd: projectPath,
      encoding: 'utf-8',
    });
    report.pruned = prune.status === 0;
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  return report;
}
