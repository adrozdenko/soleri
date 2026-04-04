import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  getValidNextStatuses,
  shouldExpire,
  applyTransition,
  LIFECYCLE_TRANSITIONS,
  NON_EXPIRING_STATUSES,
  scoreToGrade,
  gradeToMinScore,
  PlanGradeRejectionError,
  hasCircularDependencies,
  calculateScore,
  applyIteration,
  applySplitTasks,
  applyTaskStatusUpdate,
  createPlanObject,
} from './plan-lifecycle.js';
import type { PlanStatus } from './plan-lifecycle.js';
import type { Plan, PlanTask } from './planner-types.js';

describe('plan-lifecycle', () => {
  describe('isValidTransition', () => {
    it('allows brainstorming -> draft', () => {
      expect(isValidTransition('brainstorming', 'draft')).toBe(true);
    });
    it('disallows brainstorming -> approved', () => {
      expect(isValidTransition('brainstorming', 'approved')).toBe(false);
    });
    it('allows executing -> validating', () => {
      expect(isValidTransition('executing', 'validating')).toBe(true);
    });
    it('allows validating -> executing (back-transition)', () => {
      expect(isValidTransition('validating', 'executing')).toBe(true);
    });
    it('disallows archived -> any', () => {
      for (const s of Object.keys(LIFECYCLE_TRANSITIONS) as PlanStatus[]) {
        expect(isValidTransition('archived', s)).toBe(false);
      }
    });
  });

  describe('getValidNextStatuses', () => {
    it('returns [draft] for brainstorming', () => {
      expect(getValidNextStatuses('brainstorming')).toEqual(['draft']);
    });
    it('returns empty for archived', () => {
      expect(getValidNextStatuses('archived')).toEqual([]);
    });
  });

  describe('shouldExpire', () => {
    it('returns false for executing', () => {
      expect(shouldExpire('executing')).toBe(false);
    });
    it('returns true for draft', () => {
      expect(shouldExpire('draft')).toBe(true);
    });
    it('returns true for completed', () => {
      expect(shouldExpire('completed')).toBe(true);
    });
    it('returns false for all non-expiring statuses', () => {
      for (const s of NON_EXPIRING_STATUSES) {
        expect(shouldExpire(s)).toBe(false);
      }
    });
  });

  describe('applyTransition', () => {
    it('returns new status and timestamp for valid transition', () => {
      const before = Date.now();
      const result = applyTransition('draft', 'approved');
      expect(result.status).toBe('approved');
      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result.updatedAt).toBeLessThanOrEqual(Date.now());
    });
    it('throws for invalid transition', () => {
      expect(() => applyTransition('draft', 'executing')).toThrow('Invalid transition');
    });
    it('error message includes valid transitions', () => {
      expect(() => applyTransition('draft', 'completed')).toThrow('approved');
    });
  });

  describe('scoreToGrade', () => {
    it('maps score thresholds correctly', () => {
      expect(scoreToGrade(100)).toBe('A+');
      expect(scoreToGrade(95)).toBe('A+');
      expect(scoreToGrade(94)).toBe('A');
      expect(scoreToGrade(90)).toBe('A');
      expect(scoreToGrade(89)).toBe('B');
      expect(scoreToGrade(80)).toBe('B');
      expect(scoreToGrade(79)).toBe('C');
      expect(scoreToGrade(70)).toBe('C');
      expect(scoreToGrade(69)).toBe('D');
      expect(scoreToGrade(60)).toBe('D');
      expect(scoreToGrade(59)).toBe('F');
      expect(scoreToGrade(0)).toBe('F');
    });
  });

  describe('gradeToMinScore', () => {
    it('returns correct minimum scores', () => {
      expect(gradeToMinScore('A+')).toBe(95);
      expect(gradeToMinScore('A')).toBe(90);
      expect(gradeToMinScore('B')).toBe(80);
      expect(gradeToMinScore('C')).toBe(70);
      expect(gradeToMinScore('D')).toBe(60);
      expect(gradeToMinScore('F')).toBe(0);
    });
  });

  describe('PlanGradeRejectionError', () => {
    it('contains grade, score, minGrade and gaps', () => {
      const gaps = [
        {
          id: 'g1',
          severity: 'critical' as const,
          category: 'structure',
          description: 'Missing structure',
          recommendation: 'Fix it',
        },
      ];
      const err = new PlanGradeRejectionError('C', 65, 'A', gaps);
      expect(err.grade).toBe('C');
      expect(err.score).toBe(65);
      expect(err.minGrade).toBe('A');
      expect(err.gaps).toHaveLength(1);
      expect(err.message).toContain('below the minimum required grade A');
      expect(err.name).toBe('PlanGradeRejectionError');
    });
    it('includes critical and major gaps in message', () => {
      const gaps = [
        {
          id: 'g1',
          severity: 'critical' as const,
          category: 'x',
          description: 'Crit gap',
          recommendation: '',
        },
        {
          id: 'g2',
          severity: 'minor' as const,
          category: 'x',
          description: 'Minor gap',
          recommendation: '',
        },
      ];
      const err = new PlanGradeRejectionError('D', 55, 'A', gaps);
      expect(err.message).toContain('Crit gap');
      expect(err.message).not.toContain('Minor gap');
    });
  });

  describe('hasCircularDependencies', () => {
    it('returns false for no dependencies', () => {
      expect(hasCircularDependencies([{ id: 'a' }, { id: 'b' }])).toBe(false);
    });
    it('returns false for linear dependencies', () => {
      expect(
        hasCircularDependencies([
          { id: 'a' },
          { id: 'b', dependsOn: ['a'] },
          { id: 'c', dependsOn: ['b'] },
        ]),
      ).toBe(false);
    });
    it('returns true for direct cycle', () => {
      expect(
        hasCircularDependencies([
          { id: 'a', dependsOn: ['b'] },
          { id: 'b', dependsOn: ['a'] },
        ]),
      ).toBe(true);
    });
    it('returns true for indirect cycle', () => {
      expect(
        hasCircularDependencies([
          { id: 'a', dependsOn: ['c'] },
          { id: 'b', dependsOn: ['a'] },
          { id: 'c', dependsOn: ['b'] },
        ]),
      ).toBe(true);
    });
    it('returns true for self-dependency', () => {
      expect(hasCircularDependencies([{ id: 'a', dependsOn: ['a'] }])).toBe(true);
    });
  });

  describe('calculateScore', () => {
    it('returns 100 for no gaps', () => {
      expect(calculateScore([])).toBe(100);
    });
    it('deducts critical gaps at weight 30', () => {
      const gaps = [
        {
          id: 'g',
          severity: 'critical' as const,
          category: 'structure',
          description: 'x',
          recommendation: 'y',
        },
      ];
      expect(calculateScore(gaps)).toBe(70);
    });
    it('treats minor gaps as free on iteration 1', () => {
      const gaps = [
        {
          id: 'g',
          severity: 'minor' as const,
          category: 'clarity',
          description: 'x',
          recommendation: 'y',
        },
      ];
      expect(calculateScore(gaps, 1)).toBe(100);
    });
    it('treats minor gaps at half weight on iteration 2', () => {
      const gaps = [
        {
          id: 'g',
          severity: 'minor' as const,
          category: 'clarity',
          description: 'x',
          recommendation: 'y',
        },
      ];
      expect(calculateScore(gaps, 2)).toBe(99);
    });
    it('treats minor gaps at full weight on iteration 3', () => {
      const gaps = [
        {
          id: 'g',
          severity: 'minor' as const,
          category: 'clarity',
          description: 'x',
          recommendation: 'y',
        },
      ];
      expect(calculateScore(gaps, 3)).toBe(98);
    });
    it('floors at 0', () => {
      const gaps = Array.from({ length: 5 }, (_, i) => ({
        id: `g${i}`,
        severity: 'critical' as const,
        category: `cat${i}`,
        description: 'x',
        recommendation: 'y',
      }));
      expect(calculateScore(gaps)).toBe(0);
    });
  });

  describe('applyIteration', () => {
    const makePlan = (): Plan => createPlanObject({ objective: 'test', scope: 'test' });

    it('updates objective and scope', () => {
      const plan = makePlan();
      applyIteration(plan, { objective: 'new obj', scope: 'new scope' });
      expect(plan.objective).toBe('new obj');
      expect(plan.scope).toBe('new scope');
    });
    it('adds tasks with correct IDs', () => {
      const plan = makePlan();
      plan.tasks = [
        { id: 'task-1', title: 'T1', description: 'd', status: 'pending', updatedAt: 0 },
      ];
      applyIteration(plan, { addTasks: [{ title: 'T2', description: 'd2' }] });
      expect(plan.tasks).toHaveLength(2);
      expect(plan.tasks[1].id).toBe('task-2');
    });
    it('removes tasks by ID', () => {
      const plan = makePlan();
      plan.tasks = [
        { id: 'task-1', title: 'T1', description: 'd', status: 'pending', updatedAt: 0 },
        { id: 'task-2', title: 'T2', description: 'd', status: 'pending', updatedAt: 0 },
      ];
      applyIteration(plan, { removeTasks: ['task-1'] });
      expect(plan.tasks).toHaveLength(1);
      expect(plan.tasks[0].id).toBe('task-2');
    });
  });

  describe('applySplitTasks', () => {
    it('replaces tasks with new set', () => {
      const plan = createPlanObject({ objective: 'test', scope: 'test' });
      applySplitTasks(plan, [
        { title: 'A', description: 'a' },
        { title: 'B', description: 'b', dependsOn: ['task-1'] },
      ]);
      expect(plan.tasks).toHaveLength(2);
      expect(plan.tasks[1].dependsOn).toEqual(['task-1']);
    });
    it('throws on unknown dependency', () => {
      const plan = createPlanObject({ objective: 'test', scope: 'test' });
      expect(() =>
        applySplitTasks(plan, [{ title: 'A', description: 'a', dependsOn: ['task-99'] }]),
      ).toThrow('depends on unknown task');
    });
    it('preserves acceptance criteria', () => {
      const plan = createPlanObject({ objective: 'test', scope: 'test' });
      applySplitTasks(plan, [{ title: 'A', description: 'a', acceptanceCriteria: ['cr1', 'cr2'] }]);
      expect(plan.tasks[0].acceptanceCriteria).toEqual(['cr1', 'cr2']);
    });
  });

  describe('applyTaskStatusUpdate', () => {
    const makeTask = (): PlanTask => ({
      id: 'task-1',
      title: 'T',
      description: 'd',
      status: 'pending',
      updatedAt: 0,
    });

    it('sets startedAt on first in_progress', () => {
      const before = Date.now();
      const task = makeTask();
      applyTaskStatusUpdate(task, 'in_progress');
      expect(task.startedAt).toBeGreaterThanOrEqual(before);
      expect(task.startedAt).toBeLessThanOrEqual(Date.now());
      expect(task.status).toBe('in_progress');
    });
    it('does not overwrite startedAt on repeated in_progress', () => {
      const task = makeTask();
      task.startedAt = 1000;
      applyTaskStatusUpdate(task, 'in_progress');
      expect(task.startedAt).toBe(1000);
    });
    it('sets completedAt and durationMs on completed', () => {
      const before = Date.now();
      const task = makeTask();
      task.startedAt = before - 500;
      applyTaskStatusUpdate(task, 'completed');
      expect(task.completedAt).toBeGreaterThanOrEqual(before);
      expect(task.completedAt).toBeLessThanOrEqual(Date.now());
      expect(task.metrics?.durationMs).toBeGreaterThanOrEqual(500);
    });
    it('sets completedAt on skipped', () => {
      const before = Date.now();
      const task = makeTask();
      applyTaskStatusUpdate(task, 'skipped');
      expect(task.completedAt).toBeGreaterThanOrEqual(before);
      expect(task.status).toBe('skipped');
    });
    it('sets completedAt on failed', () => {
      const before = Date.now();
      const task = makeTask();
      applyTaskStatusUpdate(task, 'failed');
      expect(task.completedAt).toBeGreaterThanOrEqual(before);
      expect(task.status).toBe('failed');
    });

    it('increments fixIterations on completed → in_progress rework', () => {
      const task = makeTask();
      applyTaskStatusUpdate(task, 'in_progress');
      applyTaskStatusUpdate(task, 'completed');
      expect(task.fixIterations).toBeUndefined();
      // Rework: send back from completed to in_progress
      applyTaskStatusUpdate(task, 'in_progress');
      expect(task.fixIterations).toBe(1);
      expect(task.completedAt).toBeUndefined();
    });

    it('increments fixIterations on failed → in_progress rework', () => {
      const task = makeTask();
      applyTaskStatusUpdate(task, 'in_progress');
      applyTaskStatusUpdate(task, 'failed');
      // Rework from failed
      applyTaskStatusUpdate(task, 'in_progress');
      expect(task.fixIterations).toBe(1);
      expect(task.completedAt).toBeUndefined();
    });

    it('accumulates fixIterations across multiple rework cycles', () => {
      const task = makeTask();
      applyTaskStatusUpdate(task, 'in_progress');
      applyTaskStatusUpdate(task, 'completed');
      applyTaskStatusUpdate(task, 'in_progress'); // rework 1
      applyTaskStatusUpdate(task, 'completed');
      applyTaskStatusUpdate(task, 'in_progress'); // rework 2
      expect(task.fixIterations).toBe(2);
    });

    it('does not increment fixIterations on pending → in_progress', () => {
      const task = makeTask();
      applyTaskStatusUpdate(task, 'in_progress');
      expect(task.fixIterations).toBeUndefined();
    });

    it('resets completedAt on rework but preserves startedAt', () => {
      const task = makeTask();
      applyTaskStatusUpdate(task, 'in_progress');
      const originalStartedAt = task.startedAt;
      applyTaskStatusUpdate(task, 'completed');
      expect(task.completedAt).toBeGreaterThan(0);
      // Rework
      applyTaskStatusUpdate(task, 'in_progress');
      expect(task.completedAt).toBeUndefined();
      expect(task.startedAt).toBe(originalStartedAt);
    });
  });

  describe('createPlanObject', () => {
    it('creates a plan with default draft status', () => {
      const plan = createPlanObject({ objective: 'Build X', scope: 'API' });
      expect(plan.status).toBe('draft');
      expect(plan.objective).toBe('Build X');
      expect(plan.id).toMatch(/^plan-/);
      expect(plan.checks).toEqual([]);
    });
    it('supports brainstorming initial status', () => {
      const plan = createPlanObject({ objective: 'x', scope: 'y', initialStatus: 'brainstorming' });
      expect(plan.status).toBe('brainstorming');
    });
    it('creates numbered tasks', () => {
      const plan = createPlanObject({
        objective: 'x',
        scope: 'y',
        tasks: [
          { title: 'A', description: 'a' },
          { title: 'B', description: 'b' },
        ],
      });
      expect(plan.tasks[0].id).toBe('task-1');
      expect(plan.tasks[1].id).toBe('task-2');
      expect(plan.tasks[0].status).toBe('pending');
    });
    it('includes optional fields only when provided', () => {
      const plan = createPlanObject({ objective: 'x', scope: 'y' });
      expect(plan.approach).toBeUndefined();
      const planWithApproach = createPlanObject({ objective: 'x', scope: 'y', approach: 'TDD' });
      expect(planWithApproach.approach).toBe('TDD');
    });
  });
});
