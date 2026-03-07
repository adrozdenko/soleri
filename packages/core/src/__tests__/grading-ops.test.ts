import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createSemanticFacades } from '../runtime/facades/index.js';
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
    ops = createSemanticFacades(runtime, 'test').flatMap(f => f.ops);
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
      objective: opts.objective ?? 'Test plan objective',
      scope: opts.scope ?? 'Test scope description',
      decisions: opts.decisions,
      tasks: opts.tasks,
    })) as { plan: { id: string } };
    return result.plan.id;
  }

  describe('plan_grade', () => {
    it('should grade an empty plan with very low score', async () => {
      const planId = await createPlan({ objective: '', scope: '' });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        score: number;
        grade: string;
        gaps: Array<{
          severity: string;
          category: string;
          description: string;
          recommendation: string;
        }>;
        iteration: number;
      };
      // 3 critical gaps: no objective, no scope, no tasks = -90
      expect(check.score).toBeLessThanOrEqual(10);
      expect(check.grade).toBe('F');
      expect(check.gaps.length).toBeGreaterThan(0);
      expect(check.iteration).toBe(1);
      // Gaps should have the new format
      expect(check.gaps[0].recommendation).toBeDefined();
    });

    it('should grade a well-formed plan highly on first iteration', async () => {
      const planId = await createPlan({
        objective: 'Build a Redis caching layer for API to reduce database load by 50%',
        scope: 'API backend services only. Does not include frontend or CDN caching.',
        decisions: [
          'Use Redis because it provides sub-millisecond latency and supports TTL natively',
          'Set TTL to 5 minutes since average data freshness requirement is 10 minutes',
        ],
        tasks: [
          {
            title: 'Setup Redis client',
            description: 'Install and configure Redis connection pool',
          },
          { title: 'Add middleware', description: 'Express transparent caching middleware layer' },
          {
            title: 'Add invalidation',
            description: 'Cache invalidation on writes for consistency',
          },
          { title: 'Add tests', description: 'Integration tests for cache hit/miss scenarios' },
          { title: 'Add metrics', description: 'Track and verify cache hit rate monitoring' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        score: number;
        grade: string;
      };
      // On iteration 1, minor gaps are free
      expect(check.score).toBeGreaterThanOrEqual(95);
      expect(check.grade).toMatch(/^A/);
    });

    it('should penalize duplicate task titles', async () => {
      const planId = await createPlan({
        objective: 'Test duplicate title detection in the grading engine',
        scope: 'Testing only, does not include production changes',
        decisions: [
          'Use assertions because they provide clear error messages due to descriptive output',
        ],
        tasks: [
          { title: 'Same name', description: 'First task implementation' },
          { title: 'Same name', description: 'Second task implementation' },
          { title: 'Unique name', description: 'Third task implementation' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        gaps: Array<{ description: string; category: string }>;
      };
      const dupGap = check.gaps.find((g) => g.description.includes('Duplicate'));
      expect(dupGap).toBeDefined();
      expect(dupGap!.category).toBe('semantic-quality');
    });

    it('should penalize tasks with short descriptions', async () => {
      const planId = await createPlan({
        objective: 'Test short description detection in the grading engine',
        scope: 'Testing only, does not include production changes',
        decisions: ['Use short tasks because they test the clarity analysis pass'],
        tasks: [
          { title: 'Task good', description: 'Has a proper description here' },
          { title: 'Task bad', description: '' },
          { title: 'Task ok', description: 'Also has a description' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        gaps: Array<{ description: string; category: string }>;
      };
      const descGap = check.gaps.find((g) => g.description.includes('short descriptions'));
      expect(descGap).toBeDefined();
      expect(descGap!.category).toBe('clarity');
    });

    it('should penalize plan without decisions using semantic-quality category', async () => {
      const planId = await createPlan({
        objective: 'Test missing decisions detection in the plan grading system',
        scope: 'Testing only, does not include production changes',
        tasks: [
          { title: 'T1', description: 'First task with details' },
          { title: 'T2', description: 'Second task with details' },
          { title: 'T3', description: 'Third task with details' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        gaps: Array<{ category: string; description: string }>;
      };
      const decGap = check.gaps.find(
        (g) => g.category === 'semantic-quality' && g.description.includes('no decisions'),
      );
      expect(decGap).toBeDefined();
    });

    it('should penalize too few tasks', async () => {
      const planId = await createPlan({
        objective: 'Test task granularity detection in grading',
        scope: 'Testing only, does not include production changes',
        decisions: ['Use single task because it tests granularity check'],
        tasks: [{ title: 'Only task', description: 'This is the only task' }],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        gaps: Array<{ description: string }>;
      };
      const granGap = check.gaps.find((g) => g.description.includes('lack'));
      expect(granGap).toBeDefined();
    });

    it('should include iteration number in check', async () => {
      const planId = await createPlan({});
      const check1 = (await findOp('plan_grade').handler({ planId })) as { iteration: number };
      const check2 = (await findOp('plan_grade').handler({ planId })) as { iteration: number };
      expect(check1.iteration).toBe(1);
      expect(check2.iteration).toBe(2);
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

    it('should accumulate checks with increasing iteration', async () => {
      const planId = await createPlan({});
      await findOp('plan_grade').handler({ planId });
      await findOp('plan_grade').handler({ planId });
      await findOp('plan_grade').handler({ planId });
      const result = (await findOp('plan_check_history').handler({ planId })) as {
        count: number;
        checks: Array<{ checkId: string; iteration: number }>;
      };
      expect(result.count).toBe(3);
      const ids = new Set(result.checks.map((c) => c.checkId));
      expect(ids.size).toBe(3);
      expect(result.checks[0].iteration).toBe(1);
      expect(result.checks[2].iteration).toBe(3);
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
        objective: 'Build a comprehensive feature for the testing module',
        scope: 'Testing module only, does not include deployment or infrastructure',
        decisions: [
          'Use vitest because it integrates natively with TypeScript due to built-in support',
        ],
        tasks: [
          { title: 'Write unit tests', description: 'Cover all edge cases in the module' },
          { title: 'Write integration tests', description: 'End-to-end API tests for the flow' },
          { title: 'Add CI pipeline', description: 'Run tests automatically on every PR' },
          { title: 'Add coverage report', description: 'Track and verify code coverage metrics' },
        ],
      });
      const result = (await findOp('plan_meets_grade').handler({
        planId,
        targetGrade: 'B',
      })) as { meets: boolean; check: { score: number } };
      expect(result.meets).toBe(true);
      expect(result.check.score).toBeGreaterThanOrEqual(80);
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
    it('should return gaps grouped by severity with next action', async () => {
      const planId = await createPlan({ objective: '', scope: '' });
      const result = (await findOp('plan_auto_improve').handler({ planId })) as {
        grade: string;
        score: number;
        iteration: number;
        totalGaps: number;
        gapsBySeverity: Record<
          string,
          Array<{ category: string; description: string; recommendation: string }>
        >;
        nextAction: string;
      };
      expect(result.score).toBeLessThan(100);
      expect(result.totalGaps).toBeGreaterThan(0);
      expect(result.gapsBySeverity.critical).toBeDefined();
      expect(result.gapsBySeverity.critical.length).toBeGreaterThan(0);
      expect(result.nextAction).toBe('iterate');
      // Each gap should have recommendation field
      expect(result.gapsBySeverity.critical[0].recommendation).toBeDefined();
    });

    it('should return approve next action for high-scoring plan', async () => {
      const planId = await createPlan({
        objective: 'Build a Redis caching layer for API to reduce database load by 50%',
        scope: 'API backend services only. Does not include frontend or CDN caching.',
        decisions: [
          'Use Redis because it provides sub-millisecond latency and supports TTL natively',
          'Set TTL to 5 minutes since average data freshness requirement is 10 minutes',
        ],
        tasks: [
          { title: 'Setup Redis', description: 'Install and configure Redis connection pool' },
          { title: 'Add middleware', description: 'Express transparent caching middleware layer' },
          {
            title: 'Add invalidation',
            description: 'Cache invalidation on writes for consistency',
          },
          { title: 'Add tests', description: 'Integration tests for cache hit/miss scenarios' },
          { title: 'Add metrics', description: 'Track and verify cache hit rate monitoring' },
        ],
      });
      const result = (await findOp('plan_auto_improve').handler({ planId })) as {
        score: number;
        nextAction: string;
      };
      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.nextAction).toBe('approve');
    });
  });

  describe('grade thresholds', () => {
    it('A+ should require >= 95', async () => {
      const planId = await createPlan({
        objective: 'Implement a Redis caching layer for the API to reduce DB load by 50%',
        scope: 'Backend API services only. Does not include frontend or CDN.',
        decisions: [
          'Use Redis because it provides sub-millisecond latency and supports TTL natively',
          'Set TTL to 5 minutes since average data freshness requirement is 10 minutes',
        ],
        tasks: [
          { title: 'Setup Redis', description: 'Install and configure Redis connection pool' },
          { title: 'Add middleware', description: 'Express transparent caching middleware' },
          { title: 'Add invalidation', description: 'Cache invalidation on write operations' },
          { title: 'Add tests', description: 'Integration tests for cache hit/miss scenarios' },
          { title: 'Add metrics', description: 'Track and verify cache hit rate monitoring' },
        ],
      });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        score: number;
        grade: string;
      };
      if (check.score >= 95) {
        expect(check.grade).toBe('A+');
      } else if (check.score >= 90) {
        expect(check.grade).toBe('A');
      }
    });

    it('F should be for score < 60', async () => {
      const planId = await createPlan({ objective: '', scope: '' });
      const check = (await findOp('plan_grade').handler({ planId })) as {
        score: number;
        grade: string;
      };
      expect(check.score).toBeLessThan(60);
      expect(check.grade).toBe('F');
    });
  });
});
