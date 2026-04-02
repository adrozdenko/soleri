import { describe, it, expect } from 'vitest';
import { createDispatcher } from './dispatch-registry.js';
import type { ActivePlanRef } from './dispatch-registry.js';
import type { FacadeConfig } from '../facades/types.js';
import { applyWorkflowOverride } from '../runtime/orchestrate-ops.js';
import type { OrchestrationPlan } from './types.js';
import type { WorkflowOverride } from '../workflows/workflow-loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFacade(agentId: string, facadeName: string, opNames: string[]): FacadeConfig {
  return {
    name: `${agentId}_${facadeName}`,
    description: `Test facade: ${facadeName}`,
    ops: opNames.map((name) => ({
      name,
      description: `op ${name}`,
      auth: 'read' as const,
      handler: async () => ({ ok: true }),
    })),
  };
}

function makePlan(steps: OrchestrationPlan['steps']): OrchestrationPlan {
  return {
    planId: 'test-plan',
    intent: 'BUILD',
    flowId: 'test-flow',
    steps,
    skipped: [],
    epilogue: [],
    warnings: [],
    summary: 'Test plan',
    estimatedTools: 0,
    context: {
      intent: 'BUILD',
      probes: {
        vault: true,
        brain: true,
        designSystem: false,
        sessionStore: false,
        projectRules: false,
        active: true,
      },
      entities: { components: [], actions: [] },
      projectPath: '/tmp/test',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deviation-detection', () => {
  const agentId = 'test';

  describe('createDispatcher with activePlan — allowed tool produces no deviation', () => {
    it('does not record a deviation when the tool is in allowedTools', async () => {
      const facades = [makeFacade(agentId, 'vault', ['search'])];
      const activePlan: ActivePlanRef = {
        steps: [{ id: 'step-1', allowedTools: ['test_vault_search'], status: 'running' }],
        deviations: [],
      };

      const dispatch = createDispatcher(agentId, facades, activePlan);
      await dispatch('test_vault_search', {});

      expect(activePlan.deviations).toHaveLength(0);
    });

    it('does not record a deviation when the op name is in allowedTools', async () => {
      const facades = [makeFacade(agentId, 'vault', ['search'])];
      const activePlan: ActivePlanRef = {
        steps: [{ id: 'step-1', allowedTools: ['search'], status: 'running' }],
        deviations: [],
      };

      const dispatch = createDispatcher(agentId, facades, activePlan);
      await dispatch('test_vault_search', {});

      expect(activePlan.deviations).toHaveLength(0);
    });
  });

  describe('createDispatcher with activePlan — disallowed tool adds deviation', () => {
    it('records a deviation when the tool is not in allowedTools', async () => {
      const facades = [
        makeFacade(agentId, 'vault', ['search']),
        makeFacade(agentId, 'brain', ['recommend']),
      ];
      const activePlan: ActivePlanRef = {
        steps: [{ id: 'step-1', allowedTools: ['test_brain_recommend'], status: 'running' }],
      };

      const dispatch = createDispatcher(agentId, facades, activePlan);
      await dispatch('test_vault_search', {});

      expect(activePlan.deviations).toHaveLength(1);
      expect(activePlan.deviations![0]).toMatchObject({
        stepId: 'step-1',
        expectedTools: ['test_brain_recommend'],
        actualTool: 'test_vault_search',
      });
      expect(activePlan.deviations![0].timestamp).toBeTruthy();
    });
  });

  describe('createDispatcher without activePlan — backward compatibility', () => {
    it('dispatches normally without deviation tracking', async () => {
      const facades = [makeFacade(agentId, 'vault', ['search'])];

      const dispatch = createDispatcher(agentId, facades);
      const result = await dispatch('test_vault_search', {});

      expect(result.status).toBe('ok');
    });
  });

  describe('applyWorkflowOverride sets allowedTools on steps with tools', () => {
    it('populates allowedTools from the merged tool set', () => {
      const plan = makePlan([
        {
          id: 'build-1',
          name: 'Build step',
          tools: ['tool_a'],
          parallel: false,
          requires: [],
          status: 'pending',
        },
        {
          id: 'verify-1',
          name: 'Verify step',
          tools: [],
          parallel: false,
          requires: [],
          status: 'pending',
        },
      ]);

      const override: WorkflowOverride = {
        name: 'test-workflow',
        gates: [],
        tools: ['tool_b'],
      };

      applyWorkflowOverride(plan, override);

      // Step with tools should have allowedTools
      expect(plan.steps[0].allowedTools).toEqual(expect.arrayContaining(['tool_a', 'tool_b']));
      expect(plan.steps[0].allowedTools).toHaveLength(2);

      // Step that started empty but got tools merged in should also have allowedTools
      expect(plan.steps[1].allowedTools).toEqual(['tool_b']);
    });

    it('does not set allowedTools on steps that remain tool-less', () => {
      const plan = makePlan([
        {
          id: 'empty-1',
          name: 'Empty step',
          tools: [],
          parallel: false,
          requires: [],
          status: 'pending',
        },
      ]);

      const override: WorkflowOverride = {
        name: 'test-workflow',
        gates: [],
        tools: [],
      };

      applyWorkflowOverride(plan, override);

      expect(plan.steps[0].allowedTools).toBeUndefined();
    });
  });

  describe('deviations summary groups correctly by step', () => {
    it('groups multiple deviations by stepId', () => {
      const deviations = [
        {
          stepId: 'step-1',
          expectedTools: ['tool_a'],
          actualTool: 'tool_x',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        {
          stepId: 'step-1',
          expectedTools: ['tool_a'],
          actualTool: 'tool_y',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          stepId: 'step-2',
          expectedTools: ['tool_b'],
          actualTool: 'tool_x',
          timestamp: '2026-01-01T00:00:02.000Z',
        },
      ];

      // Replicate the grouping logic from plan_reconcile
      const byStep = Object.entries(
        deviations.reduce(
          (acc, d) => {
            (acc[d.stepId] = acc[d.stepId] || []).push(d);
            return acc;
          },
          {} as Record<string, typeof deviations>,
        ),
      ).map(([stepId, devs]) => ({
        stepId,
        deviationCount: devs.length,
        unexpectedTools: [...new Set(devs.map((d) => d.actualTool))],
      }));

      expect(byStep).toHaveLength(2);
      expect(byStep[0]).toEqual({
        stepId: 'step-1',
        deviationCount: 2,
        unexpectedTools: ['tool_x', 'tool_y'],
      });
      expect(byStep[1]).toEqual({
        stepId: 'step-2',
        deviationCount: 1,
        unexpectedTools: ['tool_x'],
      });
    });
  });
});
