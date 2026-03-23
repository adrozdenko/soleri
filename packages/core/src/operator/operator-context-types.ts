/**
 * Operator Context Signal Taxonomy — types for Soleri's adaptive persona feature.
 *
 * 4 signal types the agent reports through `orchestrate_complete`:
 *   - expertise: what the operator knows
 *   - corrections: what the operator wants done differently
 *   - interests: what the operator cares about beyond work
 *   - patterns: how the operator works
 *
 * Signals are compounded over sessions into a stable OperatorContext profile.
 */

// =============================================================================
// INPUT SIGNALS (reported per session)
// =============================================================================

/** Bag of signals the agent reports after a session. */
export interface OperatorSignals {
  expertise: ExpertiseSignal[];
  corrections: CorrectionSignal[];
  interests: InterestSignal[];
  patterns: WorkPatternSignal[];
}

/** Observed expertise in a topic. */
export interface ExpertiseSignal {
  /** e.g. "typescript", "react", "postgresql" */
  topic: string;
  level: ExpertiseLevel;
  /** Brief quote or observation. */
  evidence?: string;
  /** 0.0–1.0, engine assigns default if missing. */
  confidence?: number;
}

/** Operator correction — "do this" / "don't do that". */
export interface CorrectionSignal {
  /** What to do or not do. */
  rule: string;
  /** User's exact words. */
  quote?: string;
  scope: SignalScope;
}

/** Something the operator cares about outside of work. */
export interface InterestSignal {
  /** e.g. "metal music", "coffee", "climbing" */
  tag: string;
  /** How it came up. */
  context?: string;
}

/** How the operator works. */
export interface WorkPatternSignal {
  /** e.g. "batches work locally", "prefers small PRs" */
  pattern: string;
  frequency?: PatternFrequency;
}

// =============================================================================
// COMPOUNDED PROFILE (stored in SQLite)
// =============================================================================

/** Full compounded operator context, assembled from accumulated signals. */
export interface OperatorContext {
  expertise: ExpertiseItem[];
  corrections: CorrectionItem[];
  interests: InterestItem[];
  patterns: WorkPatternItem[];
  sessionCount: number;
  lastUpdated: number;
}

/** Compounded expertise entry. */
export interface ExpertiseItem {
  topic: string;
  level: ExpertiseLevel;
  confidence: number;
  /** How many sessions observed this topic. */
  sessionCount: number;
  lastObserved: number;
}

/** Stored correction. */
export interface CorrectionItem {
  id: string;
  rule: string;
  quote?: string;
  scope: SignalScope;
  projectPath?: string;
  active: boolean;
  createdAt: number;
  sessionId?: string;
}

/** Compounded interest entry. */
export interface InterestItem {
  tag: string;
  confidence: number;
  mentionCount: number;
  lastMentioned: number;
}

/** Compounded work pattern entry. */
export interface WorkPatternItem {
  pattern: string;
  frequency: PatternFrequency;
  confidence: number;
  observedCount: number;
  lastObserved: number;
}

// =============================================================================
// SHARED ENUMS / LITERALS
// =============================================================================

export type ExpertiseLevel = 'learning' | 'intermediate' | 'expert';
export type SignalScope = 'global' | 'project';
export type PatternFrequency = 'once' | 'occasional' | 'frequent';
export type ContextItemType = 'expertise' | 'correction' | 'interest' | 'pattern';

// =============================================================================
// MUST-NOT-LEARN CATEGORIES
// =============================================================================

/** Categories the agent must never store, regardless of what is observed. */
export const DECLINED_CATEGORIES = [
  'health',
  'medical',
  'political',
  'religious',
  'sexual',
  'financial',
  'legal',
  'family',
  'relationship',
] as const;

export type DeclinedCategory = (typeof DECLINED_CATEGORIES)[number];
