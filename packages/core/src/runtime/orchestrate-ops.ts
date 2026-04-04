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

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { OpDefinition, FacadeConfig } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { buildPlan, type VaultConstraint } from '../flows/plan-builder.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ---------------------------------------------------------------------------
// Recommendation types + helpers (module-level for testability)
// ---------------------------------------------------------------------------

export interface PlanRecommendation {
  pattern: string;
  strength: number;
  entryId?: string;
  source: 'vault' | 'brain';
  context?: string;
  example?: string;
  mandatory: boolean;
  entryType?: 'pattern' | 'anti-pattern' | 'rule' | 'playbook';
}

/**
 * Map vault search results to PlanRecommendation[].
 * Accepts both RankedResult[] (semantic search) and SearchResult[] (keyword fallback)
 * since both share the same entry: IntelligenceEntry shape.
 * Critical entries get strength:100 and mandatory:true; all others get 80/false.
 */
export function mapVaultResults(
  results: Array<{ entry: IntelligenceEntry; score: number }>,
): PlanRecommendation[] {
  return results.map((r) => {
    const isCritical = r.entry.severity === 'critical';
    const rec: PlanRecommendation = {
      pattern: r.entry.title,
      strength: isCritical ? 100 : 80,
      entryId: r.entry.id,
      source: 'vault',
      mandatory: isCritical,
      entryType: r.entry.type,
    };
    if (r.entry.context) rec.context = r.entry.context;
    if (r.entry.example) rec.example = r.entry.example;
    return rec;
  });
}
import { FlowExecutor, getPlanRunDir, loadManifest, saveManifest } from '../flows/executor.js';
import { createDispatcher } from '../flows/dispatch-registry.js';
import { runEpilogue } from '../flows/epilogue.js';
import type { OrchestrationPlan, ExecutionResult, PlanRunManifest } from '../flows/types.js';
import type { ContextHealthStatus } from './context-health.js';
import type { OperatorSignals } from '../operator/operator-context-types.js';
import { loadAgentWorkflows, getWorkflowForIntent } from '../workflows/workflow-loader.js';
import type { WorkflowOverride } from '../workflows/workflow-loader.js';
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
import { detectRationalizations } from '../planning/rationalization-detector.js';
import { ImpactAnalyzer } from '../planning/impact-analyzer.js';
import type { ImpactReport } from '../planning/impact-analyzer.js';
import { collectGitEvidence } from '../planning/evidence-collector.js';
import type { EvidenceReport } from '../planning/evidence-collector.js';
import { recordPlanFeedback } from './plan-feedback-helper.js';
import {
  analyzeQualitySignals,
  captureQualitySignals,
  buildFixTrailSummary,
} from './quality-signals.js';

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
// Workflow override merge
// ---------------------------------------------------------------------------

/**
 * Merge a workflow override into an OrchestrationPlan (mutates in place).
 *
 * - Gates: each workflow gate becomes a gate on the matching plan step
 *   (matched by phase → step id prefix). Unmatched gates are appended as
 *   new gate-only steps at the end.
 * - Tools: workflow tools are merged into every step's `tools` array
 *   (deduped). This ensures the tools are available to the executor.
 */
export function applyWorkflowOverride(plan: OrchestrationPlan, override: WorkflowOverride): void {
  // Merge gates into plan steps
  for (const gate of override.gates) {
    // Try to find a step whose id starts with the gate phase
    const matchingStep = plan.steps.find((s) =>
      s.id.toLowerCase().startsWith(gate.phase.toLowerCase()),
    );
    if (matchingStep) {
      // Attach/replace gate on the step
      matchingStep.gate = {
        type: 'GATE',
        condition: gate.requirement,
        onFail: { action: 'STOP', message: `Gate check failed: ${gate.check}` },
      };
    } else {
      // No matching step — append a new gate-only step
      plan.steps.push({
        id: `workflow-gate-${gate.phase}`,
        name: `${gate.phase} gate (${override.name})`,
        tools: [],
        parallel: false,
        requires: [],
        gate: {
          type: 'GATE',
          condition: gate.requirement,
          onFail: { action: 'STOP', message: `Gate check failed: ${gate.check}` },
        },
        status: 'pending',
      });
    }
  }

  // Merge tools into plan steps (deduplicated)
  if (override.tools.length > 0) {
    for (const step of plan.steps) {
      for (const tool of override.tools) {
        if (!step.tools.includes(tool)) {
          step.tools.push(tool);
        }
      }
    }
    // Update estimated tools count
    plan.estimatedTools = plan.steps.reduce((acc, s) => acc + s.tools.length, 0);
  }

  // Set allowedTools from the merged tool set
  for (const step of plan.steps) {
    if (step.tools.length > 0) {
      step.allowedTools = [...new Set(step.tools)];
    }
  }

  // Inject workflow prompt.md content if available
  if (override.prompt) {
    plan.workflowPrompt = override.prompt;
    plan.workflowName = override.name;
  }

  // Add workflow info to warnings for visibility
  plan.warnings.push(
    `Workflow override "${override.name}" applied (${override.gates.length} gate(s), ${override.tools.length} tool(s)).`,
  );
}

// ---------------------------------------------------------------------------
// Workflow prompt preamble helper
// ---------------------------------------------------------------------------

/**
 * Prepend workflow prompt content to a task prompt when available.
 * Returns the original prompt unchanged if no workflow prompt is set.
 */
function withWorkflowPreamble(taskPrompt: string, plan: OrchestrationPlan | undefined): string {
  if (!plan?.workflowPrompt) return taskPrompt;
  const header = plan.workflowName ? `## Workflow: ${plan.workflowName}` : '## Workflow';
  return `${header}\n${plan.workflowPrompt}\n\n## Task\n${taskPrompt}`;
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
function buildDispatch(
  agentId: string,
  runtime: AgentRuntime,
  facades?: FacadeConfig[],
  activePlan?: import('../flows/dispatch-registry.js').ActivePlanRef,
) {
  if (facades && facades.length > 0) {
    return createDispatcher(agentId, facades, activePlan);
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
// Anti-rationalization helpers
// ---------------------------------------------------------------------------

/**
 * Collect all acceptance criteria from a plan's tasks.
 * Returns empty array if plan not found or has no criteria (graceful skip).
 */
function collectAcceptanceCriteria(plannerRef: AgentRuntime['planner'], planId: string): string[] {
  const plan = plannerRef.get(planId);
  if (!plan) return [];
  const criteria: string[] = [];
  for (const task of plan.tasks) {
    if (task.acceptanceCriteria) {
      criteria.push(...task.acceptanceCriteria);
    }
  }
  return criteria;
}

/**
 * Capture detected rationalization as an anti-pattern in vault.
 * Best-effort — never throws.
 */
function captureRationalizationAntiPattern(
  vaultRef: AgentRuntime['vault'],
  report: import('../planning/rationalization-detector.js').RationalizationReport,
): void {
  try {
    const patterns = report.items.map((i) => i.pattern).join(', ');
    vaultRef.add({
      id: `antipattern-rationalization-${Date.now()}`,
      title: 'Rationalization detected in completion claim',
      description:
        `Detected rationalization patterns: ${patterns}. ` +
        `Items: ${report.items.map((i) => `"${i.phrase}" (${i.pattern})`).join('; ')}.`,
      type: 'anti-pattern',
      domain: 'planning',
      severity: 'warning',
      tags: ['rationalization', 'anti-pattern', 'completion-gate'],
    });
  } catch {
    // Vault capture is best-effort
  }
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
  const { planner, brain, brainIntelligence, vault, contextHealth } = runtime;
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
        prompt: z
          .string()
          .optional()
          .describe('Natural language description of what to do (or use objective)'),
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

        // 2. Build recommendations — vault first (authoritative), brain enriches (additive)
        let recommendations: PlanRecommendation[] = [];

        // Vault always runs first — curated explicit knowledge takes precedence.
        // Prefer semantic search (vector-scored); fall back to keyword search.

        try {
          const vaultResults = await brain.intelligentSearch(prompt, {
            domain,
            limit: 5,
          });
          recommendations = mapVaultResults(vaultResults);
        } catch {
          // Semantic search unavailable — fall back to keyword search
          try {
            const vaultResults = vault.search(prompt, { domain, limit: 5 });
            recommendations = mapVaultResults(vaultResults);
          } catch {
            // Vault unavailable — brain will cover below
          }
        }

        // Brain enriches with learned usage patterns — additive, never replaces vault
        try {
          const brainResults = brainIntelligence.recommend({
            domain,
            task: prompt,
            limit: 5,
          });
          for (const r of brainResults) {
            if (!recommendations.find((rec) => rec.pattern === r.pattern)) {
              recommendations.push({
                pattern: r.pattern,
                strength: r.strength,
                source: 'brain',
                mandatory: false,
              });
            }
          }
        } catch {
          // Brain has no data yet
        }

        // 3. Build flow-engine plan — pass vault constraints for gate injection
        const vaultConstraints: VaultConstraint[] = recommendations
          .filter((r) => r.source === 'vault' && r.entryId)
          .map((r) => ({
            entryId: r.entryId!,
            title: r.pattern,
            context: r.context,
            mandatory: r.mandatory,
            entryType: r.entryType,
          }));
        const plan = await buildPlan(
          intent,
          agentId,
          projectPath,
          runtime,
          prompt,
          vaultConstraints,
        );

        // 3b. Merge workflow overrides (gates + tools) if agent has a matching workflow
        let workflowApplied: string | undefined;
        const agentDir = runtime.config.agentDir;
        if (agentDir) {
          try {
            const workflowsDir = path.join(agentDir, 'workflows');
            const agentWorkflows = loadAgentWorkflows(workflowsDir);
            const workflowOverride = getWorkflowForIntent(agentWorkflows, intent);
            if (workflowOverride) {
              applyWorkflowOverride(plan, workflowOverride);
              workflowApplied = workflowOverride.name;
            }
          } catch {
            // Workflow loading failed — plan is still valid without overrides
          }
        }

        // 4. Store in planStore
        planStore.set(plan.planId, { plan, createdAt: Date.now() });

        // 5. Also create a planner plan for lifecycle tracking (backward compat)
        const decisions = recommendations.map((r) => {
          const label = r.source === 'vault' ? 'Vault pattern' : 'Brain pattern';
          const base = `${label}: ${r.pattern} (strength: ${r.strength.toFixed(1)})`;
          return r.entryId ? `${base} [entryId:${r.entryId}]` : base;
        });
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

        const planObjective =
          ((params as Record<string, unknown>)._enrichedObjective as string | undefined) ?? prompt;

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
            ...(plan.recommendations ? { vaultConstraints: plan.recommendations } : {}),
            ...(workflowApplied ? { workflowOverride: workflowApplied } : {}),
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
    },

    // ─── orchestrate_complete ─────────────────────────────────────
    {
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
        sessionId: z.string().describe('ID of the brain session to end'),
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
          .default({})
          .describe(
            'Your silent assessment of the operator this session. Fill what you observed, empty arrays for what you did not. Never announce this to the operator.',
          ),
      }),
      handler: async (params) => {
        const planId = params.planId as string | undefined;
        const sessionId = params.sessionId as string;
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

        // End brain session — runs regardless of plan existence
        const fixTrail = evidenceReport ? buildFixTrailSummary(evidenceReport) : undefined;
        const session = brainIntelligence.lifecycle({
          action: 'end',
          sessionId,
          planId,
          planOutcome: outcome,
          toolsUsed,
          filesModified,
          ...(fixTrail ? { context: `Fix trail: ${fixTrail}` } : {}),
        });

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
              captureQualitySignals(
                qualityAnalysis,
                vault,
                brain,
                planId ?? `direct-${Date.now()}`,
              );
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

        return {
          plan: completedPlan,
          session,
          extraction,
          epilogue: epilogueResult,
          ...(impactReport ? { impactAnalysis: impactReport } : {}),
          evidenceReport,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
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
        projectPath: z
          .string()
          .optional()
          .default('.')
          .describe('Project root path for git detection'),
        milestone: z.number().optional().describe('GitHub milestone number to assign issues to'),
        labels: z.array(z.string()).optional().describe('Labels to apply to created issues'),
        linkToIssue: z
          .number()
          .optional()
          .describe('Existing issue number to link plan to instead of creating new issues'),
        dryRun: z
          .boolean()
          .optional()
          .default(false)
          .describe('Preview what would be created without actually creating issues'),
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
          throw new Error(
            'Plan has no tasks — run plan_split first to define tasks before projecting to GitHub',
          );
        }

        // 2. Detect GitHub context
        const ctx = await detectGitHubContext(projectPath);
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

          const updated = await updateGitHubIssueBody(ctx.repo, linkToIssue, body);
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
        const skipped: Array<{
          taskId: string;
          title: string;
          existingIssue: number;
          reason: string;
        }> = [];
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

          const issueNumber = await createGitHubIssue(ctx.repo, task.title, body, {
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

    // ─── orchestrate_rerun_step ──────────────────────────────────────
    {
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
    },
  ];
}
