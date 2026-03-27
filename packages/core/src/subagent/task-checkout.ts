/**
 * Atomic task claim system — prevents two subagents from working the same task.
 *
 * Pure in-memory Map backing store. No async, no external deps.
 */

import type { ClaimInfo } from './types.js';

export class TaskCheckout {
  private readonly claims = new Map<string, ClaimInfo>();

  /**
   * Attempt to claim a task for a claimer.
   * Returns true if the claim succeeds (or the same claimer already holds it).
   * Returns false if the task is already claimed by a different claimer.
   */
  claim(taskId: string, claimerId: string): boolean {
    const existing = this.claims.get(taskId);
    if (existing) {
      return existing.claimerId === claimerId;
    }
    this.claims.set(taskId, { taskId, claimerId, claimedAt: Date.now() });
    return true;
  }

  /**
   * Release a claimed task. Returns true if released, false if not claimed.
   */
  release(taskId: string): boolean {
    return this.claims.delete(taskId);
  }

  /**
   * Get claim info for a task, or undefined if unclaimed.
   */
  getClaimer(taskId: string): ClaimInfo | undefined {
    return this.claims.get(taskId);
  }

  /**
   * List all active claims.
   */
  listClaimed(): ClaimInfo[] {
    return [...this.claims.values()];
  }

  /**
   * Check whether a task is available (unclaimed).
   */
  isAvailable(taskId: string): boolean {
    return !this.claims.has(taskId);
  }

  /**
   * Clear all claims. Useful for cleanup between dispatch rounds.
   */
  releaseAll(): void {
    this.claims.clear();
  }
}
