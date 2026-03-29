/**
 * Tests for orchestrate_status readiness field.
 *
 * Validates that orchestrate_status computes readiness
 * based on the active plan's task states.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOrchestrateOps } from './orchestrate-ops.js';
import { captureOps } from '../engine/test-helpers.js';
import { createAgentRuntime } from './runtime.js';
import type { AgentRuntime } from './types.js';

let runtime: AgentRuntime;
let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `readiness-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  runtime = createAgentRuntime({
    agentId: 'test-readiness',
    vaultPath: ':memory:',
    plansPath: join(tempDir, 'plans.json'),
  });
});

afterEach(() => {
  runtime.close();
  rmSync(tempDir, { recursive: true, force: true });
});

/** Helper: call the orchestrate_status handler directly. */
async function callStatus(rt: AgentRuntime): Promise<Record<string, unknown>> {
  const ops = captureOps(createOrchestrateOps(rt));
  const op = ops.get('orchestrate_status')!;
  return (await op.handler({})) as Record<string, unknown>;
}

/** Helper: create an executing plan with N tasks, return plan + task IDs. */
function createExecutingPlan(
  rt: AgentRuntime,
  tasks: Array<{ title: string; description: string }>,
) {
  const plan = rt.planner.create({
    objective: 'Test plan',
    scope: 'test',
    decisions: [],
    tasks: [],
  });
  rt.planner.approve(plan.id);
  rt.planner.splitTasks(plan.id, tasks);
  rt.planner.startExecution(plan.id);
  const executing = rt.planner.get(plan.id)!;
  return { planId: plan.id, tasks: executing.tasks };
}

describe('orchestrate_status readiness', () => {
  it('returns no readiness when there are no executing plans', async () => {
    const data = await callStatus(runtime);
    expect(data.readiness).toBeUndefined();
  });

  it('returns readiness with allTasksTerminal=true when all tasks are done', async () => {
    const { planId, tasks } = createExecutingPlan(runtime, [
      { title: 'Task A', description: 'Do A' },
      { title: 'Task B', description: 'Do B' },
    ]);

    for (const task of tasks) {
      runtime.planner.updateTask(planId, task.id, 'completed');
    }

    const data = await callStatus(runtime);
    const readiness = data.readiness as {
      allTasksTerminal: boolean;
      terminalCount: number;
      totalCount: number;
      idleSince: number | null;
    };

    expect(readiness).toBeDefined();
    expect(readiness.allTasksTerminal).toBe(true);
    expect(readiness.terminalCount).toBe(2);
    expect(readiness.totalCount).toBe(2);
    expect(readiness.idleSince).toBeNull();
  });

  it('returns readiness with mixed task states', async () => {
    const { planId, tasks } = createExecutingPlan(runtime, [
      { title: 'Task X', description: 'Do X' },
      { title: 'Task Y', description: 'Do Y' },
      { title: 'Task Z', description: 'Do Z' },
    ]);

    runtime.planner.updateTask(planId, tasks[0].id, 'completed');
    runtime.planner.updateTask(planId, tasks[1].id, 'skipped');
    // tasks[2] remains pending

    const data = await callStatus(runtime);
    const readiness = data.readiness as {
      allTasksTerminal: boolean;
      terminalCount: number;
      totalCount: number;
      idleSince: number | null;
    };

    expect(readiness).toBeDefined();
    expect(readiness.allTasksTerminal).toBe(false);
    expect(readiness.terminalCount).toBe(2);
    expect(readiness.totalCount).toBe(3);
  });

  it('includes failed tasks in terminal count', async () => {
    const { planId, tasks } = createExecutingPlan(runtime, [
      { title: 'Task F', description: 'Fail' },
    ]);

    runtime.planner.updateTask(planId, tasks[0].id, 'failed');

    const data = await callStatus(runtime);
    const readiness = data.readiness as {
      allTasksTerminal: boolean;
      terminalCount: number;
      totalCount: number;
      idleSince: number | null;
    };

    expect(readiness).toBeDefined();
    expect(readiness.allTasksTerminal).toBe(true);
    expect(readiness.terminalCount).toBe(1);
    expect(readiness.totalCount).toBe(1);
  });

  it('computes idleSince from last terminal task timestamp', async () => {
    const { planId, tasks } = createExecutingPlan(runtime, [
      { title: 'Done', description: 'Already done' },
      { title: 'Pending', description: 'Still pending' },
    ]);

    runtime.planner.updateTask(planId, tasks[0].id, 'completed');
    // tasks[1] remains pending

    const data = await callStatus(runtime);
    const readiness = data.readiness as {
      allTasksTerminal: boolean;
      terminalCount: number;
      totalCount: number;
      idleSince: number | null;
    };

    expect(readiness).toBeDefined();
    expect(readiness.allTasksTerminal).toBe(false);
    expect(readiness.terminalCount).toBe(1);
    expect(readiness.totalCount).toBe(2);
    // idleSince should be set (either from completedAt or updatedAt)
    expect(readiness.idleSince).not.toBeNull();
    expect(typeof readiness.idleSince).toBe('number');
  });
});
