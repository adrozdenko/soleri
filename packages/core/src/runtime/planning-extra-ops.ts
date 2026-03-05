/**
 * Extended planning operations — 9 ops for advanced plan lifecycle management.
 *
 * These complement the 5 basic planning ops in core-ops.ts with:
 * iteration, splitting, reconciliation, lifecycle completion,
 * dispatch, review, archival, task listing, and statistics.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import type { DriftItem } from '../planning/planner.js';

/**
 * Create 9 extended planning operations for an agent runtime.
 *
 * Groups: mutation (plan_iterate, plan_split, plan_reconcile, plan_complete_lifecycle,
 *         plan_review, plan_archive), query (plan_dispatch, plan_list_tasks, plan_stats).
 */
export function createPlanningExtraOps(runtime: AgentRuntime): OpDefinition[] {
  const { planner, vault } = runtime;

  return [
    // ─── Plan Iteration ───────────────────────────────────────────
    {
      name: 'plan_iterate',
      description:
        'Revise a draft plan — change objective, scope, decisions, or add/remove tasks. Only works on draft plans.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('ID of the draft plan to iterate on'),
        objective: z.string().optional().describe('New objective (replaces existing)'),
        scope: z.string().optional().describe('New scope (replaces existing)'),
        decisions: z.array(z.string()).optional().describe('New decisions list (replaces existing)'),
        addTasks: z
          .array(z.object({ title: z.string(), description: z.string() }))
          .optional()
          .describe('Tasks to append'),
        removeTasks: z
          .array(z.string())
          .optional()
          .describe('Task IDs to remove'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.iterate(params.planId as string, {
            objective: params.objective as string | undefined,
            scope: params.scope as string | undefined,
            decisions: params.decisions as string[] | undefined,
            addTasks: params.addTasks as Array<{ title: string; description: string }> | undefined,
            removeTasks: params.removeTasks as string[] | undefined,
          });
          return { iterated: true, plan };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Plan Split ───────────────────────────────────────────────
    {
      name: 'plan_split',
      description:
        'Split a plan into sub-tasks with dependency tracking. Replaces existing tasks with a new set. Works on draft or approved plans.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('Plan ID to split tasks for'),
        tasks: z
          .array(
            z.object({
              title: z.string(),
              description: z.string(),
              dependsOn: z.array(z.string()).optional().describe('Task IDs this task depends on'),
            }),
          )
          .describe('New task list with optional dependency references (task-1, task-2, etc.)'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.splitTasks(
            params.planId as string,
            params.tasks as Array<{ title: string; description: string; dependsOn?: string[] }>,
          );
          return { split: true, taskCount: plan.tasks.length, plan };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Plan Reconcile ───────────────────────────────────────────
    {
      name: 'plan_reconcile',
      description:
        'Capture what actually happened vs what was planned. Produces a drift analysis with accuracy score. Works on executing or completed plans.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('Plan ID to reconcile'),
        actualOutcome: z.string().describe('Description of what actually happened'),
        driftItems: z
          .array(
            z.object({
              type: z.enum(['skipped', 'added', 'modified', 'reordered']),
              description: z.string(),
              impact: z.enum(['low', 'medium', 'high']),
              rationale: z.string(),
            }),
          )
          .optional()
          .describe('Specific drift items — differences between plan and reality'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.reconcile(params.planId as string, {
            actualOutcome: params.actualOutcome as string,
            driftItems: params.driftItems as DriftItem[] | undefined,
          });
          return {
            reconciled: true,
            accuracy: plan.reconciliation!.accuracy,
            driftCount: plan.reconciliation!.driftItems.length,
            plan,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Plan Complete Lifecycle ──────────────────────────────────
    {
      name: 'plan_complete_lifecycle',
      description:
        'Extract knowledge from a completed and reconciled plan. Captures patterns and anti-patterns into the vault based on drift analysis.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('Plan ID (must be completed with reconciliation data)'),
        patterns: z
          .array(z.string())
          .optional()
          .describe('Patterns discovered during execution'),
        antiPatterns: z
          .array(z.string())
          .optional()
          .describe('Anti-patterns discovered during execution'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.get(params.planId as string);
          if (!plan) return { error: `Plan not found: ${params.planId}` };
          if (plan.status !== 'completed')
            return { error: `Plan must be completed — current status: '${plan.status}'` };

          const patterns = (params.patterns as string[] | undefined) ?? [];
          const antiPatterns = (params.antiPatterns as string[] | undefined) ?? [];
          let captured = 0;

          // Capture patterns into vault
          for (const p of patterns) {
            vault.add({
              id: `plan-pattern-${plan.id}-${captured}`,
              type: 'pattern',
              domain: 'planning',
              title: p,
              severity: 'suggestion',
              description: `Discovered during plan: ${plan.objective}`,
              tags: ['plan-knowledge', plan.id],
            });
            captured++;
          }

          // Capture anti-patterns into vault
          for (const ap of antiPatterns) {
            vault.add({
              id: `plan-antipattern-${plan.id}-${captured}`,
              type: 'anti-pattern',
              domain: 'planning',
              title: ap,
              severity: 'warning',
              description: `Discovered during plan: ${plan.objective}`,
              tags: ['plan-knowledge', plan.id],
            });
            captured++;
          }

          return {
            completed: true,
            knowledgeCaptured: captured,
            patternsAdded: patterns.length,
            antiPatternsAdded: antiPatterns.length,
            reconciliation: plan.reconciliation ?? null,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Plan Dispatch ────────────────────────────────────────────
    {
      name: 'plan_dispatch',
      description:
        'Get task execution instructions for subagents. Returns the task, its unmet dependencies, and whether it is ready to execute.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        taskId: z.string().describe('Task ID to get dispatch instructions for'),
      }),
      handler: async (params) => {
        try {
          const dispatch = planner.getDispatch(
            params.planId as string,
            params.taskId as string,
          );
          return dispatch;
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Plan Review ──────────────────────────────────────────────
    {
      name: 'plan_review',
      description:
        'Submit review evidence for a plan or specific task. Records reviewer, outcome, and comments.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('Plan ID to review'),
        taskId: z.string().optional().describe('Specific task ID (omit to review the whole plan)'),
        reviewer: z.string().describe('Name or ID of reviewer'),
        outcome: z
          .enum(['approved', 'rejected', 'needs_changes'])
          .describe('Review outcome'),
        comments: z.string().describe('Review comments'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.addReview(params.planId as string, {
            taskId: params.taskId as string | undefined,
            reviewer: params.reviewer as string,
            outcome: params.outcome as 'approved' | 'rejected' | 'needs_changes',
            comments: params.comments as string,
          });
          return {
            reviewed: true,
            totalReviews: plan.reviews?.length ?? 0,
            plan: { id: plan.id, status: plan.status },
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Plan Archive ─────────────────────────────────────────────
    {
      name: 'plan_archive',
      description:
        'Archive completed plans older than N days. Removes them from active store and returns the archived plans.',
      auth: 'admin',
      schema: z.object({
        olderThanDays: z.number().describe('Archive plans completed more than this many days ago'),
      }),
      handler: async (params) => {
        try {
          const olderThanDays = (params.olderThanDays as number) ?? 30;
          const archived = planner.archive(olderThanDays);
          return { archived: archived.length, plans: archived.map((p) => ({ id: p.id, objective: p.objective })) };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Plan List Tasks ──────────────────────────────────────────
    {
      name: 'plan_list_tasks',
      description:
        'List all tasks for a plan with their current status. Optionally filter by status.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        status: z
          .enum(['pending', 'in_progress', 'completed', 'skipped', 'failed'])
          .optional()
          .describe('Filter tasks by status'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.get(params.planId as string);
          if (!plan) return { error: `Plan not found: ${params.planId}` };

          const statusFilter = params.status as string | undefined;
          const tasks = statusFilter
            ? plan.tasks.filter((t) => t.status === statusFilter)
            : plan.tasks;

          return {
            planId: plan.id,
            planStatus: plan.status,
            total: plan.tasks.length,
            filtered: tasks.length,
            tasks,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Plan Stats ───────────────────────────────────────────────
    {
      name: 'plan_stats',
      description:
        'Planning statistics — total plans, breakdown by status, average tasks per plan, task status distribution.',
      auth: 'read',
      handler: async () => {
        try {
          return planner.stats();
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
  ];
}
