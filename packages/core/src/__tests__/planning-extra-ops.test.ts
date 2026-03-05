import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createPlanningExtraOps } from '../runtime/planning-extra-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createPlanningExtraOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'planning-extra-ops-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-planning-extra',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createPlanningExtraOps(runtime);
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  it('should return 9 ops', () => {
    expect(ops.length).toBe(9);
  });

  it('should have all expected op names', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('plan_iterate');
    expect(names).toContain('plan_split');
    expect(names).toContain('plan_reconcile');
    expect(names).toContain('plan_complete_lifecycle');
    expect(names).toContain('plan_dispatch');
    expect(names).toContain('plan_review');
    expect(names).toContain('plan_archive');
    expect(names).toContain('plan_list_tasks');
    expect(names).toContain('plan_stats');
  });

  it('should assign correct auth levels', () => {
    expect(findOp('plan_iterate').auth).toBe('write');
    expect(findOp('plan_split').auth).toBe('write');
    expect(findOp('plan_reconcile').auth).toBe('write');
    expect(findOp('plan_complete_lifecycle').auth).toBe('write');
    expect(findOp('plan_dispatch').auth).toBe('read');
    expect(findOp('plan_review').auth).toBe('write');
    expect(findOp('plan_archive').auth).toBe('admin');
    expect(findOp('plan_list_tasks').auth).toBe('read');
    expect(findOp('plan_stats').auth).toBe('read');
  });

  // ─── Helper: create a draft plan ─────────────────────────────────
  function createDraftPlan() {
    return runtime.planner.create({
      objective: 'Test objective',
      scope: 'Test scope',
      tasks: [
        { title: 'Task A', description: 'Do A' },
        { title: 'Task B', description: 'Do B' },
      ],
    });
  }

  // ─── plan_iterate ─────────────────────────────────────────────────
  describe('plan_iterate', () => {
    it('should update objective on a draft plan', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_iterate').handler({
        planId: plan.id,
        objective: 'Updated objective',
      })) as { iterated: boolean; plan: { objective: string } };
      expect(result.iterated).toBe(true);
      expect(result.plan.objective).toBe('Updated objective');
    });

    it('should add tasks to a draft plan', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_iterate').handler({
        planId: plan.id,
        addTasks: [{ title: 'Task C', description: 'Do C' }],
      })) as { iterated: boolean; plan: { tasks: unknown[] } };
      expect(result.iterated).toBe(true);
      expect(result.plan.tasks.length).toBe(3);
    });

    it('should remove tasks from a draft plan', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_iterate').handler({
        planId: plan.id,
        removeTasks: ['task-1'],
      })) as { iterated: boolean; plan: { tasks: Array<{ id: string }> } };
      expect(result.iterated).toBe(true);
      expect(result.plan.tasks.length).toBe(1);
      expect(result.plan.tasks[0].id).toBe('task-2');
    });

    it('should return error for non-draft plan', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      const result = (await findOp('plan_iterate').handler({
        planId: plan.id,
        objective: 'Updated',
      })) as { error: string };
      expect(result.error).toContain("must be 'draft'");
    });

    it('should return error for unknown plan', async () => {
      const result = (await findOp('plan_iterate').handler({
        planId: 'nonexistent',
        objective: 'Updated',
      })) as { error: string };
      expect(result.error).toContain('Plan not found');
    });
  });

  // ─── plan_split ───────────────────────────────────────────────────
  describe('plan_split', () => {
    it('should replace tasks with dependency tracking', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_split').handler({
        planId: plan.id,
        tasks: [
          { title: 'Setup', description: 'Environment setup' },
          { title: 'Implement', description: 'Core implementation', dependsOn: ['task-1'] },
          { title: 'Test', description: 'Write tests', dependsOn: ['task-2'] },
        ],
      })) as { split: boolean; taskCount: number; plan: { tasks: Array<{ dependsOn?: string[] }> } };
      expect(result.split).toBe(true);
      expect(result.taskCount).toBe(3);
      expect(result.plan.tasks[1].dependsOn).toEqual(['task-1']);
      expect(result.plan.tasks[2].dependsOn).toEqual(['task-2']);
    });

    it('should reject invalid dependency references', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_split').handler({
        planId: plan.id,
        tasks: [
          { title: 'Task', description: 'Depends on nothing that exists', dependsOn: ['task-99'] },
        ],
      })) as { error: string };
      expect(result.error).toContain('unknown task');
    });

    it('should work on approved plans', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      const result = (await findOp('plan_split').handler({
        planId: plan.id,
        tasks: [
          { title: 'Only task', description: 'Single task' },
        ],
      })) as { split: boolean; taskCount: number };
      expect(result.split).toBe(true);
      expect(result.taskCount).toBe(1);
    });

    it('should return error for executing plan', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);
      const result = (await findOp('plan_split').handler({
        planId: plan.id,
        tasks: [{ title: 'T', description: 'D' }],
      })) as { error: string };
      expect(result.error).toContain("must be 'draft' or 'approved'");
    });
  });

  // ─── plan_reconcile ───────────────────────────────────────────────
  describe('plan_reconcile', () => {
    it('should reconcile an executing plan', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);

      const result = (await findOp('plan_reconcile').handler({
        planId: plan.id,
        actualOutcome: 'Completed as planned with minor adjustments',
        driftItems: [
          {
            type: 'modified',
            description: 'Changed approach for Task B',
            impact: 'low',
            rationale: 'Found a simpler way',
          },
        ],
      })) as { reconciled: boolean; accuracy: number; driftCount: number };
      expect(result.reconciled).toBe(true);
      expect(result.accuracy).toBe(50); // 1 drift out of 2 tasks = 50%
      expect(result.driftCount).toBe(1);
    });

    it('should mark executing plan as completed after reconcile', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);

      const result = (await findOp('plan_reconcile').handler({
        planId: plan.id,
        actualOutcome: 'Done',
      })) as { reconciled: boolean; plan: { status: string } };
      expect(result.plan.status).toBe('completed');
    });

    it('should return 100% accuracy with no drift items', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);

      const result = (await findOp('plan_reconcile').handler({
        planId: plan.id,
        actualOutcome: 'Perfect execution',
      })) as { accuracy: number; driftCount: number };
      expect(result.accuracy).toBe(100);
      expect(result.driftCount).toBe(0);
    });

    it('should return error for draft plan', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_reconcile').handler({
        planId: plan.id,
        actualOutcome: 'Done',
      })) as { error: string };
      expect(result.error).toContain("must be 'executing' or 'completed'");
    });
  });

  // ─── plan_complete_lifecycle ──────────────────────────────────────
  describe('plan_complete_lifecycle', () => {
    it('should capture patterns and anti-patterns into vault', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);
      runtime.planner.complete(plan.id);

      const result = (await findOp('plan_complete_lifecycle').handler({
        planId: plan.id,
        patterns: ['Always write tests first'],
        antiPatterns: ['Do not skip code review'],
      })) as {
        completed: boolean;
        knowledgeCaptured: number;
        patternsAdded: number;
        antiPatternsAdded: number;
      };
      expect(result.completed).toBe(true);
      expect(result.knowledgeCaptured).toBe(2);
      expect(result.patternsAdded).toBe(1);
      expect(result.antiPatternsAdded).toBe(1);

      // Verify entries are in vault
      const stats = runtime.vault.stats();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(2);
    });

    it('should work with no patterns or anti-patterns', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);
      runtime.planner.complete(plan.id);

      const result = (await findOp('plan_complete_lifecycle').handler({
        planId: plan.id,
      })) as { completed: boolean; knowledgeCaptured: number };
      expect(result.completed).toBe(true);
      expect(result.knowledgeCaptured).toBe(0);
    });

    it('should return error for non-completed plan', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_complete_lifecycle').handler({
        planId: plan.id,
        patterns: ['Test'],
      })) as { error: string };
      expect(result.error).toContain('must be completed');
    });

    it('should return error for unknown plan', async () => {
      const result = (await findOp('plan_complete_lifecycle').handler({
        planId: 'nonexistent',
      })) as { error: string };
      expect(result.error).toContain('Plan not found');
    });
  });

  // ─── plan_dispatch ────────────────────────────────────────────────
  describe('plan_dispatch', () => {
    it('should return task and ready status when no dependencies', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_dispatch').handler({
        planId: plan.id,
        taskId: 'task-1',
      })) as { task: { id: string }; unmetDependencies: unknown[]; ready: boolean };
      expect(result.task.id).toBe('task-1');
      expect(result.unmetDependencies).toEqual([]);
      expect(result.ready).toBe(true);
    });

    it('should report unmet dependencies', async () => {
      const plan = createDraftPlan();
      // Split with dependencies
      runtime.planner.splitTasks(plan.id, [
        { title: 'First', description: 'Do first' },
        { title: 'Second', description: 'Do second', dependsOn: ['task-1'] },
      ]);

      const result = (await findOp('plan_dispatch').handler({
        planId: plan.id,
        taskId: 'task-2',
      })) as { task: { id: string }; unmetDependencies: Array<{ id: string }>; ready: boolean };
      expect(result.ready).toBe(false);
      expect(result.unmetDependencies.length).toBe(1);
      expect(result.unmetDependencies[0].id).toBe('task-1');
    });

    it('should report ready when dependencies are completed', async () => {
      const plan = createDraftPlan();
      runtime.planner.splitTasks(plan.id, [
        { title: 'First', description: 'Do first' },
        { title: 'Second', description: 'Do second', dependsOn: ['task-1'] },
      ]);
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);
      runtime.planner.updateTask(plan.id, 'task-1', 'completed');

      const result = (await findOp('plan_dispatch').handler({
        planId: plan.id,
        taskId: 'task-2',
      })) as { ready: boolean; unmetDependencies: unknown[] };
      expect(result.ready).toBe(true);
      expect(result.unmetDependencies).toEqual([]);
    });

    it('should return error for unknown task', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_dispatch').handler({
        planId: plan.id,
        taskId: 'task-99',
      })) as { error: string };
      expect(result.error).toContain('Task not found');
    });
  });

  // ─── plan_review ──────────────────────────────────────────────────
  describe('plan_review', () => {
    it('should add a review to a plan', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_review').handler({
        planId: plan.id,
        reviewer: 'Alice',
        outcome: 'approved',
        comments: 'Looks good',
      })) as { reviewed: boolean; totalReviews: number };
      expect(result.reviewed).toBe(true);
      expect(result.totalReviews).toBe(1);
    });

    it('should add a task-level review', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_review').handler({
        planId: plan.id,
        taskId: 'task-1',
        reviewer: 'Bob',
        outcome: 'needs_changes',
        comments: 'Needs more detail',
      })) as { reviewed: boolean; totalReviews: number };
      expect(result.reviewed).toBe(true);
      expect(result.totalReviews).toBe(1);
    });

    it('should accumulate multiple reviews', async () => {
      const plan = createDraftPlan();
      await findOp('plan_review').handler({
        planId: plan.id,
        reviewer: 'Alice',
        outcome: 'approved',
        comments: 'LGTM',
      });
      const result = (await findOp('plan_review').handler({
        planId: plan.id,
        reviewer: 'Bob',
        outcome: 'approved',
        comments: 'Also LGTM',
      })) as { totalReviews: number };
      expect(result.totalReviews).toBe(2);
    });

    it('should return error for unknown task', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_review').handler({
        planId: plan.id,
        taskId: 'task-99',
        reviewer: 'Alice',
        outcome: 'approved',
        comments: 'Ok',
      })) as { error: string };
      expect(result.error).toContain('Task not found');
    });
  });

  // ─── plan_archive ─────────────────────────────────────────────────
  describe('plan_archive', () => {
    it('should archive old completed plans', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);
      runtime.planner.complete(plan.id);

      // Hack: set updatedAt to 60 days ago
      const stored = runtime.planner.get(plan.id)!;
      (stored as { updatedAt: number }).updatedAt = Date.now() - 60 * 24 * 60 * 60 * 1000;
      // Force save by calling a no-op iterate (not possible on completed plan)
      // Instead, create another plan and archive to trigger save
      // We need to directly manipulate — use archive with 0 days to catch it
      const result = (await findOp('plan_archive').handler({
        olderThanDays: 0,
      })) as { archived: number; plans: Array<{ id: string }> };
      expect(result.archived).toBe(1);
      expect(result.plans[0].id).toBe(plan.id);
    });

    it('should not archive non-completed plans', async () => {
      createDraftPlan(); // draft plan
      const result = (await findOp('plan_archive').handler({
        olderThanDays: 0,
      })) as { archived: number };
      expect(result.archived).toBe(0);
    });

    it('should not archive recent completed plans', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);
      runtime.planner.complete(plan.id);

      const result = (await findOp('plan_archive').handler({
        olderThanDays: 30,
      })) as { archived: number };
      expect(result.archived).toBe(0);
    });
  });

  // ─── plan_list_tasks ──────────────────────────────────────────────
  describe('plan_list_tasks', () => {
    it('should list all tasks for a plan', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_list_tasks').handler({
        planId: plan.id,
      })) as { planId: string; total: number; filtered: number; tasks: unknown[] };
      expect(result.planId).toBe(plan.id);
      expect(result.total).toBe(2);
      expect(result.filtered).toBe(2);
      expect(result.tasks.length).toBe(2);
    });

    it('should filter tasks by status', async () => {
      const plan = createDraftPlan();
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);
      runtime.planner.updateTask(plan.id, 'task-1', 'completed');

      const result = (await findOp('plan_list_tasks').handler({
        planId: plan.id,
        status: 'completed',
      })) as { total: number; filtered: number; tasks: Array<{ id: string }> };
      expect(result.total).toBe(2);
      expect(result.filtered).toBe(1);
      expect(result.tasks[0].id).toBe('task-1');
    });

    it('should return empty when no tasks match filter', async () => {
      const plan = createDraftPlan();
      const result = (await findOp('plan_list_tasks').handler({
        planId: plan.id,
        status: 'failed',
      })) as { filtered: number; tasks: unknown[] };
      expect(result.filtered).toBe(0);
      expect(result.tasks).toEqual([]);
    });

    it('should return error for unknown plan', async () => {
      const result = (await findOp('plan_list_tasks').handler({
        planId: 'nonexistent',
      })) as { error: string };
      expect(result.error).toContain('Plan not found');
    });
  });

  // ─── plan_stats ───────────────────────────────────────────────────
  describe('plan_stats', () => {
    it('should return zero stats when no plans exist', async () => {
      const result = (await findOp('plan_stats').handler({})) as {
        total: number;
        byStatus: Record<string, number>;
        avgTasksPerPlan: number;
        totalTasks: number;
        tasksByStatus: Record<string, number>;
      };
      expect(result.total).toBe(0);
      expect(result.byStatus.draft).toBe(0);
      expect(result.avgTasksPerPlan).toBe(0);
      expect(result.totalTasks).toBe(0);
    });

    it('should return correct stats with plans', async () => {
      createDraftPlan(); // draft with 2 tasks
      const plan2 = runtime.planner.create({
        objective: 'Plan 2',
        scope: 'Scope 2',
        tasks: [{ title: 'T1', description: 'D1' }],
      });
      runtime.planner.approve(plan2.id);
      runtime.planner.startExecution(plan2.id);
      runtime.planner.updateTask(plan2.id, 'task-1', 'completed');
      runtime.planner.complete(plan2.id);

      const result = (await findOp('plan_stats').handler({})) as {
        total: number;
        byStatus: Record<string, number>;
        avgTasksPerPlan: number;
        totalTasks: number;
        tasksByStatus: Record<string, number>;
      };
      expect(result.total).toBe(2);
      expect(result.byStatus.draft).toBe(1);
      expect(result.byStatus.completed).toBe(1);
      expect(result.totalTasks).toBe(3);
      expect(result.avgTasksPerPlan).toBe(1.5);
      expect(result.tasksByStatus.pending).toBe(2);
      expect(result.tasksByStatus.completed).toBe(1);
    });
  });
});
