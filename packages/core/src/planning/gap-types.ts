/**
 * Gap analysis types and scoring constants.
 * Ported from Salvador MCP's multi-pass grading engine.
 */

// ─── Severity & Category ─────────────────────────────────────────

export type GapSeverity = 'critical' | 'major' | 'minor' | 'info' | 'bonus';

export type GapCategory =
  | 'structure'
  | 'completeness'
  | 'feasibility'
  | 'risk'
  | 'clarity'
  | 'semantic-quality'
  | 'knowledge-depth'
  | 'alternative-analysis'
  | 'tool-feasibility'
  | 'flow-alignment'
  | 'anti-pattern'
  | 'rationalization';

export interface PlanGap {
  id: string;
  severity: GapSeverity;
  category: GapCategory;
  description: string;
  recommendation: string;
  /** Where in the plan this gap was found (e.g. 'objective', 'tasks[2]'). */
  location?: string;
  /** Machine-readable condition that fired — debug aid only. */
  _trigger?: string;
}

// ─── Scoring Constants ───────────────────────────────────────────

/** Points deducted per gap severity. Negative = bonus (adds points). */
export const SEVERITY_WEIGHTS: Record<GapSeverity, number> = {
  critical: 30,
  major: 15,
  minor: 2,
  info: 0,
  bonus: -3,
};

/**
 * Maximum deduction per category.
 * Categories not listed here have NO cap — uncapped deductions.
 */
export const CATEGORY_PENALTY_CAPS: Record<string, number> = {
  clarity: 10,
  'alternative-analysis': 15,
};

/**
 * Maximum bonus per category.
 * Substance bonuses offset structural penalties but are capped to prevent gaming.
 */
export const CATEGORY_BONUS_CAPS: Record<string, number> = {
  'knowledge-depth': 15,
};

// ─── Validation Thresholds ───────────────────────────────────────

export const MIN_OBJECTIVE_LENGTH = 10;
export const MIN_SCOPE_LENGTH = 10;
export const MIN_DECISION_LENGTH = 10;

// ─── Helpers ─────────────────────────────────────────────────────

export function generateGapId(): string {
  return `gap_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
