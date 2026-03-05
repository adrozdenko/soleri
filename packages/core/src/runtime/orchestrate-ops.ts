/**
 * Orchestration operations — compose planning + brain + vault into high-level workflows.
 *
 * These ops are convenience wrappers that sequence multiple module calls:
 *   - orchestrate_plan: brain-informed plan creation
 *   - orchestrate_execute: start plan + brain session together
 *   - orchestrate_complete: finish plan + brain session + extract knowledge
 *   - orchestrate_status: combined status across all modules
 *   - orchestrate_quick_capture: one-call knowledge capture without full planning
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

/**
 * Create the 5 orchestration operations for an agent runtime.
 */
export function createOrchestrateOps(runtime: AgentRuntime): OpDefinition[] {
  const { planner, brainIntelligence, vault } = runtime;

  return [
    // ─── orchestrate_plan ─────────────────────────────────────────
    {
      name: 'orchestrate_plan',
      description:
        'Create a brain-informed plan with recommendations from pattern strengths. ' +
        'Fetches relevant brain recommendations for the domain/task, then creates a plan ' +
        'with those recommendations injected as decisions.',
      auth: 'write',
      schema: z.object({
        objective: z.string().describe('What the plan aims to achieve'),
        scope: z.string().describe('Boundaries of the work'),
        domain: z.string().optional().describe('Domain for brain recommendations (e.g. "component", "styling")'),
        tasks: z
          .array(z.object({ title: z.string(), description: z.string() }))
          .optional()
          .describe('Optional pre-defined tasks'),
      }),
      handler: async (params) => {
        const objective = params.objective as string;
        const scope = params.scope as string;
        const domain = params.domain as string | undefined;
        const tasks = (params.tasks as Array<{ title: string; description: string }>) ?? [];

        // Get brain recommendations — graceful degradation if no data
        let recommendations: Array<{ pattern: string; strength: number }> = [];
        try {
          const raw = brainIntelligence.recommend({
            domain,
            task: objective,
            limit: 5,
          });
          recommendations = raw.map((r) => ({
            pattern: r.pattern,
            strength: r.strength,
          }));
        } catch {
          // Brain has no data yet — proceed without recommendations
        }

        // Build decisions from recommendations
        const decisions = recommendations.map(
          (r) => `Brain pattern: ${r.pattern} (strength: ${r.strength.toFixed(1)})`,
        );

        // Create plan with recommendations as context
        const plan = planner.create({
          objective,
          scope,
          decisions,
          tasks,
        });

        return { plan, recommendations };
      },
    },

    // ─── orchestrate_execute ──────────────────────────────────────
    {
      name: 'orchestrate_execute',
      description:
        'Start plan execution and open a brain session to track the work. ' +
        'The plan must be in "approved" status. Returns both the updated plan and session ID.',
      auth: 'write',
      schema: z.object({
        planId: z.string().describe('ID of the approved plan to start executing'),
        domain: z.string().optional().describe('Domain for brain session tracking'),
        context: z.string().optional().describe('Additional context for the brain session'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        const domain = params.domain as string | undefined;
        const context = params.context as string | undefined;

        // Start plan execution
        const plan = planner.startExecution(planId);

        // Start brain session linked to this plan
        const session = brainIntelligence.lifecycle({
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
        'Complete plan execution, end brain session, and extract knowledge. ' +
        'Performs three steps: marks plan completed, ends the brain session with outcome, ' +
        'and runs knowledge extraction on the session.',
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

        // Complete the plan
        const plan = planner.complete(planId);

        // End brain session with outcome
        const session = brainIntelligence.lifecycle({
          action: 'end',
          sessionId,
          planId,
          planOutcome: outcome,
          toolsUsed,
          filesModified,
        });

        // Extract knowledge from the session — graceful if nothing to extract
        let extraction = null;
        try {
          extraction = brainIntelligence.extractKnowledge(sessionId);
        } catch {
          // Session may not have enough signal for extraction — that's OK
        }

        return { plan, session, extraction };
      },
    },

    // ─── orchestrate_status ───────────────────────────────────────
    {
      name: 'orchestrate_status',
      description:
        'Get combined orchestration status: active plans, brain session context, ' +
        'vault stats, and recent brain recommendations.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional().describe('Filter recommendations by domain'),
        sessionLimit: z.number().optional().describe('Number of recent sessions to include (default 5)'),
      }),
      handler: async (params) => {
        const domain = params.domain as string | undefined;
        const sessionLimit = (params.sessionLimit as number) ?? 5;

        // Active plans
        const activePlans = planner.getActive();

        // Brain session context
        const sessionContext = brainIntelligence.getSessionContext(sessionLimit);

        // Vault stats
        const vaultStats = vault.stats();

        // Recent recommendations — graceful degradation
        let recommendations: Array<{ pattern: string; strength: number }> = [];
        try {
          const raw = brainIntelligence.recommend({
            domain,
            limit: 5,
          });
          recommendations = raw.map((r) => ({
            pattern: r.pattern,
            strength: r.strength,
          }));
        } catch {
          // No recommendations available
        }

        // Brain intelligence stats
        const brainStats = brainIntelligence.getStats();

        return {
          activePlans,
          sessionContext,
          vaultStats,
          recommendations,
          brainStats,
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

        // Start session
        const startedSession = brainIntelligence.lifecycle({
          action: 'start',
          domain,
          context,
          toolsUsed,
          filesModified,
        });

        // End session immediately with outcome
        const endedSession = brainIntelligence.lifecycle({
          action: 'end',
          sessionId: startedSession.id,
          toolsUsed,
          filesModified,
          planOutcome: outcome,
        });

        // Extract knowledge — graceful if nothing to extract
        let extraction = null;
        try {
          extraction = brainIntelligence.extractKnowledge(startedSession.id);
        } catch {
          // Not enough signal — that's fine
        }

        return {
          session: endedSession,
          extraction,
        };
      },
    },
  ];
}
