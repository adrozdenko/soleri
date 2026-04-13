import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { FacadeConfig, OpDefinition } from '../facades/types.js';
import { FlowExecutor, getPlanRunDir, loadManifest, saveManifest } from '../flows/executor.js';
import { runEpilogue } from '../flows/epilogue.js';
import type { PlanRunManifest } from '../flows/types.js';
import type { EvidenceReport } from '../planning/evidence-collector.js';
import { collectGitEvidence } from '../planning/evidence-collector.js';
import type { ImpactReport } from '../planning/impact-analyzer.js';
import { ImpactAnalyzer } from '../planning/impact-analyzer.js';
import { detectRationalizations } from '../planning/rationalization-detector.js';
import type { OperatorSignals } from '../operator/operator-context-types.js';
import { recordPlanFeedback } from './plan-feedback-helper.js';
import {
  analyzeQualitySignals,
  captureQualitySignals,
  buildFixTrailSummary,
} from './quality-signals.js';
import type { AgentRuntime } from './types.js';
import {
  buildDispatch,
  buildHealthWarning,
  captureRationalizationAntiPattern,
  collectAcceptanceCriteria,
  planStore,
  withWorkflowPreamble,
} from './orchestrate-shared.js';

export interface OrchestrateExecutionContext {
  runtime: AgentRuntime;
  planner: AgentRuntime['planner'];
  brain: AgentRuntime['brain'];
  brainIntelligence: AgentRuntime['brainIntelligence'];
  vault: AgentRuntime['vault'];
  contextHealth: AgentRuntime['contextHealth'];
  agentId: string;
  facades?: FacadeConfig[];
}

export function createOrchestrateExecuteOp(ctx: OrchestrateExecutionContext): OpDefinition {
  const { runtime, planner, brainIntelligence, contextHealth, vault, agentId, facades } = ctx;

  return {
    name: 'orchestrate_execute',
    description:
      'Execute a flow-engine plan. Dispatches each step to its facade ops, ' +
      'evaluates gates, and tracks execution with a brain session.',
    auth: 'write',
    schema: z.object({
      planId: z.string().describe('ID of the plan to execute (flow planId or legacy planId)'),
      domain: z.string().optional().describe('Domain for brain session tracking'),
      context: z.string().optional().describe('Additional context for the brain session'),
      runtime: z
        .string()
        .optional()
        .describe(
          'Runtime adapter type (e.g. "claude-code", "codex"). ' +
            'When provided, dispatches via the adapter instead of the flow engine.',
        ),
      subagent: z
        .boolean()
        .optional()
        .describe(
          'When true, dispatches plan tasks via SubagentDispatcher instead of FlowExecutor. ' +
            'Each task runs as a separate subagent process.',
        ),
      parallel: z
        .boolean()
        .optional()
        .describe(
          'Run subagent tasks in parallel (default: true). Only applies when subagent=true.',
        ),
      maxConcurrent: z
        .number()
        .optional()
        .describe('Max concurrent subagents (default: 3). Only applies when subagent=true.'),
    }),
    handler: async (params) => {
      const planId = params.planId as string;
      const domain = params.domain as string | undefined;
      const context = params.context as string | undefined;
      const runtimeType = params.runtime as string | undefined;
      const useSubagent = params.subagent as boolean | undefined;
      const parallelMode = params.parallel as boolean | undefined;
      const maxConcurrentParam = params.maxConcurrent as number | undefined;

      // ── Subagent dispatch path ───────────────────────────────────
      // When subagent=true, dispatch plan tasks via SubagentDispatcher.
      // Each task runs as a separate child process via the adapter layer.
      if (useSubagent && runtime.subagentDispatcher) {
        const entry = planStore.get(planId);
        const legacyPlan = !entry ? planner.get(planId) : undefined;
        const tasks =
          entry?.plan.steps.map((s) => ({
            taskId: s.id,
            prompt: withWorkflowPreamble(s.name, entry?.plan),
            workspace: process.cwd(),
            runtime: runtimeType,
            timeout: 300_000,
          })) ??
          legacyPlan?.tasks?.map((t) => ({
            taskId: t.id,
            prompt: t.title ?? t.description ?? '',
            workspace: process.cwd(),
            runtime: runtimeType,
            timeout: 300_000,
          })) ??
          [];

        let aggregated;
        let reapedOrphans: { taskId: string; pid?: number }[] = [];
        try {
          aggregated = await runtime.subagentDispatcher.dispatch(tasks, {
            parallel: parallelMode ?? true,
            maxConcurrent: maxConcurrentParam ?? 3,
          });
        } finally {
          // Post-dispatch cleanup: reap orphaned subagent processes
          try {
            const reapResult = runtime.subagentDispatcher.reapOrphans();
            if (reapResult.reaped.length > 0) {
              reapedOrphans = reapResult.reaped.map((taskId) => ({ taskId }));
              console.error(
                `[soleri] Reaped ${reapResult.reaped.length} orphaned subagent(s): ${reapResult.reaped.join(', ')}`,
              );
            }
          } catch {
            // Orphan reaping is best-effort — never blocks dispatch result
          }
        }

        // Track in brain session
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

        contextHealth.track({
          type: 'orchestrate_execute',
          payloadSize: JSON.stringify(aggregated).length,
        });
        const healthStatus = contextHealth.check();
        const healthWarning = buildHealthWarning(healthStatus, vault);

        // Check for subagent review stage requirements from matched playbook
        const legacyPlanForReview = planner.get(planId);
        let reviewStagesRequired: string[] | undefined;
        if (legacyPlanForReview?.playbookSessionId && runtime.playbookExecutor) {
          const session_ = runtime.playbookExecutor.getSession(
            legacyPlanForReview.playbookSessionId,
          );
          if (session_) {
            const postTaskGates = session_.gates.filter((g) => g.phase === 'post-task');
            if (postTaskGates.length > 0) {
              reviewStagesRequired = postTaskGates.map((g) => g.checkType);
            }
          }
        } else if (
          legacyPlanForReview?.playbookMatch?.genericId === 'generic-subagent-execution' ||
          legacyPlanForReview?.playbookMatch?.label?.toLowerCase().includes('subagent')
        ) {
          // Playbook matched but no live session — surface known review stages
          reviewStagesRequired = ['spec-review', 'quality-review'];
        }

        return {
          plan: { id: planId, status: 'executing' },
          session,
          subagent: {
            status: aggregated.status,
            totalTasks: aggregated.totalTasks,
            completed: aggregated.completed,
            failed: aggregated.failed,
            durationMs: aggregated.durationMs,
            totalUsage: aggregated.totalUsage,
          },
          ...(reviewStagesRequired
            ? {
                reviewStagesRequired,
                reviewNote:
                  'Subagent Execution playbook matched. Each completed task requires review evidence before status can be set to completed: ' +
                  reviewStagesRequired.join(' → '),
              }
            : {}),
          ...(reapedOrphans.length > 0 ? { reapedOrphans } : {}),
          ...(healthWarning ? { contextHealth: healthWarning } : {}),
        };
      }

      // ── Adapter dispatch path ────────────────────────────────────
      // When a runtime is specified, dispatch the plan's prompt via the
      // adapter instead of the flow engine. This is the integration point
      // for multi-runtime support (GH #410).
      if (runtimeType && runtime.adapterRegistry) {
        const adapter = runtime.adapterRegistry.get(runtimeType);
        const entry = planStore.get(planId);
        const rawPrompt = entry?.plan.summary ?? `Execute plan ${planId}`;
        const prompt = withWorkflowPreamble(rawPrompt, entry?.plan);

        const adapterResult = await adapter.execute({
          runId: `${planId}-${Date.now()}`,
          prompt,
          workspace: process.cwd(),
          config: { planId, domain },
        });

        // Track in brain session
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

        contextHealth.track({
          type: 'orchestrate_execute',
          payloadSize: JSON.stringify(adapterResult).length,
        });
        const healthStatus = contextHealth.check();
        const healthWarning = buildHealthWarning(healthStatus, vault);

        return {
          plan: { id: planId, status: 'executing' },
          session,
          adapter: {
            type: runtimeType,
            exitCode: adapterResult.exitCode,
            summary: adapterResult.summary,
            usage: adapterResult.usage,
          },
          ...(healthWarning ? { contextHealth: healthWarning } : {}),
        };
      }

      // Look up flow plan
      const entry = planStore.get(planId);

      if (entry) {
        // Flow-engine execution path
        const activePlanRef = {
          steps: entry.plan.steps.map((s) => ({
            id: s.id,
            allowedTools: s.allowedTools,
            status: s.status,
          })),
          deviations: entry.plan.deviations,
        };
        const dispatch = buildDispatch(agentId, runtime, facades, activePlanRef);
        const projectPath = (params.projectPath as string) ?? '.';
        const executor = new FlowExecutor(dispatch, projectPath);
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

        // Build workflow preamble for the calling agent's context
        const workflowPreamble = entry.plan.workflowPrompt
          ? withWorkflowPreamble(entry.plan.summary, entry.plan)
          : undefined;

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
          ...(workflowPreamble ? { workflowPreamble } : {}),
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
  };
}

export function createOrchestrateCompleteOp(ctx: OrchestrateExecutionContext): OpDefinition {
  const { runtime, planner, brain, brainIntelligence, vault, agentId, facades } = ctx;

  return {
    name: 'orchestrate_complete',
    description:
      'Complete plan execution, run epilogue (knowledge capture + session capture), ' +
      'end brain session, and clean up.',
    auth: 'write',
    schema: z.object({
      planId: z
        .string()
        .optional()
        .describe('ID of the executing plan to complete (optional for direct tasks)'),
      sessionId: z
        .string()
        .optional()
        .describe('ID of the brain session to end (auto-resolved from planId if omitted)'),
      outcome: z
        .enum(['completed', 'abandoned', 'partial'])
        .optional()
        .default('completed')
        .describe('Plan outcome'),
      summary: z
        .string()
        .optional()
        .describe('Completion summary — checked for rationalization language'),
      toolsUsed: z.array(z.string()).optional().describe('Tools used during execution'),
      filesModified: z.array(z.string()).optional().describe('Files modified during execution'),
      projectPath: z
        .string()
        .optional()
        .default('.')
        .describe('Project root path for impact analysis'),
      overrideRationalization: z
        .boolean()
        .optional()
        .default(false)
        .describe('Set true to bypass rationalization gate and impact warnings after review'),
      operatorSignals: z
        .object({
          expertise: z
            .array(
              z.object({
                topic: z.string(),
                level: z.enum(['learning', 'intermediate', 'expert']),
                evidence: z.string().optional(),
                confidence: z.number().min(0).max(1).optional(),
              }),
            )
            .default([]),
          corrections: z
            .array(
              z.object({
                rule: z.string(),
                quote: z.string().optional(),
                scope: z.enum(['global', 'project']).default('global'),
              }),
            )
            .default([]),
          interests: z
            .array(
              z.object({
                tag: z.string(),
                context: z.string().optional(),
              }),
            )
            .default([]),
          patterns: z
            .array(
              z.object({
                pattern: z.string(),
                frequency: z.enum(['once', 'occasional', 'frequent']).optional(),
              }),
            )
            .default([]),
        })
        .default({ expertise: [], corrections: [], interests: [], patterns: [] })
        .describe(
          'Your silent assessment of the operator this session. Fill what you observed, empty arrays for what you did not. Never announce this to the operator.',
        ),
    }),
    handler: async (params) => {
      const planId = params.planId as string | undefined;
      const sessionId =
        (params.sessionId as string | undefined) ??
        (planId ? brainIntelligence.getSessionByPlanId(planId)?.id : undefined) ??
        '';
      const outcome = (params.outcome as string) ?? 'completed';
      const completionSummary = (params.summary as string) ?? '';
      const toolsUsed = (params.toolsUsed as string[]) ?? [];
      const filesModified = (params.filesModified as string[]) ?? [];
      const overrideRationalization = (params.overrideRationalization as boolean) ?? false;

      // Look up plan — optional for direct tasks that skipped planning
      const planObj = planId ? planner.get(planId) : null;

      // Anti-rationalization gate: only if we have acceptance criteria from a plan
      const criteria = planObj && planId ? collectAcceptanceCriteria(planner, planId) : [];
      if (
        outcome === 'completed' &&
        criteria.length > 0 &&
        completionSummary &&
        !overrideRationalization
      ) {
        const report = detectRationalizations(criteria, completionSummary);
        if (report.detected) {
          captureRationalizationAntiPattern(vault, report);
          return {
            blocked: true,
            reason: 'Rationalization language detected in completion summary',
            rationalization: report,
            hint: 'Address the unmet criteria, or set overrideRationalization: true to bypass this gate.',
          };
        }
      }

      // Impact analysis gate: assess downstream impact of modified files
      let impactReport: ImpactReport | null = null;
      if (filesModified.length > 0) {
        try {
          const analyzer = new ImpactAnalyzer();
          const scopeHints = planObj?.scope ? [planObj.scope] : undefined;
          impactReport = analyzer.analyzeImpact(
            filesModified,
            (params.projectPath as string) ?? '.',
            scopeHints,
          );

          // If high risk and not overridden, warn the user
          if (impactReport.riskLevel === 'high' && !overrideRationalization) {
            return {
              warning: true,
              reason: 'High impact detected — review before completing',
              impactReport,
              hint: 'Review affected consumers and re-run with overrideRationalization: true or address the issues.',
            };
          }
        } catch {
          // Impact analysis is best-effort — never blocks
        }
      }

      const warnings: string[] = [];

      // Evidence-based reconciliation: cross-reference plan tasks against git diff
      let evidenceReport: EvidenceReport | null = null;
      if (planObj) {
        try {
          evidenceReport = collectGitEvidence(
            planObj,
            (params.projectPath as string) ?? '.',
            'main',
          );
          if (evidenceReport.accuracy < 50) {
            console.error(
              `[soleri] Evidence accuracy ${evidenceReport.accuracy}% — significant drift detected between plan and git state`,
            );
            warnings.push(
              `Low evidence accuracy (${evidenceReport.accuracy}%) — plan tasks may not match git changes.`,
            );
          }
        } catch {
          // Evidence collection is best-effort — never blocks
        }
      }

      // Complete the planner plan (legacy lifecycle) — best-effort
      // The epilogue (brain session, knowledge extraction, flow epilogue) MUST run
      // even if plan transition fails (e.g. already completed, missing, invalid state).
      let completedPlan;
      if (planObj && planId) {
        try {
          completedPlan = planner.complete(planId);
        } catch (err) {
          warnings.push(`Plan transition skipped: ${(err as Error).message}`);
          completedPlan = {
            id: planId,
            status: planObj.status ?? 'completed',
            objective: planObj.objective ?? (completionSummary || 'Direct execution'),
          };
        }
      } else {
        completedPlan = {
          id: planId ?? `direct-${Date.now()}`,
          status: 'completed',
          objective: completionSummary || 'Direct execution',
        };
      }

      // End brain session — only if we have a valid sessionId
      const fixTrail = evidenceReport ? buildFixTrailSummary(evidenceReport) : undefined;
      const session = sessionId
        ? brainIntelligence.lifecycle({
            action: 'end',
            sessionId,
            planId,
            planOutcome: outcome,
            toolsUsed,
            filesModified,
            ...(fixTrail ? { context: `Fix trail: ${fixTrail}` } : {}),
          })
        : null;

      // Record brain feedback for vault entries referenced in plan decisions
      if (planObj && planObj.decisions) {
        try {
          recordPlanFeedback(
            { objective: planObj.objective, decisions: planObj.decisions },
            brain,
            brainIntelligence,
          );
        } catch {
          // Brain feedback is best-effort
        }
      }

      // Feed evidence accuracy into brain feedback — low accuracy signals poor pattern match
      if (evidenceReport && planObj) {
        try {
          const evidenceAction = evidenceReport.accuracy < 50 ? 'dismissed' : 'accepted';
          brain.recordFeedback(`plan-evidence:${planObj.objective}`, planObj.id, evidenceAction);
        } catch {
          // Evidence brain feedback is best-effort
        }
      }

      // Quality signals: capture rework anti-patterns and clean-task feedback
      if (evidenceReport) {
        try {
          const qualityAnalysis = analyzeQualitySignals(evidenceReport, planObj);
          if (qualityAnalysis.antiPatterns.length > 0 || qualityAnalysis.cleanTasks.length > 0) {
            captureQualitySignals(qualityAnalysis, vault, brain, planId ?? `direct-${Date.now()}`);
          }
        } catch {
          // Quality signal capture is best-effort — never blocks completion
        }
      }

      // Extract knowledge — runs regardless of plan existence
      let extraction = null;
      try {
        extraction = brainIntelligence.extractKnowledge(sessionId);
      } catch {
        // Not enough signal
      }

      // Run flow-engine epilogue if we have a flow plan
      let epilogueResult = null;
      if (planId) {
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
              {
                intent: entry.plan.intent,
                objective: completionSummary || entry.plan.summary,
                domain: entry.plan.context.entities?.technologies?.[0],
              },
            );
          } catch {
            // Epilogue is best-effort
          }

          // Clean up plan store
          planStore.delete(planId);
        }
      }

      // Compound operator signals (silent learning)
      const signals = params.operatorSignals as OperatorSignals | undefined;
      if (signals && runtime.operatorContextStore) {
        runtime.operatorContextStore.compoundSignals(signals, sessionId);

        // Re-render operator context file if profile drifted
        const agentDir = runtime.config.agentDir;
        if (runtime.operatorContextStore.hasDrifted() && agentDir) {
          const content = runtime.operatorContextStore.renderContextFile();
          const contextPath = path.join(agentDir, 'instructions', 'operator-context.md');
          fs.mkdirSync(path.dirname(contextPath), { recursive: true });
          fs.writeFileSync(contextPath, content, 'utf-8');
        }
      }

      // Best-effort worktree cleanup after plan completion
      try {
        const { worktreeReap } = await import('../utils/worktree-reaper.js');
        Promise.resolve()
          .then(() => worktreeReap((params.projectPath as string) ?? '.'))
          .catch(() => {
            /* best-effort */
          });
      } catch {
        /* skip silently */
      }

      return {
        plan: completedPlan,
        session,
        extraction,
        epilogue: epilogueResult ?? {
          completed: true,
          captured: false,
          note: 'no flow plan in store',
        },
        ...(impactReport ? { impactAnalysis: impactReport } : {}),
        evidenceReport,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    },
  };
}

export function createOrchestrateStatusOp(ctx: OrchestrateExecutionContext): OpDefinition {
  const { planner, brainIntelligence, vault } = ctx;

  return {
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

      // Compute readiness for the most recent active plan
      const TERMINAL_TASK_STATES = new Set(['completed', 'skipped', 'failed']);
      let readiness: {
        allTasksTerminal: boolean;
        terminalCount: number;
        totalCount: number;
        idleSince: number | null;
      } | null = null;

      const executingPlans = activePlans.filter(
        (p: { status: string }) => p.status === 'executing',
      );
      if (executingPlans.length > 0) {
        const plan = executingPlans[0] as {
          tasks?: Array<{ status: string; completedAt?: number; startedAt?: number }>;
          updatedAt?: number;
        };
        const tasks = plan.tasks ?? [];
        const totalCount = tasks.length;
        const terminalCount = tasks.filter((t) => TERMINAL_TASK_STATES.has(t.status)).length;
        const allTasksTerminal = totalCount > 0 && terminalCount === totalCount;

        // idleSince: the most recent completedAt among terminal tasks, or plan updatedAt
        let idleSince: number | null = null;
        if (totalCount > 0 && !allTasksTerminal) {
          const terminalTimestamps = tasks
            .filter((t) => TERMINAL_TASK_STATES.has(t.status) && t.completedAt)
            .map((t) => t.completedAt as number);
          if (terminalTimestamps.length > 0) {
            idleSince = Math.max(...terminalTimestamps);
          } else if (plan.updatedAt) {
            idleSince = plan.updatedAt;
          }
        }

        readiness = { allTasksTerminal, terminalCount, totalCount, idleSince };
      }

      return {
        activePlans,
        sessionContext,
        vaultStats,
        recommendations,
        brainStats,
        flowPlans,
        ...(readiness ? { readiness } : {}),
      };
    },
  };
}

export function createOrchestrateQuickCaptureOp(
  brainIntelligence: AgentRuntime['brainIntelligence'],
): OpDefinition {
  return {
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
  };
}

export function createOrchestrateRerunStepOp(): OpDefinition {
  return {
    name: 'orchestrate_rerun_step',
    description:
      'Re-execute a single plan step without full restart. Marks the target step as invalidated then rerun, ' +
      'marks downstream steps as stale (or rerun if within cascadeTo range). ' +
      'Reads and writes the plan-run manifest on disk.',
    auth: 'write',
    schema: z.object({
      planId: z.string().describe('Plan ID'),
      stepNumber: z.number().describe('0-based step index to re-run'),
      reason: z.string().describe('Why the step is being re-run'),
      projectPath: z
        .string()
        .optional()
        .default('.')
        .describe('Project root (for manifest location)'),
      cascadeTo: z
        .number()
        .optional()
        .describe(
          'If set, also mark steps up to this index (exclusive) as rerun instead of just stale',
        ),
    }),
    handler: async (params) => {
      const planId = params.planId as string;
      const stepNumber = params.stepNumber as number;
      const reason = params.reason as string;
      const projectPath = params.projectPath as string;
      const cascadeTo = params.cascadeTo as number | undefined;

      const runDir = getPlanRunDir(projectPath, planId);
      let manifest: PlanRunManifest;
      try {
        manifest = loadManifest(runDir, planId);
      } catch (err) {
        return { error: `Failed to load manifest: ${(err as Error).message}` };
      }

      const stepKeys = Object.keys(manifest.steps);
      if (stepKeys.length === 0 && stepNumber > 0) {
        return {
          error:
            'No step data in manifest — the plan may not have been executed with persistence enabled.',
        };
      }

      // Find the step key at the target index by checking all steps
      // Steps are keyed by stepId — we match by position in the plan
      const allStepIds = Object.keys(manifest.steps);
      const targetStepId = allStepIds[stepNumber];

      if (!targetStepId && !manifest.steps[String(stepNumber)]) {
        return {
          error: `Step ${stepNumber} not found in manifest. Available steps: ${allStepIds.join(', ') || '(none)'}`,
        };
      }

      const now = new Date().toISOString();
      const affected: { stepId: string; status: string }[] = [];

      // Mark all steps by their position
      const sortedStepIds = Object.keys(manifest.steps);
      for (let i = 0; i < sortedStepIds.length; i++) {
        const sid = sortedStepIds[i];
        const state = manifest.steps[sid];

        if (i === stepNumber) {
          // Target step: invalidated → rerun
          state.status = 'rerun';
          state.rerunCount += 1;
          state.rerunReason = reason;
          state.timestamp = now;
          affected.push({ stepId: sid, status: 'rerun' });
        } else if (i > stepNumber) {
          // Downstream step
          if (cascadeTo !== undefined && i < cascadeTo) {
            state.status = 'rerun';
            state.rerunCount += 1;
            state.rerunReason = `Cascade from step ${stepNumber}: ${reason}`;
            state.timestamp = now;
            affected.push({ stepId: sid, status: 'rerun' });
          } else {
            state.status = 'stale';
            state.timestamp = now;
            affected.push({ stepId: sid, status: 'stale' });
          }
        }
      }

      manifest.lastRun = now;

      try {
        saveManifest(runDir, manifest);
      } catch (err) {
        return { error: `Failed to save manifest: ${(err as Error).message}` };
      }

      return {
        planId,
        stepNumber,
        reason,
        cascadeTo: cascadeTo ?? null,
        affected,
        manifestPath: runDir,
      };
    },
  };
}
