/**
 * Session Compaction Policy — types and defaults for session rotation.
 *
 * Three thresholds determine when a session should be compacted:
 * - maxRuns: tool call / interaction count
 * - maxInputTokens: cumulative input token count
 * - maxAge: wall-clock duration (ISO 8601 duration string, e.g. '72h')
 */

// =============================================================================
// TYPES
// =============================================================================

/** Policy thresholds — all optional, merged from three levels. */
export interface CompactionPolicy {
  /** Maximum number of runs (tool calls / interactions) before compaction. */
  maxRuns?: number;
  /** Maximum cumulative input tokens before compaction. */
  maxInputTokens?: number;
  /** Maximum wall-clock age as an ISO 8601-ish duration string (e.g. '72h', '30m', '7d'). */
  maxAge?: string;
}

/** Result of evaluating whether compaction is needed. */
export interface CompactionResult {
  /** Whether compaction should happen. */
  compact: boolean;
  /** Human-readable reason (empty string when compact is false). */
  reason: string;
  /** Pre-rendered handoff markdown (empty string when compact is false). */
  handoff: string;
}

/** State snapshot of the current session, used for evaluation. */
export interface SessionState {
  /** Number of runs (tool calls) so far. */
  runCount: number;
  /** Cumulative input tokens consumed. */
  inputTokens: number;
  /** ISO 8601 timestamp when the session started. */
  startedAt: string;
}

/** Structured handoff note persisted on rotation. */
export interface HandoffNote {
  /** ISO 8601 timestamp when the session was rotated. */
  rotatedAt: string;
  /** Why the session was rotated. */
  reason: string;
  /** Description of work in progress at rotation time. */
  inProgress: string;
  /** Key decisions made during the session. */
  keyDecisions: string[];
  /** Files modified during the session. */
  filesModified: string[];
}

// =============================================================================
// ENGINE DEFAULTS
// =============================================================================

export const ENGINE_DEFAULTS: Required<CompactionPolicy> = {
  maxRuns: 200,
  maxInputTokens: 2_000_000,
  maxAge: '72h',
};
