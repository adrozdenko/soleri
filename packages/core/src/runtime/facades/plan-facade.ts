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
import { PlanGradeRejectionError } from '../../planning/planner.js';
import { matchPlaybooks } from '../../playbooks/playbook-registry.js';

export function createPlanFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { planner, vault } = runtime;

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
        decisions: z
          .array(z.union([z.string(), z.object({ decision: z.string(), rationale: z.string() })]))
          .optional()
          .default([]),
        tasks: z
          .array(z.object({ title: z.string(), description: z.string() }))
          .optional()
          .default([]),
        alternatives: z
          .array(
            z.object({
              approach: z.string().describe('The alternative approach considered'),
              pros: z.array(z.string()).describe('Advantages of this approach'),
              cons: z.array(z.string()).describe('Disadvantages of this approach'),
              rejected_reason: z.string().describe('Why this alternative was rejected'),
            }),
          )
          .optional()
          .describe('Rejected alternative approaches — plans with 2+ alternatives score higher'),
      }),
      handler: async (params) => {
        const objective = params.objective as string;
        const decisions = ((params.decisions as string[]) ?? []).slice();

        // Vault enrichment: search for patterns matching the objective
        let vaultEntryIds: string[] = [];
        try {
          const results = vault.search(objective, { limit: 5 });
          if (results.length > 0) {
            vaultEntryIds = results.map((r) => r.entry.id);
            for (const r of results) {
              decisions.push(
                `Vault pattern: ${r.entry.title ?? r.entry.id} (score: ${r.score.toFixed(2)}) [entryId:${r.entry.id}]`,
              );
            }
          }
        } catch {
          // Vault search failed — proceed without enrichment
        }

        // Playbook matching: inject task templates + start executor session
        const userTasks = (params.tasks as Array<{ title: string; description: string }>) ?? [];
        const matchResult = matchPlaybooks('BUILD', objective);
        const playbook = matchResult.playbook;
        const playbookTasks: Array<{ title: string; description: string }> = [];
        let playbookSessionId: string | undefined;
        let playbookMatch: { label: string; genericId?: string; domainId?: string } | undefined;

        if (playbook) {
          playbookMatch = {
            label: playbook.label,
            genericId: playbook.generic?.id,
            domainId: playbook.domain?.id,
          };

          // Inject task templates (before-implementation first, then user tasks)
          for (const tmpl of playbook.mergedTasks) {
            const title = tmpl.titleTemplate.replace('{objective}', objective);
            playbookTasks.push({ title, description: tmpl.acceptanceCriteria.join('\n') });
          }

          // Start executor session to track gate enforcement
          if (runtime.playbookExecutor) {
            const startResult = runtime.playbookExecutor.start(playbook);
            playbookSessionId = startResult.sessionId;
          }
        }

        const beforeTasks = playbookTasks.filter((_, i) => {
          const tmpl = playbook?.mergedTasks[i];
          return !tmpl || tmpl.order === 'before-implementation';
        });
        const afterTasks = playbookTasks.filter((_, i) => {
          const tmpl = playbook?.mergedTasks[i];
          return tmpl?.order === 'after-implementation';
        });

        const allTasks = [...beforeTasks, ...userTasks, ...afterTasks];

        const plan = planner.create({
          objective,
          scope: params.scope as string,
          decisions,
          tasks: allTasks,
          alternatives: params.alternatives as
            | Array<{ approach: string; pros: string[]; cons: string[]; rejected_reason: string }>
            | undefined,
        });

        if (playbookMatch) plan.playbookMatch = playbookMatch;
        if (playbookSessionId) {
          planner.patchPlan(plan.id, { playbookSessionId });
        }

        return {
          created: true,
          plan,
          vaultEntryIds,
          playbook: playbook
            ? { label: playbook.label, tasksInjected: playbookTasks.length }
            : null,
        };
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
        try {
          let plan = planner.approve(params.planId as string);
          if (params.startExecution) {
            plan = planner.startExecution(plan.id);
          }
          return { approved: true, executing: plan.status === 'executing', plan };
        } catch (err) {
          if (err instanceof PlanGradeRejectionError) {
            return {
              approved: false,
              error: 'grade_gate_rejection',
              message: err.message,
              grade: err.grade,
              score: err.score,
              minGrade: err.minGrade,
              gaps: err.gaps.map((g) => ({
                severity: g.severity,
                category: g.category,
                description: g.description,
                recommendation: g.recommendation,
              })),
              recommendation:
                'Iterate on the plan using `op:create_plan` to address the gaps above, then re-grade with `op:plan_grade` before approving.',
            };
          }
          throw err;
        }
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
        const targetStatus = params.status as
          | 'pending'
          | 'in_progress'
          | 'completed'
          | 'skipped'
          | 'failed';

        // Gate check: enforce blocking post-task gates before allowing completion
        if (targetStatus === 'completed') {
          const currentPlan = planner.get(params.planId as string);
          if (currentPlan?.playbookSessionId && runtime.playbookExecutor) {
            const session = runtime.playbookExecutor.getSession(currentPlan.playbookSessionId);
            if (session) {
              const blockingPostTaskGates = session.gates.filter(
                (g) =>
                  g.phase === 'post-task' &&
                  (g.severity === 'blocking' || g.severity === undefined),
              );
              if (blockingPostTaskGates.length > 0) {
                return {
                  updated: false,
                  blocked: true,
                  reason: 'post-task gates unsatisfied',
                  gates: blockingPostTaskGates.map((g) => ({
                    checkType: g.checkType,
                    requirement: g.requirement,
                  })),
                };
              }
            }
          }
        }

        const plan = planner.updateTask(
          params.planId as string,
          params.taskId as string,
          targetStatus,
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
        // Enforce playbook completion gates before allowing plan completion
        const currentPlan = planner.get(params.planId as string);
        if (currentPlan?.playbookSessionId && runtime.playbookExecutor) {
          const completeResult = runtime.playbookExecutor.complete(
            currentPlan.playbookSessionId,
            {},
          );
          if ('error' in completeResult) {
            // Session not found — executor may have been reset; proceed without gate check
          } else if (!completeResult.gatesPassed && completeResult.unsatisfiedGates.length > 0) {
            // Session is consumed after complete() — use the result's unsatisfied gate list
            // All completion gates are blocking unless marked advisory
            return {
              completed: false,
              blocked: true,
              reason: 'completion gates unsatisfied',
              unsatisfiedGates: completeResult.unsatisfiedGates,
              recommendation:
                'Satisfy the listed playbook gates before completing this plan. Pass gate results via the playbook executor if checks were completed externally.',
            };
          }
        }

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
