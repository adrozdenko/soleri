import { describe, it, expect, vi } from 'vitest';
import { createGradingOps } from './grading-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

function makeMockRuntime() {
  return {
    planner: {
      grade: vi.fn().mockReturnValue({
        grade: 'B',
        score: 82,
        iteration: 1,
        gaps: [
          { severity: 'major', category: 'scope', description: 'Missing scope', recommendation: 'Add scope', location: 'plan.scope' },
          { severity: 'minor', category: 'detail', description: 'Low detail', recommendation: 'Add detail' },
          { severity: 'critical', category: 'risk', description: 'No risk analysis', recommendation: 'Add risks' },
        ],
      }),
      getCheckHistory: vi.fn().mockReturnValue([
        { grade: 'C', score: 70, iteration: 1 },
        { grade: 'B', score: 82, iteration: 2 },
      ]),
      getLatestCheck: vi.fn().mockReturnValue({ grade: 'B', score: 82, iteration: 2 }),
      meetsGrade: vi.fn().mockReturnValue({ meets: true, currentScore: 92, threshold: 90 }),
    },
  } as unknown as AgentRuntime;
}

describe('createGradingOps', () => {
  let ops: OpDefinition[];
  let runtime: ReturnType<typeof makeMockRuntime>;

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  it('returns 5 ops', () => {
    runtime = makeMockRuntime();
    ops = createGradingOps(runtime);
    expect(ops).toHaveLength(5);
  });

  it('has correct op names', () => {
    runtime = makeMockRuntime();
    ops = createGradingOps(runtime);
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'plan_grade',
      'plan_check_history',
      'plan_latest_check',
      'plan_meets_grade',
      'plan_auto_improve',
    ]);
  });

  it('all ops have read auth', () => {
    runtime = makeMockRuntime();
    ops = createGradingOps(runtime);
    for (const op of ops) {
      expect(op.auth).toBe('read');
    }
  });

  describe('plan_grade', () => {
    it('delegates to planner.grade', async () => {
      runtime = makeMockRuntime();
      ops = createGradingOps(runtime);
      const result = await findOp('plan_grade').handler({ planId: 'p1' });
      expect(runtime.planner.grade).toHaveBeenCalledWith('p1');
      expect(result).toHaveProperty('grade', 'B');
    });
  });

  describe('plan_check_history', () => {
    it('returns count and checks array', async () => {
      runtime = makeMockRuntime();
      ops = createGradingOps(runtime);
      const result = (await findOp('plan_check_history').handler({ planId: 'p1' })) as Record<string, unknown>;
      expect(result.planId).toBe('p1');
      expect(result.count).toBe(2);
      expect(result.checks).toHaveLength(2);
    });
  });

  describe('plan_latest_check', () => {
    it('returns the latest check', async () => {
      runtime = makeMockRuntime();
      ops = createGradingOps(runtime);
      const result = await findOp('plan_latest_check').handler({ planId: 'p1' });
      expect(result).toHaveProperty('grade', 'B');
    });

    it('returns message when no checks found', async () => {
      runtime = makeMockRuntime();
      (runtime.planner.getLatestCheck as ReturnType<typeof vi.fn>).mockReturnValue(null);
      ops = createGradingOps(runtime);
      const result = (await findOp('plan_latest_check').handler({ planId: 'p1' })) as Record<string, unknown>;
      expect(result.message).toBe('No checks found for this plan.');
    });
  });

  describe('plan_meets_grade', () => {
    it('delegates to planner.meetsGrade', async () => {
      runtime = makeMockRuntime();
      ops = createGradingOps(runtime);
      const result = await findOp('plan_meets_grade').handler({ planId: 'p1', targetGrade: 'A' });
      expect(runtime.planner.meetsGrade).toHaveBeenCalledWith('p1', 'A');
      expect(result).toHaveProperty('meets', true);
    });
  });

  describe('plan_auto_improve', () => {
    it('sorts gaps by severity and groups them', async () => {
      runtime = makeMockRuntime();
      ops = createGradingOps(runtime);
      const result = (await findOp('plan_auto_improve').handler({ planId: 'p1' })) as Record<string, unknown>;
      expect(result.grade).toBe('B');
      expect(result.score).toBe(82);
      expect(result.totalGaps).toBe(3);
      expect(result.nextAction).toBe('iterate');

      const grouped = result.gapsBySeverity as Record<string, unknown[]>;
      expect(grouped.critical).toHaveLength(1);
      expect(grouped.major).toHaveLength(1);
      expect(grouped.minor).toHaveLength(1);
    });

    it('returns approve as nextAction when score >= 90', async () => {
      runtime = makeMockRuntime();
      (runtime.planner.grade as ReturnType<typeof vi.fn>).mockReturnValue({
        grade: 'A', score: 92, iteration: 3, gaps: [],
      });
      ops = createGradingOps(runtime);
      const result = (await findOp('plan_auto_improve').handler({ planId: 'p1' })) as Record<string, unknown>;
      expect(result.nextAction).toBe('approve');
      expect(result.totalGaps).toBe(0);
    });
  });
});
