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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  describe('step context (output → input flow)', () => {
    it('passes prior step outputs as context to subsequent steps', async () => {
      const received: Array<Record<string, unknown>> = [];

      const dispatch = vi.fn(async (tool: string, params: Record<string, unknown>) => {
        received.push({ tool, context: params.context });
        return {
          tool,
          status: 'ok',
          data: { 'vault-patterns': ['pattern-A', 'pattern-B'] },
        };
      });

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([
        step('search-vault', ['vault.search'], { output: ['vault-patterns'] }),
        step('brainstorm', ['brain.recommend']),
      ]);

      await executor.execute(plan);

      // Step 1 receives empty context
      expect(received[0].context).toEqual({});

      // Step 2 receives vault-patterns from step 1
      expect(received[1].context).toEqual({ 'vault-patterns': ['pattern-A', 'pattern-B'] });
    });

    it('steps with no output declaration do not pollute context', async () => {
      const received: Array<Record<string, unknown>> = [];

      const dispatch = vi.fn(async (tool: string, params: Record<string, unknown>) => {
        received.push({ tool, context: params.context });
        return { tool, status: 'ok', data: { 'some-key': 'value' } };
      });

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([step('s1', ['tool-a']), step('s2', ['tool-b'])]);

      await executor.execute(plan);

      // No output declared on s1 — context stays empty for s2
      expect(received[1].context).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // WS5 — scoped flow context
  // -------------------------------------------------------------------------

  describe('WS5 scoped inputs', () => {
    function mkTmp(): string {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'soleri-exec-ws5-'));
    }

    it('strict mode: a scoped step receives only its declared from_steps outputs', async () => {
      const received: Array<Record<string, unknown>> = [];
      const dispatch = vi.fn(async (tool: string, params: Record<string, unknown>) => {
        received.push({ tool, context: params.context });
        return { tool, status: 'ok', data: { foo: 'FOO', bar: 'BAR' } };
      });

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([
        step('a', ['t-a'], { output: ['foo', 'bar'] }),
        step('b', ['t-b'], { inputs: { from_steps: ['a.foo'] } }),
      ]);

      await executor.execute(plan);

      // Step a produced foo AND bar, but scoped step b declared only a.foo.
      expect(received[1].context).toEqual({ foo: 'FOO' });
      expect(received[1].context).not.toHaveProperty('bar');
    });

    it('delivers declared input descriptors (files + fromSteps) to the step', async () => {
      const dir = mkTmp();
      fs.writeFileSync(path.join(dir, 'present.md'), 'reference');
      const received: Array<Record<string, unknown>> = [];
      const dispatch = vi.fn(async (tool: string, params: Record<string, unknown>) => {
        received.push({ inputs: params.inputs });
        return { tool, status: 'ok', data: { foo: 'FOO' } };
      });

      const executor = new FlowExecutor(dispatch, undefined, { workspaceRoot: dir });
      const plan = makePlan([
        step('a', ['t-a'], { output: ['foo'] }),
        step('b', ['t-b'], {
          inputs: { files: [{ path: 'present.md', layer: 3 }], from_steps: ['a.foo'] },
        }),
      ]);

      await executor.execute(plan);
      fs.rmSync(dir, { recursive: true, force: true });

      const inputs = received[1].inputs as {
        files: Array<{ path: string; layer: number; present: boolean }>;
        fromSteps: string[];
      };
      expect(inputs.files[0]).toMatchObject({ path: 'present.md', layer: 3, present: true });
      expect(inputs.fromSteps).toEqual(['a.foo']);
    });

    it('warns that a step with no inputs block is unscoped (strict mode)', async () => {
      const dispatch = vi.fn(async (tool: string) => ({ tool, status: 'ok', data: {} }));
      const executor = new FlowExecutor(dispatch);
      const plan = makePlan([step('s1', ['t1'])]);

      const result = await executor.execute(plan);

      expect(result.warnings.some((w) => w.includes('unscoped'))).toBe(true);
    });

    it('on-missing-input=fail (default): a missing file fails the step and stops', async () => {
      const dir = mkTmp();
      const dispatch = vi.fn(async (tool: string) => ({ tool, status: 'ok', data: {} }));
      const executor = new FlowExecutor(dispatch, undefined, { workspaceRoot: dir });
      const plan = makePlan([
        step('s1', ['t1'], { inputs: { files: [{ path: 'absent.md', layer: 4 }] } }),
        step('s2', ['t2']),
      ]);

      const result = await executor.execute(plan);
      fs.rmSync(dir, { recursive: true, force: true });

      expect(result.status).toBe('partial');
      expect(result.stepResults[0].status).toBe('failed');
      // The step's tools are never dispatched when a required input is missing.
      expect(dispatch).not.toHaveBeenCalled();
      expect(result.warnings.some((w) => w.includes('missing required input'))).toBe(true);
    });

    it('on-missing-input=skip-with-warning: skips the step and continues', async () => {
      const dir = mkTmp();
      const calls: string[] = [];
      const dispatch = vi.fn(async (tool: string) => {
        calls.push(tool);
        return { tool, status: 'ok', data: {} };
      });
      const executor = new FlowExecutor(dispatch, undefined, { workspaceRoot: dir });
      const plan = makePlan([
        step('s1', ['t1'], {
          inputs: { files: [{ path: 'absent.md', layer: 4 }] },
          onMissingInput: 'skip-with-warning',
        }),
        step('s2', ['t2']),
      ]);

      const result = await executor.execute(plan);
      fs.rmSync(dir, { recursive: true, force: true });

      expect(result.stepResults[0].status).toBe('skipped');
      // s1 skipped, s2 still ran.
      expect(calls).toEqual(['t2']);
      expect(result.warnings.some((w) => w.includes('skipped'))).toBe(true);
    });

    it('on-missing-input=ask-user: pauses execution', async () => {
      const dir = mkTmp();
      const dispatch = vi.fn(async (tool: string) => ({ tool, status: 'ok', data: {} }));
      const executor = new FlowExecutor(dispatch, undefined, { workspaceRoot: dir });
      const plan = makePlan([
        step('s1', ['t1'], {
          inputs: { files: [{ path: 'absent.md', layer: 4 }] },
          onMissingInput: 'ask-user',
        }),
        step('s2', ['t2']),
      ]);

      const result = await executor.execute(plan);
      fs.rmSync(dir, { recursive: true, force: true });

      expect(result.status).toBe('partial');
      expect(result.stepResults[0].status).toBe('gate-paused');
      expect(dispatch).not.toHaveBeenCalled();
      expect(result.warnings.some((w) => w.includes('paused'))).toBe(true);
    });

    it('a mandatory vault query with empty results is a missing input', async () => {
      const dispatch = vi.fn(async (tool: string) => ({ tool, status: 'ok', data: {} }));
      const executor = new FlowExecutor(dispatch, undefined, { vaultSearch: () => [] });
      const plan = makePlan([
        step('s1', ['t1'], { inputs: { vault: [{ query: 'x', mandatory: true }] } }),
      ]);

      const result = await executor.execute(plan);

      expect(result.stepResults[0].status).toBe('failed');
      expect(result.warnings.some((w) => w.includes('vault:x'))).toBe(true);
    });

    it('advisory mode: delivers full context despite scoped inputs, with a warning', async () => {
      const received: Array<Record<string, unknown>> = [];
      const dispatch = vi.fn(async (tool: string, params: Record<string, unknown>) => {
        received.push({ context: params.context });
        return { tool, status: 'ok', data: { foo: 'FOO', bar: 'BAR' } };
      });

      const executor = new FlowExecutor(dispatch);
      const plan = makePlan(
        [
          step('a', ['t-a'], { output: ['foo', 'bar'] }),
          step('b', ['t-b'], { inputs: { from_steps: ['a.foo'] } }),
        ],
        { enforcement: 'advisory' },
      );

      const result = await executor.execute(plan);

      // Advisory: step b sees the FULL accumulated context (foo AND bar).
      expect(received[1].context).toEqual({ foo: 'FOO', bar: 'BAR' });
      expect(result.warnings.some((w) => w.includes('advisory'))).toBe(true);
    });

    it('advisory mode: a missing declared input does not fail the step', async () => {
      const dir = mkTmp();
      const dispatch = vi.fn(async (tool: string) => ({ tool, status: 'ok', data: {} }));
      const executor = new FlowExecutor(dispatch, undefined, { workspaceRoot: dir });
      const plan = makePlan(
        [step('s1', ['t1'], { inputs: { files: [{ path: 'absent.md', layer: 4 }] } })],
        { enforcement: 'advisory' },
      );

      const result = await executor.execute(plan);
      fs.rmSync(dir, { recursive: true, force: true });

      expect(result.stepResults[0].status).not.toBe('failed');
      expect(dispatch).toHaveBeenCalled();
    });
  });
});
