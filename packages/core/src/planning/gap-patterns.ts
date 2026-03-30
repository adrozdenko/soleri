/**
 * Gap analysis helpers, pattern constants, and structural passes (1-4).
 * Contains shared utilities and the first four analysis passes that check
 * structure, completeness, feasibility, and risk.
 */

import type { Plan, PlanDecision } from './planner.js';
import type { PlanGap, GapSeverity, GapCategory } from './gap-types.js';
import {
  generateGapId,
  MIN_OBJECTIVE_LENGTH,
  MIN_SCOPE_LENGTH,
  MIN_DECISION_LENGTH,
} from './gap-types.js';

// ─── Helper Functions ────────────────────────────────────────────

/** Create a PlanGap with auto-generated ID. */
export function gap(
  severity: GapSeverity,
  category: GapCategory,
  description: string,
  recommendation: string,
  location?: string,
  trigger?: string,
): PlanGap {
  return {
    id: generateGapId(),
    severity,
    category,
    description,
    recommendation,
    ...(location ? { location } : {}),
    ...(trigger ? { _trigger: trigger } : {}),
  };
}

/** Combine all task descriptions + titles into a single text blob for analysis. */
export function taskText(plan: Plan): string {
  return plan.tasks.map((t) => `${t.title} ${t.description}`).join(' ');
}

/** Extract text from a decision (supports both string and structured format). */
export function decisionText(d: string | PlanDecision): string {
  return typeof d === 'string' ? d : `${d.decision} ${d.rationale}`;
}

/** Combine all decisions into a single text blob. */
export function decisionsText(plan: Plan): string {
  return plan.decisions.map(decisionText).join(' ');
}

/** Check if text contains any of the given patterns (case-insensitive). */
export function containsAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

// ─── Pattern Constants (Passes 1-4) ─────────────────────────────

export const METRIC_PATTERNS = [
  /\d+/,
  /percent/i,
  /reduce/i,
  /increase/i,
  /measure/i,
  /target/i,
  /goal/i,
  /kpi/i,
  /metric/i,
  /benchmark/i,
];

export const EXCLUSION_KEYWORDS = [
  'not',
  'exclude',
  'outside',
  'beyond',
  'limit',
  'except',
  "won't",
  'will not',
];

export const OVERLY_BROAD_PATTERNS = [
  'everything',
  'all systems',
  'entire codebase',
  'complete rewrite',
  'from scratch',
  'total overhaul',
  'rewrite everything',
];

export const DEPENDENCY_KEYWORDS = [
  'depends',
  'dependency',
  'prerequisite',
  'requires',
  'blocked',
  'before',
];

export const BREAKING_CHANGE_KEYWORDS = [
  'breaking change',
  'breaking',
  'migration',
  'deprecate',
  'remove api',
  'remove endpoint',
  'schema change',
  'database migration',
];

export const MITIGATION_KEYWORDS = [
  'rollback',
  'backward compatible',
  'backwards compatible',
  'feature flag',
  'gradual',
  'phased',
  'fallback',
  'backup',
  'canary',
  'blue-green',
];

export const VERIFICATION_KEYWORDS = [
  'test',
  'verify',
  'validate',
  'check',
  'assert',
  'confirm',
  'spec',
  'coverage',
];

// ─── Pass 1: Structure ───────────────────────────────────────────

export function analyzeStructure(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];

  if (!plan.objective || plan.objective.trim().length < MIN_OBJECTIVE_LENGTH) {
    gaps.push(
      gap(
        'critical',
        'structure',
        plan.objective
          ? `Objective too short (${plan.objective.trim().length} chars, need ${MIN_OBJECTIVE_LENGTH}+).`
          : 'Plan has no objective.',
        'Add a clear objective describing what this plan achieves.',
        'objective',
        'missing_or_short_objective',
      ),
    );
  }

  if (!plan.scope || plan.scope.trim().length < MIN_SCOPE_LENGTH) {
    gaps.push(
      gap(
        'critical',
        'structure',
        plan.scope
          ? `Scope too short (${plan.scope.trim().length} chars, need ${MIN_SCOPE_LENGTH}+).`
          : 'Plan has no scope defined.',
        'Define the scope — what is included and excluded.',
        'scope',
        'missing_or_short_scope',
      ),
    );
  }

  if (plan.tasks.length === 0) {
    const hasApproachSteps =
      plan.approach && /(?:step\s+\d|task\s+\d|\d\.\s|\d\)\s)/i.test(plan.approach);
    gaps.push(
      gap(
        hasApproachSteps ? 'major' : 'critical',
        'structure',
        hasApproachSteps
          ? 'Plan has no tasks but approach contains steps. Use `addTasks` in `plan_iterate` or pass `tasks` in `create_plan` to promote them.'
          : 'Plan has no tasks.',
        'Add tasks via `create_plan` (tasks param) or `plan_iterate` (addTasks param).',
        'tasks',
        'no_tasks',
      ),
    );
  }

  return gaps;
}

// ─── Pass 2: Completeness ────────────────────────────────────────

export function analyzeCompleteness(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];

  if (plan.objective && !METRIC_PATTERNS.some((p) => p.test(plan.objective))) {
    gaps.push(
      gap(
        'minor',
        'completeness',
        'Objective has no measurable targets or metrics.',
        'Include quantifiable success criteria (numbers, percentages, concrete outcomes).',
        'objective',
        'no_metrics_in_objective',
      ),
    );
  }

  if (plan.decisions.length > 0) {
    for (let i = 0; i < plan.decisions.length; i++) {
      const d = plan.decisions[i];
      const text = decisionText(d);
      if (text.trim().length < MIN_DECISION_LENGTH) {
        gaps.push(
          gap(
            'major',
            'completeness',
            `Decision ${i + 1} is too short (${text.trim().length} chars) — lacks rationale.`,
            'Expand each decision to include the reasoning (why this choice over alternatives).',
            `decisions[${i}]`,
            'short_decision',
          ),
        );
      }
    }
  }

  if (plan.scope && !containsAny(plan.scope, EXCLUSION_KEYWORDS)) {
    gaps.push(
      gap(
        'minor',
        'completeness',
        'Scope does not mention what is excluded.',
        'Add explicit exclusions to prevent scope creep (e.g., "does NOT include…").',
        'scope',
        'no_exclusions_in_scope',
      ),
    );
  }

  return gaps;
}

// ─── Pass 3: Feasibility ─────────────────────────────────────────

export function analyzeFeasibility(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];
  const scopeAndTasks = `${plan.scope} ${taskText(plan)}`;

  if (containsAny(scopeAndTasks, OVERLY_BROAD_PATTERNS)) {
    gaps.push(
      gap(
        'major',
        'feasibility',
        'Scope contains overly broad indicators — risk of unrealistic delivery.',
        'Narrow the scope to a well-defined subset. Prefer incremental delivery over big-bang rewrites.',
        'scope',
        'overly_broad_scope',
      ),
    );
  }

  if (plan.tasks.length > 3 && !containsAny(scopeAndTasks, DEPENDENCY_KEYWORDS)) {
    const hasDeps = plan.tasks.some((t) => t.dependsOn && t.dependsOn.length > 0);
    if (!hasDeps) {
      gaps.push(
        gap(
          'minor',
          'feasibility',
          `${plan.tasks.length} tasks with no dependency mentions — execution order unclear.`,
          'Identify dependencies between tasks or add explicit ordering notes.',
          'tasks',
          'no_dependency_awareness',
        ),
      );
    }
  }

  return gaps;
}

// ─── Pass 4: Risk ────────────────────────────────────────────────

export function analyzeRisk(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];
  const allText = `${plan.objective} ${plan.scope} ${taskText(plan)} ${decisionsText(plan)}`;

  if (
    containsAny(allText, BREAKING_CHANGE_KEYWORDS) &&
    !containsAny(allText, MITIGATION_KEYWORDS)
  ) {
    gaps.push(
      gap(
        'major',
        'risk',
        'Plan involves breaking changes but mentions no mitigation strategy.',
        'Add a rollback plan, feature flags, or phased migration approach.',
        undefined,
        'breaking_without_mitigation',
      ),
    );
  }

  if (plan.tasks.length > 0 && !containsAny(allText, VERIFICATION_KEYWORDS)) {
    gaps.push(
      gap(
        'minor',
        'risk',
        'No verification or testing mentioned in the plan.',
        'Add at least one task or note about testing/validation.',
        'tasks',
        'no_verification_mentioned',
      ),
    );
  }

  return gaps;
}
