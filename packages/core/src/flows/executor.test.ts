/**
 * FlowExecutor — colocated contract tests.
 *
 * Contract:
 * - execute() runs plan steps sequentially, parallel tools within a step
 * - Gates are evaluated after each step via evaluateGate()
 * - STOP gate halts execution and returns partial result
 * - BRANCH gate jumps to a target step (with max iteration guard)
 * - Tool errors are captured per-tool without aborting the step
 * - ExecutionResult includes toolsCalled (deduplicated), stepResults, timing
 *
 * Lighter coverage for basic happy path (covered in __tests__/flows.test.ts).
 * Focus: BRANCH handling, error resilience, SCORE gates, edge cases.
 */

import { describe, it, expect, vi } from 'vitest';
import { FlowExecutor } from './executor.js';
import type { OrchestrationPlan, PlanStep } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlan(steps: PlanStep[], overrides?: Partial<OrchestrationPlan>): OrchestrationPlan {
  return {
    planId: 'test-plan',
    intent: 'BUILD',
    flowId: 'BUILD-flow',
    steps,
    skipped: [],
    epilogue: [],
    warnings: [],
    summary: 'Test plan',
    estimatedTools: steps.reduce((a, s) => a + s.tools.length, 0),
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
    ...overrides,
  };
}

function step(id: string, tools: string[], opts?: Partial<PlanStep>): PlanStep {
  return {
    id,
    name: id,
    tools,
    parallel: false,
    requires: [],
    status: 'pending',
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowExecutor', () => {
  describe('error resilience', () => {
    it('captures tool error without aborting entire step', async () => {
      const dispatch = vi.fn(async (tool: string) => {
        if (tool === 'fail-tool') throw new Error('tool broke');
        return { tool, status: 'ok', data: {} };
      });

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([step('s1', ['ok-tool', 'fail-tool'])]);
      const result = await executor.execute(plan);

      // Both tools were called
      expect(result.toolsCalled).toContain('ok-tool');
      expect(result.toolsCalled).toContain('fail-tool');
      // Step still completes (gate evaluation may mark it passed/failed)
      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].toolResults['fail-tool'].status).toBe('error');
      expect(result.stepResults[0].toolResults['fail-tool'].error).toBe('tool broke');
    });

    it('deduplicates toolsCalled', async () => {
      const dispatch = vi.fn(async (tool: string) => ({ tool, status: 'ok', data: {} }));
      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([step('s1', ['tool-a']), step('s2', ['tool-a'])]);
      const result = await executor.execute(plan);

      expect(result.toolsCalled).toEqual(['tool-a']);
    });
  });

  describe('BRANCH gate', () => {
    it('jumps to target step on BRANCH action', async () => {
      const callOrder: string[] = [];
      const dispatch = vi.fn(async (tool: string) => {
        callOrder.push(tool);
        return { tool, status: 'ok', data: { branch: true } };
      });

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([
        step('s1', ['check'], {
          gate: {
            type: 'BRANCH',
            onFail: { action: 'BRANCH', goto: 's3' },
          },
        }),
        step('s2', ['skipped']),
        step('s3', ['target']),
      ]);

      const result = await executor.execute(plan);

      // s1 → branch to s3, skipping s2
      expect(callOrder).toContain('check');
      expect(callOrder).toContain('target');
      expect(callOrder).not.toContain('skipped');
      expect(result.status).toBe('completed');
    });

    it('stops after MAX_BRANCH_ITERATIONS to prevent infinite loops', async () => {
      const dispatch = vi.fn(async (tool: string) => ({
        tool,
        status: 'ok',
        data: {},
      }));

      const executor = new FlowExecutor(dispatch);
      // Create a loop: s1 branches back to s1
      const plan = makePlan([
        step('s1', ['loop-tool'], {
          gate: {
            type: 'BRANCH',
            onFail: { action: 'BRANCH', goto: 's1' },
          },
        }),
        step('s2', ['after']),
      ]);

      const result = await executor.execute(plan);

      // Should eventually stop with partial status
      expect(result.status).toBe('partial');
      expect(dispatch).toHaveBeenCalled();
    });
  });

  describe('SCORE gate', () => {
    it('stops execution when score is below minimum', async () => {
      const dispatch = vi.fn(async (tool: string) => ({
        tool,
        status: 'ok',
        data: { score: 30 },
      }));

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([
        step('s1', ['validate'], {
          gate: {
            type: 'SCORE',
            min: 80,
            onFail: { action: 'STOP', message: 'Score too low' },
          },
        }),
        step('s2', ['next']),
      ]);

      const result = await executor.execute(plan);

      expect(result.status).toBe('partial');
      expect(result.stepsCompleted).toBe(0);
      expect(result.stepResults[0].gateResult?.action).toBe('STOP');
    });

    it('continues when score meets minimum', async () => {
      const dispatch = vi.fn(async (tool: string) => ({
        tool,
        status: 'ok',
        data: { score: 95 },
      }));

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([
        step('s1', ['validate'], {
          gate: { type: 'SCORE', min: 80, onFail: { action: 'STOP' } },
        }),
        step('s2', ['next']),
      ]);

      const result = await executor.execute(plan);

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(2);
    });
  });

  describe('parallel tool execution', () => {
    it('handles mixed success/failure in parallel tools', async () => {
      const dispatch = vi.fn(async (tool: string) => {
        if (tool === 'bad') throw new Error('parallel fail');
        return { tool, status: 'ok', data: {} };
      });

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([step('s1', ['good', 'bad'], { parallel: true })]);
      const result = await executor.execute(plan);

      const toolResults = result.stepResults[0].toolResults;
      expect(toolResults['good'].status).toBe('ok');
      expect(toolResults['bad'].status).toBe('error');
      expect(toolResults['bad'].error).toBe('parallel fail');
    });
  });

  describe('result structure', () => {
    it('includes correct timing and counts', async () => {
      const dispatch = vi.fn(async (tool: string) => ({ tool, status: 'ok', data: {} }));
      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([step('s1', ['t1']), step('s2', ['t2'])]);

      const result = await executor.execute(plan);

      expect(result.planId).toBe('test-plan');
      expect(result.totalSteps).toBe(2);
      expect(result.stepsCompleted).toBe(2);
      expect(typeof result.durationMs).toBe('number');
      expect(result.stepResults).toHaveLength(2);
      expect(typeof result.stepResults[0].durationMs).toBe('number');
    });

    it('returns failed status when a step has a STOP gate that fails', async () => {
      const dispatch = vi.fn(async (tool: string) => ({
        tool,
        status: 'ok',
        data: { pass: false },
      }));

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([
        step('s1', ['check'], {
          gate: {
            type: 'GATE',
            condition: 'pass == true',
            onFail: { action: 'STOP', message: 'Blocked' },
          },
        }),
      ]);

      const result = await executor.execute(plan);

      expect(result.status).toBe('partial');
      expect(result.stepResults[0].status).toBe('failed');
      expect(result.stepResults[0].gateResult?.message).toBe('Blocked');
    });
  });
});
