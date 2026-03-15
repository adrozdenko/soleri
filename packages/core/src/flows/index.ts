/**
 * Flow engine — YAML-driven workflow orchestration.
 */

// Types
export type {
  Flow,
  FlowStep,
  Gate,
  GateAction,
  ProbeName,
  ProbeResults,
  PlanStep,
  SkippedStep,
  OrchestrationPlan,
  OrchestrationContext,
  StepResult,
  ExecutionResult,
  GateVerdict,
} from './types.js';

// Loader
export { loadFlowById, loadAllFlows, parseSimpleYaml } from './loader.js';

// Probes
export { runProbes } from './probes.js';

// Plan builder
export {
  INTENT_TO_FLOW,
  chainToToolName,
  chainToRequires,
  flowStepsToPlanSteps,
  pruneSteps,
  buildPlan,
} from './plan-builder.js';

// Context router
export { detectContext, applyContextOverrides, getFlowOverrides } from './context-router.js';
export type { ContextOverride } from './context-router.js';

// Gate evaluator
export { evaluateGate, evaluateCondition, extractScore, resolvePath } from './gate-evaluator.js';

// Executor
export { FlowExecutor } from './executor.js';

// Dispatch registry
export { createDispatcher } from './dispatch-registry.js';

// Epilogue
export { runEpilogue } from './epilogue.js';
