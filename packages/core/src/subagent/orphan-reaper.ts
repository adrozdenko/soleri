/**
 * OrphanReaper — tracks spawned child processes and detects dead/orphaned ones.
 *
 * Uses `process.kill(pid, 0)` (signal 0) as an existence check:
 * - No error → process is alive
 * - ESRCH → process is dead (reap it)
 * - EPERM → process is alive but we lack permission to signal it
 */

import type { TrackedProcess } from './types.js';

/** Result of a reap cycle. */
export interface ReapResult {
  /** Task IDs of processes that were found dead and cleaned up. */
  reaped: string[];
  /** Task IDs of processes that are still alive. */
  alive: string[];
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
   * tracking, the onOrphan callback is invoked, and the result summarises
   * which task IDs were reaped vs still alive.
   */
  reap(): ReapResult {
    const reaped: string[] = [];
    const alive: string[] = [];

    for (const [pid, entry] of this.tracked) {
      if (!this.isAlive(pid)) {
        this.tracked.delete(pid);
        this.onOrphan?.(entry.taskId, pid);
        reaped.push(entry.taskId);
      } else {
        alive.push(entry.taskId);
      }
    }

    return { reaped, alive };
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
