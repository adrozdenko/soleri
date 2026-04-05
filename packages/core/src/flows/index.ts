/**
 * Flow engine — YAML-driven workflow orchestration.
 */

// Types
export type {
  Flow,
  FlowStep,
  ProbeName,
  ProbeResults,
  PlanStep,
  SkippedStep,
  OrchestrationPlan,
  OrchestrationContext,
  StepResult,
  ExecutionResult,
  GateVerdict,
  ToolDeviation,
} from './types.js';

// Loader
export { loadFlowById, loadAllFlows, parseSimpleYaml } from './loader.js';

// Probes
export { runProbes } from './probes.js';

// Plan builder
export {
  resolveFlowByIntent,
  chainToToolName,
  chainToRequires,
  flowStepsToPlanSteps,
  pruneSteps,
  buildPlan,
} from './plan-builder.js';

// Context router
export { detectContext, applyContextOverrides, getFlowOverrides } from './context-router.js';
// ContextOverride is intentionally unexported — internal use only

// Gate evaluator
export { evaluateGate, evaluateCondition, extractScore, resolvePath } from './gate-evaluator.js';

// Executor
export { FlowExecutor } from './executor.js';

// Dispatch registry
export { createDispatcher } from './dispatch-registry.js';
export type { ActivePlanRef } from './dispatch-registry.js';

// Epilogue
export { runEpilogue } from './epilogue.js';
