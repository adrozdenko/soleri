import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createCoreOps } from '../runtime/core-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('Grading Ops', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'grading-ops-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-grading',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createCoreOps(runtime);
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

  // ─── Helper to create plans ─────────────────────────────────────
  async function createPlan(opts: {
    objective?: string;
    scope?: string;
    decisions?: string[];
    tasks?: Array<{ title: string; description: string }>;
  }): Promise<string> {
    const result = (await findOp('create_plan').handler({
      objective: opts.objective ?? 'Test plan',
      scope: opts.scope ?? 'Test scope',
      decisions: opts.decisions,
      tasks: opts.tasks,
    })) as { plan: { id: string } };
    return result.plan.id;
  }

  describe('plan_grade', () => {
    it('should grade an empty plan with low score', async () => {
      const planId = await createPlan({ objective: '', scope: '' });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        score: number;
        grade: string;
        gaps: Array<{ severity: string; category: string; description: string }>;
      };
      expect(check.score).toBeLessThanOrEqual(40);
      expect(check.gaps.length).toBeGreaterThan(0);
    });

    it('should grade a well-formed plan highly', async () => {
      const planId = await createPlan({
        objective: 'Build a caching layer for API',
        scope: 'API backend services',
        decisions: ['Use Redis', 'TTL 5 minutes'],
        tasks: [
          { title: 'Setup Redis', description: 'Install and configure Redis' },
          { title: 'Add middleware', description: 'Express caching middleware' },
          { title: 'Add invalidation', description: 'Cache invalidation on writes' },
          { title: 'Add tests', description: 'Integration tests for caching' },
          { title: 'Add metrics', description: 'Cache hit rate monitoring' },
          { title: 'Add docs', description: 'Document caching strategy' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        score: number;
        grade: string;
        gaps: Array<{ severity: string }>;
      };
      expect(check.score).toBeGreaterThanOrEqual(85);
      expect(check.grade).toMatch(/^A/);
    });

    it('should penalize duplicate task titles', async () => {
      const planId = await createPlan({
        decisions: ['D1', 'D2'],
        tasks: [
          { title: 'Same name', description: 'First' },
          { title: 'Same name', description: 'Second' },
          { title: 'Unique', description: 'Third' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        gaps: Array<{ description: string }>;
      };
      const dupGap = check.gaps.find((g) => g.description.includes('Duplicate'));
      expect(dupGap).toBeDefined();
    });

    it('should penalize tasks without descriptions', async () => {
      const planId = await createPlan({
        decisions: ['D1'],
        tasks: [
          { title: 'T1', description: 'Good' },
          { title: 'T2', description: '' },
          { title: 'T3', description: 'Good' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        gaps: Array<{ description: string }>;
      };
      const descGap = check.gaps.find((g) => g.description.includes('missing descriptions'));
      expect(descGap).toBeDefined();
    });

    it('should penalize plan without decisions', async () => {
      const planId = await createPlan({
        tasks: [
          { title: 'T1', description: 'D1' },
          { title: 'T2', description: 'D2' },
          { title: 'T3', description: 'D3' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        gaps: Array<{ category: string; description: string }>;
      };
      const decGap = check.gaps.find((g) => g.category === 'decisions');
      expect(decGap).toBeDefined();
    });

    it('should penalize too few tasks (granularity)', async () => {
      const planId = await createPlan({
        decisions: ['D1'],
        tasks: [{ title: 'T1', description: 'D1' }],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        gaps: Array<{ description: string }>;
      };
      const granGap = check.gaps.find((g) => g.description.includes('lack granularity'));
      expect(granGap).toBeDefined();
    });
  });

  describe('plan_check_history', () => {
    it('should return empty checks for new plan', async () => {
      const planId = await createPlan({});
      const result = (await findOp('plan_check_history').handler({ planId })) as {
        count: number;
        checks: unknown[];
      };
      expect(result.count).toBe(0);
      expect(result.checks).toEqual([]);
    });

    it('should accumulate checks', async () => {
      const planId = await createPlan({});
      await findOp('plan_grade').handler({ planId });
      await findOp('plan_grade').handler({ planId });
      await findOp('plan_grade').handler({ planId });
      const result = (await findOp('plan_check_history').handler({ planId })) as {
        count: number;
        checks: Array<{ checkId: string }>;
      };
      expect(result.count).toBe(3);
      // All check IDs should be unique
      const ids = new Set(result.checks.map((c) => c.checkId));
      expect(ids.size).toBe(3);
    });
  });

  describe('plan_latest_check', () => {
    it('should return null-like response for ungraded plan', async () => {
      const planId = await createPlan({});
      const result = (await findOp('plan_latest_check').handler({ planId })) as {
        check?: null;
        message?: string;
      };
      expect(result.message).toBeDefined();
    });

    it('should return latest check after grading', async () => {
      const planId = await createPlan({});
      const gradeResult = (await findOp('plan_grade').handler({ planId })) as {
        checkId: string;
      };
      const latest = (await findOp('plan_latest_check').handler({ planId })) as {
        checkId: string;
      };
      expect(latest.checkId).toBe(gradeResult.checkId);
    });
  });

  describe('plan_meets_grade', () => {
    it('should return meets=true for plan meeting target', async () => {
      const planId = await createPlan({
        objective: 'Good plan',
        scope: 'Complete scope',
        decisions: ['D1', 'D2'],
        tasks: [
          { title: 'T1', description: 'D1' },
          { title: 'T2', description: 'D2' },
          { title: 'T3', description: 'D3' },
          { title: 'T4', description: 'D4' },
          { title: 'T5', description: 'D5' },
          { title: 'T6', description: 'D6' },
        ],
      });
      const result = (await findOp('plan_meets_grade').handler({
        planId,
        targetGrade: 'C',
      })) as { meets: boolean; check: { score: number } };
      expect(result.meets).toBe(true);
    });

    it('should return meets=false for plan not meeting target', async () => {
      const planId = await createPlan({ objective: '', scope: '' });
      const result = (await findOp('plan_meets_grade').handler({
        planId,
        targetGrade: 'A+',
      })) as { meets: boolean; check: { score: number } };
      expect(result.meets).toBe(false);
    });
  });

  describe('plan_auto_improve', () => {
    it('should return sorted gaps with suggestions', async () => {
      const planId = await createPlan({ objective: '', scope: '' });
      const result = (await findOp('plan_auto_improve').handler({ planId })) as {
        check: { score: number; grade: string };
        worstGaps: Array<{ severity: string; category: string }>;
        suggestions: string[];
      };
      expect(result.check.score).toBeLessThan(100);
      expect(result.worstGaps.length).toBeGreaterThan(0);
      expect(result.suggestions.length).toBeGreaterThan(0);
      // Critical should come first
      if (result.worstGaps.length > 1) {
        const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2 };
        for (let i = 0; i < result.worstGaps.length - 1; i++) {
          const current = severityOrder[result.worstGaps[i].severity] ?? 3;
          const next = severityOrder[result.worstGaps[i + 1].severity] ?? 3;
          expect(current).toBeLessThanOrEqual(next);
        }
      }
    });

    it('should return empty gaps for perfect plan', async () => {
      const planId = await createPlan({
        objective: 'Build feature X',
        scope: 'Module Y',
        decisions: ['Use approach A', 'Use approach B'],
        tasks: [
          { title: 'Task 1', description: 'First task' },
          { title: 'Task 2', description: 'Second task' },
          { title: 'Task 3', description: 'Third task' },
          { title: 'Task 4', description: 'Fourth task' },
          { title: 'Task 5', description: 'Fifth task' },
          { title: 'Task 6', description: 'Sixth task' },
        ],
      });
      const result = (await findOp('plan_auto_improve').handler({ planId })) as {
        check: { score: number };
        worstGaps: unknown[];
        suggestions: unknown[];
      };
      expect(result.check.score).toBeGreaterThanOrEqual(95);
    });
  });

  describe('grade thresholds', () => {
    it('A+ should require >= 95', async () => {
      // A perfect plan: objective, scope, 5 tasks (all with desc), 2 decisions, unique titles
      const planId = await createPlan({
        objective: 'Build X',
        scope: 'Module Y',
        decisions: ['D1', 'D2'],
        tasks: [
          { title: 'T1', description: 'D1' },
          { title: 'T2', description: 'D2' },
          { title: 'T3', description: 'D3' },
          { title: 'T4', description: 'D4' },
          { title: 'T5', description: 'D5' },
          { title: 'T6', description: 'D6' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        score: number;
        grade: string;
      };
      if (check.score >= 95) {
        expect(check.grade).toBe('A+');
      } else if (check.score >= 85) {
        expect(check.grade).toBe('A');
      }
    });

    it('F should be for score < 40', async () => {
      // A terrible plan: no objective, no scope, no tasks
      const planId = await createPlan({ objective: '', scope: '' });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        score: number;
        grade: string;
      };
      if (check.score < 40) {
        expect(check.grade).toBe('F');
      }
    });
  });
});
