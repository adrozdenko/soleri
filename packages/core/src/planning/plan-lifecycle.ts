/**
 * Plan lifecycle FSM — state transitions, grade thresholds, and structural validation.
 * Extracted from planner.ts to isolate pure lifecycle logic from persistence.
 */

import type { PlanGap } from './gap-types.js';
import { SEVERITY_WEIGHTS, CATEGORY_PENALTY_CAPS, CATEGORY_BONUS_CAPS } from './gap-types.js';

// ─── Plan Status FSM ─────────────────────────────────────────────

/**
 * Plan lifecycle status.
 * Ported from Salvador's PlanLifecycleStatus with full 8-state lifecycle.
 *
 * Lifecycle: brainstorming → draft → approved → executing → [validating] → reconciling → completed → archived
 */
export type PlanStatus =
  | 'brainstorming'
  | 'draft'
  | 'approved'
  | 'executing'
  | 'validating'
  | 'reconciling'
  | 'completed'
  | 'archived';

/**
 * Valid status transitions.
 * Each key maps to the set of statuses it can transition to.
 * Ported from Salvador's LIFECYCLE_TRANSITIONS.
 */
export const LIFECYCLE_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  brainstorming: ['draft'],
  draft: ['approved'],
  approved: ['executing'],
  executing: ['validating', 'reconciling'],
  validating: ['reconciling', 'executing'],
  reconciling: ['completed'],
  completed: ['archived'],
  archived: [],
};

/**
 * Statuses where the 30-minute TTL should NOT apply.
 * Plans in these states may span multiple sessions.
 */
export const NON_EXPIRING_STATUSES: PlanStatus[] = [
  'brainstorming',
  'executing',
  'validating',
  'reconciling',
];

/**
 * Validate a lifecycle status transition.
 * Returns true if the transition is valid, false otherwise.
 */
export function isValidTransition(from: PlanStatus, to: PlanStatus): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

/**
 * Get the valid next statuses for a given status.
 */
export function getValidNextStatuses(status: PlanStatus): PlanStatus[] {
  return LIFECYCLE_TRANSITIONS[status];
}

/**
 * Check if a status should have TTL expiration.
 * Plans in executing/reconciling states persist indefinitely.
 */
export function shouldExpire(status: PlanStatus): boolean {
  return !NON_EXPIRING_STATUSES.includes(status);
}

/**
 * Apply an FSM transition to a plan status.
 * Throws if the transition is invalid. Returns the new status and timestamp.
 * Does NOT mutate the plan — caller applies the result.
 */
export function applyTransition(
  currentStatus: PlanStatus,
  targetStatus: PlanStatus,
): { status: PlanStatus; updatedAt: number } {
  if (!isValidTransition(currentStatus, targetStatus)) {
    const valid = getValidNextStatuses(currentStatus);
    throw new Error(
      `Invalid transition: '${currentStatus}' → '${targetStatus}'. ` +
        `Valid transitions from '${currentStatus}': ${valid.length > 0 ? valid.join(', ') : 'none'}`,
    );
  }
  return { status: targetStatus, updatedAt: Date.now() };
}

// ─── Grading ─────────────────────────────────────────────────────

export type PlanGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Convert a numeric score to a letter grade.
 * Thresholds: A+=95, A=90, B=80, C=70, D=60, F=<60
 */
export function scoreToGrade(score: number): PlanGrade {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Convert a letter grade to the minimum score required.
 */
export function gradeToMinScore(grade: PlanGrade): number {
  switch (grade) {
    case 'A+':
      return 95;
    case 'A':
      return 90;
    case 'B':
      return 80;
    case 'C':
      return 70;
    case 'D':
      return 60;
    case 'F':
      return 0;
  }
}

/**
 * Error thrown when a plan's grade is below the minimum required for approval.
 */
export class PlanGradeRejectionError extends Error {
  readonly grade: PlanGrade;
  readonly score: number;
  readonly minGrade: PlanGrade;
  readonly gaps: PlanGap[];

  constructor(grade: PlanGrade, score: number, minGrade: PlanGrade, gaps: PlanGap[]) {
    const gapSummary = gaps
      .filter((g) => g.severity === 'critical' || g.severity === 'major')
      .map((g) => `- [${g.severity}] ${g.description}`)
      .join('\n');
    super(
      `Plan grade ${grade} (${score}/100) is below the minimum required grade ${minGrade} for approval. ` +
        `Iterate on the plan to address gaps before approving.\n${gapSummary}`,
    );
    this.name = 'PlanGradeRejectionError';
    this.grade = grade;
    this.score = score;
    this.minGrade = minGrade;
    this.gaps = gaps;
  }
}

// ─── Score Calculation ───────────────────────────────────────────

/**
 * Calculate score from gaps with severity-weighted deductions and iteration leniency.
 */
export function calculateScore(gaps: PlanGap[], iteration: number = 1): number {
  const categoryDeductions = new Map<string, number>();
  const categoryBonuses = new Map<string, number>();
  for (const gap of gaps) {
    let weight: number = SEVERITY_WEIGHTS[gap.severity];
    if (gap.severity === 'minor') {
      if (iteration === 1) weight = 0;
      else if (iteration === 2) weight = 1;
    }
    const category = gap.category;
    if (weight < 0) {
      categoryBonuses.set(category, (categoryBonuses.get(category) ?? 0) + Math.abs(weight));
    } else {
      categoryDeductions.set(category, (categoryDeductions.get(category) ?? 0) + weight);
    }
  }
  let deductions = 0;
  for (const [category, total] of categoryDeductions) {
    const cap = CATEGORY_PENALTY_CAPS[category];
    deductions += cap !== undefined ? Math.min(total, cap) : total;
  }
  let bonuses = 0;
  for (const [category, total] of categoryBonuses) {
    const cap = CATEGORY_BONUS_CAPS[category];
    bonuses += cap !== undefined ? Math.min(total, cap) : total;
  }
  return Math.max(0, Math.min(100, 100 - deductions + bonuses));
}

// ─── Structural Validation ───────────────────────────────────────

/**
 * Detect circular dependencies among tasks.
 * Uses DFS with in-stack tracking.
 */
export function hasCircularDependencies(
  tasks: ReadonlyArray<{ id: string; dependsOn?: string[] }>,
): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const dfs = (taskId: string): boolean => {
    if (inStack.has(taskId)) return true;
    if (visited.has(taskId)) return false;
    visited.add(taskId);
    inStack.add(taskId);
    const task = taskMap.get(taskId);
    if (task?.dependsOn) {
      for (const dep of task.dependsOn) {
        if (dfs(dep)) return true;
      }
    }
    inStack.delete(taskId);
    return false;
  };

  for (const task of tasks) {
    if (dfs(task.id)) return true;
  }
  return false;
}

// ─── Plan Mutation Helpers ───────────────────────────────────────

import type { PlanTask, TaskStatus, Plan, PlanDecision } from './planner-types.js';

export interface IterateChanges {
  objective?: string;
  scope?: string;
  decisions?: (string | PlanDecision)[];
  addTasks?: Array<{ title: string; description: string }>;
  removeTasks?: string[];
  approach?: string;
  context?: string;
  success_criteria?: string[];
  tool_chain?: string[];
  flow?: string;
  target_mode?: string;
}

/**
 * Apply iteration changes to a plan (mutates in place).
 * Caller is responsible for status validation and persistence.
 */
export function applyIteration(plan: Plan, changes: IterateChanges): void {
  const now = Date.now();
  if (changes.objective !== undefined) plan.objective = changes.objective;
  if (changes.scope !== undefined) plan.scope = changes.scope;
  if (changes.decisions !== undefined) plan.decisions = changes.decisions;
  if (changes.approach !== undefined) plan.approach = changes.approach;
  if (changes.context !== undefined) plan.context = changes.context;
  if (changes.success_criteria !== undefined) plan.success_criteria = changes.success_criteria;
  if (changes.tool_chain !== undefined) plan.tool_chain = changes.tool_chain;
  if (changes.flow !== undefined) plan.flow = changes.flow;
  if (changes.target_mode !== undefined) plan.target_mode = changes.target_mode;
  if (changes.removeTasks?.length) {
    const removeSet = new Set(changes.removeTasks);
    plan.tasks = plan.tasks.filter((t) => !removeSet.has(t.id));
  }
  if (changes.addTasks?.length) {
    const maxIndex = plan.tasks.reduce((max, t) => {
      const num = parseInt(t.id.replace('task-', ''), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    for (let i = 0; i < changes.addTasks.length; i++) {
      plan.tasks.push({
        id: `task-${maxIndex + i + 1}`,
        title: changes.addTasks[i].title,
        description: changes.addTasks[i].description,
        status: 'pending' as TaskStatus,
        updatedAt: now,
      });
    }
  }
  plan.updatedAt = now;
}

/**
 * Replace plan tasks with a new split set, validating dependency references.
 * Caller is responsible for status validation and persistence.
 */
/**
 * Apply a task status update with auto-metrics (startedAt, completedAt, durationMs).
 * Caller is responsible for plan status validation and persistence.
 */
export function applyTaskStatusUpdate(task: PlanTask, status: TaskStatus): void {
  const now = Date.now();
  if (status === 'in_progress' && !task.startedAt) task.startedAt = now;
  if (status === 'completed' || status === 'skipped' || status === 'failed') {
    task.completedAt = now;
    if (task.startedAt) {
      if (!task.metrics) task.metrics = {};
      task.metrics.durationMs = now - task.startedAt;
    }
  }
  task.status = status;
  task.updatedAt = now;
}

/**
 * Create a new Plan object (factory). Does not persist.
 */
export function createPlanObject(params: {
  objective: string;
  scope: string;
  decisions?: (string | PlanDecision)[];
  tasks?: Array<{ title: string; description: string }>;
  approach?: string;
  context?: string;
  success_criteria?: string[];
  tool_chain?: string[];
  flow?: string;
  target_mode?: string;
  alternatives?: import('./planner-types.js').PlanAlternative[];
  initialStatus?: 'brainstorming' | 'draft';
}): Plan {
  const now = Date.now();
  return {
    id: `plan-${now}-${Math.random().toString(36).slice(2, 8)}`,
    objective: params.objective,
    scope: params.scope,
    status: params.initialStatus ?? 'draft',
    decisions: params.decisions ?? [],
    tasks: (params.tasks ?? []).map((t, i) => ({
      id: `task-${i + 1}`,
      title: t.title,
      description: t.description,
      status: 'pending' as TaskStatus,
      updatedAt: now,
    })),
    ...(params.approach !== undefined && { approach: params.approach }),
    ...(params.context !== undefined && { context: params.context }),
    ...(params.success_criteria !== undefined && { success_criteria: params.success_criteria }),
    ...(params.tool_chain !== undefined && { tool_chain: params.tool_chain }),
    ...(params.flow !== undefined && { flow: params.flow }),
    ...(params.target_mode !== undefined && { target_mode: params.target_mode }),
    ...(params.alternatives !== undefined && { alternatives: params.alternatives }),
    checks: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function applySplitTasks(
  plan: Plan,
  tasks: Array<{
    title: string;
    description: string;
    dependsOn?: string[];
    acceptanceCriteria?: string[];
  }>,
): void {
  const now = Date.now();
  plan.tasks = tasks.map((t, i) => ({
    id: `task-${i + 1}`,
    title: t.title,
    description: t.description,
    status: 'pending' as TaskStatus,
    dependsOn: t.dependsOn,
    ...(t.acceptanceCriteria && { acceptanceCriteria: t.acceptanceCriteria }),
    updatedAt: now,
  }));
  const taskIds = new Set(plan.tasks.map((t) => t.id));
  for (const task of plan.tasks) {
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        if (!taskIds.has(dep))
          throw new Error(`Task '${task.id}' depends on unknown task '${dep}'`);
      }
    }
  }
  plan.updatedAt = now;
}
