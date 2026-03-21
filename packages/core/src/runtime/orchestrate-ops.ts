/**
 * Orchestration operations — flow-engine-driven workflows.
 *
 * These ops wire the YAML flow engine into the facade layer:
 *   - orchestrate_plan: intent detection + buildPlan from flow engine
 *   - orchestrate_execute: FlowExecutor dispatches steps to facade ops
 *   - orchestrate_complete: runEpilogue captures knowledge + session
 *   - orchestrate_status: combined status across all modules
 *   - orchestrate_quick_capture: one-call knowledge capture without full planning
 */

import { z } from 'zod';
import type { OpDefinition, FacadeConfig } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { buildPlan } from '../flows/plan-builder.js';
import { FlowExecutor } from '../flows/executor.js';
import { createDispatcher } from '../flows/dispatch-registry.js';
import { runEpilogue } from '../flows/epilogue.js';
import type { OrchestrationPlan, ExecutionResult } from '../flows/types.js';
import type { ContextHealthStatus } from './context-health.js';
import {
  detectGitHubContext,
  findMatchingMilestone,
  findDuplicateIssue,
  formatIssueBody,
  createGitHubIssue,
  updateGitHubIssueBody,
} from '../planning/github-projection.js';
import type { PlanMetadataForIssue, GitHubProjection } from '../planning/github-projection.js';
import {
  extractIssueNumber,
  detectGitHubRemote as detectGitHubRemoteAsync,
  getIssueDetails,
} from './github-integration.js';

// ---------------------------------------------------------------------------
// Intent detection — keyword-based mapping from prompt to intent
// ---------------------------------------------------------------------------

const INTENT_KEYWORDS: [RegExp, string][] = [
  [/\b(fix|bug|broken|error|crash|issue)\b/i, 'FIX'],
  [/\b(review|audit|check|inspect)\b/i, 'REVIEW'],
  [/\b(build|create|add|new|implement|scaffold)\b/i, 'BUILD'],
  [/\b(plan|architect|design-system|roadmap)\b/i, 'PLAN'],
  [/\b(enhance|improve|refactor|optimize)\b/i, 'ENHANCE'],
  [/\b(explore|research|investigate|spike)\b/i, 'EXPLORE'],
  [/\b(deploy|ship|release|publish)\b/i, 'DELIVER'],
  [/\b(design|palette|theme|color|typography)\b/i, 'DESIGN'],
];

function detectIntent(prompt: string): string {
  for (const [pattern, intent] of INTENT_KEYWORDS) {
    if (pattern.test(prompt)) return intent;
  }
  return 'BUILD'; // default
}

// ---------------------------------------------------------------------------
// In-memory plan store
// ---------------------------------------------------------------------------

interface PlanEntry {
  plan: OrchestrationPlan;
  executionResult?: ExecutionResult;
  createdAt: number;
}

const planStore = new Map<string, PlanEntry>();

// ---------------------------------------------------------------------------
// Helper: create a runtime-backed dispatcher
// ---------------------------------------------------------------------------

/**
 * Build a dispatch function that routes tool names to runtime modules.
 * If facades are provided, uses the full dispatch registry.
 * Otherwise, falls back to a simple runtime-based dispatcher.
 */
function buildDispatch(agentId: string, runtime: AgentRuntime, facades?: FacadeConfig[]) {
  if (facades && facades.length > 0) {
    return createDispatcher(agentId, facades);
  }

  // Fallback: runtime-based dispatch for known tool patterns
  return async (
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<{ tool: string; status: string; data?: unknown; error?: string }> => {
    try {
      // Handle well-known epilogue tools directly via runtime
      if (toolName === 'capture_knowledge' || toolName.endsWith('_capture_knowledge')) {
        const title = (params.title as string) ?? 'Flow execution';
        const description = (params.content as string) ?? (params.description as string) ?? '';
        const tags = (params.tags as string[]) ?? ['workflow'];
        runtime.vault.add({
          id: `flow-${Date.now()}`,
          title,
          description,
          type: 'pattern',
          domain: 'workflow',
          severity: 'suggestion',
          tags,
        });
        return { tool: toolName, status: 'ok', data: { title } };
      }

      if (toolName === 'session_capture' || toolName.endsWith('_session_capture')) {
        // Session capture is best-effort
        return { tool: toolName, status: 'ok', data: { sessionId: 'flow-session' } };
      }

      // For other tools: mark as unregistered (graceful degradation)
      return { tool: toolName, status: 'unregistered' };
    } catch (err) {
      return {
        tool: toolName,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Context health warning builder
// ---------------------------------------------------------------------------

interface HealthWarning {
  level: string;
  recommendation: string;
  sessionCaptured?: boolean;
}

/**
 * Build a context health warning if level is yellow or red.
 * On red: auto-triggers a session capture to vault memory.
 */
function buildHealthWarning(
  status: ContextHealthStatus,
  vault: AgentRuntime['vault'],
): HealthWarning | null {
  if (status.level === 'green') return null;

  const warning: HealthWarning = {
    level: status.level,
    recommendation: status.recommendation,
  };

  if (status.level === 'red') {
    try {
      vault.captureMemory({
        projectPath: '.',
        type: 'session',
        context: 'Auto-captured by context health monitor (red level)',
        summary: `Context fill at ${(status.estimatedFill * 100).toFixed(0)}% (${status.toolCallCount} tool calls, ~${status.estimatedTokens} tokens). Session capture recommended.`,
        topics: ['context-health'],
        filesModified: [],
        toolsUsed: [],
        intent: null,
        decisions: [],
        currentState: `Context health: ${status.level}`,
        nextSteps: ['Compact context or start a new session'],
        vaultEntriesReferenced: [],
      });
      warning.sessionCaptured = true;
    } catch {
      warning.sessionCaptured = false;
    }
  }

  return warning;
}

// ---------------------------------------------------------------------------
// Op factory
// ---------------------------------------------------------------------------

/**
 * Create the 5 orchestration operations for an agent runtime.
 * Optionally accepts facades for full dispatch capability.
 */
export function createOrchestrateOps(
  runtime: AgentRuntime,
  facades?: FacadeConfig[],
): OpDefinition[] {
  const { planner, brainIntelligence, vault, contextHealth } = runtime;
  const agentId = runtime.config.agentId;

  return [
    // ─── orchestrate_plan ─────────────────────────────────────────
    {
      name: 'orchestrate_plan',
      description:
        'Create a flow-engine-driven plan. Detects intent from the prompt, ' +
        'loads the matching YAML flow, probes runtime capabilities, and builds ' +
        'a pruned orchestration plan with gate-guarded steps.',
      auth: 'write',
      schema: z.object({
        prompt: z.string().optional().describe('Natural language description of what to do (or use objective)'),
        projectPath: z.string().optional().default('.').describe('Project root path'),
        // Legacy params — still accepted for backward compat
        objective: z.string().optional().describe('(Legacy) Plan objective — use prompt instead'),
        scope: z.string().optional().describe('(Legacy) Plan scope'),
        domain: z.string().optional().describe('Domain hint for brain recommendations'),
        tasks: z
          .array(z.object({ title: z.string(), description: z.string() }))
          .optional()
          .describe('Optional pre-defined tasks'),
      }),
      handler: async (params) => {
        const prompt = (params.prompt as string) ?? (params.objective as string) ?? '';
        const projectPath = (params.projectPath as string) ?? '.';
        const domain = params.domain as string | undefined;

        // 1. Detect intent from prompt
        const intent = detectIntent(prompt);

        // 2. Get brain recommendations — graceful degradation
        let recommendations: Array<{ pattern: string; strength: number; entryId?: string }> = [];
        try {
          const raw = brainIntelligence.recommend({
            domain,
            task: prompt,
            limit: 5,
          });
          recommendations = raw.map((r) => {
            // Look up vault entry ID by title for feedback tracking
            const entries = vault.search(r.pattern, { limit: 1 });
            const entryId = entries.length > 0 && entries[0].entry.title === r.pattern
              ? entries[0].entry.id
              : undefined;
            return { pattern: r.pattern, strength: r.strength, entryId };
          });
        } catch {
          // Brain has no data yet
        }

        // Fallback to vault if brain empty
        if (recommendations.length === 0) {
          try {
            const vaultResults = vault.search(prompt, { domain, limit: 5 });
            recommendations = vaultResults.map((r) => ({
              pattern: r.entry.title,
              strength: 50,
              entryId: r.entry.id,
            }));
          } catch {
            // Vault search failed
          }
        }

        // 3. Build flow-engine plan
        const plan = await buildPlan(intent, agentId, projectPath, runtime, prompt);

        // 4. Store in planStore
        planStore.set(plan.planId, { plan, createdAt: Date.now() });

        // 5. Also create a planner plan for lifecycle tracking (backward compat)
        const decisions = recommendations.map(
          (r) => {
            const base = `Brain pattern: ${r.pattern} (strength: ${r.strength.toFixed(1)})`;
            return r.entryId ? `${base} [entryId:${r.entryId}]` : base;
          },
        );
        const tasks = (params.tasks as Array<{ title: string; description: string }>) ?? [];

        // 5b. Extract GitHub issue context if prompt references #NNN
        let githubIssue: { owner: string; repo: string; number: number } | undefined;
        const issueNum = extractIssueNumber(prompt);
        if (issueNum) {
          const remote = await detectGitHubRemoteAsync(projectPath);
          if (remote) {
            githubIssue = { owner: remote.owner, repo: remote.repo, number: issueNum };
            const details = await getIssueDetails(remote.owner, remote.repo, issueNum);
            if (details) {
              // Enrich objective with issue context
              const enriched = `${prompt}\n\n--- GitHub Issue #${issueNum}: ${details.title} ---\n${details.body}`;
              decisions.unshift(`Source: GitHub issue #${issueNum} — ${details.title}`);
              // Replace prompt for plan creation
              Object.assign(params, { _enrichedObjective: enriched });
            }
          }
        }

        const planObjective = (params as Record<string, unknown>)._enrichedObjective as string | undefined ?? prompt;

        let legacyPlan;
        try {
          legacyPlan = planner.create({
            objective: planObjective,
            scope: (params.scope as string) ?? `${intent} workflow`,
            decisions,
            tasks,
          });
          if (legacyPlan && githubIssue) {
            legacyPlan.githubIssue = githubIssue;
          }
        } catch {
          // Planner creation failed — flow plan still valid
        }

        return {
          plan: legacyPlan ?? {
            id: plan.planId,
            objective: prompt,
            decisions,
          },
          recommendations,
          flow: {
            planId: plan.planId,
            intent: plan.intent,
            flowId: plan.flowId,
            stepsCount: plan.steps.length,
            skippedCount: plan.skipped.length,
            warnings: plan.warnings,
            estimatedTools: plan.estimatedTools,
          },
        };
      },
    },

    // ─── orchestrate_execute ──────────────────────────────────────
    {
      name: 'orchestrate_execute',
      description:
        'Execute a flow-engine plan. Dispatches each step to its facade ops, ' +
        'evaluates gates, and tracks execution with a brain session.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('ID of the plan to execute (flow planId or legacy planId)'),
        domain: z.string().optional().describe('Domain for brain session tracking'),
        context: z.string().optional().describe('Additional context for the brain session'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        const domain = params.domain as string | undefined;
        const context = params.context as string | undefined;

        // Look up flow plan
        const entry = planStore.get(planId);

        if (entry) {
          // Flow-engine execution path
          const dispatch = buildDispatch(agentId, runtime, facades);
          const executor = new FlowExecutor(dispatch);
          const executionResult = await executor.execute(entry.plan);

          // Store result
          entry.executionResult = executionResult;

          // Reuse brain session from plan_split if one exists, otherwise start new
          const existingSession = brainIntelligence.getSessionByPlanId(planId);
          const session =
            existingSession && !existingSession.endedAt
              ? existingSession
              : brainIntelligence.lifecycle({
                  action: 'start',
                  domain,
                  context,
                  planId,
                });

          // Track execution in context health monitor
          contextHealth.track({
            type: 'orchestrate_execute',
            payloadSize: JSON.stringify(executionResult).length,
          });
          const healthStatus = contextHealth.check();
          const healthWarning = buildHealthWarning(healthStatus, vault);

          return {
            plan: { id: planId, status: 'executing' },
            session,
            execution: {
              status: executionResult.status,
              stepsCompleted: executionResult.stepsCompleted,
              totalSteps: executionResult.totalSteps,
              toolsCalled: executionResult.toolsCalled,
              durationMs: executionResult.durationMs,
            },
            ...(healthWarning ? { contextHealth: healthWarning } : {}),
          };
        }

        // Legacy path: no flow plan found, use planner directly
        const plan = planner.startExecution(planId);
        // Reuse brain session from plan_split if one exists, otherwise start new
        const existingSession = brainIntelligence.getSessionByPlanId(planId);
        const session =
          existingSession && !existingSession.endedAt
            ? existingSession
            : brainIntelligence.lifecycle({
                action: 'start',
                domain,
                context,
                planId,
              });

        // Track legacy execution in context health monitor
        contextHealth.track({
          type: 'orchestrate_execute_legacy',
          payloadSize: JSON.stringify(plan).length,
        });
        const healthStatus = contextHealth.check();
        const healthWarning = buildHealthWarning(healthStatus, vault);

        return {
          plan,
          session,
          ...(healthWarning ? { contextHealth: healthWarning } : {}),
        };
      },
    },

    // ─── orchestrate_complete ─────────────────────────────────────
    {
      name: 'orchestrate_complete',
      description:
        'Complete plan execution, run epilogue (knowledge capture + session capture), ' +
        'end brain session, and clean up.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('ID of the executing plan to complete'),
        sessionId: z.string().describe('ID of the brain session to end'),
        outcome: z
          .enum(['completed', 'abandoned', 'partial'])
          .optional()
          .default('completed')
          .describe('Plan outcome'),
        toolsUsed: z.array(z.string()).optional().describe('Tools used during execution'),
        filesModified: z.array(z.string()).optional().describe('Files modified during execution'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        const sessionId = params.sessionId as string;
        const outcome = (params.outcome as string) ?? 'completed';
        const toolsUsed = (params.toolsUsed as string[]) ?? [];
        const filesModified = (params.filesModified as string[]) ?? [];

        // Complete the planner plan (legacy lifecycle)
        const plan = planner.complete(planId);

        // End brain session
        const session = brainIntelligence.lifecycle({
          action: 'end',
          sessionId,
          planId,
          planOutcome: outcome,
          toolsUsed,
          filesModified,
        });

        // Extract knowledge
        let extraction = null;
        try {
          extraction = brainIntelligence.extractKnowledge(sessionId);
        } catch {
          // Not enough signal
        }

        // Run flow-engine epilogue if we have a flow plan
        let epilogueResult = null;
        const entry = planStore.get(planId);
        if (entry) {
          try {
            const dispatch = buildDispatch(agentId, runtime, facades);
            const summary = `${outcome}: ${entry.plan.summary}. Tools: ${toolsUsed.join(', ') || 'none'}. Files: ${filesModified.join(', ') || 'none'}.`;
            epilogueResult = await runEpilogue(
              dispatch,
              entry.plan.context.probes,
              entry.plan.context.projectPath,
              summary,
            );
          } catch {
            // Epilogue is best-effort
          }

          // Clean up plan store
          planStore.delete(planId);
        }

        return { plan, session, extraction, epilogue: epilogueResult };
      },
    },

    // ─── orchestrate_status ───────────────────────────────────────
    {
      name: 'orchestrate_status',
      description:
        'Get combined orchestration status: active plans, brain session context, ' +
        'vault stats, recent brain recommendations, and flow plan store.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional().describe('Filter recommendations by domain'),
        sessionLimit: z
          .number()
          .optional()
          .describe('Number of recent sessions to include (default 5)'),
      }),
      handler: async (params) => {
        const domain = params.domain as string | undefined;
        const sessionLimit = (params.sessionLimit as number) ?? 5;

        const activePlans = planner.getActive();
        const sessionContext = brainIntelligence.getSessionContext(sessionLimit);
        const vaultStats = vault.stats();

        let recommendations: Array<{ pattern: string; strength: number }> = [];
        try {
          const raw = brainIntelligence.recommend({ domain, limit: 5 });
          recommendations = raw.map((r) => ({
            pattern: r.pattern,
            strength: r.strength,
          }));
        } catch {
          // No recommendations available
        }

        const brainStats = brainIntelligence.getStats();

        // Include flow plan store info
        const flowPlans = Array.from(planStore.entries()).map(([id, e]) => ({
          planId: id,
          intent: e.plan.intent,
          flowId: e.plan.flowId,
          stepsCount: e.plan.steps.length,
          hasResult: !!e.executionResult,
          createdAt: e.createdAt,
        }));

        return {
          activePlans,
          sessionContext,
          vaultStats,
          recommendations,
          brainStats,
          flowPlans,
        };
      },
    },

    // ─── orchestrate_quick_capture ────────────────────────────────
    {
      name: 'orchestrate_quick_capture',
      description:
        'Capture knowledge from a completed task without full plan lifecycle. ' +
        'Creates a brain session, records the context, ends it, and extracts knowledge — all in one call.',
      auth: 'write',
      schema: z.object({
        domain: z.string().describe('Knowledge domain (e.g. "component", "accessibility")'),
        context: z.string().describe('What was done — summary of the task'),
        toolsUsed: z.array(z.string()).optional().describe('Tools used during the task'),
        filesModified: z.array(z.string()).optional().describe('Files modified during the task'),
        outcome: z
          .enum(['completed', 'abandoned', 'partial'])
          .optional()
          .default('completed')
          .describe('Task outcome'),
      }),
      handler: async (params) => {
        const domain = params.domain as string;
        const context = params.context as string;
        const toolsUsed = (params.toolsUsed as string[]) ?? [];
        const filesModified = (params.filesModified as string[]) ?? [];
        const outcome = (params.outcome as string) ?? 'completed';

        const startedSession = brainIntelligence.lifecycle({
          action: 'start',
          domain,
          context,
          toolsUsed,
          filesModified,
        });

        const endedSession = brainIntelligence.lifecycle({
          action: 'end',
          sessionId: startedSession.id,
          toolsUsed,
          filesModified,
          planOutcome: outcome,
        });

        let extraction = null;
        try {
          extraction = brainIntelligence.extractKnowledge(startedSession.id);
        } catch {
          // Not enough signal
        }

        return { session: endedSession, extraction };
      },
    },

    // ─── orchestrate_project_to_github ─────────────────────────────
    {
      name: 'orchestrate_project_to_github',
      description:
        'Project plan tasks as GitHub issues. Detects the GitHub remote, checks milestones ' +
        'and existing issues for duplicates, creates issues with plan metadata linked, and ' +
        'stores the projection on the plan. Opt-in: the agent suggests, user confirms.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('ID of the plan to project to GitHub'),
        projectPath: z.string().optional().default('.').describe('Project root path for git detection'),
        milestone: z.number().optional().describe('GitHub milestone number to assign issues to'),
        labels: z.array(z.string()).optional().describe('Labels to apply to created issues'),
        linkToIssue: z.number().optional().describe('Existing issue number to link plan to instead of creating new issues'),
        dryRun: z.boolean().optional().default(false).describe('Preview what would be created without actually creating issues'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        const projectPath = (params.projectPath as string) ?? '.';
        const milestone = params.milestone as number | undefined;
        const labels = (params.labels as string[]) ?? [];
        const linkToIssue = params.linkToIssue as number | undefined;
        const dryRun = (params.dryRun as boolean) ?? false;

        // 1. Find the plan
        const plan = planner.get(planId);
        if (!plan) throw new Error(`Plan not found: ${planId}`);

        if (plan.tasks.length === 0) {
          throw new Error('Plan has no tasks — run plan_split first to define tasks before projecting to GitHub');
        }

        // 2. Detect GitHub context
        const ctx = detectGitHubContext(projectPath);
        if (!ctx) {
          return {
            status: 'skipped',
            reason: 'No GitHub remote detected or gh CLI not authenticated',
          };
        }

        const repoSlug = `${ctx.repo.owner}/${ctx.repo.repo}`;

        // 3. Build plan metadata for issue body
        const planMeta: PlanMetadataForIssue = {
          planId: plan.id,
          grade: plan.latestCheck?.grade ?? 'N/A',
          score: plan.latestCheck?.score ?? 0,
          objective: plan.objective,
          decisions: plan.decisions,
          tasks: plan.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            dependsOn: t.dependsOn,
          })),
        };

        // 4. Handle "link to existing issue" flow
        if (linkToIssue) {
          const body = formatIssueBody(planMeta, plan.objective, plan.scope);
          if (dryRun) {
            return {
              status: 'dry_run',
              action: 'update_existing',
              repo: repoSlug,
              issueNumber: linkToIssue,
              bodyPreview: body.slice(0, 500),
            };
          }

          const updated = updateGitHubIssueBody(ctx.repo, linkToIssue, body);
          if (!updated) {
            return {
              status: 'error',
              reason: `Failed to update issue #${linkToIssue}`,
            };
          }

          const projection: GitHubProjection = {
            repo: repoSlug,
            issues: [{ taskId: 'all', issueNumber: linkToIssue }],
            projectedAt: Date.now(),
          };
          planner.setGitHubProjection(planId, projection);

          return {
            status: 'linked',
            repo: repoSlug,
            issueNumber: linkToIssue,
            message: `Plan linked to existing issue #${linkToIssue}`,
          };
        }

        // 5. Milestone matching
        let milestoneNumber = milestone;
        let milestoneMatch: string | undefined;
        if (!milestoneNumber && ctx.milestones.length > 0 && plan.scope) {
          const match = findMatchingMilestone(plan.scope, ctx.milestones);
          if (match) {
            milestoneNumber = match.number;
            milestoneMatch = match.title;
          }
        }

        // 6. Create issues per task (with duplicate detection)
        const created: Array<{ taskId: string; issueNumber: number; title: string }> = [];
        const skipped: Array<{ taskId: string; title: string; existingIssue: number; reason: string }> = [];
        const failed: Array<{ taskId: string; title: string; reason: string }> = [];

        for (const task of plan.tasks) {
          // Duplicate detection
          const dup = findDuplicateIssue(task.title, ctx.existingIssues);
          if (dup) {
            skipped.push({
              taskId: task.id,
              title: task.title,
              existingIssue: dup.number,
              reason: `Existing issue #${dup.number} "${dup.title}" looks like it covers this task`,
            });
            continue;
          }

          const body = formatIssueBody(planMeta, task.title, task.description);

          if (dryRun) {
            created.push({ taskId: task.id, issueNumber: 0, title: task.title });
            continue;
          }

          const issueNumber = createGitHubIssue(ctx.repo, task.title, body, {
            milestone: milestoneNumber,
            labels: labels.length > 0 ? labels : undefined,
          });

          if (issueNumber) {
            created.push({ taskId: task.id, issueNumber, title: task.title });
          } else {
            failed.push({ taskId: task.id, title: task.title, reason: 'gh issue create failed' });
          }
        }

        // 7. Store projection on the plan (unless dry run)
        if (!dryRun && created.length > 0) {
          const projection: GitHubProjection = {
            repo: repoSlug,
            milestone: milestoneNumber,
            issues: created.map((c) => ({ taskId: c.taskId, issueNumber: c.issueNumber })),
            projectedAt: Date.now(),
          };
          planner.setGitHubProjection(planId, projection);
        }

        return {
          status: dryRun ? 'dry_run' : 'projected',
          repo: repoSlug,
          milestone: milestoneMatch
            ? { number: milestoneNumber, title: milestoneMatch }
            : milestoneNumber
              ? { number: milestoneNumber }
              : null,
          created,
          skipped,
          failed,
          context: {
            milestonesFound: ctx.milestones.length,
            existingIssuesChecked: ctx.existingIssues.length,
            labelsAvailable: ctx.labels.length,
          },
        };
      },
    },
  ];
}
