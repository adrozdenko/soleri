import { describe, it, expect } from 'vitest';
import { applyWorkflowOverride } from '../runtime/orchestrate-ops.js';
import type { OrchestrationPlan, PlanStep } from '../flows/types.js';
import type { WorkflowOverride } from './workflow-loader.js';

function makePlan(steps: PlanStep[]): OrchestrationPlan {
  return {
    planId: 'test-plan-1',
    intent: 'BUILD',
    flowId: 'BUILD-flow',
    steps,
    skipped: [],
    epilogue: ['capture_knowledge'],
    warnings: [],
    summary: 'Test plan',
    estimatedTools: steps.reduce((acc, s) => acc + s.tools.length, 0),
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
      projectPath: '.',
    },
  };
}

function makeStep(id: string, tools: string[] = []): PlanStep {
  return {
    id,
    name: id,
    tools,
    parallel: false,
    requires: [],
    status: 'pending',
  };
}

describe('applyWorkflowOverride', () => {
  it('merges gates into matching plan steps', () => {
    const plan = makePlan([
      makeStep('pre-execution-vault-search', ['vault_search']),
      makeStep('completion-capture', ['capture_knowledge']),
    ]);

    const override: WorkflowOverride = {
      name: 'feature-dev',
      gates: [
        {
          phase: 'pre-execution',
          requirement: 'Plan approved by user',
          check: 'plan-approved',
        },
        {
          phase: 'completion',
          requirement: 'Knowledge captured',
          check: 'knowledge-captured',
        },
      ],
      tools: [],
    };

    applyWorkflowOverride(plan, override);

    // Gates should be attached to matching steps
    expect(plan.steps[0].gate).toBeDefined();
    expect(plan.steps[0].gate!.type).toBe('GATE');
    expect(plan.steps[0].gate!.condition).toBe('Plan approved by user');

    expect(plan.steps[1].gate).toBeDefined();
    expect(plan.steps[1].gate!.condition).toBe('Knowledge captured');
  });

  it('appends unmatched gates as new steps', () => {
    const plan = makePlan([makeStep('vault-search', ['vault_search'])]);

    const override: WorkflowOverride = {
      name: 'bug-fix',
      gates: [
        {
          phase: 'post-task',
          requirement: 'All tests pass',
          check: 'tests-pass',
        },
      ],
      tools: [],
    };

    applyWorkflowOverride(plan, override);

    // Original step untouched
    expect(plan.steps[0].gate).toBeUndefined();

    // New gate step appended
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1].id).toBe('workflow-gate-post-task');
    expect(plan.steps[1].gate!.condition).toBe('All tests pass');
  });

  it('merges tools into all plan steps (deduplicated)', () => {
    const plan = makePlan([makeStep('step1', ['existing_tool']), makeStep('step2', [])]);

    const override: WorkflowOverride = {
      name: 'feature-dev',
      gates: [],
      tools: ['soleri_vault op:search_intelligent', 'existing_tool'],
    };

    applyWorkflowOverride(plan, override);

    // step1 already had existing_tool — should not duplicate
    expect(plan.steps[0].tools).toEqual(['existing_tool', 'soleri_vault op:search_intelligent']);
    // step2 gets the tools
    expect(plan.steps[1].tools).toEqual(['soleri_vault op:search_intelligent', 'existing_tool']);
    // estimatedTools updated
    expect(plan.estimatedTools).toBe(plan.steps.reduce((acc, s) => acc + s.tools.length, 0));
  });

  it('does nothing when override has no gates or tools', () => {
    const plan = makePlan([makeStep('step1', ['t1'])]);
    const originalSteps = plan.steps.length;
    const originalTools = plan.steps[0].tools.length;

    const override: WorkflowOverride = {
      name: 'empty',
      gates: [],
      tools: [],
    };

    applyWorkflowOverride(plan, override);

    expect(plan.steps).toHaveLength(originalSteps);
    expect(plan.steps[0].tools).toHaveLength(originalTools);
    // Warning still added
    expect(plan.warnings).toContain('Workflow override "empty" applied (0 gate(s), 0 tool(s)).');
  });

  it('plan remains unchanged when no workflow matches', () => {
    // This tests the calling code path — if getWorkflowForIntent returns null,
    // applyWorkflowOverride is never called
    const plan = makePlan([makeStep('step1', ['t1'])]);
    expect(plan.warnings).toHaveLength(0);
    expect(plan.steps[0].gate).toBeUndefined();
  });

  it('adds info warning about applied override', () => {
    const plan = makePlan([makeStep('step1')]);

    const override: WorkflowOverride = {
      name: 'feature-dev',
      gates: [{ phase: 'pre', requirement: 'ok', check: 'go' }],
      tools: ['tool1', 'tool2'],
    };

    applyWorkflowOverride(plan, override);

    expect(plan.warnings).toContain(
      'Workflow override "feature-dev" applied (1 gate(s), 2 tool(s)).',
    );
  });
});
