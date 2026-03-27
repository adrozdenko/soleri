/**
 * Per-agent-type semaphore for controlling concurrent subagent runs.
 *
 * Pure promise-based — zero external deps. FIFO ordering guarantees
 * the first waiter is the first to acquire a slot when one frees up.
 */

interface TypeState {
  active: number;
  waiters: Array<() => void>;
}

const DEFAULT_MAX_CONCURRENT = 3;

export class ConcurrencyManager {
  private state: Map<string, TypeState> = new Map();

  /**
   * Acquire a concurrency slot for the given adapter type.
   * Resolves immediately if a slot is available, otherwise queues
   * and resolves when a slot frees up (FIFO).
   */
  async acquire(type: string, maxConcurrent: number = DEFAULT_MAX_CONCURRENT): Promise<void> {
    const entry = this.getOrCreate(type);

    if (entry.active < maxConcurrent) {
      entry.active++;
      return;
    }

    // At capacity — park until a slot opens.
    return new Promise<void>((resolve) => {
      entry.waiters.push(() => {
        entry.active++;
        resolve();
      });
    });
  }

  /**
   * Release a concurrency slot for the given adapter type.
   * If waiters exist, the first one (FIFO) is unblocked.
   * No-op if the type is not tracked.
   */
  release(type: string): void {
    const entry = this.state.get(type);
    if (!entry) return;

    entry.active = Math.max(0, entry.active - 1);

    if (entry.waiters.length > 0) {
      const next = entry.waiters.shift()!;
      next();
    }
  }

  /** Return the number of active slots for a type (0 if untracked). */
  getActive(type: string): number {
    return this.state.get(type)?.active ?? 0;
  }

  /** Return the number of waiters queued for a type (0 if untracked). */
  getWaiting(type: string): number {
    return this.state.get(type)?.waiters.length ?? 0;
  }

  /** Clear all state, resolving any pending waiters immediately. */
  reset(): void {
    for (const entry of this.state.values()) {
      for (const waiter of entry.waiters) {
        waiter();
      }
      entry.waiters.length = 0;
      entry.active = 0;
    }
    this.state.clear();
  }

  // ── internal ──────────────────────────────────────────────────────

  private getOrCreate(type: string): TypeState {
    let entry = this.state.get(type);
    if (!entry) {
      entry = { active: 0, waiters: [] };
      this.state.set(type, entry);
    }
    return entry;
  }
}
