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

import type { FacadeConfig, OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import {
  createOrchestrateExecuteOp,
  createOrchestrateCompleteOp,
  createOrchestrateStatusOp,
  createOrchestrateQuickCaptureOp,
  createOrchestrateRerunStepOp,
} from './orchestrate-execution-ops.js';
import {
  createOrchestratePlanOp,
  createOrchestrateProjectToGitHubOp,
} from './orchestrate-planning-ops.js';

export { mapVaultResults, detectIntent, applyWorkflowOverride } from './orchestrate-shared.js';

/**
 * Create the orchestration operations for an agent runtime.
 * Optionally accepts facades for full dispatch capability.
 */
export function createOrchestrateOps(
  runtime: AgentRuntime,
  facades?: FacadeConfig[],
): OpDefinition[] {
  const { planner, brain, brainIntelligence, vault, contextHealth } = runtime;
  const agentId = runtime.config.agentId;

  const context = {
    runtime,
    planner,
    brain,
    brainIntelligence,
    vault,
    contextHealth,
    agentId,
    facades,
  } as const;

  return [
    createOrchestratePlanOp(context),
    createOrchestrateExecuteOp(context),
    createOrchestrateCompleteOp(context),
    createOrchestrateStatusOp(context),
    createOrchestrateQuickCaptureOp(brainIntelligence),
    createOrchestrateProjectToGitHubOp(planner),
    createOrchestrateRerunStepOp(),
  ];
}
