import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PlanGap } from './gap-types.js';
import { SEVERITY_WEIGHTS, CATEGORY_PENALTY_CAPS } from './gap-types.js';
import { runGapAnalysis } from './gap-analysis.js';
import type { GapAnalysisOptions } from './gap-analysis.js';

export type PlanStatus = 'draft' | 'approved' | 'executing' | 'completed';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  /** Optional dependency IDs — tasks that must complete before this one. */
  dependsOn?: string[];
  updatedAt: number;
}

export interface DriftItem {
  type: 'skipped' | 'added' | 'modified' | 'reordered';
  description: string;
  impact: 'low' | 'medium' | 'high';
  rationale: string;
}

export interface ReconciliationReport {
  planId: string;
  accuracy: number;
  driftItems: DriftItem[];
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
  const categoryTotals = new Map<string, number>();

  for (const gap of gaps) {
    let weight: number = SEVERITY_WEIGHTS[gap.severity];

    // Iteration leniency for minor gaps
    if (gap.severity === 'minor') {
      if (iteration === 1) weight = 0;
      else if (iteration === 2) weight = 1;
      // iteration 3+: full weight (2)
    }

    const category = gap.category;
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + weight);
  }

  let deductions = 0;
  for (const [category, total] of categoryTotals) {
    const cap = CATEGORY_PENALTY_CAPS[category];
    deductions += cap !== undefined ? Math.min(total, cap) : total;
  }

  return Math.max(0, 100 - deductions);
}

export interface Plan {
  id: string;
  objective: string;
  scope: string;
  status: PlanStatus;
  decisions: string[];
  tasks: PlanTask[];
  /** Reconciliation report — populated by reconcile(). */
  reconciliation?: ReconciliationReport;
  /** Review evidence — populated by addReview(). */
  reviews?: ReviewEvidence[];
  /** Latest grading check. */
  latestCheck?: PlanCheck;
  /** All check history. */
  checks: PlanCheck[];
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
    decisions?: string[];
    tasks?: Array<{ title: string; description: string }>;
  }): Plan {
    const now = Date.now();
    const plan: Plan = {
      id: `plan-${now}-${Math.random().toString(36).slice(2, 8)}`,
      objective: params.objective,
      scope: params.scope,
      status: 'draft',
      decisions: params.decisions ?? [],
      tasks: (params.tasks ?? []).map((t, i) => ({
        id: `task-${i + 1}`,
        title: t.title,
        description: t.description,
        status: 'pending' as TaskStatus,
        updatedAt: now,
      })),
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

  approve(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'draft')
      throw new Error(`Cannot approve plan in '${plan.status}' status — must be 'draft'`);
    plan.status = 'approved';
    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  startExecution(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'approved')
      throw new Error(`Cannot execute plan in '${plan.status}' status — must be 'approved'`);
    plan.status = 'executing';
    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  updateTask(planId: string, taskId: string, status: TaskStatus): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'executing')
      throw new Error(
        `Cannot update tasks on plan in '${plan.status}' status — must be 'executing'`,
      );
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.status = status;
    task.updatedAt = Date.now();
    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  complete(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'executing')
      throw new Error(`Cannot complete plan in '${plan.status}' status — must be 'executing'`);
    plan.status = 'completed';
    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  getExecuting(): Plan[] {
    return this.store.plans.filter((p) => p.status === 'executing');
  }

  getActive(): Plan[] {
    return this.store.plans.filter(
      (p) => p.status === 'draft' || p.status === 'approved' || p.status === 'executing',
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
      decisions?: string[];
      addTasks?: Array<{ title: string; description: string }>;
      removeTasks?: string[];
    },
  ): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'draft')
      throw new Error(`Cannot iterate plan in '${plan.status}' status — must be 'draft'`);

    const now = Date.now();
    if (changes.objective !== undefined) plan.objective = changes.objective;
    if (changes.scope !== undefined) plan.scope = changes.scope;
    if (changes.decisions !== undefined) plan.decisions = changes.decisions;

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
    tasks: Array<{ title: string; description: string; dependsOn?: string[] }>,
  ): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'draft' && plan.status !== 'approved')
      throw new Error(
        `Cannot split tasks on plan in '${plan.status}' status — must be 'draft' or 'approved'`,
      );

    const now = Date.now();
    plan.tasks = tasks.map((t, i) => ({
      id: `task-${i + 1}`,
      title: t.title,
      description: t.description,
      status: 'pending' as TaskStatus,
      dependsOn: t.dependsOn,
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
   * Only allowed on 'executing' or 'completed' plans.
   */
  reconcile(
    planId: string,
    report: {
      actualOutcome: string;
      driftItems?: DriftItem[];
    },
  ): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'executing' && plan.status !== 'completed')
      throw new Error(
        `Cannot reconcile plan in '${plan.status}' status — must be 'executing' or 'completed'`,
      );

    const driftItems = report.driftItems ?? [];
    const totalTasks = plan.tasks.length;
    const driftCount = driftItems.length;
    const accuracy = totalTasks > 0 ? Math.round(((totalTasks - driftCount) / totalTasks) * 100) : 100;

    plan.reconciliation = {
      planId,
      accuracy: Math.max(0, Math.min(100, accuracy)),
      driftItems,
      summary: report.actualOutcome,
      reconciledAt: Date.now(),
    };

    // If still executing, mark completed
    if (plan.status === 'executing') {
      plan.status = 'completed';
    }
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
  ): { task: PlanTask; unmetDependencies: PlanTask[]; ready: boolean } {
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

    return { task, unmetDependencies, ready: unmetDependencies.length === 0 };
  }

  /**
   * Archive completed plans older than the given number of days.
   * Removes them from the active store and returns the archived plans.
   */
  archive(olderThanDays: number): Plan[] {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const toArchive = this.store.plans.filter(
      (p) => p.status === 'completed' && p.updatedAt < cutoff,
    );
    if (toArchive.length > 0) {
      this.store.plans = this.store.plans.filter(
        (p) => !(p.status === 'completed' && p.updatedAt < cutoff),
      );
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
    const byStatus: Record<PlanStatus, number> = { draft: 0, approved: 0, executing: 0, completed: 0 };
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
   * Grade a plan using 6-pass gap analysis with severity-weighted scoring.
   * Ported from Salvador MCP's multi-pass grading engine.
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
      case 'A+': return 95;
      case 'A': return 90;
      case 'B': return 80;
      case 'C': return 70;
      case 'D': return 60;
      case 'F': return 0;
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
