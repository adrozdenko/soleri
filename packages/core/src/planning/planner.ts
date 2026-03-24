/**
 * Planner facade — delegates to extracted modules, owns persistence.
 * Re-exports all public types for backward compatibility.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runGapAnalysis } from './gap-analysis.js';
import type { GapAnalysisOptions } from './gap-analysis.js';
export * from './plan-lifecycle.js';
export * from './reconciliation-engine.js';
export * from './task-verifier.js';
export * from './planner-types.js';
import type {
  TaskStatus,
  PlanTask,
  Plan,
  PlanStore,
  PlanCheck,
  PlannerOptions,
} from './planner-types.js';
import {
  applyTransition,
  scoreToGrade,
  gradeToMinScore,
  PlanGradeRejectionError,
  hasCircularDependencies,
  applyIteration,
  applySplitTasks,
  calculateScore,
  applyTaskStatusUpdate,
  createPlanObject,
} from './plan-lifecycle.js';
import type { PlanStatus, PlanGrade, IterateChanges } from './plan-lifecycle.js';
import {
  buildReconciliationReport,
  buildAutoReconcileInput,
  computeExecutionSummary,
} from './reconciliation-engine.js';
import type { ReconcileInput } from './reconciliation-engine.js';
import {
  createEvidence,
  verifyTaskLogic,
  verifyPlanLogic,
  verifyDeliverablesLogic,
  createDeliverable,
  buildSpecReviewPrompt,
  buildQualityReviewPrompt,
} from './task-verifier.js';

export class Planner {
  private filePath: string;
  private store: PlanStore;
  private gapOptions?: GapAnalysisOptions;
  private minGradeForApproval: PlanGrade;

  constructor(filePath: string, options?: GapAnalysisOptions | PlannerOptions) {
    this.filePath = filePath;
    if (options && 'minGradeForApproval' in options) {
      this.gapOptions = options.gapOptions;
      this.minGradeForApproval = options.minGradeForApproval ?? 'A';
    } else {
      this.gapOptions = options as GapAnalysisOptions | undefined;
      this.minGradeForApproval = 'A';
    }
    this.store = this.load();
  }

  private load(): PlanStore {
    if (!existsSync(this.filePath)) return { version: '1.0', plans: [] };
    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const store = JSON.parse(data) as PlanStore;
      for (const plan of store.plans) plan.checks = plan.checks ?? [];
      return store;
    } catch {
      return { version: '1.0', plans: [] };
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  private transition(plan: Plan, to: PlanStatus): void {
    const r = applyTransition(plan.status, to);
    plan.status = r.status;
    plan.updatedAt = r.updatedAt;
  }

  private requirePlan(planId: string): Plan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    return plan;
  }

  private requireTask(plan: Plan, taskId: string): PlanTask {
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    return task;
  }

  create(params: Parameters<typeof createPlanObject>[0]): Plan {
    const plan = createPlanObject(params);
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

  remove(planId: string): boolean {
    const idx = this.store.plans.findIndex((p) => p.id === planId);
    if (idx < 0) return false;
    this.store.plans.splice(idx, 1);
    this.save();
    return true;
  }

  promoteToDraft(planId: string): Plan {
    const plan = this.requirePlan(planId);
    this.transition(plan, 'draft');
    this.save();
    return plan;
  }

  approve(planId: string): Plan {
    const plan = this.requirePlan(planId);
    const check = plan.latestCheck;
    if (check && check.score < gradeToMinScore(this.minGradeForApproval)) {
      throw new PlanGradeRejectionError(
        check.grade,
        check.score,
        this.minGradeForApproval,
        check.gaps,
      );
    }
    this.transition(plan, 'approved');
    this.save();
    return plan;
  }

  startExecution(planId: string): Plan {
    const plan = this.requirePlan(planId);
    this.transition(plan, 'executing');
    this.save();
    return plan;
  }

  startValidation(planId: string): Plan {
    const plan = this.requirePlan(planId);
    this.transition(plan, 'validating');
    this.save();
    return plan;
  }

  startReconciliation(planId: string): Plan {
    const plan = this.requirePlan(planId);
    this.transition(plan, 'reconciling');
    this.save();
    return plan;
  }

  updateTask(planId: string, taskId: string, status: TaskStatus): Plan {
    const plan = this.requirePlan(planId);
    if (plan.status !== 'executing' && plan.status !== 'validating')
      throw new Error(
        `Cannot update tasks on plan in '${plan.status}' status — must be 'executing' or 'validating'`,
      );
    applyTaskStatusUpdate(this.requireTask(plan, taskId), status);
    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  reconcile(planId: string, report: ReconcileInput): Plan {
    const plan = this.requirePlan(planId);
    if (
      plan.status !== 'executing' &&
      plan.status !== 'validating' &&
      plan.status !== 'reconciling'
    )
      throw new Error(
        `Cannot reconcile plan in '${plan.status}' status — must be 'executing', 'validating', or 'reconciling'`,
      );
    plan.reconciliation = buildReconciliationReport(planId, report);
    plan.executionSummary = computeExecutionSummary(plan.tasks);
    if (plan.status === 'executing' || plan.status === 'validating') plan.status = 'reconciling';
    plan.status = 'completed';
    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  complete(planId: string): Plan {
    const plan = this.requirePlan(planId);
    if (plan.status === 'executing' || plan.status === 'validating')
      return this.reconcile(planId, { actualOutcome: 'All tasks completed', reconciledBy: 'auto' });
    plan.executionSummary = computeExecutionSummary(plan.tasks);
    this.transition(plan, 'completed');
    this.save();
    return plan;
  }

  autoReconcile(planId: string): Plan | null {
    const plan = this.requirePlan(planId);
    if (plan.status !== 'executing' && plan.status !== 'validating')
      throw new Error(
        `Cannot auto-reconcile plan in '${plan.status}' status — must be 'executing' or 'validating'`,
      );
    const result = buildAutoReconcileInput(plan.tasks);
    if (!result.canAutoReconcile || !result.input) return null;
    return this.reconcile(planId, result.input);
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

  iterate(planId: string, changes: IterateChanges): { plan: Plan; mutated: number } {
    const plan = this.requirePlan(planId);
    if (plan.status !== 'draft' && plan.status !== 'brainstorming')
      throw new Error(
        `Cannot iterate plan in '${plan.status}' status — must be 'draft' or 'brainstorming'`,
      );
    const mutated = applyIteration(plan, changes);
    if (mutated > 0) {
      this.save();
    }
    return { plan, mutated };
  }

  splitTasks(
    planId: string,
    tasks: Array<{
      title: string;
      description: string;
      dependsOn?: string[];
      acceptanceCriteria?: string[];
    }>,
  ): Plan {
    const plan = this.requirePlan(planId);
    if (plan.status !== 'brainstorming' && plan.status !== 'draft' && plan.status !== 'approved')
      throw new Error(
        `Cannot split tasks on plan in '${plan.status}' status — must be 'brainstorming', 'draft', or 'approved'`,
      );
    applySplitTasks(plan, tasks);
    this.save();
    return plan;
  }

  addReview(
    planId: string,
    review: {
      taskId?: string;
      reviewer: string;
      outcome: 'approved' | 'rejected' | 'needs_changes';
      comments: string;
    },
  ): Plan {
    const plan = this.requirePlan(planId);
    if (review.taskId) this.requireTask(plan, review.taskId);
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

  setGitHubProjection(
    planId: string,
    projection: {
      repo: string;
      milestone?: number;
      issues: Array<{ taskId: string; issueNumber: number }>;
      projectedAt: number;
    },
  ): Plan {
    const plan = this.requirePlan(planId);
    plan.githubProjection = projection;
    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  getDispatch(
    planId: string,
    taskId: string,
  ): {
    task: PlanTask;
    unmetDependencies: PlanTask[];
    ready: boolean;
    deliverableStatus?: { count: number; staleCount: number };
  } {
    const plan = this.requirePlan(planId);
    const task = this.requireTask(plan, taskId);
    const unmetDeps: PlanTask[] = [];
    for (const depId of task.dependsOn ?? []) {
      const dep = plan.tasks.find((t) => t.id === depId);
      if (dep && dep.status !== 'completed') unmetDeps.push(dep);
    }
    return {
      task,
      unmetDependencies: unmetDeps,
      ready: unmetDeps.length === 0,
      ...(task.deliverables?.length && {
        deliverableStatus: {
          count: task.deliverables.length,
          staleCount: task.deliverables.filter((d) => d.stale).length,
        },
      }),
    };
  }

  submitDeliverable(
    planId: string,
    taskId: string,
    deliverable: { type: 'file' | 'vault_entry' | 'url'; path: string; hash?: string },
  ): PlanTask {
    const plan = this.requirePlan(planId);
    const task = this.requireTask(plan, taskId);
    if (!task.deliverables) task.deliverables = [];
    task.deliverables.push(createDeliverable(deliverable));
    task.updatedAt = Date.now();
    plan.updatedAt = Date.now();
    this.save();
    return task;
  }

  verifyDeliverables(
    planId: string,
    taskId: string,
    vault?: { get(id: string): unknown | null },
  ): {
    verified: boolean;
    deliverables: import('./planner-types.js').TaskDeliverable[];
    staleCount: number;
  } {
    const plan = this.requirePlan(planId);
    const task = this.requireTask(plan, taskId);
    const result = verifyDeliverablesLogic(task.deliverables ?? [], vault);
    task.deliverables = result.deliverables;
    plan.updatedAt = Date.now();
    this.save();
    return result;
  }

  submitEvidence(
    planId: string,
    taskId: string,
    evidence: {
      criterion: string;
      content: string;
      type: import('./planner-types.js').TaskEvidence['type'];
    },
  ): PlanTask {
    const plan = this.requirePlan(planId);
    const task = this.requireTask(plan, taskId);
    task.evidence = createEvidence(task.evidence ?? [], evidence);
    task.updatedAt = Date.now();
    plan.updatedAt = Date.now();
    this.save();
    return task;
  }

  verifyTask(
    planId: string,
    taskId: string,
  ): {
    verified: boolean;
    task: PlanTask;
    missingCriteria: string[];
    reviewStatus: 'approved' | 'rejected' | 'needs_changes' | 'no_reviews';
  } {
    const plan = this.requirePlan(planId);
    const task = this.requireTask(plan, taskId);
    const result = verifyTaskLogic(task, plan.reviews ?? []);
    if (result.verified !== task.verified) {
      task.verified = result.verified;
      task.updatedAt = Date.now();
      plan.updatedAt = Date.now();
      this.save();
    }
    return { ...result, task };
  }

  verifyPlan(planId: string) {
    return verifyPlanLogic(planId, this.requirePlan(planId).tasks);
  }

  generateReviewSpec(
    planId: string,
    taskId: string,
  ): { prompt: string; task: PlanTask; plan: Plan } {
    const plan = this.requirePlan(planId);
    const task = this.requireTask(plan, taskId);
    return { prompt: buildSpecReviewPrompt(task, plan.objective), task, plan };
  }

  generateReviewQuality(
    planId: string,
    taskId: string,
  ): { prompt: string; task: PlanTask; plan: Plan } {
    const plan = this.requirePlan(planId);
    const task = this.requireTask(plan, taskId);
    return { prompt: buildQualityReviewPrompt(task), task, plan };
  }

  archive(olderThanDays?: number): Plan[] {
    const cutoff =
      olderThanDays !== undefined
        ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
        : Date.now() + 1;
    const toArchive = this.store.plans.filter(
      (p) => p.status === 'completed' && p.updatedAt < cutoff,
    );
    for (const plan of toArchive) {
      plan.status = 'archived';
      plan.updatedAt = Date.now();
    }
    if (toArchive.length > 0) this.save();
    return toArchive;
  }

  stats(): {
    total: number;
    byStatus: Record<PlanStatus, number>;
    avgTasksPerPlan: number;
    totalTasks: number;
    tasksByStatus: Record<TaskStatus, number>;
  } {
    const plans = this.store.plans;
    const byStatus = {
      brainstorming: 0,
      draft: 0,
      approved: 0,
      executing: 0,
      validating: 0,
      reconciling: 0,
      completed: 0,
      archived: 0,
    } as Record<PlanStatus, number>;
    const tasksByStatus = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
    } as Record<TaskStatus, number>;
    let totalTasks = 0;
    for (const p of plans) {
      byStatus[p.status]++;
      totalTasks += p.tasks.length;
      for (const t of p.tasks) tasksByStatus[t.status]++;
    }
    return {
      total: plans.length,
      byStatus,
      totalTasks,
      tasksByStatus,
      avgTasksPerPlan: plans.length > 0 ? Math.round((totalTasks / plans.length) * 100) / 100 : 0,
    };
  }

  grade(planId: string): PlanCheck {
    const plan = this.requirePlan(planId);
    const gaps = runGapAnalysis(plan, this.gapOptions);
    if (hasCircularDependencies(plan.tasks)) {
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
    const iteration = plan.checks.length + 1;
    const score = calculateScore(gaps, iteration);
    const check: PlanCheck = {
      checkId: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planId,
      grade: scoreToGrade(score),
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

  getLatestCheck(planId: string): PlanCheck | null {
    return this.requirePlan(planId).latestCheck ?? null;
  }

  getCheckHistory(planId: string): PlanCheck[] {
    return [...this.requirePlan(planId).checks];
  }

  meetsGrade(planId: string, targetGrade: PlanGrade): { meets: boolean; check: PlanCheck } {
    const check = this.grade(planId);
    return { meets: check.score >= gradeToMinScore(targetGrade), check };
  }
}
