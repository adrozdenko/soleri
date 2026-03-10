/**
 * Task Cancellation Manager — per-chat AbortController management.
 *
 * Maps chat/session IDs to AbortControllers so running tasks can be
 * cancelled from commands (e.g. /stop) or inline buttons.
 *
 * The agent loop already accepts AbortSignal — this provides the
 * lifecycle management layer on top.
 */

export interface CancellationInfo {
  /** The AbortController for this task. */
  controller: AbortController;
  /** Unix timestamp ms when the task started. */
  startedAt: number;
  /** Optional description of what's running. */
  description?: string;
}

export class TaskCancellationManager {
  private active = new Map<string, CancellationInfo>();

  /**
   * Create a new AbortController for a chat/session.
   * If one already exists, it is cancelled first.
   */
  create(chatId: string, description?: string): AbortSignal {
    // Cancel existing task if any
    this.cancel(chatId);

    const controller = new AbortController();
    this.active.set(chatId, {
      controller,
      startedAt: Date.now(),
      description,
    });

    return controller.signal;
  }

  /**
   * Cancel the running task for a chat. Returns info about what was cancelled.
   */
  cancel(chatId: string): CancellationInfo | null {
    const info = this.active.get(chatId);
    if (!info) return null;

    info.controller.abort();
    this.active.delete(chatId);
    return info;
  }

  /**
   * Mark a task as complete (remove without aborting).
   */
  complete(chatId: string): void {
    this.active.delete(chatId);
  }

  /**
   * Check if a chat has a running task.
   */
  isRunning(chatId: string): boolean {
    return this.active.has(chatId);
  }

  /**
   * Get info about a running task.
   */
  getInfo(chatId: string): CancellationInfo | null {
    return this.active.get(chatId) ?? null;
  }

  /**
   * Get all running task IDs.
   */
  listRunning(): string[] {
    return [...this.active.keys()];
  }

  /**
   * Number of active tasks.
   */
  get size(): number {
    return this.active.size;
  }

  /**
   * Cancel all running tasks.
   */
  cancelAll(): number {
    let count = 0;
    for (const [chatId] of this.active) {
      this.cancel(chatId);
      count++;
    }
    return count;
  }
}
