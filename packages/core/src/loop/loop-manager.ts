/**
 * Loop manager — lightweight in-memory state tracker for iterative
 * validation loops.
 *
 * Tracks active loop, iteration history, and past loop results.
 * Session-scoped (no persistence across restarts).
 */

import type { LoopConfig, LoopIteration, LoopState } from './types.js';

export class LoopManager {
  private activeLoop: LoopState | null = null;
  private completedLoops: LoopState[] = [];

  /**
   * Start a new validation loop.
   * Throws if a loop is already active.
   */
  startLoop(config: LoopConfig): LoopState {
    if (this.activeLoop) {
      throw new Error(
        `Loop already active: ${this.activeLoop.id} (mode: ${this.activeLoop.config.mode}). ` +
          'Cancel or complete it first.',
      );
    }

    const loop: LoopState = {
      id: `loop-${Date.now()}`,
      config,
      iterations: [],
      status: 'active',
      startedAt: new Date().toISOString(),
    };

    this.activeLoop = loop;
    return loop;
  }

  /**
   * Record an iteration result on the active loop.
   * If the iteration passes, the loop status is NOT automatically changed —
   * call `completeLoop()` explicitly when validation is confirmed.
   * If max iterations reached and this iteration fails, status becomes 'max-iterations'.
   */
  iterate(result: {
    validationScore?: number;
    validationResult?: string;
    passed: boolean;
  }): LoopIteration {
    if (!this.activeLoop) {
      throw new Error('No active loop. Start one first.');
    }

    const iteration: LoopIteration = {
      iteration: this.activeLoop.iterations.length + 1,
      timestamp: new Date().toISOString(),
      validationScore: result.validationScore,
      validationResult: result.validationResult,
      passed: result.passed,
    };

    this.activeLoop.iterations.push(iteration);

    // Auto-transition to max-iterations if limit reached and not passing
    if (
      !result.passed &&
      this.activeLoop.iterations.length >= this.activeLoop.config.maxIterations
    ) {
      this.activeLoop.status = 'max-iterations';
      this.activeLoop.completedAt = new Date().toISOString();
      this.completedLoops.push(this.activeLoop);
      this.activeLoop = null;
    }

    return iteration;
  }

  /**
   * Mark the active loop as completed (validation passed).
   */
  completeLoop(): LoopState {
    if (!this.activeLoop) {
      throw new Error('No active loop to complete.');
    }

    this.activeLoop.status = 'completed';
    this.activeLoop.completedAt = new Date().toISOString();
    const completed = this.activeLoop;
    this.completedLoops.push(completed);
    this.activeLoop = null;
    return completed;
  }

  /**
   * Cancel the active loop.
   */
  cancelLoop(): LoopState {
    if (!this.activeLoop) {
      throw new Error('No active loop to cancel.');
    }

    this.activeLoop.status = 'cancelled';
    this.activeLoop.completedAt = new Date().toISOString();
    const cancelled = this.activeLoop;
    this.completedLoops.push(cancelled);
    this.activeLoop = null;
    return cancelled;
  }

  /**
   * Get current loop status. Returns null if no active loop.
   */
  getStatus(): LoopState | null {
    return this.activeLoop;
  }

  /**
   * Get history of all completed/cancelled/max-iterations loops.
   */
  getHistory(): LoopState[] {
    return [...this.completedLoops];
  }

  /**
   * Check if a loop is currently active.
   */
  isActive(): boolean {
    return this.activeLoop !== null;
  }
}
