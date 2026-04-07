import type { FacadeConfig } from '../facades/types.js';
import { createDispatcher } from '../flows/dispatch-registry.js';
import type { ActivePlanRef } from '../flows/dispatch-registry.js';
import type { ExecutionResult, OrchestrationPlan } from '../flows/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { RationalizationReport } from '../planning/rationalization-detector.js';
import type { ContextHealthStatus } from './context-health.js';
import type { AgentRuntime } from './types.js';
import type { WorkflowOverride } from '../workflows/workflow-loader.js';

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

// ---------------------------------------------------------------------------
// Intent detection — keyword-based mapping from prompt to intent
// ---------------------------------------------------------------------------

// Ordered from most-specific to least-specific.
// BUILD is the fallback — its keywords ("new", "add", "create") appear in nearly
// every prompt, so it must never be an early match.
const INTENT_KEYWORDS: [RegExp, string][] = [
  [/\b(deliver|deploy|ship|release|publish)\b/i, 'DELIVER'],
  [/\b(fix|bug|broken|error|crash|issue)\b/i, 'FIX'],
  [/\b(review|audit|inspect)\b/i, 'REVIEW'],
  [/\b(plan|architect|architecture|roadmap|design-system)\b/i, 'PLAN'],
  [/\b(enhance|improve|refactor|optimize)\b/i, 'ENHANCE'],
  [/\b(explore|research|investigate|spike)\b/i, 'EXPLORE'],
  [/\b(design|palette|theme|color|typography)\b/i, 'DESIGN'],
  [/\b(build|create|add|new|implement|scaffold)\b/i, 'BUILD'],
];

export function detectIntent(prompt: string): string {
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
export function withWorkflowPreamble(
  taskPrompt: string,
  plan: OrchestrationPlan | undefined,
): string {
  if (!plan?.workflowPrompt) return taskPrompt;
  const header = plan.workflowName ? `## Workflow: ${plan.workflowName}` : '## Workflow';
  return `${header}\n${plan.workflowPrompt}\n\n## Task\n${taskPrompt}`;
}

// ---------------------------------------------------------------------------
// In-memory plan store
// ---------------------------------------------------------------------------

export interface PlanEntry {
  plan: OrchestrationPlan;
  executionResult?: ExecutionResult;
  createdAt: number;
}

export const planStore = new Map<string, PlanEntry>();

// ---------------------------------------------------------------------------
// Helper: create a runtime-backed dispatcher
// ---------------------------------------------------------------------------

/**
 * Build a dispatch function that routes tool names to runtime modules.
 * If facades are provided, uses the full dispatch registry.
 * Otherwise, falls back to a simple runtime-based dispatcher.
 */
export function buildDispatch(
  agentId: string,
  runtime: AgentRuntime,
  facades?: FacadeConfig[],
  activePlan?: ActivePlanRef,
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
export function buildHealthWarning(
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
export function collectAcceptanceCriteria(
  plannerRef: AgentRuntime['planner'],
  planId: string,
): string[] {
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
export function captureRationalizationAntiPattern(
  vaultRef: AgentRuntime['vault'],
  report: RationalizationReport,
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
