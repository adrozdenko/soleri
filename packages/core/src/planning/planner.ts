import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import type { PlanGap } from './gap-types.js';
import { SEVERITY_WEIGHTS, CATEGORY_PENALTY_CAPS, CATEGORY_BONUS_CAPS } from './gap-types.js';
import { runGapAnalysis } from './gap-analysis.js';
import type { GapAnalysisOptions } from './gap-analysis.js';

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

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';

export interface TaskEvidence {
  /** What the evidence proves (maps to an acceptance criterion). */
  criterion: string;
  /** Evidence content — command output, URL, file path, description. */
  content: string;
  /** Evidence type. */
  type: 'command_output' | 'url' | 'file' | 'description';
  submittedAt: number;
}

export interface TaskMetrics {
  durationMs?: number;
  iterations?: number;
  toolCalls?: number;
  modelTier?: string;
  estimatedCostUsd?: number;
}

export interface TaskDeliverable {
  type: 'file' | 'vault_entry' | 'url';
  path: string;
  hash?: string;
  verifiedAt?: number;
  stale?: boolean;
}

export interface ExecutionSummary {
  totalDurationMs: number;
  tasksCompleted: number;
  tasksSkipped: number;
  tasksFailed: number;
  avgTaskDurationMs: number;
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  /** Optional dependency IDs — tasks that must complete before this one. */
  dependsOn?: string[];
  /** Evidence submitted for task acceptance criteria. */
  evidence?: TaskEvidence[];
  /** Whether this task has been verified (all evidence checked + reviews passed). */
  verified?: boolean;
  /** Task-level acceptance criteria (for verification checking). */
  acceptanceCriteria?: string[];
  /** Timestamp when task was first moved to in_progress. */
  startedAt?: number;
  /** Timestamp when task reached a terminal state (completed/skipped/failed). */
  completedAt?: number;
  /** Per-task execution metrics. */
  metrics?: TaskMetrics;
  /** Deliverables produced by this task. */
  deliverables?: TaskDeliverable[];
  updatedAt: number;
}

export interface DriftItem {
  /** Type of drift */
  type: 'skipped' | 'added' | 'modified' | 'reordered';
  /** What drifted */
  description: string;
  /** How much this affected the plan */
  impact: 'low' | 'medium' | 'high';
  /** Why the drift occurred */
  rationale: string;
}

/**
 * Severity weights for drift accuracy score calculation.
 * Score = 100 - sum(drift_items * weight_per_impact)
 * Ported from Salvador's plan-lifecycle-types.ts.
 */
export const DRIFT_WEIGHTS: Record<DriftItem['impact'], number> = {
  high: 20,
  medium: 10,
  low: 5,
};

/**
 * Calculate drift accuracy score from drift items.
 * Score = max(0, 100 - sum(weight_per_impact))
 * Ported from Salvador's calculateDriftScore.
 */
export function calculateDriftScore(items: DriftItem[]): number {
  let deductions = 0;
  for (const item of items) {
    deductions += DRIFT_WEIGHTS[item.impact];
  }
  return Math.max(0, 100 - deductions);
}

export interface ReconciliationReport {
  planId: string;
  /** Accuracy score: 100 = perfect execution, 0 = total drift. Impact-weighted. */
  accuracy: number;
  driftItems: DriftItem[];
  /** Human-readable summary of the drift */
  summary: string;
  reconciledAt: number;
}

export interface ReviewEvidence {
  planId: string;
  taskId?: string;
  reviewer: string;
  outcome: 'approved' | 'rejected' | 'needs_changes';
  comments: string;
  reviewedAt: number;
}

export type PlanGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface PlanCheck {
  checkId: string;
  planId: string;
  grade: PlanGrade;
  score: number; // 0-100
  gaps: PlanGap[];
  iteration: number;
  checkedAt: number;
}

/**
 * Calculate score from gaps with severity-weighted deductions and iteration leniency.
 * Ported from Salvador MCP's plan-grading.ts.
 *
 * - Minor gaps: weight=0 on iteration 1 (free sketching), weight=1 on iteration 2, full weight on 3+
 * - Per-category deductions are capped before summing (prevents one category from tanking the score)
 * - Score = max(0, 100 - totalDeductions)
 */
export function calculateScore(gaps: PlanGap[], iteration: number = 1): number {
  const categoryDeductions = new Map<string, number>();
  const categoryBonuses = new Map<string, number>();

  for (const gap of gaps) {
    let weight: number = SEVERITY_WEIGHTS[gap.severity];

    // Iteration leniency for minor gaps
    if (gap.severity === 'minor') {
      if (iteration === 1) weight = 0;
      else if (iteration === 2) weight = 1;
      // iteration 3+: full weight (2)
    }

    const category = gap.category;
    if (weight < 0) {
      // Bonus — accumulate as positive value for capping, apply as negative deduction
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

/**
 * A structured decision with rationale.
 * Ported from Salvador's PlanContent.decisions.
 */
export interface PlanDecision {
  decision: string;
  rationale: string;
}

export interface Plan {
  id: string;
  objective: string;
  scope: string;
  status: PlanStatus;
  /**
   * Decisions can be flat strings (backward compat) or structured {decision, rationale}.
   * New plans should prefer PlanDecision[].
   */
  decisions: (string | PlanDecision)[];
  tasks: PlanTask[];
  /** High-level approach description. Ported from Salvador's PlanContent. */
  approach?: string;
  /** Additional context for the plan. */
  context?: string;
  /** Measurable success criteria. */
  success_criteria?: string[];
  /** Tools to use in execution order. */
  tool_chain?: string[];
  /** Flow definition to follow (e.g., 'developer', 'reviewer', 'designer'). */
  flow?: string;
  /** Target operational mode (e.g., 'build', 'review', 'fix'). */
  target_mode?: string;
  /** Reconciliation report — populated by reconcile(). */
  reconciliation?: ReconciliationReport;
  /** Review evidence — populated by addReview(). */
  reviews?: ReviewEvidence[];
  /** Latest grading check. */
  latestCheck?: PlanCheck;
  /** All check history. */
  checks: PlanCheck[];
  /** Matched playbook info (set by orchestration layer via playbook_match). */
  playbookMatch?: {
    label: string;
    genericId?: string;
    domainId?: string;
  };
  /** Aggregate execution metrics — populated by reconcile() and complete(). */
  executionSummary?: ExecutionSummary;
  createdAt: number;
  updatedAt: number;
}

export interface PlanStore {
  version: string;
  plans: Plan[];
}

export class Planner {
  private filePath: string;
  private store: PlanStore;
  private gapOptions?: GapAnalysisOptions;

  constructor(filePath: string, gapOptions?: GapAnalysisOptions) {
    this.filePath = filePath;
    this.gapOptions = gapOptions;
    this.store = this.load();
  }

  private load(): PlanStore {
    if (!existsSync(this.filePath)) {
      return { version: '1.0', plans: [] };
    }
    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const store = JSON.parse(data) as PlanStore;
      // Backward compatibility: ensure every plan has a checks array
      for (const plan of store.plans) {
        plan.checks = plan.checks ?? [];
      }
      return store;
    } catch {
      return { version: '1.0', plans: [] };
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  create(params: {
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
    /** Start in 'brainstorming' instead of 'draft'. Default: 'draft'. */
    initialStatus?: 'brainstorming' | 'draft';
  }): Plan {
    const now = Date.now();
    const plan: Plan = {
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
      checks: [],
      createdAt: now,
      updatedAt: now,
    };
    this.store.plans.push(plan);
    this.save();
    return plan;
  }

  get(planId: string): Plan | null {
    return this.store.plans.find((p) => p.id === planId) ?? null;
  }

  list(): Plan[] {
    return [...this.store.plans];
  }

  /**
   * Transition a plan to a new status using the typed FSM.
   * Validates that the transition is allowed before applying it.
   */
  private transition(plan: Plan, to: PlanStatus): void {
    if (!isValidTransition(plan.status, to)) {
      const valid = getValidNextStatuses(plan.status);
      throw new Error(
        `Invalid transition: '${plan.status}' → '${to}'. ` +
          `Valid transitions from '${plan.status}': ${valid.length > 0 ? valid.join(', ') : 'none'}`,
      );
    }
    plan.status = to;
    plan.updatedAt = Date.now();
  }

  /**
   * Promote a brainstorming plan to draft status.
   * Only allowed from 'brainstorming'.
   */
  promoteToDraft(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    this.transition(plan, 'draft');
    this.save();
    return plan;
  }

  approve(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    this.transition(plan, 'approved');
    this.save();
    return plan;
  }

  startExecution(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    this.transition(plan, 'executing');
    this.save();
    return plan;
  }

  updateTask(planId: string, taskId: string, status: TaskStatus): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'executing' && plan.status !== 'validating')
      throw new Error(
        `Cannot update tasks on plan in '${plan.status}' status — must be 'executing' or 'validating'`,
      );
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const now = Date.now();

    // Auto-set startedAt on first in_progress transition
    if (status === 'in_progress' && !task.startedAt) {
      task.startedAt = now;
    }

    // Auto-set completedAt and compute durationMs on terminal transitions
    if (status === 'completed' || status === 'skipped' || status === 'failed') {
      task.completedAt = now;
      if (task.startedAt) {
        if (!task.metrics) task.metrics = {};
        task.metrics.durationMs = now - task.startedAt;
      }
    }

    task.status = status;
    task.updatedAt = now;
    plan.updatedAt = now;
    this.save();
    return plan;
  }

  /**
   * Transition plan to 'validating' state (post-execution verification).
   * Only allowed from 'executing'.
   */
  startValidation(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    this.transition(plan, 'validating');
    this.save();
    return plan;
  }

  /**
   * Transition plan to 'reconciling' state.
   * Allowed from 'executing' or 'validating'.
   */
  startReconciliation(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    this.transition(plan, 'reconciling');
    this.save();
    return plan;
  }

  /**
   * Complete a plan. Only allowed from 'reconciling'.
   * Use startReconciliation() + reconcile() + complete() for the full lifecycle,
   * or reconcile() which auto-transitions through reconciling → completed.
   */
  complete(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    plan.executionSummary = this.computeExecutionSummary(plan);
    this.transition(plan, 'completed');
    this.save();
    return plan;
  }

  getExecuting(): Plan[] {
    return this.store.plans.filter((p) => p.status === 'executing' || p.status === 'validating');
  }

  getActive(): Plan[] {
    return this.store.plans.filter(
      (p) =>
        p.status === 'brainstorming' ||
        p.status === 'draft' ||
        p.status === 'approved' ||
        p.status === 'executing' ||
        p.status === 'validating' ||
        p.status === 'reconciling',
    );
  }

  /**
   * Iterate on a draft plan — modify objective, scope, decisions, or tasks.
   * Only allowed on plans in 'draft' status.
   */
  iterate(
    planId: string,
    changes: {
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
    },
  ): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'draft' && plan.status !== 'brainstorming')
      throw new Error(
        `Cannot iterate plan in '${plan.status}' status — must be 'draft' or 'brainstorming'`,
      );

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

    // Remove tasks by ID
    if (changes.removeTasks && changes.removeTasks.length > 0) {
      const removeSet = new Set(changes.removeTasks);
      plan.tasks = plan.tasks.filter((t) => !removeSet.has(t.id));
    }

    // Add new tasks
    if (changes.addTasks && changes.addTasks.length > 0) {
      const maxIndex = plan.tasks.reduce((max, t) => {
        const num = parseInt(t.id.replace('task-', ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      for (let i = 0; i < changes.addTasks.length; i++) {
        plan.tasks.push({
          id: `task-${maxIndex + i + 1}`,
          title: changes.addTasks[i].title,
          description: changes.addTasks[i].description,
          status: 'pending',
          updatedAt: now,
        });
      }
    }

    plan.updatedAt = now;
    this.save();
    return plan;
  }

  /**
   * Split a plan's tasks into sub-tasks with dependency tracking.
   * Replaces existing tasks with a new set that includes dependency references.
   * Only allowed on 'draft' or 'approved' plans.
   */
  splitTasks(
    planId: string,
    tasks: Array<{
      title: string;
      description: string;
      dependsOn?: string[];
      acceptanceCriteria?: string[];
    }>,
  ): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'brainstorming' && plan.status !== 'draft' && plan.status !== 'approved')
      throw new Error(
        `Cannot split tasks on plan in '${plan.status}' status — must be 'brainstorming', 'draft', or 'approved'`,
      );

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

    // Validate dependency references
    const taskIds = new Set(plan.tasks.map((t) => t.id));
    for (const task of plan.tasks) {
      if (task.dependsOn) {
        for (const dep of task.dependsOn) {
          if (!taskIds.has(dep)) {
            throw new Error(`Task '${task.id}' depends on unknown task '${dep}'`);
          }
        }
      }
    }

    plan.updatedAt = now;
    this.save();
    return plan;
  }

  /**
   * Reconcile a plan — compare what was planned vs what actually happened.
   * Uses impact-weighted drift scoring (ported from Salvador's calculateDriftScore).
   *
   * Transitions: executing → reconciling → completed (automatic).
   * Also allowed from 'validating' and 'reconciling' states.
   */
  reconcile(
    planId: string,
    report: {
      actualOutcome: string;
      driftItems?: DriftItem[];
      /** Who initiated the reconciliation. */
      reconciledBy?: 'human' | 'auto';
    },
  ): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (
      plan.status !== 'executing' &&
      plan.status !== 'validating' &&
      plan.status !== 'reconciling'
    )
      throw new Error(
        `Cannot reconcile plan in '${plan.status}' status — must be 'executing', 'validating', or 'reconciling'`,
      );

    const driftItems = report.driftItems ?? [];

    // Impact-weighted drift scoring (ported from Salvador)
    const accuracy = calculateDriftScore(driftItems);

    plan.reconciliation = {
      planId,
      accuracy,
      driftItems,
      summary: report.actualOutcome,
      reconciledAt: Date.now(),
    };

    // Compute execution summary from per-task metrics
    plan.executionSummary = this.computeExecutionSummary(plan);

    // Transition through reconciling → completed via FSM
    if (plan.status === 'executing' || plan.status === 'validating') {
      plan.status = 'reconciling';
    }
    // Auto-complete after reconciliation
    plan.status = 'completed';
    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  /**
   * Add review evidence to a plan or specific task.
   */
  addReview(
    planId: string,
    review: {
      taskId?: string;
      reviewer: string;
      outcome: 'approved' | 'rejected' | 'needs_changes';
      comments: string;
    },
  ): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    if (review.taskId) {
      const task = plan.tasks.find((t) => t.id === review.taskId);
      if (!task) throw new Error(`Task not found: ${review.taskId}`);
    }

    if (!plan.reviews) plan.reviews = [];
    plan.reviews.push({
      planId,
      taskId: review.taskId,
      reviewer: review.reviewer,
      outcome: review.outcome,
      comments: review.comments,
      reviewedAt: Date.now(),
    });

    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  /**
   * Get dispatch instructions for a specific task — returns the task and its
   * unmet dependencies so a subagent knows what to work on and what to wait for.
   */
  getDispatch(
    planId: string,
    taskId: string,
  ): {
    task: PlanTask;
    unmetDependencies: PlanTask[];
    ready: boolean;
    deliverableStatus?: { count: number; staleCount: number };
  } {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const unmetDependencies: PlanTask[] = [];
    if (task.dependsOn) {
      for (const depId of task.dependsOn) {
        const dep = plan.tasks.find((t) => t.id === depId);
        if (dep && dep.status !== 'completed') {
          unmetDependencies.push(dep);
        }
      }
    }

    const result: {
      task: PlanTask;
      unmetDependencies: PlanTask[];
      ready: boolean;
      deliverableStatus?: { count: number; staleCount: number };
    } = {
      task,
      unmetDependencies,
      ready: unmetDependencies.length === 0,
    };

    // Include deliverable status if deliverables exist
    if (task.deliverables && task.deliverables.length > 0) {
      result.deliverableStatus = {
        count: task.deliverables.length,
        staleCount: task.deliverables.filter((d) => d.stale).length,
      };
    }

    return result;
  }

  // ─── Execution Metrics & Deliverables ──────────────────────────

  /**
   * Compute aggregate execution summary from per-task metrics.
   * Called from reconcile() and complete() to populate plan.executionSummary.
   */
  private computeExecutionSummary(plan: Plan): ExecutionSummary {
    let totalDurationMs = 0;
    let tasksCompleted = 0;
    let tasksSkipped = 0;
    let tasksFailed = 0;
    let tasksWithDuration = 0;

    for (const task of plan.tasks) {
      if (task.status === 'completed') tasksCompleted++;
      else if (task.status === 'skipped') tasksSkipped++;
      else if (task.status === 'failed') tasksFailed++;

      if (task.metrics?.durationMs) {
        totalDurationMs += task.metrics.durationMs;
        tasksWithDuration++;
      }
    }

    return {
      totalDurationMs,
      tasksCompleted,
      tasksSkipped,
      tasksFailed,
      avgTaskDurationMs:
        tasksWithDuration > 0 ? Math.round(totalDurationMs / tasksWithDuration) : 0,
    };
  }

  /**
   * Submit a deliverable for a task. Auto-computes SHA-256 hash for file deliverables.
   */
  submitDeliverable(
    planId: string,
    taskId: string,
    deliverable: { type: TaskDeliverable['type']; path: string; hash?: string },
  ): PlanTask {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const entry: TaskDeliverable = {
      type: deliverable.type,
      path: deliverable.path,
    };

    // Auto-compute hash for file deliverables
    if (deliverable.type === 'file' && !deliverable.hash) {
      try {
        if (existsSync(deliverable.path)) {
          const content = readFileSync(deliverable.path);
          entry.hash = createHash('sha256').update(content).digest('hex');
        }
      } catch {
        // Graceful degradation — skip hash if file can't be read
      }
    } else if (deliverable.hash) {
      entry.hash = deliverable.hash;
    }

    if (!task.deliverables) task.deliverables = [];
    task.deliverables.push(entry);
    task.updatedAt = Date.now();
    plan.updatedAt = Date.now();
    this.save();
    return task;
  }

  /**
   * Verify all deliverables for a task.
   * - file: checks existsSync + SHA-256 hash match
   * - vault_entry: checks vault.get(path) non-null (requires vault instance)
   * - url: skips (just records, no fetch)
   */
  verifyDeliverables(
    planId: string,
    taskId: string,
    vault?: { get(id: string): unknown | null },
  ): { verified: boolean; deliverables: TaskDeliverable[]; staleCount: number } {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const deliverables = task.deliverables ?? [];
    let staleCount = 0;
    const now = Date.now();

    for (const d of deliverables) {
      d.stale = false;

      if (d.type === 'file') {
        if (!existsSync(d.path)) {
          d.stale = true;
          staleCount++;
        } else if (d.hash) {
          try {
            const content = readFileSync(d.path);
            const currentHash = createHash('sha256').update(content).digest('hex');
            if (currentHash !== d.hash) {
              d.stale = true;
              staleCount++;
            }
          } catch {
            d.stale = true;
            staleCount++;
          }
        }
        d.verifiedAt = now;
      } else if (d.type === 'vault_entry') {
        if (vault) {
          const entry = vault.get(d.path);
          if (!entry) {
            d.stale = true;
            staleCount++;
          }
        }
        d.verifiedAt = now;
      }
      // url: skip — just record
    }

    plan.updatedAt = Date.now();
    this.save();

    return { verified: staleCount === 0, deliverables, staleCount };
  }

  // ─── Evidence & Verification ────────────────────────────────────

  /**
   * Submit evidence for a task acceptance criterion.
   * Evidence is stored on the task and used by verifyTask() to check completeness.
   */
  submitEvidence(
    planId: string,
    taskId: string,
    evidence: { criterion: string; content: string; type: TaskEvidence['type'] },
  ): PlanTask {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!task.evidence) task.evidence = [];
    task.evidence.push({
      criterion: evidence.criterion,
      content: evidence.content,
      type: evidence.type,
      submittedAt: Date.now(),
    });
    task.updatedAt = Date.now();
    plan.updatedAt = Date.now();
    this.save();
    return task;
  }

  /**
   * Verify a task — check that evidence exists for all acceptance criteria
   * and any reviews have passed.
   * Returns verification status with details.
   */
  verifyTask(
    planId: string,
    taskId: string,
  ): {
    verified: boolean;
    task: PlanTask;
    missingCriteria: string[];
    reviewStatus: 'approved' | 'rejected' | 'needs_changes' | 'no_reviews';
  } {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    // Check evidence coverage
    const criteria = task.acceptanceCriteria ?? [];
    const evidencedCriteria = new Set((task.evidence ?? []).map((e) => e.criterion));
    const missingCriteria = criteria.filter((c) => !evidencedCriteria.has(c));

    // Check task-level reviews
    const taskReviews = (plan.reviews ?? []).filter((r) => r.taskId === taskId);
    let reviewStatus: 'approved' | 'rejected' | 'needs_changes' | 'no_reviews' = 'no_reviews';
    if (taskReviews.length > 0) {
      const latest = taskReviews[taskReviews.length - 1];
      reviewStatus = latest.outcome;
    }

    const verified =
      task.status === 'completed' &&
      missingCriteria.length === 0 &&
      (reviewStatus === 'approved' || reviewStatus === 'no_reviews');

    if (verified !== task.verified) {
      task.verified = verified;
      task.updatedAt = Date.now();
      plan.updatedAt = Date.now();
      this.save();
    }

    return { verified, task, missingCriteria, reviewStatus };
  }

  /**
   * Verify an entire plan — check all tasks are in a final state,
   * all verification-required tasks have evidence, no tasks stuck in_progress.
   * Returns a validation report.
   */
  verifyPlan(planId: string): {
    valid: boolean;
    planId: string;
    issues: Array<{ taskId: string; issue: string }>;
    summary: {
      total: number;
      completed: number;
      skipped: number;
      failed: number;
      pending: number;
      inProgress: number;
      verified: number;
    };
  } {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    const issues: Array<{ taskId: string; issue: string }> = [];
    let verified = 0;
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    let pending = 0;
    let inProgress = 0;

    for (const task of plan.tasks) {
      switch (task.status) {
        case 'completed':
          completed++;
          break;
        case 'skipped':
          skipped++;
          break;
        case 'failed':
          failed++;
          break;
        case 'pending':
          pending++;
          break;
        case 'in_progress':
          inProgress++;
          break;
      }

      if (task.verified) verified++;

      // Check for stuck tasks
      if (task.status === 'in_progress') {
        issues.push({ taskId: task.id, issue: 'Task stuck in in_progress state' });
      }
      if (task.status === 'pending') {
        issues.push({ taskId: task.id, issue: 'Task still pending — not started' });
      }

      // Check evidence for completed tasks with acceptance criteria
      if (
        task.status === 'completed' &&
        task.acceptanceCriteria &&
        task.acceptanceCriteria.length > 0
      ) {
        const evidencedCriteria = new Set((task.evidence ?? []).map((e) => e.criterion));
        const missing = task.acceptanceCriteria.filter((c) => !evidencedCriteria.has(c));
        if (missing.length > 0) {
          issues.push({
            taskId: task.id,
            issue: `Missing evidence for ${missing.length} criteria: ${missing.join(', ')}`,
          });
        }
      }
    }

    const valid = issues.length === 0 && pending === 0 && inProgress === 0;

    return {
      valid,
      planId,
      issues,
      summary: {
        total: plan.tasks.length,
        completed,
        skipped,
        failed,
        pending,
        inProgress,
        verified,
      },
    };
  }

  /**
   * Auto-reconcile a plan — fast path for plans with minimal drift.
   * Checks all tasks are in final state, generates reconciliation report automatically.
   * Returns null if drift is too significant for auto-reconciliation (>2 non-completed tasks).
   */
  autoReconcile(planId: string): Plan | null {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'executing' && plan.status !== 'validating')
      throw new Error(
        `Cannot auto-reconcile plan in '${plan.status}' status — must be 'executing' or 'validating'`,
      );

    const completed = plan.tasks.filter((t) => t.status === 'completed').length;
    const skipped = plan.tasks.filter((t) => t.status === 'skipped').length;
    const failed = plan.tasks.filter((t) => t.status === 'failed').length;
    const pending = plan.tasks.filter((t) => t.status === 'pending').length;
    const inProgress = plan.tasks.filter((t) => t.status === 'in_progress').length;

    // Can't auto-reconcile if tasks are still in progress
    if (inProgress > 0) return null;
    // Can't auto-reconcile if too many non-completed tasks
    if (pending + failed > 2) return null;

    const driftItems: DriftItem[] = [];

    for (const task of plan.tasks) {
      if (task.status === 'skipped') {
        driftItems.push({
          type: 'skipped',
          description: `Task '${task.title}' was skipped`,
          impact: 'medium',
          rationale: 'Task not executed during plan implementation',
        });
      } else if (task.status === 'failed') {
        driftItems.push({
          type: 'modified',
          description: `Task '${task.title}' failed`,
          impact: 'high',
          rationale: 'Task execution failed',
        });
      } else if (task.status === 'pending') {
        driftItems.push({
          type: 'skipped',
          description: `Task '${task.title}' was never started`,
          impact: 'low',
          rationale: 'Task left in pending state',
        });
      }
    }

    return this.reconcile(planId, {
      actualOutcome: `Auto-reconciled: ${completed}/${plan.tasks.length} tasks completed, ${skipped} skipped, ${failed} failed`,
      driftItems,
      reconciledBy: 'auto',
    });
  }

  /**
   * Generate a review prompt for spec compliance checking.
   * Used by subagent dispatch — the controller generates the prompt, a subagent executes it.
   */
  generateReviewSpec(
    planId: string,
    taskId: string,
  ): { prompt: string; task: PlanTask; plan: Plan } {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const criteria = task.acceptanceCriteria?.length
      ? `\n\nAcceptance Criteria:\n${task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '';

    const prompt = [
      `# Spec Compliance Review`,
      ``,
      `## Task: ${task.title}`,
      `**Description:** ${task.description}`,
      `**Plan Objective:** ${plan.objective}${criteria}`,
      ``,
      `## Review Checklist`,
      `1. Does the implementation match the task description?`,
      `2. Are all acceptance criteria satisfied?`,
      `3. Does it align with the plan's overall objective?`,
      `4. Are there any spec deviations?`,
      ``,
      `Provide: outcome (approved/rejected/needs_changes) and detailed comments.`,
    ].join('\n');

    return { prompt, task, plan };
  }

  /**
   * Generate a review prompt for code quality checking.
   */
  generateReviewQuality(
    planId: string,
    taskId: string,
  ): { prompt: string; task: PlanTask; plan: Plan } {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const prompt = [
      `# Code Quality Review`,
      ``,
      `## Task: ${task.title}`,
      `**Description:** ${task.description}`,
      ``,
      `## Quality Checklist`,
      `1. **Correctness** — Does it work as intended?`,
      `2. **Security** — No injection, XSS, or OWASP top 10 vulnerabilities?`,
      `3. **Performance** — No unnecessary allocations, N+1 queries, or blocking calls?`,
      `4. **Maintainability** — Clear naming, appropriate abstractions, documented intent?`,
      `5. **Testing** — Adequate test coverage for the changes?`,
      `6. **Error Handling** — Graceful degradation, no swallowed errors?`,
      `7. **Conventions** — Follows project coding standards?`,
      ``,
      `Provide: outcome (approved/rejected/needs_changes) and detailed comments.`,
    ].join('\n');

    return { prompt, task, plan };
  }

  /**
   * Archive completed plans — transitions them to 'archived' status.
   * If olderThanDays is provided, only archives plans older than that.
   * Returns the archived plans.
   */
  archive(olderThanDays?: number): Plan[] {
    const cutoff =
      olderThanDays !== undefined
        ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
        : Date.now() + 1; // +1ms so archive() with no args archives all completed plans
    const toArchive = this.store.plans.filter(
      (p) => p.status === 'completed' && p.updatedAt < cutoff,
    );
    for (const plan of toArchive) {
      plan.status = 'archived';
      plan.updatedAt = Date.now();
    }
    if (toArchive.length > 0) {
      this.save();
    }
    return toArchive;
  }

  /**
   * Get statistics about all plans.
   */
  stats(): {
    total: number;
    byStatus: Record<PlanStatus, number>;
    avgTasksPerPlan: number;
    totalTasks: number;
    tasksByStatus: Record<TaskStatus, number>;
  } {
    const plans = this.store.plans;
    const byStatus: Record<PlanStatus, number> = {
      brainstorming: 0,
      draft: 0,
      approved: 0,
      executing: 0,
      validating: 0,
      reconciling: 0,
      completed: 0,
      archived: 0,
    };
    const tasksByStatus: Record<TaskStatus, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
    };
    let totalTasks = 0;

    for (const p of plans) {
      byStatus[p.status]++;
      totalTasks += p.tasks.length;
      for (const t of p.tasks) {
        tasksByStatus[t.status]++;
      }
    }

    return {
      total: plans.length,
      byStatus,
      avgTasksPerPlan: plans.length > 0 ? Math.round((totalTasks / plans.length) * 100) / 100 : 0,
      totalTasks,
      tasksByStatus,
    };
  }

  // ─── Grading ──────────────────────────────────────────────────────

  /**
   * Grade a plan using gap analysis with severity-weighted scoring.
   * Ported from Salvador MCP's multi-pass grading engine.
   *
   * 6 built-in passes + optional custom passes (domain-specific checks).
   *
   * Scoring:
   * - Each gap has a severity (critical=30, major=15, minor=2, info=0)
   * - Deductions are per-category with optional caps
   * - Iteration leniency: minor gaps free on iter 1, half on iter 2, full on 3+
   * - Score = max(0, 100 - deductions)
   *
   * Grade thresholds: A+=95, A=90, B=80, C=70, D=60, F=<60
   */
  grade(planId: string): PlanCheck {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    // Run 6-pass gap analysis
    const gaps = runGapAnalysis(plan, this.gapOptions);

    // Add circular dependency check (structural, not covered by gap-analysis passes)
    if (this.hasCircularDependencies(plan)) {
      gaps.push({
        id: `gap_${Date.now()}_circ`,
        severity: 'critical',
        category: 'structure',
        description: 'Circular dependencies detected among tasks.',
        recommendation: 'Remove circular dependency chains so tasks can be executed in order.',
        location: 'tasks',
        _trigger: 'circular_dependencies',
      });
    }

    // Iteration = number of previous checks + 1
    const iteration = plan.checks.length + 1;
    const score = calculateScore(gaps, iteration);
    const grade = this.scoreToGrade(score);

    const check: PlanCheck = {
      checkId: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planId,
      grade,
      score,
      gaps,
      iteration,
      checkedAt: Date.now(),
    };

    plan.checks.push(check);
    plan.latestCheck = check;
    plan.updatedAt = Date.now();
    this.save();

    return check;
  }

  /**
   * Get the latest check for a plan.
   */
  getLatestCheck(planId: string): PlanCheck | null {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    return plan.latestCheck ?? null;
  }

  /**
   * Get all checks for a plan (history).
   */
  getCheckHistory(planId: string): PlanCheck[] {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    return [...plan.checks];
  }

  /**
   * Auto-grade: grade the plan and return whether it meets a target grade.
   */
  meetsGrade(planId: string, targetGrade: PlanGrade): { meets: boolean; check: PlanCheck } {
    const check = this.grade(planId);
    const targetScore = this.gradeToMinScore(targetGrade);
    return { meets: check.score >= targetScore, check };
  }

  // ─── Grading Helpers ──────────────────────────────────────────────

  private scoreToGrade(score: number): PlanGrade {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private gradeToMinScore(grade: PlanGrade): number {
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

  private hasCircularDependencies(plan: Plan): boolean {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const taskMap = new Map(plan.tasks.map((t) => [t.id, t]));

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

    for (const task of plan.tasks) {
      if (dfs(task.id)) return true;
    }
    return false;
  }
}
