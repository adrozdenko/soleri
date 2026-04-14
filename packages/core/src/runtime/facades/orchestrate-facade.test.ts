import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../../vault/vault.js';
import { Planner } from '../../planning/planner.js';
import { Brain } from '../../brain/brain.js';
import { BrainIntelligence } from '../../brain/intelligence.js';
import { Governance } from '../../governance/governance.js';
import { ProjectRegistry } from '../../project/project-registry.js';
import { PlaybookExecutor } from '../../playbooks/playbook-executor.js';
import { createOrchestrateFacadeOps } from './orchestrate-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeRuntime(vault: Vault): AgentRuntime {
  const brain = new Brain(vault);
  const plansPath = join(tmpdir(), `orch-test-${Date.now()}.json`);
  const planner = new Planner(plansPath);
  const brainIntelligence = new BrainIntelligence(vault, brain);
  const governance = new Governance(vault);
  const projectRegistry = new ProjectRegistry(vault.getProvider());
  const playbookExecutor = new PlaybookExecutor();
  const contextHealth = {
    track: vi.fn(),
    check: vi.fn().mockReturnValue({
      level: 'green',
      estimatedFill: 0.1,
      toolCallCount: 5,
      estimatedTokens: 1000,
      recommendation: '',
    }),
  };

  return {
    vault,
    planner,
    brain,
    brainIntelligence,
    governance,
    projectRegistry,
    playbookExecutor,
    contextHealth,
    config: { agentId: 'test-agent' },
  } as unknown as AgentRuntime;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('orchestrate-facade', () => {
  let vault: Vault;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    vault = new Vault(':memory:');
    ops = captureOps(createOrchestrateFacadeOps(makeRuntime(vault)));
  });

  afterEach(() => {
    vault.close();
  });

  // ─── session_start ─────────────────────────────────────────────

  it('session_start registers project and returns stats', async () => {
    const result = await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.project).toBeDefined();
    expect(data.is_new).toBe(true);
    expect(data.vault).toBeDefined();
    expect(data.governance).toBeDefined();
  });

  it('session_start includes preflight manifest', async () => {
    const result = await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const preflight = data.preflight as Record<string, unknown>;
    expect(preflight).toBeDefined();
    expect(Array.isArray(preflight.tools)).toBe(true);
    expect(Array.isArray(preflight.skills)).toBe(true);
    expect(Array.isArray(preflight.activePlans)).toBe(true);
    expect(preflight.vaultSummary).toBeDefined();
    const vaultSummary = preflight.vaultSummary as Record<string, unknown>;
    expect(typeof vaultSummary.entryCount).toBe('number');
    expect(typeof vaultSummary.connected).toBe('boolean');
    expect(Array.isArray(vaultSummary.domains)).toBe(true);
  });

  it('session_start increments session count on second call', async () => {
    await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    const result = await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.is_new).toBe(false);
    expect(data.message).toContain('Session #2');
  });

  it('session_start auto-closes stale plans and reports count', async () => {
    // Create a runtime with a planner we can manipulate
    const rt = makeRuntime(vault);
    const rtOps = captureOps(createOrchestrateFacadeOps(rt));

    // Create a draft plan in the past so it's stale (>30 min TTL)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(oneHourAgo);
    const plan = rt.planner.create({ objective: 'Stale draft plan', scope: 'test' });
    vi.restoreAllMocks();

    const result = await executeOp(rtOps, 'session_start', { projectPath: '/test/stale' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.stalePlansClosed).toBe(1);

    // The plan should now be completed
    const closed = rt.planner.get(plan.id);
    expect(closed?.status).toBe('completed');
  });

  it('session_start auto-reconciles executing plans where all tasks are terminal', async () => {
    // Use a planner with relaxed grading so test plans pass approve()
    const plansPath = join(tmpdir(), `orch-autorec-${Date.now()}.json`);
    const rt = makeRuntime(vault);
    const { Planner } = await import('../../planning/planner.js');
    (rt as Record<string, unknown>).planner = new Planner(plansPath, {
      minGradeForApproval: 'F' as never,
    });
    const rtOps = captureOps(createOrchestrateFacadeOps(rt));

    // Create a plan and move it to executing with all tasks completed
    const plan = rt.planner.create({
      objective: 'Auto-reconcile target for session_start integration test',
      scope: 'test auto-reconcile wiring',
    });
    rt.planner.grade(plan.id);
    rt.planner.approve(plan.id);
    rt.planner.splitTasks(plan.id, [
      { title: 'Task A', description: 'Do A' },
      { title: 'Task B', description: 'Do B' },
    ]);
    rt.planner.startExecution(plan.id);
    rt.planner.updateTask(plan.id, 'task-1', 'completed');
    rt.planner.updateTask(plan.id, 'task-2', 'completed');

    const result = await executeOp(rtOps, 'session_start', { projectPath: '/test/auto-rec' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.autoReconciledCount).toBe(1);

    // The plan should be completed with a real reconciliation (not stale-closed)
    const completed = rt.planner.get(plan.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.reconciliation).toBeDefined();
    expect(completed?.reconciliation?.accuracy).toBe(100);
    expect(completed?.reconciliation?.summary).toContain('All tasks completed');
  });

  it('session_start does NOT auto-reconcile plans with pending tasks', async () => {
    const plansPath = join(tmpdir(), `orch-norec-${Date.now()}.json`);
    const rt = makeRuntime(vault);
    const { Planner } = await import('../../planning/planner.js');
    (rt as Record<string, unknown>).planner = new Planner(plansPath, {
      minGradeForApproval: 'F' as never,
    });
    const rtOps = captureOps(createOrchestrateFacadeOps(rt));

    // Create a plan with one completed and three pending tasks
    const plan = rt.planner.create({
      objective: 'Should not auto-reconcile with many pending tasks',
      scope: 'test auto-reconcile precondition gating',
    });
    rt.planner.grade(plan.id);
    rt.planner.approve(plan.id);
    rt.planner.splitTasks(plan.id, [
      { title: 'Task A', description: 'Do A' },
      { title: 'Task B', description: 'Do B' },
      { title: 'Task C', description: 'Do C' },
      { title: 'Task D', description: 'Do D' },
    ]);
    rt.planner.startExecution(plan.id);
    rt.planner.updateTask(plan.id, 'task-1', 'completed');
    // task-2, task-3, task-4 remain pending (3 pending > 2 threshold)

    const result = await executeOp(rtOps, 'session_start', { projectPath: '/test/no-rec' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.autoReconciledCount).toBe(0);

    // Plan should still be executing
    const stillExecuting = rt.planner.get(plan.id);
    expect(stillExecuting?.status).toBe('executing');
  });

  // ─── project_get ───────────────────────────────────────────────

  it('project_get returns not found for unregistered project', async () => {
    const result = await executeOp(ops, 'project_get', { projectId: 'nonexistent' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).found).toBe(false);
  });

  // ─── project_list ──────────────────────────────────────────────

  it('project_list returns empty initially', async () => {
    const result = await executeOp(ops, 'project_list', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(0);
  });

  it('project_list includes registered projects', async () => {
    await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    const result = await executeOp(ops, 'project_list', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBeGreaterThanOrEqual(1);
  });

  // ─── orchestrate_status ────────────────────────────────────────

  it('orchestrate_status returns combined status', async () => {
    const result = await executeOp(ops, 'orchestrate_status', {});
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.activePlans).toBeDefined();
    expect(data.vaultStats).toBeDefined();
    expect(data.brainStats).toBeDefined();
  });

  // ─── orchestrate_quick_capture ─────────────────────────────────

  it('orchestrate_quick_capture captures knowledge', async () => {
    const result = await executeOp(ops, 'orchestrate_quick_capture', {
      domain: 'testing',
      context: 'Learned that tests should be colocated',
    });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.session).toBeDefined();
  });

  // ─── playbook_list ─────────────────────────────────────────────

  it('playbook_list returns empty with no playbooks', async () => {
    const result = await executeOp(ops, 'playbook_list', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(0);
  });

  // ─── project_add_rule ──────────────────────────────────────────

  it('project_add_rule adds a rule to a project', async () => {
    await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    const listResult = await executeOp(ops, 'project_list', {});
    const projects = (listResult.data as { projects: Array<Record<string, unknown>> }).projects;
    const projectId = projects[0].id as string;

    const result = await executeOp(ops, 'project_add_rule', {
      projectId,
      category: 'convention',
      text: 'Use semantic tokens',
      priority: 5,
    });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).added).toBe(true);
  });

  // ─── project_unregister ────────────────────────────────────────

  it('project_unregister removes a project', async () => {
    await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    const listResult = await executeOp(ops, 'project_list', {});
    const projects = (listResult.data as { projects: Array<Record<string, unknown>> }).projects;
    const projectId = projects[0].id as string;

    const result = await executeOp(ops, 'project_unregister', { projectId });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).removed).toBe(true);
  });
});
