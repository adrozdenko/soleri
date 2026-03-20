/**
 * Extended planning operations — 22 ops for advanced plan lifecycle management.
 *
 * These complement the 5 basic planning ops in core-ops.ts with:
 * iteration, splitting, reconciliation, lifecycle completion,
 * dispatch, review, archival, task listing, statistics,
 * evidence submission, verification, validation, auto-reconciliation,
 * review prompt generation, brainstorming, execution metrics,
 * deliverable submission, and deliverable verification.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import type { DriftItem, TaskEvidence } from '../planning/planner.js';
import { collectGitEvidence } from '../planning/evidence-collector.js';
import { matchPlaybooks, type PlaybookMatchResult } from '../playbooks/index.js';
import { entryToPlaybookDefinition } from '../playbooks/index.js';

/**
 * Create 22 extended planning operations for an agent runtime.
 *
 * Groups:
 *   mutation: plan_iterate, plan_split, plan_reconcile, plan_complete_lifecycle,
 *             plan_review, plan_archive, plan_submit_evidence, plan_auto_reconcile,
 *             plan_review_outcome, plan_record_task_metrics, plan_submit_deliverable
 *   query:   plan_dispatch, plan_list_tasks, plan_stats, plan_verify_task,
 *             plan_verify_plan, plan_validate, plan_review_spec, plan_review_quality,
 *             plan_brainstorm, plan_execution_metrics, plan_verify_deliverables
 */
export function createPlanningExtraOps(runtime: AgentRuntime): OpDefinition[] {
  const { planner, vault, brain, brainIntelligence } = runtime;

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
        decisions: z
          .array(z.string())
          .optional()
          .describe('New decisions list (replaces existing)'),
        addTasks: z
          .array(z.object({ title: z.string(), description: z.string() }))
          .optional()
          .describe('Tasks to append'),
        removeTasks: z.array(z.string()).optional().describe('Task IDs to remove'),
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

          // Auto-start brain session linked to the plan for learning pipeline
          let brainSessionId: string | null = null;
          try {
            const session = brainIntelligence.lifecycle({
              action: 'start',
              domain: plan.scope ?? undefined,
              context: plan.objective,
              planId: plan.id,
            });
            brainSessionId = session.id;
          } catch {
            // Non-critical — don't block plan execution
          }

          return { split: true, taskCount: plan.tasks.length, brainSessionId, plan };
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
        patterns: z.array(z.string()).optional().describe('Patterns discovered during execution'),
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

          // End brain session so the learning pipeline can extract patterns
          let session = null;
          let extraction = null;
          const brainSession = brainIntelligence.getSessionByPlanId(plan.id);
          if (brainSession && !brainSession.endedAt) {
            session = brainIntelligence.lifecycle({
              action: 'end',
              sessionId: brainSession.id,
              planId: plan.id,
              planOutcome: 'completed',
            });
            try {
              extraction = brainIntelligence.extractKnowledge(brainSession.id);
            } catch {
              // Not enough signal — extraction is best-effort
            }
          }

          // Auto-record positive feedback for vault entries used as recommendations
          let feedbackRecorded = 0;
          const entryIdRegex = /\[entryId:([^\]]+)\]/;
          for (const d of plan.decisions) {
            const decisionStr = typeof d === 'string' ? d : d.decision;
            const match = entryIdRegex.exec(decisionStr);
            if (match) {
              try {
                brain.recordFeedback(plan.objective, match[1], 'accepted');
                feedbackRecorded++;
              } catch {
                // Graceful degradation — skip if entry not found or already recorded
              }
            }
          }

          return {
            completed: true,
            knowledgeCaptured: captured,
            feedbackRecorded,
            patternsAdded: patterns.length,
            antiPatternsAdded: antiPatterns.length,
            reconciliation: plan.reconciliation ?? null,
            brainSession: session?.id ?? brainSession?.id ?? null,
            brainExtraction: extraction ? { proposals: extraction.proposals.length } : null,
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
          const dispatch = planner.getDispatch(params.planId as string, params.taskId as string);
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
        outcome: z.enum(['approved', 'rejected', 'needs_changes']).describe('Review outcome'),
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
          return {
            archived: archived.length,
            plans: archived.map((p) => ({ id: p.id, objective: p.objective })),
          };
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

    // ─── Evidence Submission (#148) ──────────────────────────────
    {
      name: 'plan_submit_evidence',
      description:
        'Submit command output evidence for a task acceptance criterion. Makes playbook verification gates enforceable.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        taskId: z.string().describe('Task ID to submit evidence for'),
        criterion: z.string().describe('Which acceptance criterion this evidence satisfies'),
        content: z
          .string()
          .describe('Evidence content — command output, URL, file path, or description'),
        type: z.enum(['command_output', 'url', 'file', 'description']).describe('Evidence type'),
      }),
      handler: async (params) => {
        try {
          const task = planner.submitEvidence(params.planId as string, params.taskId as string, {
            criterion: params.criterion as string,
            content: params.content as string,
            type: params.type as TaskEvidence['type'],
          });
          return {
            submitted: true,
            taskId: task.id,
            evidenceCount: task.evidence?.length ?? 0,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Verify Task (#148) ─────────────────────────────────────
    {
      name: 'plan_verify_task',
      description:
        'Check task evidence submitted + reviews passed → mark verified. Returns verification status with details.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        taskId: z.string().describe('Task ID to verify'),
      }),
      handler: async (params) => {
        try {
          return planner.verifyTask(params.planId as string, params.taskId as string);
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Verify Plan (#148) ─────────────────────────────────────
    {
      name: 'plan_verify_plan',
      description:
        'Check all tasks verified → plan is ready for reconciliation. Returns validation status with per-task issues.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID to verify'),
      }),
      handler: async (params) => {
        try {
          return planner.verifyPlan(params.planId as string);
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Review Spec (#149) ─────────────────────────────────────
    {
      name: 'plan_review_spec',
      description:
        'Generate a spec compliance review prompt for a task. Stage 1 of the two-stage subagent review model.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        taskId: z.string().describe('Task ID to generate review prompt for'),
      }),
      handler: async (params) => {
        try {
          return planner.generateReviewSpec(params.planId as string, params.taskId as string);
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Review Quality (#149) ──────────────────────────────────
    {
      name: 'plan_review_quality',
      description:
        'Generate a code quality review prompt for a task. Stage 2 of the two-stage subagent review model.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        taskId: z.string().describe('Task ID to generate review prompt for'),
      }),
      handler: async (params) => {
        try {
          return planner.generateReviewQuality(params.planId as string, params.taskId as string);
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Review Outcome (#149) ──────────────────────────────────
    {
      name: 'plan_review_outcome',
      description:
        'Record a subagent review pass/fail result with feedback. Works alongside plan_review for structured review tracking.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        taskId: z.string().describe('Task ID being reviewed'),
        reviewType: z
          .enum(['spec', 'quality'])
          .describe('Type of review — spec compliance or code quality'),
        reviewer: z.string().describe('Reviewer identifier (subagent name)'),
        outcome: z.enum(['approved', 'rejected', 'needs_changes']).describe('Review outcome'),
        comments: z.string().describe('Review comments and feedback'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.addReview(params.planId as string, {
            taskId: params.taskId as string,
            reviewer: `${params.reviewType}-review:${params.reviewer}`,
            outcome: params.outcome as 'approved' | 'rejected' | 'needs_changes',
            comments: params.comments as string,
          });
          return {
            recorded: true,
            totalReviews: plan.reviews?.length ?? 0,
            taskId: params.taskId,
            reviewType: params.reviewType,
            outcome: params.outcome,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Brainstorm (#150) ──────────────────────────────────────
    {
      name: 'plan_brainstorm',
      description:
        'Match a playbook for the given intent/text and return its brainstorm sections. ' +
        'Enforces the brainstorming gate — design must be explored before plan creation.',
      auth: 'read',
      schema: z.object({
        intent: z
          .enum(['BUILD', 'FIX', 'REVIEW', 'PLAN', 'IMPROVE', 'DELIVER'])
          .optional()
          .describe('Detected intent (optional, improves matching)'),
        text: z.string().describe('Task description text to match against playbooks'),
      }),
      handler: async (params) => {
        try {
          // Load vault playbooks for matching
          const vaultEntries = vault.list({ type: 'playbook' });
          const vaultPlaybooks = vaultEntries
            .map((e) => entryToPlaybookDefinition(e))
            .filter((p): p is NonNullable<typeof p> => p !== null);

          const intent = params.intent as
            | 'BUILD'
            | 'FIX'
            | 'REVIEW'
            | 'PLAN'
            | 'IMPROVE'
            | 'DELIVER'
            | undefined;
          const result: PlaybookMatchResult = matchPlaybooks(
            intent,
            params.text as string,
            vaultPlaybooks,
          );

          if (!result.playbook) {
            return { matched: false, sections: [], playbook: null };
          }

          // Gather brainstorm sections from matched playbooks
          const sections = [
            ...(result.playbook.generic?.brainstormSections ?? []),
            ...(result.playbook.domain?.brainstormSections ?? []),
          ];

          return {
            matched: true,
            label: result.playbook.label,
            genericMatch: result.genericMatch ?? null,
            domainMatch: result.domainMatch ?? null,
            sections,
            gates: result.playbook.mergedGates,
            toolInjections: result.playbook.mergedTools,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Auto-Reconcile (#151) ──────────────────────────────────
    {
      name: 'plan_auto_reconcile',
      description:
        'Automated fast-path reconciliation. Checks task completion status, generates drift report automatically. ' +
        'Returns null if drift is too significant (>2 non-completed tasks).',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('Plan ID to auto-reconcile'),
      }),
      handler: async (params) => {
        try {
          const result = planner.autoReconcile(params.planId as string);
          if (!result) {
            return {
              autoReconciled: false,
              reason: 'Drift too significant for auto-reconciliation — use manual plan_reconcile',
            };
          }
          return {
            autoReconciled: true,
            accuracy: result.reconciliation!.accuracy,
            driftCount: result.reconciliation!.driftItems.length,
            plan: result,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Validate Plan (#152) ───────────────────────────────────
    {
      name: 'plan_validate',
      description:
        'Post-execution validation — checks all tasks final, evidence exists for verification tasks, ' +
        'no tasks stuck in_progress. Run before reconciliation.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID to validate'),
      }),
      handler: async (params) => {
        try {
          return planner.verifyPlan(params.planId as string);
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Execution Metrics (#80) ─────────────────────────────────
    {
      name: 'plan_execution_metrics',
      description:
        'Per-task timing and aggregate execution summary for a plan. Shows duration, status counts, and average task time.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID to get metrics for'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.get(params.planId as string);
          if (!plan) return { error: `Plan not found: ${params.planId}` };

          const taskMetrics = plan.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            startedAt: t.startedAt ?? null,
            completedAt: t.completedAt ?? null,
            metrics: t.metrics ?? null,
          }));

          return {
            planId: plan.id,
            status: plan.status,
            executionSummary: plan.executionSummary ?? null,
            taskMetrics,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Record Task Metrics (#80) ──────────────────────────────
    {
      name: 'plan_record_task_metrics',
      description:
        'Record execution metrics for a task — tool calls, model tier, estimated cost. Merges with existing metrics.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        taskId: z.string().describe('Task ID to record metrics for'),
        toolCalls: z.number().optional().describe('Number of tool calls made'),
        modelTier: z.string().optional().describe('Model tier used (e.g., "opus", "sonnet")'),
        estimatedCostUsd: z.number().optional().describe('Estimated cost in USD'),
        iterations: z.number().optional().describe('Number of iterations taken'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.get(params.planId as string);
          if (!plan) return { error: `Plan not found: ${params.planId}` };
          const task = plan.tasks.find((t) => t.id === params.taskId);
          if (!task) return { error: `Task not found: ${params.taskId}` };

          if (!task.metrics) task.metrics = {};
          if (params.toolCalls !== undefined) task.metrics.toolCalls = params.toolCalls as number;
          if (params.modelTier !== undefined) task.metrics.modelTier = params.modelTier as string;
          if (params.estimatedCostUsd !== undefined)
            task.metrics.estimatedCostUsd = params.estimatedCostUsd as number;
          if (params.iterations !== undefined)
            task.metrics.iterations = params.iterations as number;

          task.updatedAt = Date.now();
          plan.updatedAt = Date.now();

          return {
            recorded: true,
            taskId: task.id,
            metrics: task.metrics,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Submit Deliverable (#83) ───────────────────────────────
    {
      name: 'plan_submit_deliverable',
      description:
        'Record a deliverable on a task. Auto-computes SHA-256 hash for file deliverables.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        taskId: z.string().describe('Task ID to attach deliverable to'),
        type: z.enum(['file', 'vault_entry', 'url']).describe('Deliverable type'),
        path: z.string().describe('File path, vault entry ID, or URL'),
      }),
      handler: async (params) => {
        try {
          const task = planner.submitDeliverable(params.planId as string, params.taskId as string, {
            type: params.type as 'file' | 'vault_entry' | 'url',
            path: params.path as string,
          });
          return {
            submitted: true,
            taskId: task.id,
            deliverableCount: task.deliverables?.length ?? 0,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Verify Deliverables (#83) ──────────────────────────────
    {
      name: 'plan_verify_deliverables',
      description:
        'Verify all deliverables for a task — checks file existence + SHA-256 hash match, vault entry existence. Returns stale count.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID'),
        taskId: z.string().describe('Task ID to verify deliverables for'),
      }),
      handler: async (params) => {
        try {
          return planner.verifyDeliverables(
            params.planId as string,
            params.taskId as string,
            vault,
          );
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Evidence-Based Reconciliation (#206) ─────────────────────
    {
      name: 'plan_reconcile_with_evidence',
      description:
        'Cross-reference plan tasks against git diff to produce an evidence-based drift report. ' +
        'Shows which tasks have matching file changes, which are missing, and what unplanned work was done.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('Plan ID to verify against git'),
        projectPath: z.string().describe('Project root (must be a git repo)'),
        baseBranch: z
          .string()
          .optional()
          .default('main')
          .describe('Branch to diff against (default: main)'),
      }),
      handler: async (params) => {
        try {
          const plan = planner.get(params.planId as string);
          if (!plan) return { error: `Plan not found: ${params.planId}` };

          return collectGitEvidence(
            plan,
            params.projectPath as string,
            params.baseBranch as string,
          );
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Purge Plans (#215) ──────────────────────────────────────────
    {
      name: 'plan_purge',
      description:
        'Permanently delete plans by mode: "archived" (only archived), "completed" (completed + archived), ' +
        '"stale" (draft/approved older than 24h), or "specific" (by IDs). Use dryRun to preview.',
      auth: 'admin',
      schema: z.object({
        mode: z.enum(['archived', 'completed', 'stale', 'specific']).describe('Purge mode'),
        planIds: z.array(z.string()).optional().describe('Plan IDs for specific mode'),
        dryRun: z.boolean().optional().default(false).describe('Preview without deleting'),
      }),
      handler: async (params) => {
        const mode = params.mode as string;
        const dryRun = params.dryRun as boolean;
        const plans = planner.list();
        const now = Date.now();
        const staleThresholdMs = 24 * 60 * 60 * 1000;

        let toPurge: typeof plans;
        if (mode === 'archived') {
          toPurge = plans.filter((p) => p.status === 'archived');
        } else if (mode === 'completed') {
          toPurge = plans.filter((p) => p.status === 'completed' || p.status === 'archived');
        } else if (mode === 'stale') {
          toPurge = plans.filter(
            (p) =>
              (p.status === 'draft' || p.status === 'approved' || p.status === 'brainstorming') &&
              p.createdAt &&
              now - p.createdAt > staleThresholdMs,
          );
        } else if (mode === 'specific') {
          const ids = new Set((params.planIds as string[]) ?? []);
          toPurge = plans.filter((p) => ids.has(p.id));
        } else {
          return { error: `Unknown purge mode: ${mode}` };
        }

        if (dryRun) {
          return {
            dryRun: true,
            mode,
            wouldPurge: toPurge.length,
            plans: toPurge.map((p) => ({ id: p.id, status: p.status, objective: p.objective })),
          };
        }

        let purged = 0;
        for (const p of toPurge) {
          try {
            planner.remove(p.id);
            purged++;
          } catch {
            // Skip plans that can't be removed
          }
        }

        return { purged, mode };
      },
    },
  ];
}
