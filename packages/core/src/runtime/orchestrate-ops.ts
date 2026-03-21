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
  const { planner, brainIntelligence, vault } = runtime;
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

        let legacyPlan;
        try {
          legacyPlan = planner.create({
            objective: prompt,
            scope: (params.scope as string) ?? `${intent} workflow`,
            decisions,
            tasks,
          });
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

        return { plan, session };
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
  ];
}
