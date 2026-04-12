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
export * from './objective-similarity.js';
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
import { findSimilarPlan } from './objective-similarity.js';
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
  private executingTtlMs: number;
  private draftTtlMs: number;

  constructor(filePath: string, options?: GapAnalysisOptions | PlannerOptions) {
    this.filePath = filePath;
    if (
      options &&
      ('minGradeForApproval' in options ||
        'executingTtlMs' in options ||
        'draftTtlMs' in options ||
        'gapOptions' in options)
    ) {
      const opts = options as PlannerOptions;
      this.gapOptions = opts.gapOptions;
      this.minGradeForApproval = opts.minGradeForApproval ?? 'A';
      this.executingTtlMs = opts.executingTtlMs ?? 24 * 60 * 60 * 1000;
      this.draftTtlMs = opts.draftTtlMs ?? 30 * 60 * 1000;
    } else {
      this.gapOptions = options as GapAnalysisOptions | undefined;
      this.minGradeForApproval = 'A';
      this.executingTtlMs = 24 * 60 * 60 * 1000;
      this.draftTtlMs = 30 * 60 * 1000;
    }
    this.store = this.load();
  }

  private normalizeTerminalTaskStates(
    plan: Plan,
    closedAt = Date.now(),
  ): { changed: boolean; pending: number; inProgress: number } {
    let pending = 0;
    let inProgress = 0;

    for (const task of plan.tasks) {
      if (task.status === 'pending') pending++;
      if (task.status === 'in_progress') inProgress++;
      if (task.status === 'pending' || task.status === 'in_progress') {
        applyTaskStatusUpdate(task, 'skipped', closedAt);
      }
    }

    return { changed: pending + inProgress > 0, pending, inProgress };
  }

  private repairTerminalPlans(store: PlanStore): boolean {
    let repaired = false;

    for (const plan of store.plans) {
      plan.checks = plan.checks ?? [];
      if (plan.status !== 'completed' && plan.status !== 'archived') continue;

      const closedAt = plan.reconciliation?.reconciledAt ?? plan.updatedAt;
      const normalized = this.normalizeTerminalTaskStates(plan, closedAt);
      if (!normalized.changed) continue;

      plan.executionSummary = computeExecutionSummary(plan.tasks);
      repaired = true;
    }

    return repaired;
  }

  private load(): PlanStore {
    if (!existsSync(this.filePath)) return { version: '1.0', plans: [] };
    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const store = JSON.parse(data) as PlanStore;
      if (this.repairTerminalPlans(store)) {
        mkdirSync(dirname(this.filePath), { recursive: true });
        writeFileSync(this.filePath, JSON.stringify(store, null, 2), 'utf-8');
      }
      return store;
    } catch {
      return { version: '1.0', plans: [] };
    }
  }

  private refresh(): void {
    this.store = this.load();
  }

  private mergeLatestStore(deletedPlanIds: string[] = []): void {
    const deleted = new Set(deletedPlanIds);
    const latest = this.load();
    const merged = new Map<string, Plan>();

    for (const plan of latest.plans) {
      if (!deleted.has(plan.id)) {
        merged.set(plan.id, plan);
      }
    }

    for (const plan of this.store.plans) {
      if (deleted.has(plan.id)) continue;
      const existing = merged.get(plan.id);
      if (!existing || plan.updatedAt >= existing.updatedAt) {
        merged.set(plan.id, plan);
      }
    }

    this.store = {
      version: latest.version ?? this.store.version ?? '1.0',
      plans: [...merged.values()],
    };
  }

  private save(deletedPlanIds: string[] = []): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.mergeLatestStore(deletedPlanIds);
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  private transition(plan: Plan, to: PlanStatus): void {
    const r = applyTransition(plan.status, to);
    plan.status = r.status;
    plan.updatedAt = r.updatedAt;
  }

  private findPlan(planId: string): Plan | null {
    return this.store.plans.find((p) => p.id === planId) ?? null;
  }

  private requirePlan(planId: string): Plan {
    this.refresh();
    const plan = this.findPlan(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    return plan;
  }

  private requireTask(plan: Plan, taskId: string): PlanTask {
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    return task;
  }

  create(
    params: Parameters<typeof createPlanObject>[0] & { forceCreate?: boolean },
  ): Plan & { _deduplicated?: boolean } {
    this.refresh();

    // Dedup: check for active plans with a similar objective
    if (!params.forceCreate) {
      const match = findSimilarPlan(this.store.plans, params.objective);
      if (match) {
        return Object.assign(match.plan, { _deduplicated: true });
      }
    }

    const plan = createPlanObject(params);
    this.store.plans.push(plan);
    this.save();
    return plan;
  }

  get(planId: string): Plan | null {
    this.refresh();
    return this.findPlan(planId);
  }

  list(): Plan[] {
    this.refresh();
    return [...this.store.plans];
  }

  remove(planId: string): boolean {
    this.refresh();
    const idx = this.store.plans.findIndex((p) => p.id === planId);
    if (idx < 0) return false;
    this.store.plans.splice(idx, 1);
    this.save([planId]);
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

  patchPlan(planId: string, fields: Partial<Plan>): Plan {
    const plan = this.requirePlan(planId);
    Object.assign(plan, fields);
    plan.updatedAt = Date.now();
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
      plan.status !== 'approved' &&
      plan.status !== 'executing' &&
      plan.status !== 'validating' &&
      plan.status !== 'reconciling'
    )
      throw new Error(
        `Cannot reconcile plan in '${plan.status}' status — must be 'approved', 'executing', 'validating', or 'reconciling'`,
      );
    plan.reconciliation = buildReconciliationReport(planId, report);
    plan.executionSummary = computeExecutionSummary(plan.tasks);
    if (plan.status === 'executing' || plan.status === 'validating' || plan.status === 'approved')
      plan.status = 'reconciling';
    plan.updatedAt = Date.now();
    this.save();
    return plan;
  }

  complete(planId: string): Plan {
    let plan = this.requirePlan(planId);
    if (plan.status === 'executing' || plan.status === 'validating') {
      const reconciled = this.autoReconcile(planId);
      if (!reconciled) {
        const pending = plan.tasks.filter((task) => task.status === 'pending').length;
        const inProgress = plan.tasks.filter((task) => task.status === 'in_progress').length;
        const failed = plan.tasks.filter((task) => task.status === 'failed').length;
        throw new Error(
          `Cannot auto-complete plan with unresolved tasks (${pending} pending, ${inProgress} in_progress, ${failed} failed). Run reconcile first to capture drift, then complete the plan.`,
        );
      }
      // Re-fetch after reconcile since refresh() replaces store objects
      plan = this.requirePlan(planId);
    }
    const closedAt = plan.reconciliation?.reconciledAt ?? Date.now();
    this.normalizeTerminalTaskStates(plan, closedAt);
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
    this.refresh();
    return this.store.plans.filter((p) => p.status === 'executing' || p.status === 'validating');
  }

  getActive(): Plan[] {
    this.refresh();
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
      phase?: string;
      milestone?: string;
      parentTaskId?: string;
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
    this.refresh();
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

  /**
   * Close stale plans — plans in non-terminal states older than the given threshold.
   * For draft/approved: uses 30 min TTL by default.
   * For executing/reconciling: uses olderThanMs parameter (24h default).
   * Returns the list of closed plan IDs.
   */
  closeStale(olderThanMs?: number): {
    closedIds: string[];
    closedPlans: Array<{ id: string; previousStatus: string; reason: string }>;
  } {
    this.refresh();
    const now = Date.now();
    const forceAll = olderThanMs === 0;
    const defaultTtl = forceAll ? 0 : (olderThanMs ?? this.draftTtlMs);
    const executingTtl = forceAll ? 0 : (olderThanMs ?? this.executingTtlMs);
    const closed: Array<{ id: string; previousStatus: string; reason: string }> = [];

    for (const plan of this.store.plans) {
      // Skip terminal states
      if (plan.status === 'completed' || plan.status === 'archived') continue;

      const age = now - plan.updatedAt;
      let shouldClose = false;
      let reason = '';

      if (plan.status === 'draft' || plan.status === 'approved') {
        // Short TTL for draft/approved — these should move quickly
        if (age >= defaultTtl) {
          shouldClose = true;
          reason = `ttl-expired (${plan.status}, age: ${Math.round(age / 60000)}min)`;
        }
      } else if (
        plan.status === 'executing' ||
        plan.status === 'validating' ||
        plan.status === 'reconciling' ||
        plan.status === 'brainstorming'
      ) {
        // Longer TTL for active states
        if (age >= executingTtl) {
          shouldClose = true;
          reason = `stale-closed (${plan.status}, age: ${Math.round(age / 3600000)}h)`;
        }
      }

      if (shouldClose) {
        const previousStatus = plan.status;
        const closedAt = now;
        // Intentional FSM bypass: force-complete stale plans regardless of current state.
        // This skips the normal reconciling → completed transition because stale plans
        // may be in any state (draft, approved, executing, etc.).
        plan.status = 'completed';
        plan.updatedAt = now;
        this.normalizeTerminalTaskStates(plan, closedAt);
        if (!plan.reconciliation) {
          plan.reconciliation = {
            planId: plan.id,
            accuracy: 0,
            driftItems: [],
            summary: `Auto-closed: ${reason}`,
            reconciledAt: now,
          };
        }
        plan.executionSummary = computeExecutionSummary(plan.tasks);
        closed.push({ id: plan.id, previousStatus, reason });
      }
    }

    if (closed.length > 0) this.save();
    return { closedIds: closed.map((c) => c.id), closedPlans: closed };
  }

  stats(): {
    total: number;
    byStatus: Record<PlanStatus, number>;
    avgTasksPerPlan: number;
    totalTasks: number;
    tasksByStatus: Record<TaskStatus, number>;
  } {
    this.refresh();
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
