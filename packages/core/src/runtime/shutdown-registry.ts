/**
 * Shutdown Registry — centralized cleanup for agent runtime resources.
 *
 * Modules register their cleanup callbacks (clear timers, close watchers,
 * kill child processes). On shutdown, callbacks run in LIFO order so
 * dependents close before their dependencies.
 *
 * Idempotent: calling `closeAll()` multiple times is safe.
 */

export type ShutdownCallback = () => void | Promise<void>;

interface ShutdownEntry {
  name: string;
  callback: ShutdownCallback;
}

export class ShutdownRegistry {
  private entries: ShutdownEntry[] = [];
  private closed = false;

  /**
   * Register a named cleanup callback.
   * Callbacks are invoked in LIFO order (last registered = first closed).
   */
  register(name: string, callback: ShutdownCallback): void {
    if (this.closed) return;
    this.entries.push({ name, callback });
  }

  /**
   * Run all registered cleanup callbacks in LIFO order.
   * Idempotent — subsequent calls are no-ops.
   * Errors in individual callbacks are caught and logged to stderr
   * so that remaining callbacks still execute.
   */
  async closeAll(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // LIFO order
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      try {
        await entry.callback();
      } catch (err) {
        // Log but don't throw — remaining cleanups must still run
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[shutdown] ${entry.name}: ${msg}\n`);
      }
    }

    this.entries = [];
  }

  /**
   * Synchronous close — best-effort for non-async callbacks.
   * Use when you can't await (e.g. process.on('exit')).
   */
  closeAllSync(): void {
    if (this.closed) return;
    this.closed = true;

    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      try {
        entry.callback();
      } catch {
        // Best-effort — swallow errors in sync path
      }
    }

    this.entries = [];
  }

  /** Number of registered callbacks. */
  get size(): number {
    return this.entries.length;
  }

  /** Whether closeAll() has been called. */
  get isClosed(): boolean {
    return this.closed;
  }
}
