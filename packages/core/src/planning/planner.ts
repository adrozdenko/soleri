import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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

export interface PlanGap {
  severity: 'critical' | 'major' | 'minor';
  category: 'scope' | 'tasks' | 'dependencies' | 'risks' | 'decisions';
  description: string;
  suggestion: string;
}

export interface PlanCheck {
  checkId: string;
  planId: string;
  grade: PlanGrade;
  score: number; // 0-100
  gaps: PlanGap[];
  checkedAt: number;
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

  constructor(filePath: string) {
    this.filePath = filePath;
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
   * Grade a plan. Scores 0-100, returns grade + gaps.
   * Criteria (10 pts each):
   * 1. Has objective
   * 2. Has scope
   * 3. Has at least 1 task
   * 4. All tasks have descriptions
   * 5. Has decisions documented
   * 6. No circular dependencies
   * 7. Tasks have reasonable granularity (3-15 tasks)
   * 8. Scope doesn't exceed 20 tasks
   * 9. Has at least one decision per 3 tasks
   * 10. All task titles are unique
   */
  grade(planId: string): PlanCheck {
    const plan = this.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    let score = 0;
    const gaps: PlanGap[] = [];

    // 1. Has objective (10 pts)
    if (plan.objective && plan.objective.trim().length > 0) {
      score += 10;
    } else {
      gaps.push({
        severity: 'critical',
        category: 'scope',
        description: 'Plan has no objective.',
        suggestion: 'Add a clear objective describing what this plan achieves.',
      });
    }

    // 2. Has scope (10 pts)
    if (plan.scope && plan.scope.trim().length > 0) {
      score += 10;
    } else {
      gaps.push({
        severity: 'critical',
        category: 'scope',
        description: 'Plan has no scope defined.',
        suggestion: 'Define the scope — what is included and excluded.',
      });
    }

    // 3. Has at least 1 task (10 pts)
    if (plan.tasks.length >= 1) {
      score += 10;
    } else {
      gaps.push({
        severity: 'critical',
        category: 'tasks',
        description: 'Plan has no tasks.',
        suggestion: 'Add at least one task to make the plan actionable.',
      });
    }

    // 4. All tasks have descriptions (10 pts)
    const tasksWithoutDesc = plan.tasks.filter(
      (t) => !t.description || t.description.trim().length === 0,
    );
    if (plan.tasks.length > 0 && tasksWithoutDesc.length === 0) {
      score += 10;
    } else if (plan.tasks.length === 0) {
      // No tasks at all — already penalized by criterion 3
      // Don't double-penalize; award this criterion vacuously
      score += 10;
    } else {
      gaps.push({
        severity: 'major',
        category: 'tasks',
        description: `${tasksWithoutDesc.length} task(s) missing descriptions: ${tasksWithoutDesc.map((t) => t.id).join(', ')}.`,
        suggestion: 'Add descriptions to all tasks explaining what needs to be done.',
      });
    }

    // 5. Has decisions documented (10 pts)
    if (plan.decisions.length > 0) {
      score += 10;
    } else {
      gaps.push({
        severity: 'major',
        category: 'decisions',
        description: 'No decisions documented.',
        suggestion: 'Document key decisions and their rationale.',
      });
    }

    // 6. No circular dependencies (10 pts)
    if (this.hasCircularDependencies(plan)) {
      gaps.push({
        severity: 'critical',
        category: 'dependencies',
        description: 'Circular dependencies detected among tasks.',
        suggestion: 'Remove circular dependency chains so tasks can be executed in order.',
      });
    } else {
      score += 10;
    }

    // 7. Tasks have reasonable granularity — 3 to 15 tasks (10 pts)
    if (plan.tasks.length >= 3 && plan.tasks.length <= 15) {
      score += 10;
    } else if (plan.tasks.length > 0) {
      gaps.push({
        severity: 'minor',
        category: 'tasks',
        description:
          plan.tasks.length < 3
            ? `Only ${plan.tasks.length} task(s) — plan may lack granularity.`
            : `${plan.tasks.length} tasks — plan may be too granular.`,
        suggestion:
          plan.tasks.length < 3
            ? 'Break down the work into 3-15 well-defined tasks.'
            : 'Consolidate related tasks to keep the plan between 3-15 tasks.',
      });
    }

    // 8. Scope doesn't exceed 20 tasks (10 pts)
    if (plan.tasks.length <= 20) {
      score += 10;
    } else {
      gaps.push({
        severity: 'major',
        category: 'scope',
        description: `Plan has ${plan.tasks.length} tasks — exceeds the 20-task limit.`,
        suggestion: 'Split into multiple plans or consolidate tasks to stay under 20.',
      });
    }

    // 9. Has at least one decision per 3 tasks (10 pts)
    const requiredDecisions = Math.max(1, Math.floor(plan.tasks.length / 3));
    if (plan.decisions.length >= requiredDecisions) {
      score += 10;
    } else {
      gaps.push({
        severity: 'minor',
        category: 'decisions',
        description: `${plan.decisions.length} decision(s) for ${plan.tasks.length} tasks — expected at least ${requiredDecisions}.`,
        suggestion: `Document at least 1 decision per 3 tasks (${requiredDecisions} needed).`,
      });
    }

    // 10. All task titles are unique (10 pts)
    const titleSet = new Set<string>();
    const duplicateTitles: string[] = [];
    for (const t of plan.tasks) {
      if (titleSet.has(t.title)) {
        duplicateTitles.push(t.title);
      }
      titleSet.add(t.title);
    }
    if (duplicateTitles.length === 0) {
      score += 10;
    } else {
      gaps.push({
        severity: 'minor',
        category: 'tasks',
        description: `Duplicate task titles: ${[...new Set(duplicateTitles)].join(', ')}.`,
        suggestion: 'Give each task a unique, descriptive title.',
      });
    }

    const grade = this.scoreToGrade(score);
    const check: PlanCheck = {
      checkId: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planId,
      grade,
      score,
      gaps,
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
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  private gradeToMinScore(grade: PlanGrade): number {
    switch (grade) {
      case 'A+': return 95;
      case 'A': return 85;
      case 'B': return 70;
      case 'C': return 55;
      case 'D': return 40;
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
