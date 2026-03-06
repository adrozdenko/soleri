/**
 * Loop system types — iterative validation loop state tracking.
 *
 * Loops let agents run validate-fix-validate cycles (e.g. token migration,
 * contrast fixes, component builds).
 *
 * Ported from Salvador's loop.facade.ts with full gate decision system,
 * output scanning, and completion promise detection.
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
  /** Target validation score for score-based modes (token-migration, component-build). */
  targetScore?: number;
  /** Target grade for plan-iteration mode (e.g., 'A', 'A+'). */
  targetGrade?: string;
  /** Completion promise text — loop completes when this appears in output. */
  completionPromise?: string;
  /** Validation instructions appended to the prompt each iteration. */
  validationInstructions?: string;
  /** Detected intent for this loop (e.g., 'BUILD', 'FIX'). Used for brain session recording. */
  intent?: string;
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

/**
 * Knowledge items tracked during loop execution.
 * Ported from Salvador's loop knowledge tracking for brain session recording.
 */
export interface LoopKnowledge {
  /** Knowledge items discovered during the loop. */
  items?: string[];
  /** Patterns successfully applied during the loop. */
  patternsApplied?: string[];
  /** Anti-patterns intentionally avoided during the loop. */
  antiPatternsAvoided?: string[];
}

/** Full state of a loop (active or historical). */
export interface LoopState {
  id: string;
  config: LoopConfig;
  iterations: LoopIteration[];
  status: LoopStatus;
  startedAt: string;
  completedAt?: string;
  /** Knowledge accumulated during the loop. */
  knowledge?: LoopKnowledge;
}

/**
 * Loop history entry — stored after loop completion.
 * Ported from Salvador's LoopHistoryEntry.
 */
export interface LoopHistoryEntry {
  id: string;
  mode: LoopMode;
  intent?: string;
  prompt: string;
  iterations: number;
  outcome: 'completed' | 'cancelled' | 'max_iterations';
  startedAt: string;
  completedAt: string;
}

/**
 * Gate decision returned by iterateWithGate().
 * Ported from Salvador's LoopIterateDecision.
 *
 * - 'allow': Loop has ended (completed, max_iterations, or error). Exit the loop.
 * - 'block': Loop continues. The returned prompt and systemMessage are injected
 *   into the next iteration of the Stop hook.
 */
export interface LoopIterateDecision {
  /** Gate decision: 'allow' to exit loop, 'block' to continue iterating. */
  decision: 'allow' | 'block';
  /** Human-readable reason for this decision. */
  reason: string;
  /** Full prompt for the next iteration (only when decision = 'block'). */
  prompt?: string;
  /** System message for the next iteration (only when decision = 'block'). */
  systemMessage?: string;
  /** Current iteration number. */
  iteration?: number;
  /** Outcome when loop ends (only when decision = 'allow'). */
  outcome?: 'completed' | 'max_iterations';
  /** Whether completion was auto-detected (heuristic, not explicit promise). */
  autoCompleted?: boolean;
}
