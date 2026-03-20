/**
 * Plan facade — plan lifecycle ops.
 * create, approve, execute, reconcile, complete, grading.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createPlanningExtraOps } from '../planning-extra-ops.js';
import { createGradingOps } from '../grading-ops.js';
import { createChainOps } from '../chain-ops.js';

export function createPlanFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { planner } = runtime;

  return [
    // ─── Planning (inline from core-ops.ts) ─────────────────────
    {
      name: 'create_plan',
      description:
        'Create a new plan in draft status. Plans track multi-step tasks with decisions and sub-tasks.',
      auth: 'write',
      schema: z.object({
        objective: z.string().describe('What the plan aims to achieve'),
        scope: z.string().describe('Which parts of the codebase are affected'),
        decisions: z.array(z.string()).optional().default([]),
        tasks: z
          .array(z.object({ title: z.string(), description: z.string() }))
          .optional()
          .default([]),
      }),
      handler: async (params) => {
        const plan = planner.create({
          objective: params.objective as string,
          scope: params.scope as string,
          decisions: (params.decisions as string[]) ?? [],
          tasks: (params.tasks as Array<{ title: string; description: string }>) ?? [],
        });
        return { created: true, plan };
      },
    },
    {
      name: 'get_plan',
      description: 'Get a plan by ID, or list all active plans if no ID provided.',
      auth: 'read',
      schema: z.object({
        planId: z.string().optional().describe('Plan ID. Omit to list all active plans.'),
      }),
      handler: async (params) => {
        if (params.planId) {
          const plan = planner.get(params.planId as string);
          if (!plan) return { error: 'Plan not found: ' + params.planId };
          return plan;
        }
        return { active: planner.getActive(), executing: planner.getExecuting() };
      },
    },
    {
      name: 'approve_plan',
      description: 'Approve a draft plan and optionally start execution.',
      auth: 'write',
      schema: z.object({
        planId: z.string(),
        startExecution: z
          .boolean()
          .optional()
          .default(false)
          .describe('If true, immediately start execution after approval'),
      }),
      handler: async (params) => {
        let plan = planner.approve(params.planId as string);
        if (params.startExecution) {
          plan = planner.startExecution(plan.id);
        }
        return { approved: true, executing: plan.status === 'executing', plan };
      },
    },
    {
      name: 'update_task',
      description: 'Update a task status within an executing plan.',
      auth: 'write',
      schema: z.object({
        planId: z.string(),
        taskId: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed', 'skipped', 'failed']),
      }),
      handler: async (params) => {
        const plan = planner.updateTask(
          params.planId as string,
          params.taskId as string,
          params.status as 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed',
        );
        const task = plan.tasks.find((t) => t.id === params.taskId);
        return { updated: true, task, plan: { id: plan.id, status: plan.status } };
      },
    },
    {
      name: 'complete_plan',
      description:
        'Mark a reconciled plan as completed. If the plan is still executing, it will be auto-reconciled first. Use `plan_reconcile` to provide a detailed drift report before completing.',
      auth: 'write',
      schema: z.object({
        planId: z.string(),
      }),
      handler: async (params) => {
        const plan = planner.complete(params.planId as string);
        const taskSummary = {
          completed: plan.tasks.filter((t) => t.status === 'completed').length,
          skipped: plan.tasks.filter((t) => t.status === 'skipped').length,
          failed: plan.tasks.filter((t) => t.status === 'failed').length,
          total: plan.tasks.length,
        };
        return { completed: true, plan, taskSummary };
      },
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createPlanningExtraOps(runtime),
    ...createGradingOps(runtime),
    ...createChainOps(runtime),
  ];
}
