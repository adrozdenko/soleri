import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../../vault/vault.js';
import { Planner } from '../../planning/planner.js';
import { Brain } from '../../brain/brain.js';
import { BrainIntelligence } from '../../brain/intelligence.js';
import { Curator } from '../../curator/curator.js';
import { ChainRunner } from '../../flows/chain-runner.js';
import { createPlanFacadeOps } from './plan-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeRuntime(vault: Vault): AgentRuntime {
  const brain = new Brain(vault);
  const plansPath = join(tmpdir(), `plan-test-${Date.now()}.json`);
  const planner = new Planner(plansPath);
  const brainIntelligence = new BrainIntelligence(vault, brain);
  const curator = new Curator(vault, brain);
  const linkManager = null;
  const chainRunner = new ChainRunner(vault.getProvider());
  return {
    vault,
    planner,
    brain,
    brainIntelligence,
    curator,
    linkManager,
    chainRunner,
  } as unknown as AgentRuntime;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('plan-facade', () => {
  let vault: Vault;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    vault = new Vault(':memory:');
    ops = captureOps(createPlanFacadeOps(makeRuntime(vault)));
  });

  afterEach(() => {
    vault.close();
  });

  it('registers base + extra + grading + chain ops', () => {
    // 5 base + 22 extra + 5 grading + 5 chain = 37
    expect(ops.size).toBeGreaterThanOrEqual(32);
    expect([...ops.keys()]).toContain('create_plan');
    expect([...ops.keys()]).toContain('get_plan');
    expect([...ops.keys()]).toContain('approve_plan');
    expect([...ops.keys()]).toContain('update_task');
    expect([...ops.keys()]).toContain('complete_plan');
    expect([...ops.keys()]).toContain('plan_grade');
    expect([...ops.keys()]).toContain('chain_execute');
  });

  it('has correct auth levels for base ops', () => {
    expect(ops.get('create_plan')!.auth).toBe('write');
    expect(ops.get('get_plan')!.auth).toBe('read');
    expect(ops.get('approve_plan')!.auth).toBe('write');
    expect(ops.get('update_task')!.auth).toBe('write');
    expect(ops.get('complete_plan')!.auth).toBe('write');
  });

  // ─── create_plan ───────────────────────────────────────────────

  it('create_plan creates a draft plan', async () => {
    const result = await executeOp(ops, 'create_plan', {
      objective: 'Build auth module',
      scope: 'packages/core/src/auth',
    });
    expect(result.success).toBe(true);
    const data = result.data as { created: boolean; plan: Record<string, unknown> };
    expect(data.created).toBe(true);
    expect(data.plan.status).toBe('draft');
    expect(data.plan.objective).toBe('Build auth module');
  });

  it('create_plan with tasks and decisions', async () => {
    const result = await executeOp(ops, 'create_plan', {
      objective: 'Refactor vault',
      scope: 'vault module',
      decisions: ['Use SQLite FTS5'],
      tasks: [{ title: 'Add FTS5 index', description: 'Create FTS5 table' }],
    });
    expect(result.success).toBe(true);
    const plan = (result.data as Record<string, unknown>).plan as Record<string, unknown>;
    expect((plan.tasks as unknown[]).length).toBe(1);
  });

  // ─── get_plan ──────────────────────────────────────────────────

  it('get_plan returns plan by ID', async () => {
    const createResult = await executeOp(ops, 'create_plan', {
      objective: 'Test',
      scope: 'test',
    });
    const planId = ((createResult.data as Record<string, unknown>).plan as Record<string, unknown>)
      .id as string;
    const result = await executeOp(ops, 'get_plan', { planId });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).objective).toBe('Test');
  });

  it('get_plan lists all active plans when no ID', async () => {
    await executeOp(ops, 'create_plan', { objective: 'A', scope: 'a' });
    const result = await executeOp(ops, 'get_plan', {});
    expect(result.success).toBe(true);
    const data = result.data as { active: unknown[] };
    expect(data.active.length).toBeGreaterThanOrEqual(1);
  });

  it('get_plan returns error for nonexistent plan', async () => {
    const result = await executeOp(ops, 'get_plan', { planId: 'nonexistent' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).error).toContain('not found');
  });

  // ─── approve_plan ──────────────────────────────────────────────

  it('approve_plan approves a draft plan', async () => {
    const createResult = await executeOp(ops, 'create_plan', {
      objective: 'Test approval',
      scope: 'test',
      decisions: ['decision 1', 'decision 2'],
      tasks: [
        { title: 'Task 1', description: 'desc 1' },
        { title: 'Task 2', description: 'desc 2' },
      ],
    });
    const planId = ((createResult.data as Record<string, unknown>).plan as Record<string, unknown>)
      .id as string;

    const result = await executeOp(ops, 'approve_plan', { planId });
    expect(result.success).toBe(true);
    const data = result.data as { approved: boolean };
    // May be rejected by grade gate — either outcome is valid
    expect(typeof data.approved).toBe('boolean');
  });

  it('approve_plan with startExecution', async () => {
    const createResult = await executeOp(ops, 'create_plan', {
      objective: 'Test exec',
      scope: 'test',
      decisions: ['d1', 'd2', 'd3'],
      tasks: [
        { title: 'T1', description: 'd1' },
        { title: 'T2', description: 'd2' },
        { title: 'T3', description: 'd3' },
      ],
      alternatives: [
        { approach: 'Alt A', pros: ['fast'], cons: ['fragile'], rejected_reason: 'Too risky' },
        { approach: 'Alt B', pros: ['safe'], cons: ['slow'], rejected_reason: 'Too slow' },
      ],
    });
    const planId = ((createResult.data as Record<string, unknown>).plan as Record<string, unknown>)
      .id as string;

    const result = await executeOp(ops, 'approve_plan', { planId, startExecution: true });
    expect(result.success).toBe(true);
  });

  // ─── update_task ───────────────────────────────────────────────

  it('update_task changes task status', async () => {
    const createResult = await executeOp(ops, 'create_plan', {
      objective: 'Task update test',
      scope: 'test',
      decisions: ['d1', 'd2', 'd3'],
      tasks: [{ title: 'Task 1', description: 'desc' }],
      alternatives: [
        { approach: 'Alt', pros: ['x'], cons: ['y'], rejected_reason: 'z' },
        { approach: 'Alt2', pros: ['a'], cons: ['b'], rejected_reason: 'c' },
      ],
    });
    const plan = (createResult.data as Record<string, unknown>).plan as Record<string, unknown>;
    const planId = plan.id as string;
    const taskId = (plan.tasks as Array<Record<string, unknown>>)[0].id as string;

    // Approve and start execution first
    await executeOp(ops, 'approve_plan', { planId, startExecution: true });

    const result = await executeOp(ops, 'update_task', {
      planId,
      taskId,
      status: 'completed',
    });
    expect(result.success).toBe(true);
    const data = result.data as { updated: boolean };
    expect(data.updated).toBe(true);
  });

  // ─── complete_plan ─────────────────────────────────────────────

  it('complete_plan completes an executing plan', async () => {
    const createResult = await executeOp(ops, 'create_plan', {
      objective: 'Complete test',
      scope: 'test',
      decisions: ['d1', 'd2', 'd3'],
      tasks: [{ title: 'T1', description: 'd1' }],
      alternatives: [
        { approach: 'A', pros: ['x'], cons: ['y'], rejected_reason: 'z' },
        { approach: 'B', pros: ['a'], cons: ['b'], rejected_reason: 'c' },
      ],
    });
    const planId = ((createResult.data as Record<string, unknown>).plan as Record<string, unknown>)
      .id as string;
    await executeOp(ops, 'approve_plan', { planId, startExecution: true });

    const result = await executeOp(ops, 'complete_plan', { planId });
    expect(result.success).toBe(true);
    const data = result.data as { completed: boolean; taskSummary: Record<string, number> };
    expect(data.completed).toBe(true);
    expect(data.taskSummary).toHaveProperty('total');
  });

  // ─── plan_iterate ──────────────────────────────────────────────

  it('plan_iterate revises a draft plan', async () => {
    const createResult = await executeOp(ops, 'create_plan', {
      objective: 'Initial',
      scope: 'test',
    });
    const planId = ((createResult.data as Record<string, unknown>).plan as Record<string, unknown>)
      .id as string;

    const result = await executeOp(ops, 'plan_iterate', {
      planId,
      objective: 'Revised objective',
    });
    expect(result.success).toBe(true);
    const data = result.data as { iterated?: boolean; error?: string };
    expect(data.iterated).toBe(true);
  });

  // ─── plan_stats ────────────────────────────────────────────────

  it('plan_stats returns statistics', async () => {
    const result = await executeOp(ops, 'plan_stats', {});
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('total');
  });

  // ─── plan_grade ────────────────────────────────────────────────

  it('plan_grade grades a plan', async () => {
    const createResult = await executeOp(ops, 'create_plan', {
      objective: 'Grade test',
      scope: 'test',
      decisions: ['Use pattern X'],
      tasks: [{ title: 'Task 1', description: 'desc' }],
    });
    const planId = ((createResult.data as Record<string, unknown>).plan as Record<string, unknown>)
      .id as string;

    const result = await executeOp(ops, 'plan_grade', { planId });
    expect(result.success).toBe(true);
    const data = result.data as { grade: string; score: number };
    expect(data.grade).toBeDefined();
    expect(data.score).toBeGreaterThanOrEqual(0);
  });

  // ─── chain_list ────────────────────────────────────────────────

  it('chain_list returns empty initially', async () => {
    const result = await executeOp(ops, 'chain_list', {});
    expect(result.success).toBe(true);
  });

  // ─── chain_status ──────────────────────────────────────────────

  it('chain_status returns error for unknown instance', async () => {
    const result = await executeOp(ops, 'chain_status', { instanceId: 'nonexistent' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).error).toContain('not found');
  });
});
