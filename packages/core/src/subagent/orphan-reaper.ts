/**
 * OrphanReaper — tracks spawned child processes and detects dead/orphaned ones.
 *
 * Uses `process.kill(pid, 0)` (signal 0) as an existence check:
 * - No error → process is alive
 * - ESRCH → process is dead (reap it)
 * - EPERM → process is alive but we lack permission to signal it
 *
 * Process group management:
 * - `killProcessGroup()` sends a signal to the entire process group (-pid)
 * - `killAll()` kills all tracked processes via process groups
 * - Group kill only works if the child was spawned with `detached: true`
 *   or is otherwise a process group leader. Falls back to single-process
 *   kill when the group doesn't exist (ESRCH on -pid).
 */

import type { TrackedProcess } from './types.js';

/** Result of a process group kill attempt */
export interface ProcessGroupKillResult {
  /** Whether the kill signal was delivered */
  killed: boolean;
  /** Whether the group or single-process kill path was used */
  method: 'group' | 'single';
}

export class OrphanReaper {
  private readonly tracked = new Map<number, TrackedProcess>();
  private readonly onOrphan?: (taskId: string, pid: number) => void;

  constructor(onOrphan?: (taskId: string, pid: number) => void) {
    this.onOrphan = onOrphan;
  }

  /** Start tracking a process. */
  register(pid: number, taskId: string): void {
    this.tracked.set(pid, { pid, taskId, registeredAt: Date.now() });
  }

  /** Stop tracking a process (called on normal completion). */
  unregister(pid: number): void {
    this.tracked.delete(pid);
  }

  /**
   * Check each tracked PID for liveness. Dead processes are removed from
   * tracking, the onOrphan callback is invoked, and they are returned.
   */
  reap(): TrackedProcess[] {
    const reaped: TrackedProcess[] = [];

    for (const [pid, entry] of this.tracked) {
      if (!this.isAlive(pid)) {
        this.tracked.delete(pid);
        this.onOrphan?.(entry.taskId, pid);
        reaped.push(entry);
      }
    }

    return reaped;
  }

  /** Return all currently tracked processes. */
  listTracked(): TrackedProcess[] {
    return [...this.tracked.values()];
  }

  /** Check if a PID is currently tracked. */
  isTracked(pid: number): boolean {
    return this.tracked.has(pid);
  }

  /** Clear all tracked processes without killing them. */
  clear(): void {
    this.tracked.clear();
  }

  /**
   * Kill an entire process group by negating the PID.
   *
   * Attempts `process.kill(-pid, signal)` first to kill the whole group.
   * Falls back to `process.kill(pid, signal)` if the group kill fails
   * (e.g., ESRCH when the process isn't a group leader).
   *
   * **Limitation:** Group kill only works if the child was spawned with
   * `detached: true` or is otherwise a process group leader. On macOS,
   * `process.kill(-pid)` works for process group leaders.
   */
  killProcessGroup(pid: number, signal: NodeJS.Signals = 'SIGTERM'): ProcessGroupKillResult {
    // Try group kill first
    try {
      process.kill(-pid, signal);
      return { killed: true, method: 'group' };
    } catch (groupErr: unknown) {
      const groupCode = (groupErr as NodeJS.ErrnoException).code;
      // ESRCH on the group means it's not a group leader — fall back to single
      if (groupCode === 'ESRCH') {
        try {
          process.kill(pid, signal);
          return { killed: true, method: 'single' };
        } catch {
          // Process is already dead
          return { killed: false, method: 'single' };
        }
      }
      // EPERM means the process group exists but we can't signal it
      // Any other error — process is dead or inaccessible
      return { killed: false, method: 'group' };
    }
  }

  /**
   * Kill all tracked processes via process groups and clear tracking.
   *
   * Returns a summary of kill results keyed by PID.
   */
  killAll(signal: NodeJS.Signals = 'SIGTERM'): Map<number, ProcessGroupKillResult> {
    const results = new Map<number, ProcessGroupKillResult>();

    for (const [pid] of this.tracked) {
      results.set(pid, this.killProcessGroup(pid, signal));
    }

    this.tracked.clear();
    return results;
  }

  // ── internals ──────────────────────────────────────────────────────

  /**
   * Signal-0 existence check.
   * - No error → alive
   * - EPERM   → alive (exists but we can't signal it)
   * - ESRCH   → dead
   */
  private isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EPERM') return true;
      // ESRCH or any other error → treat as dead
      return false;
    }
  }
}
