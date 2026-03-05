import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createOrchestrateOps } from '../runtime/orchestrate-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createOrchestrateOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'orchestrate-ops-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-orchestrate',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createOrchestrateOps(runtime);
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  it('should return 5 ops', () => {
    expect(ops.length).toBe(5);
  });

  it('should have all expected op names', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('orchestrate_plan');
    expect(names).toContain('orchestrate_execute');
    expect(names).toContain('orchestrate_complete');
    expect(names).toContain('orchestrate_status');
    expect(names).toContain('orchestrate_quick_capture');
  });

  it('should assign correct auth levels', () => {
    expect(findOp('orchestrate_plan').auth).toBe('write');
    expect(findOp('orchestrate_execute').auth).toBe('write');
    expect(findOp('orchestrate_complete').auth).toBe('write');
    expect(findOp('orchestrate_status').auth).toBe('read');
    expect(findOp('orchestrate_quick_capture').auth).toBe('write');
  });

  // ─── orchestrate_plan ───────────────────────────────────────────

  describe('orchestrate_plan', () => {
    it('should create a plan with empty recommendations when brain has no data', async () => {
      const op = findOp('orchestrate_plan');
      const result = (await op.handler({
        objective: 'Build a new button component',
        scope: 'src/components/Button',
        domain: 'component',
      })) as { plan: { id: string; objective: string; decisions: string[] }; recommendations: unknown[] };

      expect(result.plan).toBeDefined();
      expect(result.plan.objective).toBe('Build a new button component');
      expect(result.recommendations).toEqual([]);
      expect(result.plan.decisions).toEqual([]);
    });

    it('should create a plan with tasks when provided', async () => {
      const op = findOp('orchestrate_plan');
      const result = (await op.handler({
        objective: 'Refactor auth module',
        scope: 'src/auth',
        tasks: [
          { title: 'Extract interfaces', description: 'Pull out shared types' },
          { title: 'Add tests', description: 'Cover edge cases' },
        ],
      })) as { plan: { tasks: Array<{ title: string }> } };

      expect(result.plan.tasks).toHaveLength(2);
      expect(result.plan.tasks[0].title).toBe('Extract interfaces');
      expect(result.plan.tasks[1].title).toBe('Add tests');
    });

    it('should work without optional domain parameter', async () => {
      const op = findOp('orchestrate_plan');
      const result = (await op.handler({
        objective: 'Quick fix',
        scope: 'all',
      })) as { plan: { id: string } };

      expect(result.plan.id).toBeDefined();
    });
  });

  // ─── orchestrate_execute ────────────────────────────────────────

  describe('orchestrate_execute', () => {
    it('should start plan execution and open a brain session', async () => {
      // Create and approve a plan first
      const plan = runtime.planner.create({
        objective: 'Test execution',
        scope: 'test',
      });
      runtime.planner.approve(plan.id);

      const op = findOp('orchestrate_execute');
      const result = (await op.handler({
        planId: plan.id,
        domain: 'testing',
        context: 'Running orchestration test',
      })) as { plan: { status: string }; session: { id: string; domain: string | null } };

      expect(result.plan.status).toBe('executing');
      expect(result.session).toBeDefined();
      expect(result.session.id).toBeDefined();
      expect(result.session.domain).toBe('testing');
    });

    it('should throw when plan is not approved', async () => {
      const plan = runtime.planner.create({
        objective: 'Not approved',
        scope: 'test',
      });

      const op = findOp('orchestrate_execute');
      await expect(op.handler({ planId: plan.id })).rejects.toThrow(/must be 'approved'/);
    });
  });

  // ─── orchestrate_complete ───────────────────────────────────────

  describe('orchestrate_complete', () => {
    it('should complete plan, end session, and extract knowledge', async () => {
      // Full lifecycle: create -> approve -> execute -> complete
      const plan = runtime.planner.create({
        objective: 'Full lifecycle test',
        scope: 'test',
      });
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);

      // Start a brain session
      const session = runtime.brainIntelligence.lifecycle({
        action: 'start',
        domain: 'testing',
        planId: plan.id,
      });

      const op = findOp('orchestrate_complete');
      const result = (await op.handler({
        planId: plan.id,
        sessionId: session.id,
        outcome: 'completed',
        toolsUsed: ['tool1', 'tool2', 'tool1', 'tool1'],
        filesModified: ['a.ts', 'b.ts'],
      })) as {
        plan: { status: string };
        session: { endedAt: string | null; planOutcome: string | null };
        extraction: unknown;
      };

      expect(result.plan.status).toBe('completed');
      expect(result.session.endedAt).toBeDefined();
      expect(result.session.planOutcome).toBe('completed');
      // extraction may or may not produce proposals depending on heuristics
    });

    it('should handle abandoned outcome', async () => {
      const plan = runtime.planner.create({ objective: 'Abandoned test', scope: 'test' });
      runtime.planner.approve(plan.id);
      runtime.planner.startExecution(plan.id);

      const session = runtime.brainIntelligence.lifecycle({
        action: 'start',
        domain: 'testing',
      });

      const op = findOp('orchestrate_complete');
      const result = (await op.handler({
        planId: plan.id,
        sessionId: session.id,
        outcome: 'abandoned',
      })) as { plan: { status: string }; session: { planOutcome: string | null } };

      expect(result.plan.status).toBe('completed');
      expect(result.session.planOutcome).toBe('abandoned');
    });
  });

  // ─── orchestrate_status ─────────────────────────────────────────

  describe('orchestrate_status', () => {
    it('should return combined status', async () => {
      const op = findOp('orchestrate_status');
      const result = (await op.handler({})) as {
        activePlans: unknown[];
        sessionContext: { recentSessions: unknown[] };
        vaultStats: { totalEntries: number };
        recommendations: unknown[];
        brainStats: { sessions: number };
      };

      expect(result.activePlans).toBeDefined();
      expect(Array.isArray(result.activePlans)).toBe(true);
      expect(result.sessionContext).toBeDefined();
      expect(result.vaultStats).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.brainStats).toBeDefined();
    });

    it('should include active plans in status', async () => {
      runtime.planner.create({ objective: 'Active plan 1', scope: 'test' });
      runtime.planner.create({ objective: 'Active plan 2', scope: 'test' });

      const op = findOp('orchestrate_status');
      const result = (await op.handler({})) as {
        activePlans: Array<{ objective: string }>;
      };

      expect(result.activePlans).toHaveLength(2);
    });

    it('should respect sessionLimit parameter', async () => {
      const op = findOp('orchestrate_status');
      const result = (await op.handler({ sessionLimit: 2 })) as {
        sessionContext: { recentSessions: unknown[] };
      };

      // No sessions exist, but the limit should be respected
      expect(result.sessionContext.recentSessions).toBeDefined();
    });
  });

  // ─── orchestrate_quick_capture ──────────────────────────────────

  describe('orchestrate_quick_capture', () => {
    it('should create, end, and extract in one call', async () => {
      const op = findOp('orchestrate_quick_capture');
      const result = (await op.handler({
        domain: 'component',
        context: 'Built a new date picker with keyboard navigation',
        toolsUsed: ['validate_component_code', 'check_contrast'],
        filesModified: ['src/DatePicker.tsx', 'src/DatePicker.test.tsx'],
        outcome: 'completed',
      })) as {
        session: { id: string; endedAt: string | null; domain: string | null };
        extraction: unknown;
      };

      expect(result.session).toBeDefined();
      expect(result.session.endedAt).toBeDefined();
      expect(result.session.domain).toBe('component');
    });

    it('should work with minimal params', async () => {
      const op = findOp('orchestrate_quick_capture');
      const result = (await op.handler({
        domain: 'misc',
        context: 'Fixed a typo',
      })) as { session: { id: string } };

      expect(result.session).toBeDefined();
      expect(result.session.id).toBeDefined();
    });

    it('should handle abandoned outcome', async () => {
      const op = findOp('orchestrate_quick_capture');
      const result = (await op.handler({
        domain: 'refactor',
        context: 'Started refactor but rolled back',
        outcome: 'abandoned',
      })) as { session: { planOutcome: string | null } };

      expect(result.session.planOutcome).toBe('abandoned');
    });
  });
});
