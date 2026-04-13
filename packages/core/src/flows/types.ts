/**
 * Flow engine types — YAML-driven workflow orchestration.
 *
 * Flow → Steps → Chains (ops) → Gates → Execution
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Gate types
// ---------------------------------------------------------------------------

export const gateActionSchema = z.object({
  action: z.enum(['STOP', 'BRANCH', 'CONTINUE']),
  goto: z.string().optional(),
  message: z.string().optional(),
});

export const gateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('GATE'),
    condition: z.string(),
    'on-false': gateActionSchema,
  }),
  z.object({
    type: z.literal('SCORE'),
    min: z.number(),
    'grade-thresholds': z.record(z.string(), z.number()).optional(),
    'on-false': gateActionSchema,
  }),
  z.object({
    type: z.literal('CHECKPOINT'),
    condition: z.string().optional(),
    save: z.array(z.string()).optional(),
    'on-false': gateActionSchema,
  }),
  z.object({
    type: z.literal('BRANCH'),
    'on-false': gateActionSchema.optional(),
  }),
  z.object({
    type: z.literal('VERIFY'),
    'on-false': gateActionSchema.optional(),
  }),
]);

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export const flowStepSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  chains: z.array(z.string()).optional(),
  parallel: z.boolean().optional(),
  output: z.array(z.string()).optional(),
  gate: gateSchema.optional(),
  /** Capability IDs required by this step (v2) */
  needs: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Flow (root YAML structure)
// ---------------------------------------------------------------------------

export const flowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  triggers: z.object({
    modes: z.array(z.string()),
    contexts: z.array(z.string()).optional(),
    'min-confidence': z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  }),
  steps: z.array(flowStepSchema),
  /**
   * Scoring weights declared per step — parsed but not yet computed by the executor.
   * Weighted-sum formula is not implemented; gate thresholds in steps are the active enforcement.
   * @see https://github.com/adrozdenko/soleri/issues/632
   */
  scoring: z
    .object({
      weights: z.record(z.string(), z.number()),
      formula: z.string().optional(),
    })
    .optional(),
  'on-error': z
    .object({
      default: z
        .object({
          action: z.string(),
          message: z.string().optional(),
          recovery: z.string().optional(),
        })
        .optional(),
      'max-retries': z.number().optional(),
      escalation: z
        .object({
          action: z.string(),
          message: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  /** Strategy when a step's capability requirement is not satisfied */
  'on-missing-capability': z
    .object({
      default: z.enum(['skip-with-warning', 'fail', 'ask-user']).default('skip-with-warning'),
      blocking: z.array(z.string()).optional().default([]),
    })
    .optional(),
  metadata: z
    .object({
      author: z.string().optional(),
      domain: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  /** Context-sensitive overrides — loaded from the flow YAML overrides: section */
  overrides: z
    .array(
      z.object({
        match: z.string(),
        matchFlags: z.string().optional(),
        context: z.string(),
        chainOverrides: z.record(z.string(), z.string()).optional(),
        injectBefore: z.record(z.string(), z.array(z.string())).optional(),
        injectAfter: z.record(z.string(), z.array(z.string())).optional(),
        skipSteps: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export type Flow = z.infer<typeof flowSchema>;
export type FlowStep = z.infer<typeof flowStepSchema>;
export type Gate = z.infer<typeof gateSchema>;
export type GateAction = z.infer<typeof gateActionSchema>;

export interface FlowContextOverride {
  /** Regex pattern source string (without slashes/flags), e.g. "\\b(button|icon)\\b" */
  match: string;
  /** Case-insensitive flag — default true */
  matchFlags?: string;
  /** Context label applied when match succeeds */
  context: string;
  /** Chain substitutions: original chain ID → replacement chain ID */
  chainOverrides?: Record<string, string>;
  /** Chains to inject before a step ID */
  injectBefore?: Record<string, string[]>;
  /** Chains to inject after a step ID */
  injectAfter?: Record<string, string[]>;
  /** Step IDs to skip in this context */
  skipSteps?: string[];
}

export interface FlowDefinition extends Flow {
  /** Context-sensitive overrides — loaded from flow YAML overrides: section */
  overrides?: FlowContextOverride[];
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

export type ProbeName = 'vault' | 'brain' | 'sessionStore' | 'projectRules' | 'active' | 'test';

export interface ProbeResults {
  vault: boolean;
  brain: boolean;
  sessionStore: boolean;
  projectRules: boolean;
  active: boolean;
  test: boolean;
}

// ---------------------------------------------------------------------------
// Plan (built from flow + probes)
// ---------------------------------------------------------------------------

export interface PlanStep {
  id: string;
  name: string;
  tools: string[];
  parallel: boolean;
  requires: ProbeName[];
  allowedTools?: string[];
  gate?: {
    type: string;
    condition?: string;
    min?: number;
    onFail?: { action: string; goto?: string; message?: string };
  };
  /** Output keys this step produces — merged into stepContext for subsequent steps. */
  output?: string[];
  status:
    | 'pending'
    | 'running'
    | 'passed'
    | 'failed'
    | 'skipped'
    | 'gate-paused'
    | 'stale'
    | 'rerun';
}

export interface SkippedStep {
  id: string;
  name: string;
  reason: string;
}

/**
 * A vault knowledge entry surfaced as a planning constraint.
 * Replaces gate-step injection — constraints are carried as metadata
 * so the executor can apply judgment rather than mechanical evaluation.
 */
export interface VaultRecommendation {
  entryId: string;
  title: string;
  context?: string;
  example?: string;
  mandatory: boolean;
  entryType?: 'pattern' | 'anti-pattern' | 'rule' | 'playbook';
  source: 'vault';
  strength: number;
}

export interface ToolDeviation {
  stepId: string;
  expectedTools: string[];
  actualTool: string;
  timestamp: string;
}

export interface OrchestrationPlan {
  planId: string;
  intent: string;
  flowId: string;
  steps: PlanStep[];
  skipped: SkippedStep[];
  epilogue: string[];
  warnings: string[];
  summary: string;
  estimatedTools: number;
  context: OrchestrationContext;
  deviations?: ToolDeviation[];
  /** Workflow prompt.md content injected by applyWorkflowOverride */
  workflowPrompt?: string;
  /** Name of the matched workflow */
  workflowName?: string;
  /** True when a blocking capability is unavailable — plan cannot run */
  blocked?: boolean;
  /** Vault knowledge constraints relevant to this plan — executor reads these as context */
  recommendations?: VaultRecommendation[];
}

export interface OrchestrationContext {
  intent: string;
  probes: ProbeResults;
  entities: { components: string[]; actions: string[]; technologies?: string[] };
  projectPath: string;
}

// ---------------------------------------------------------------------------
// Step persistence (incremental correction protocol)
// ---------------------------------------------------------------------------

export type StepPersistenceStatus = 'completed' | 'stale' | 'invalidated' | 'rerun';

export interface StepState {
  status: StepPersistenceStatus;
  output: unknown;
  timestamp: string;
  rerunCount: number;
  rerunReason?: string;
}

export interface PlanRunManifest {
  planId: string;
  steps: Record<string, StepState>;
  lastRun: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface StepResult {
  stepId: string;
  status: 'passed' | 'failed' | 'skipped' | 'gate-paused';
  toolResults: Record<string, { tool: string; status: string; data?: unknown; error?: string }>;
  durationMs: number;
  gateResult?: { action: string; message?: string };
}

export interface ExecutionResult {
  planId: string;
  status: 'completed' | 'partial' | 'failed';
  stepsCompleted: number;
  totalSteps: number;
  toolsCalled: string[];
  durationMs: number;
  stepResults: StepResult[];
}

// ---------------------------------------------------------------------------
// Gate verdict
// ---------------------------------------------------------------------------

export interface GateVerdict {
  passed: boolean;
  action: 'CONTINUE' | 'STOP' | 'BRANCH';
  goto?: string;
  message?: string;
  score?: number;
}
