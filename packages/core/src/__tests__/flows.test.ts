/**
 * Flow engine tests — loader, probes, plan builder, gate evaluator, executor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentRuntime } from '../runtime/runtime.js';
import type { AgentRuntime } from '../runtime/types.js';
import { loadFlowById, loadAllFlows } from '../flows/loader.js';
import { runProbes } from '../flows/probes.js';
import {
  INTENT_TO_FLOW,
  chainToToolName,
  chainToRequires,
  pruneSteps,
} from '../flows/plan-builder.js';
import { evaluateCondition, extractScore, resolvePath } from '../flows/gate-evaluator.js';
import { FlowExecutor } from '../flows/executor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FLOWS_DIR = join(__dirname, '..', '..', 'data', 'flows');

// ---------------------------------------------------------------------------
// Flow Loader
// ---------------------------------------------------------------------------

describe('Flow Loader', () => {
  it('should load all 8 flow files', () => {
    const flows = loadAllFlows(FLOWS_DIR);
    expect(flows.length).toBe(8);
  });

  it('should load BUILD-flow by ID', () => {
    const flow = loadFlowById('BUILD-flow', FLOWS_DIR);
    expect(flow).not.toBeNull();
    expect(flow!.id).toBe('BUILD-flow');
    expect(flow!.steps.length).toBeGreaterThan(0);
  });

  it('should load FIX-flow by ID', () => {
    const flow = loadFlowById('FIX-flow', FLOWS_DIR);
    expect(flow).not.toBeNull();
    expect(flow!.triggers.modes).toContain('FIX');
  });

  it('should return null for unknown flow ID', () => {
    const flow = loadFlowById('NONEXISTENT-flow', FLOWS_DIR);
    expect(flow).toBeNull();
  });

  it('each flow should have valid structure', () => {
    const flows = loadAllFlows(FLOWS_DIR);
    for (const flow of flows) {
      expect(flow.id).toBeTruthy();
      expect(flow.triggers.modes.length).toBeGreaterThan(0);
      expect(flow.steps.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Intent Mapping
// ---------------------------------------------------------------------------

describe('Intent to Flow mapping', () => {
  it('should map BUILD to BUILD-flow', () => {
    expect(INTENT_TO_FLOW.BUILD).toBe('BUILD-flow');
  });

  it('should map FIX to FIX-flow', () => {
    expect(INTENT_TO_FLOW.FIX).toBe('FIX-flow');
  });

  it('should map DELIVER to DELIVER-flow', () => {
    expect(INTENT_TO_FLOW.DELIVER).toBe('DELIVER-flow');
  });

  it('should have all 8 flows mapped', () => {
    const flowIds = new Set(Object.values(INTENT_TO_FLOW));
    expect(flowIds.size).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// Chain to Tool Name
// ---------------------------------------------------------------------------

describe('chainToToolName', () => {
  it('should prefix with agentId and convert hyphens', () => {
    expect(chainToToolName('vault-search', 'myagent')).toBe('myagent_vault_search');
  });

  it('should handle single-word chains', () => {
    expect(chainToToolName('validate', 'test')).toBe('test_validate');
  });
});

describe('chainToRequires', () => {
  it('should detect vault requirement', () => {
    expect(chainToRequires('vault-search')).toBe('vault');
  });

  it('should detect brain requirement', () => {
    expect(chainToRequires('brain-recommend')).toBe('brain');
  });

  it('should detect designSystem requirement', () => {
    expect(chainToRequires('component-search')).toBe('designSystem');
  });

  it('should return undefined for recommendation chains', () => {
    expect(chainToRequires('recommend-style')).toBeUndefined();
    expect(chainToRequires('get-stack-guidelines')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Step Pruning
// ---------------------------------------------------------------------------

describe('pruneSteps', () => {
  it('should keep steps with no requirements', () => {
    const steps = [
      {
        id: 's1',
        name: 'Step 1',
        tools: ['t1'],
        parallel: false,
        requires: [],
        status: 'pending' as const,
      },
    ];
    const probes = {
      vault: false,
      brain: false,
      designSystem: false,
      sessionStore: false,
      projectRules: false,
      active: true,
    };
    const { kept, skipped } = pruneSteps(steps, probes);
    expect(kept.length).toBe(1);
    expect(skipped.length).toBe(0);
  });

  it('should skip steps with unmet requirements', () => {
    const steps = [
      {
        id: 's1',
        name: 'Vault Step',
        tools: ['t1'],
        parallel: false,
        requires: ['vault' as const],
        status: 'pending' as const,
      },
      {
        id: 's2',
        name: 'No Req',
        tools: ['t2'],
        parallel: false,
        requires: [],
        status: 'pending' as const,
      },
    ];
    const probes = {
      vault: false,
      brain: false,
      designSystem: false,
      sessionStore: false,
      projectRules: false,
      active: true,
    };
    const { kept, skipped } = pruneSteps(steps, probes);
    expect(kept.length).toBe(1);
    expect(kept[0].id).toBe('s2');
    expect(skipped.length).toBe(1);
    expect(skipped[0].reason).toContain('vault');
  });

  it('should keep steps when requirements are met', () => {
    const steps = [
      {
        id: 's1',
        name: 'Vault Step',
        tools: ['t1'],
        parallel: false,
        requires: ['vault' as const],
        status: 'pending' as const,
      },
    ];
    const probes = {
      vault: true,
      brain: false,
      designSystem: false,
      sessionStore: false,
      projectRules: false,
      active: true,
    };
    const { kept } = pruneSteps(steps, probes);
    expect(kept.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gate Evaluator
// ---------------------------------------------------------------------------

describe('evaluateCondition', () => {
  it('should evaluate equality', () => {
    expect(evaluateCondition('count == 0', { count: 0 })).toBe(true);
    expect(evaluateCondition('count == 0', { count: 5 })).toBe(false);
  });

  it('should evaluate inequality', () => {
    expect(evaluateCondition('count != 0', { count: 5 })).toBe(true);
  });

  it('should evaluate greater than', () => {
    expect(evaluateCondition('score >= 80', { score: 90 })).toBe(true);
    expect(evaluateCondition('score >= 80', { score: 70 })).toBe(false);
  });

  it('should evaluate boolean', () => {
    expect(evaluateCondition('pass == true', { pass: true })).toBe(true);
  });

  it('should evaluate truthy path', () => {
    expect(evaluateCondition('result', { result: 'something' })).toBe(true);
    expect(evaluateCondition('result', { result: '' })).toBe(false);
  });
});

describe('extractScore', () => {
  it('should extract score from data.score', () => {
    expect(extractScore({ score: 85 })).toBe(85);
  });

  it('should extract from nested data', () => {
    expect(extractScore({ validationScore: 92 })).toBe(92);
  });

  it('should return 0 if no score found', () => {
    expect(extractScore({ unrelated: 'data' })).toBe(0);
  });
});

describe('resolvePath', () => {
  it('should resolve simple path', () => {
    expect(resolvePath({ count: 5 }, 'count')).toBe(5);
  });

  it('should resolve dotted path', () => {
    expect(resolvePath({ a: { b: 42 } }, 'a.b')).toBe(42);
  });

  it('should return undefined for missing path', () => {
    expect(resolvePath({ a: 1 }, 'b')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

describe('FlowExecutor', () => {
  it('should execute a simple plan', async () => {
    const dispatch = async (tool: string, _params: Record<string, unknown>) => ({
      tool,
      status: 'ok',
      data: { result: true },
    });

    const executor = new FlowExecutor(dispatch);
    const plan = {
      planId: 'test-plan',
      intent: 'BUILD',
      flowId: 'BUILD-flow',
      steps: [
        {
          id: 's1',
          name: 'Step 1',
          tools: ['tool1'],
          parallel: false,
          requires: [],
          status: 'pending' as const,
        },
        {
          id: 's2',
          name: 'Step 2',
          tools: ['tool2'],
          parallel: false,
          requires: [],
          status: 'pending' as const,
        },
      ],
      skipped: [],
      epilogue: [],
      warnings: [],
      summary: 'Test plan',
      estimatedTools: 2,
      context: {
        intent: 'BUILD',
        probes: {
          vault: true,
          brain: false,
          designSystem: false,
          sessionStore: true,
          projectRules: false,
          active: true,
        },
        entities: { components: [], actions: [] },
        projectPath: '/test',
      },
    };

    const result = await executor.execute(plan);
    expect(result.status).toBe('completed');
    expect(result.stepsCompleted).toBe(2);
    expect(result.toolsCalled).toContain('tool1');
    expect(result.toolsCalled).toContain('tool2');
  });

  it('should handle STOP gate', async () => {
    const dispatch = async (tool: string) => ({
      tool,
      status: 'ok',
      data: { pass: false },
    });

    const executor = new FlowExecutor(dispatch);
    const plan = {
      planId: 'test-stop',
      intent: 'DELIVER',
      flowId: 'DELIVER-flow',
      steps: [
        {
          id: 's1',
          name: 'Gate Step',
          tools: ['check'],
          parallel: false,
          requires: [],
          gate: {
            type: 'GATE',
            condition: 'pass == true',
            onFail: { action: 'STOP', message: 'Failed' },
          },
          status: 'pending' as const,
        },
        {
          id: 's2',
          name: 'After Gate',
          tools: ['next'],
          parallel: false,
          requires: [],
          status: 'pending' as const,
        },
      ],
      skipped: [],
      epilogue: [],
      warnings: [],
      summary: 'Test stop',
      estimatedTools: 2,
      context: {
        intent: 'DELIVER',
        probes: {
          vault: true,
          brain: false,
          designSystem: false,
          sessionStore: true,
          projectRules: false,
          active: true,
        },
        entities: { components: [], actions: [] },
        projectPath: '/test',
      },
    };

    const result = await executor.execute(plan);
    expect(result.stepsCompleted).toBeLessThan(2);
  });

  it('should execute parallel steps', async () => {
    const callOrder: string[] = [];
    const dispatch = async (tool: string) => {
      callOrder.push(tool);
      return { tool, status: 'ok', data: {} };
    };

    const executor = new FlowExecutor(dispatch);
    const plan = {
      planId: 'test-parallel',
      intent: 'BUILD',
      flowId: 'BUILD-flow',
      steps: [
        {
          id: 's1',
          name: 'Parallel',
          tools: ['a', 'b', 'c'],
          parallel: true,
          requires: [],
          status: 'pending' as const,
        },
      ],
      skipped: [],
      epilogue: [],
      warnings: [],
      summary: 'Test parallel',
      estimatedTools: 3,
      context: {
        intent: 'BUILD',
        probes: {
          vault: true,
          brain: false,
          designSystem: false,
          sessionStore: true,
          projectRules: false,
          active: true,
        },
        entities: { components: [], actions: [] },
        projectPath: '/test',
      },
    };

    const result = await executor.execute(plan);
    expect(result.toolsCalled.length).toBe(3);
    expect(result.toolsCalled).toContain('a');
    expect(result.toolsCalled).toContain('b');
    expect(result.toolsCalled).toContain('c');
  });
});

// ---------------------------------------------------------------------------
// Context Router
// ---------------------------------------------------------------------------

import { detectContext, applyContextOverrides } from '../flows/context-router.js';
import { flowStepsToPlanSteps } from '../flows/plan-builder.js';

describe('detectContext', () => {
  const emptyEntities = { components: [], actions: [] };

  it('should find "small-component" context for button prompts', () => {
    const contexts = detectContext('Build a submit button', emptyEntities);
    expect(contexts).toContain('small-component');
  });

  it('should find "large-component" context for dashboard prompts', () => {
    const contexts = detectContext('Create a dashboard layout', emptyEntities);
    expect(contexts).toContain('large-component');
  });

  it('should find "form-component" context for input prompts', () => {
    const contexts = detectContext('Build a select dropdown input', emptyEntities);
    expect(contexts).toContain('form-component');
  });

  it('should find "container-component" context for modal prompts', () => {
    const contexts = detectContext('Build a confirmation dialog', emptyEntities);
    expect(contexts).toContain('container-component');
  });

  it('should find "design-fix" context for styling fix prompts', () => {
    const contexts = detectContext('Fix the color tokens in the header', emptyEntities);
    expect(contexts).toContain('design-fix');
  });

  it('should find "a11y-fix" context for accessibility fix prompts', () => {
    const contexts = detectContext('Fix accessibility issues with ARIA labels', emptyEntities);
    expect(contexts).toContain('a11y-fix');
  });

  it('should find "pr-review" context for pull request prompts', () => {
    const contexts = detectContext('Review this PR diff', emptyEntities);
    expect(contexts).toContain('pr-review');
  });

  it('should find "architecture-review" context for architecture prompts', () => {
    const contexts = detectContext('Review the import structure', emptyEntities);
    expect(contexts).toContain('architecture-review');
  });

  it('should return empty array for generic prompts', () => {
    const contexts = detectContext('Do something useful', emptyEntities);
    expect(contexts).toHaveLength(0);
  });

  it('should detect multiple contexts when prompt matches several', () => {
    const contexts = detectContext(
      'Build a form with input fields and a submit button',
      emptyEntities,
    );
    expect(contexts).toContain('small-component');
    expect(contexts).toContain('form-component');
  });

  it('should also match entity content', () => {
    const contexts = detectContext('Build this', { components: ['Button'], actions: [] });
    expect(contexts).toContain('small-component');
  });
});

describe('applyContextOverrides', () => {
  const agentId = 'test';

  function loadBuildSteps(): PlanStep[] {
    const flow = loadFlowById('BUILD-flow', FLOWS_DIR);
    return flowStepsToPlanSteps(flow!, agentId);
  }

  function loadFixSteps(): PlanStep[] {
    const flow = loadFlowById('FIX-flow', FLOWS_DIR);
    return flowStepsToPlanSteps(flow!, agentId);
  }

  it('should skip get-architecture for small-component context', () => {
    const steps = loadBuildSteps();
    const result = applyContextOverrides(steps, ['small-component'], 'BUILD-flow', agentId);
    const ids = result.map((s) => s.id);
    expect(ids).not.toContain('get-architecture');
  });

  it('should inject button-semantics-check before validate for small-component', () => {
    const steps = loadBuildSteps();
    const result = applyContextOverrides(steps, ['small-component'], 'BUILD-flow', agentId);
    const ids = result.map((s) => s.id);
    expect(ids).toContain('ctx-before-validate');
    const injected = result.find((s) => s.id === 'ctx-before-validate');
    expect(injected!.tools).toContain('test_button_semantics_check');
  });

  it('should inject responsive-patterns before validate for large-component', () => {
    const steps = loadBuildSteps();
    const result = applyContextOverrides(steps, ['large-component'], 'BUILD-flow', agentId);
    const ids = result.map((s) => s.id);
    const beforeIdx = ids.indexOf('ctx-before-validate');
    const validateIdx = ids.indexOf('validate');
    expect(beforeIdx).toBeGreaterThan(-1);
    expect(beforeIdx).toBeLessThan(validateIdx);
    const injected = result.find((s) => s.id === 'ctx-before-validate');
    expect(injected!.tools).toContain('test_responsive_patterns');
  });

  it('should inject performance-check after validate for large-component', () => {
    const steps = loadBuildSteps();
    const result = applyContextOverrides(steps, ['large-component'], 'BUILD-flow', agentId);
    const ids = result.map((s) => s.id);
    const afterIdx = ids.indexOf('ctx-after-validate');
    const validateIdx = ids.indexOf('validate');
    expect(afterIdx).toBeGreaterThan(validateIdx);
    const injected = result.find((s) => s.id === 'ctx-after-validate');
    expect(injected!.tools).toContain('test_performance_check');
  });

  it('should inject contrast-check and token-validation for design-fix context', () => {
    const steps = loadFixSteps();
    const result = applyContextOverrides(steps, ['design-fix'], 'FIX-flow', agentId);
    const injected = result.find((s) => s.id === 'ctx-before-validate');
    expect(injected).toBeDefined();
    expect(injected!.tools).toContain('test_contrast_check');
    expect(injected!.tools).toContain('test_token_validation');
  });

  it('should return steps unchanged for unknown flow', () => {
    const steps = loadBuildSteps();
    const result = applyContextOverrides(steps, ['small-component'], 'UNKNOWN-flow', agentId);
    expect(result).toEqual(steps);
  });

  it('should return steps unchanged for empty contexts', () => {
    const steps = loadBuildSteps();
    const result = applyContextOverrides(steps, [], 'BUILD-flow', agentId);
    expect(result).toEqual(steps);
  });
});

// ---------------------------------------------------------------------------
// Context Probes
// ---------------------------------------------------------------------------

describe('Context Probes', () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = createAgentRuntime({ agentId: 'test-probes', vaultPath: ':memory:' });
  });

  afterEach(() => {
    runtime.close();
  });

  it('should return probe results', async () => {
    const probes = await runProbes(runtime, '/tmp/nonexistent');
    expect(typeof probes.vault).toBe('boolean');
    expect(typeof probes.brain).toBe('boolean');
    expect(typeof probes.active).toBe('boolean');
    expect(probes.active).toBe(true);
  });

  it('should detect vault as available', async () => {
    const probes = await runProbes(runtime, '/tmp/nonexistent');
    expect(probes.vault).toBe(true); // :memory: vault is connected
  });
});
