/**
 * Loop system types — iterative validation loop state tracking.
 *
 * Loops let agents run validate-fix-validate cycles (e.g. token migration,
 * contrast fixes, component builds). In-memory only — session-scoped.
 */

/** Supported loop modes — each maps to a different validation strategy. */
export type LoopMode =
  | 'token-migration'
  | 'contrast-fix'
  | 'component-build'
  | 'plan-iteration'
  | 'custom';

/** Configuration for starting a new loop. */
export interface LoopConfig {
  mode: LoopMode;
  prompt: string;
  maxIterations: number;
  targetScore?: number;
}

/** A single iteration result within a loop. */
export interface LoopIteration {
  iteration: number;
  timestamp: string;
  validationScore?: number;
  validationResult?: string;
  passed: boolean;
}

/** Loop lifecycle status. */
export type LoopStatus = 'active' | 'completed' | 'cancelled' | 'max-iterations';

/** Full state of a loop (active or historical). */
export interface LoopState {
  id: string;
  config: LoopConfig;
  iterations: LoopIteration[];
  status: LoopStatus;
  startedAt: string;
  completedAt?: string;
}
