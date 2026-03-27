/**
 * Pack Lifecycle Manager — Central state machine for pack lifecycle management.
 *
 * Manages in-memory pack states, validates transitions against VALID_TRANSITIONS,
 * records transition history, and notifies listeners on state changes.
 */

import type { PackState, PackTransition } from './types.js';
import { VALID_TRANSITIONS } from './types.js';

type TransitionListener = (packId: string, from: PackState, to: PackState, reason?: string) => void;

interface PackEntry {
  state: PackState;
  transitions: PackTransition[];
}

export class PackLifecycleManager {
  private packs: Map<string, PackEntry> = new Map();
  private listeners: Array<TransitionListener> = [];

  /**
   * Transition a pack to a new state. Validates against VALID_TRANSITIONS.
   * Throws a descriptive error if the transition is not allowed.
   */
  transition(packId: string, to: PackState, reason?: string): void {
    const entry = this.packs.get(packId);
    if (!entry) {
      throw new Error(`Pack '${packId}' is not being tracked`);
    }

    const currentState = entry.state;
    const validTargets = VALID_TRANSITIONS[currentState];

    if (!validTargets.includes(to)) {
      throw new Error(
        `Invalid pack lifecycle transition for '${packId}': '${currentState}' \u2192 '${to}'. Valid targets from '${currentState}': ${validTargets.join(', ')}`,
      );
    }

    const transition: PackTransition = {
      from: currentState,
      to,
      timestamp: Date.now(),
      reason,
    };

    entry.state = to;
    entry.transitions.push(transition);

    for (const listener of this.listeners) {
      listener(packId, currentState, to, reason);
    }
  }

  /**
   * Set initial state without transition validation (for loading from lockfile).
   */
  initState(packId: string, state: PackState): void {
    this.packs.set(packId, { state, transitions: [] });
  }

  /**
   * Returns current state of a pack, or undefined if not tracked.
   */
  getState(packId: string): PackState | undefined {
    return this.packs.get(packId)?.state;
  }

  /**
   * Returns the full transition history for a pack.
   */
  getTransitions(packId: string): PackTransition[] {
    return this.packs.get(packId)?.transitions ?? [];
  }

  /**
   * Register a listener for state transitions. Returns an unsubscribe function.
   */
  onTransition(callback: TransitionListener): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  /**
   * Remove a pack from tracking entirely.
   */
  remove(packId: string): void {
    this.packs.delete(packId);
  }

  /**
   * List all tracked packs with their current state.
   */
  listAll(): Array<{ packId: string; state: PackState }> {
    const result: Array<{ packId: string; state: PackState }> = [];
    for (const [packId, entry] of this.packs) {
      result.push({ packId, state: entry.state });
    }
    return result;
  }

  /**
   * Clear all tracked state and listeners.
   */
  reset(): void {
    this.packs.clear();
    this.listeners.length = 0;
  }
}
