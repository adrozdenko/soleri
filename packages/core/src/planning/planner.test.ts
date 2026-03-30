import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Planner, PlanGradeRejectionError } from './planner.js';
import type { PlanGap } from './gap-types.js';
import type { PlanAlternative } from './planner.js';
import { generateGapId } from './gap-types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Two well-structured alternatives to satisfy pass 8. */
const TWO_ALTERNATIVES: PlanAlternative[] = [
  {
    approach: 'Use alternative A',
    pros: ['Pro A'],
    cons: ['Con A'],
    rejected_reason: 'Not suitable for our use case',
  },
  {
    approach: 'Use alternative B',
    pros: ['Pro B'],
    cons: ['Con B'],
    rejected_reason: 'Too complex for the scope',
  },
];

describe('Planner', () => {
  let tempDir: string;
  let planner: Planner;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'planner-test-'));
    planner = new Planner(join(tempDir, 'plans.json'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a plan in draft status', () => {
      const plan = planner.create({ objective: 'Add auth', scope: 'backend' });
      expect(plan.id).toMatch(/^plan-/);
      expect(plan.status).toBe('draft');
      expect(plan.objective).toBe('Add auth');
      expect(plan.scope).toBe('backend');
    });

    it('should create a plan with tasks', () => {
      const plan = planner.create({
        objective: 'Add auth',
        scope: 'backend',
        tasks: [
          { title: 'Add JWT', description: 'Implement JWT signing' },
          { title: 'Add middleware', description: 'Auth middleware' },
        ],
      });
      expect(plan.tasks).toHaveLength(2);
      expect(plan.tasks[0].id).toBe('task-1');
      expect(plan.tasks[0].status).toBe('pending');
      expect(plan.tasks[1].id).toBe('task-2');
    });

    it('should create a plan with decisions', () => {
      const plan = planner.create({
        objective: 'Add caching',
        scope: 'api',
        decisions: ['Use Redis', 'TTL of 5 minutes'],
      });
      expect(plan.decisions).toEqual(['Use Redis', 'TTL of 5 minutes']);
    });

    it('should persist plan to disk', () => {
      planner.create({ objective: 'Test persistence', scope: 'test' });
      const planner2 = new Planner(join(tempDir, 'plans.json'));
      expect(planner2.list()).toHaveLength(1);
    });
  });

  describe('get', () => {
    it('should return a plan by id', () => {
      const created = planner.create({ objective: 'Find me', scope: 'test' });
      const found = planner.get(created.id);
      expect(found).not.toBeNull();
      expect(found!.objective).toBe('Find me');
    });

    it('should return null for unknown id', () => {
      expect(planner.get('plan-nonexistent')).toBeNull();
    });
  });

  describe('list', () => {
    it('should list all plans', () => {
      planner.create({ objective: 'Plan A', scope: 'a' });
      planner.create({ objective: 'Plan B', scope: 'b' });
      expect(planner.list()).toHaveLength(2);
    });

    it('should return empty array when no plans', () => {
      expect(planner.list()).toEqual([]);
    });
  });

  describe('approve', () => {
    it('should transition draft to approved', () => {
      const plan = planner.create({ objective: 'Approve me', scope: 'test' });
      const approved = planner.approve(plan.id);
      expect(approved.status).toBe('approved');
    });

    it('should throw when approving non-draft plan', () => {
      const plan = planner.create({ objective: 'Already approved', scope: 'test' });
      planner.approve(plan.id);
      expect(() => planner.approve(plan.id)).toThrow('Invalid transition');
    });

    it('should throw for unknown plan', () => {
      expect(() => planner.approve('plan-xxx')).toThrow('not found');
    });

    it('should approve a plan with A+ grade', () => {
      const plan = planner.create({
        objective: 'Well-graded plan',
        scope: 'test',
        tasks: [
          { title: 'Task 1', description: 'A well-described task for implementation' },
          { title: 'Task 2', description: 'Another well-described task for testing' },
        ],
        decisions: ['Use TypeScript for type safety'],
      });
      // Grade the plan — set an A+ grade check
      const p = planner.get(plan.id)!;
      p.latestCheck = {
        checkId: 'chk-test-aplus',
        planId: plan.id,
        grade: 'A+',
        score: 98,
        gaps: [],
        iteration: 1,
        checkedAt: Date.now(),
      };
      p.checks = [p.latestCheck];
      const approved = planner.approve(plan.id);
      expect(approved.status).toBe('approved');
    });

    it('should reject approval when grade is below A', () => {
      const plan = planner.create({
        objective: 'Bad plan',
        scope: 'test',
      });
      // Manually set a B grade check on the plan
      const p = planner.get(plan.id)!;
      p.latestCheck = {
        checkId: 'chk-test',
        planId: plan.id,
        grade: 'B',
        score: 82,
        gaps: [
          {
            id: 'gap-1',
            severity: 'major',
            category: 'completeness',
            description: 'Missing tasks',
            recommendation: 'Add tasks',
            location: 'tasks',
          },
        ],
        iteration: 1,
        checkedAt: Date.now(),
      };
      p.checks = [p.latestCheck];
      expect(() => planner.approve(plan.id)).toThrow(PlanGradeRejectionError);
    });

    it('should approve a plan with no grade check (backward compatibility)', () => {
      const plan = planner.create({ objective: 'No grade plan', scope: 'test' });
      // No grade() call — latestCheck is undefined
      const approved = planner.approve(plan.id);
      expect(approved.status).toBe('approved');
    });

    it('should respect configurable minGradeForApproval threshold', () => {
      const lenientPlanner = new Planner(join(tempDir, 'lenient-plans.json'), {
        minGradeForApproval: 'B',
      });
      const plan = lenientPlanner.create({ objective: 'B-grade plan', scope: 'test' });
      // Set a B grade check
      const p = lenientPlanner.get(plan.id)!;
      p.latestCheck = {
        checkId: 'chk-test-b',
        planId: plan.id,
        grade: 'B',
        score: 82,
        gaps: [],
        iteration: 1,
        checkedAt: Date.now(),
      };
      p.checks = [p.latestCheck];
      // B grade should pass with B threshold
      const approved = lenientPlanner.approve(plan.id);
      expect(approved.status).toBe('approved');
    });

    it('should reject with PlanGradeRejectionError containing gap details', () => {
      const plan = planner.create({ objective: 'Gap details', scope: 'test' });
      const p = planner.get(plan.id)!;
      const testGaps = [
        {
          id: 'gap-crit',
          severity: 'critical' as const,
          category: 'structure',
          description: 'Missing critical structure',
          recommendation: 'Fix structure',
          location: 'tasks',
        },
        {
          id: 'gap-maj',
          severity: 'major' as const,
          category: 'completeness',
          description: 'Incomplete scope',
          recommendation: 'Add scope details',
          location: 'scope',
        },
      ];
      p.latestCheck = {
        checkId: 'chk-test-gaps',
        planId: plan.id,
        grade: 'C',
        score: 65,
        gaps: testGaps,
        iteration: 1,
        checkedAt: Date.now(),
      };
      p.checks = [p.latestCheck];
      try {
        planner.approve(plan.id);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PlanGradeRejectionError);
        const rejection = err as PlanGradeRejectionError;
        expect(rejection.grade).toBe('C');
        expect(rejection.score).toBe(65);
        expect(rejection.minGrade).toBe('A');
        expect(rejection.gaps).toHaveLength(2);
        expect(rejection.message).toContain('below the minimum required grade A');
      }
    });
  });

  describe('startExecution', () => {
    it('should transition approved to executing', () => {
      const plan = planner.create({ objective: 'Execute me', scope: 'test' });
      planner.approve(plan.id);
      const executing = planner.startExecution(plan.id);
      expect(executing.status).toBe('executing');
    });

    it('should throw when executing non-approved plan', () => {
      const plan = planner.create({ objective: 'Not approved', scope: 'test' });
      expect(() => planner.startExecution(plan.id)).toThrow('Invalid transition');
    });
  });

  describe('updateTask', () => {
    it('should update task status on executing plan', () => {
      const plan = planner.create({
        objective: 'Task test',
        scope: 'test',
        tasks: [{ title: 'Task 1', description: 'Do thing' }],
      });
      planner.approve(plan.id);
      planner.startExecution(plan.id);
      const updated = planner.updateTask(plan.id, 'task-1', 'in_progress');
      expect(updated.tasks[0].status).toBe('in_progress');
    });

    it('should support all task statuses', () => {
      const plan = planner.create({
        objective: 'Status test',
        scope: 'test',
        tasks: [
          { title: 'T1', description: 'd' },
          { title: 'T2', description: 'd' },
          { title: 'T3', description: 'd' },
          { title: 'T4', description: 'd' },
          { title: 'T5', description: 'd' },
        ],
      });
      planner.approve(plan.id);
      planner.startExecution(plan.id);
      planner.updateTask(plan.id, 'task-1', 'completed');
      planner.updateTask(plan.id, 'task-2', 'skipped');
      planner.updateTask(plan.id, 'task-3', 'failed');
      planner.updateTask(plan.id, 'task-4', 'in_progress');
      const result = planner.get(plan.id)!;
      expect(result.tasks[0].status).toBe('completed');
      expect(result.tasks[1].status).toBe('skipped');
      expect(result.tasks[2].status).toBe('failed');
      expect(result.tasks[3].status).toBe('in_progress');
      expect(result.tasks[4].status).toBe('pending');
    });

    it('should throw when updating tasks on non-executing plan', () => {
      const plan = planner.create({
        objective: 'Not executing',
        scope: 'test',
        tasks: [{ title: 'T1', description: 'd' }],
      });
      expect(() => planner.updateTask(plan.id, 'task-1', 'completed')).toThrow('must be');
    });

    it('should throw for unknown task', () => {
      const plan = planner.create({
        objective: 'Unknown task',
        scope: 'test',
        tasks: [{ title: 'T1', description: 'd' }],
      });
      planner.approve(plan.id);
      planner.startExecution(plan.id);
      expect(() => planner.updateTask(plan.id, 'task-99', 'completed')).toThrow('not found');
    });
  });

  describe('complete', () => {
    it('should transition reconciling to completed', () => {
      const plan = planner.create({ objective: 'Complete me', scope: 'test' });
      planner.approve(plan.id);
      planner.startExecution(plan.id);
      planner.startReconciliation(plan.id);
      const completed = planner.complete(plan.id);
      expect(completed.status).toBe('completed');
    });

    it('should auto-reconcile when completing from executing state', () => {
      const plan = planner.create({ objective: 'Auto reconcile', scope: 'test' });
      planner.approve(plan.id);
      planner.startExecution(plan.id);
      const completed = planner.complete(plan.id);
      expect(completed.status).toBe('completed');
      expect(completed.reconciliation).toBeDefined();
      expect(completed.reconciliation!.summary).toBe('All tasks completed');
      expect(completed.reconciliation!.reconciledAt).toBeGreaterThan(0);
    });

    it('should auto-reconcile when completing from validating state', () => {
      const plan = planner.create({ objective: 'Auto reconcile from validating', scope: 'test' });
      planner.approve(plan.id);
      planner.startExecution(plan.id);
      planner.startValidation(plan.id);
      const completed = planner.complete(plan.id);
      expect(completed.status).toBe('completed');
      expect(completed.reconciliation).toBeDefined();
      expect(completed.reconciliation!.summary).toBe('All tasks completed');
    });

    it('should throw when completing from draft', () => {
      const plan = planner.create({ objective: 'Not executing', scope: 'test' });
      expect(() => planner.complete(plan.id)).toThrow();
    });
  });

  describe('getExecuting', () => {
    it('should return only executing plans', () => {
      const p1 = planner.create({ objective: 'Executing', scope: 'a' });
      planner.create({ objective: 'Draft', scope: 'b' });
      planner.approve(p1.id);
      planner.startExecution(p1.id);
      const executing = planner.getExecuting();
      expect(executing).toHaveLength(1);
      expect(executing[0].objective).toBe('Executing');
    });

    it('should return empty when nothing is executing', () => {
      planner.create({ objective: 'Draft only', scope: 'test' });
      expect(planner.getExecuting()).toEqual([]);
    });
  });

  describe('getActive', () => {
    it('should return brainstorming, draft, approved, executing, validating, and reconciling plans', () => {
      planner.create({ objective: 'Draft', scope: 'a' });
      const p2 = planner.create({ objective: 'Approved', scope: 'b' });
      const p3 = planner.create({ objective: 'Executing', scope: 'c' });
      const p4 = planner.create({ objective: 'Completed', scope: 'd' });
      planner.approve(p2.id);
      planner.approve(p3.id);
      planner.startExecution(p3.id);
      planner.approve(p4.id);
      planner.startExecution(p4.id);
      planner.startReconciliation(p4.id);
      planner.complete(p4.id);
      const active = planner.getActive();
      expect(active).toHaveLength(3);
      expect(active.map((p) => p.status).sort()).toEqual(['approved', 'draft', 'executing']);
    });
  });

  describe('grade', () => {
    it('should grade a well-formed plan highly on first iteration', () => {
      const plan = planner.create({
        objective: 'Implement a Redis caching layer for the API to reduce DB load by 50%',
        scope: 'Backend API services only. Does not include frontend caching or CDN.',
        decisions: [
          'Use Redis because it provides sub-millisecond latency and supports TTL natively',
          'Set TTL to 5 minutes since average data freshness requirement is 10 minutes',
        ],
        tasks: [
          {
            title: 'Set up Redis client',
            description: 'Install and configure Redis connection pool',
          },
          {
            title: 'Add cache middleware',
            description: 'Express middleware for transparent caching',
          },
          {
            title: 'Add invalidation logic',
            description: 'Purge cache on write operations to ensure consistency',
          },
          {
            title: 'Write integration tests',
            description: 'Test cache hit/miss scenarios with Redis',
          },
          { title: 'Add monitoring', description: 'Track and verify cache hit rate metrics' },
        ],
        alternatives: TWO_ALTERNATIVES,
      });
      const check = planner.grade(plan.id);
      // Iteration 1: minor gaps are free, so well-formed plan scores very high
      expect(check.score).toBeGreaterThanOrEqual(95);
      expect(check.grade).toMatch(/^A/);
      expect(check.iteration).toBe(1);
      expect(check.checkId).toMatch(/^chk-/);
    });

    it('should give low score to empty plan', () => {
      const plan = planner.create({ objective: '', scope: '' });
      const check = planner.grade(plan.id);
      // Missing objective (critical=30) + scope (critical=30) + no tasks (critical=30) = 90 deduction
      expect(check.score).toBeLessThanOrEqual(10);
      expect(check.grade).toBe('F');
      expect(check.gaps.length).toBeGreaterThan(0);
    });

    it('should use severity-weighted scoring', () => {
      // Plan with 1 critical gap (missing tasks) = -30, 1 major (no alternatives) = -15
      const plan = planner.create({
        objective: 'Good objective with some detail',
        scope: 'Narrow scope that excludes nothing important',
      });
      const check = planner.grade(plan.id);
      // No tasks = critical (-30), no alternatives = major (-15)
      // On iteration 1, minor gaps are free, so only critical + major count
      expect(check.score).toBe(55); // 100 - 30 (no tasks) - 15 (no alternatives)
    });

    it('should detect duplicate task titles', () => {
      const plan = planner.create({
        objective: 'Test duplicate detection in plan grading system',
        scope: 'Testing only, does not affect production',
        decisions: ['Use approach A because it handles edge cases better due to type safety'],
        tasks: [
          { title: 'Same title', description: 'First task with description' },
          { title: 'Same title', description: 'Second task with description' },
          { title: 'Unique title', description: 'Third task with description' },
        ],
      });
      const check = planner.grade(plan.id);
      const dupGap = check.gaps.find((g) => g.description.includes('Duplicate'));
      expect(dupGap).toBeDefined();
      expect(dupGap!.category).toBe('semantic-quality');
    });

    it('should detect tasks with short/missing descriptions', () => {
      const plan = planner.create({
        objective: 'Test description detection in plan grading system',
        scope: 'Testing only, does not affect production',
        decisions: ['Use assertions because they provide clear feedback on failures'],
        tasks: [
          { title: 'Task with desc', description: 'Has a proper description' },
          { title: 'Task without desc', description: '' },
          { title: 'Another task', description: 'Also has a description' },
        ],
      });
      const check = planner.grade(plan.id);
      const descGap = check.gaps.find((g) => g.description.includes('short descriptions'));
      expect(descGap).toBeDefined();
      expect(descGap!.category).toBe('clarity');
    });

    it('should track iteration number across multiple grades', () => {
      const plan = planner.create({
        objective: 'Iteration tracking test plan',
        scope: 'Test scope',
      });
      const check1 = planner.grade(plan.id);
      const check2 = planner.grade(plan.id);
      const check3 = planner.grade(plan.id);
      expect(check1.iteration).toBe(1);
      expect(check2.iteration).toBe(2);
      expect(check3.iteration).toBe(3);
    });

    it('should apply iteration leniency — minor gaps free on iter 1', () => {
      // Plan with only minor gaps: no metrics in objective, no exclusions in scope
      const plan = planner.create({
        objective: 'Build a comprehensive authentication system for the application',
        scope: 'Backend authentication module',
        decisions: ['Use JWT tokens because they are stateless and work well with microservices'],
        tasks: [
          { title: 'Create auth middleware', description: 'JWT validation middleware for Express' },
          {
            title: 'Add login endpoint',
            description: 'POST /auth/login with credential validation',
          },
          {
            title: 'Add refresh tokens',
            description: 'Implement token refresh flow with rotation',
          },
          { title: 'Write auth tests', description: 'Integration tests for all auth endpoints' },
        ],
        alternatives: TWO_ALTERNATIVES,
      });

      // Iteration 1: minor gaps free → score should be 100
      const check1 = planner.grade(plan.id);
      expect(check1.score).toBe(100);

      // Iteration 2: minor gaps at half weight → score slightly lower
      const check2 = planner.grade(plan.id);
      expect(check2.score).toBeLessThan(check1.score);

      // Iteration 3: minor gaps at full weight → score even lower
      const check3 = planner.grade(plan.id);
      expect(check3.score).toBeLessThanOrEqual(check2.score);
    });

    it('should cap category deductions', () => {
      // Plan with many clarity issues (ambiguous words) — capped at 10
      const plan = planner.create({
        objective: 'Maybe perhaps build something simple and easy, possibly soon, etc',
        scope: 'Various things, probably several modules, somehow',
        decisions: ['Use some appropriate approach because it seems good due to various reasons'],
        tasks: [
          { title: 'Do some stuff', description: 'Maybe implement various things somehow' },
          { title: 'Maybe test', description: 'Perhaps write some tests probably' },
          { title: 'Maybe deploy', description: 'Possibly deploy to various environments soon' },
        ],
      });
      // Grade on iteration 3 to get full minor weight
      planner.grade(plan.id);
      planner.grade(plan.id);
      const check3 = planner.grade(plan.id);
      // Clarity category should be capped at 10 even though there are many ambiguous words
      // Without cap, multiple minor clarity gaps (3x2=6, but also semantic-quality gaps)
      // The key assertion: score shouldn't be destroyed by clarity alone
      expect(check3.score).toBeGreaterThanOrEqual(50);
    });

    it('should store check in plan history', () => {
      const plan = planner.create({
        objective: 'History test plan objective',
        scope: 'test scope',
      });
      planner.grade(plan.id);
      planner.grade(plan.id);
      const history = planner.getCheckHistory(plan.id);
      expect(history).toHaveLength(2);
      expect(history[0].checkId).not.toBe(history[1].checkId);
    });

    it('should persist latestCheck', () => {
      const plan = planner.create({
        objective: 'Persist test plan objective',
        scope: 'test scope',
      });
      const check = planner.grade(plan.id);
      const latest = planner.getLatestCheck(plan.id);
      expect(latest).not.toBeNull();
      expect(latest!.checkId).toBe(check.checkId);
    });

    it('should detect circular dependencies', () => {
      const plan = planner.create({
        objective: 'Circular dependency detection test plan',
        scope: 'Test scope only, does not affect production',
        decisions: ['Test with circular deps because it validates the analysis engine'],
        tasks: [
          { title: 'Task A', description: 'First task in the cycle' },
          { title: 'Task B', description: 'Second task in the cycle' },
          { title: 'Task C', description: 'Third task (not in cycle)' },
        ],
      });
      // Manually create circular deps
      const p = planner.get(plan.id)!;
      p.tasks[0].dependsOn = ['task-2'];
      p.tasks[1].dependsOn = ['task-1'];
      const check = planner.grade(plan.id);
      const circGap = check.gaps.find((g) => g.description.includes('Circular'));
      expect(circGap).toBeDefined();
      expect(circGap!.severity).toBe('critical');
    });

    it('should use correct grade thresholds: A+=95, A=90, B=80, C=70, D=60', () => {
      // We can verify by creating plans with known gap profiles
      // Plan with 2 major gaps = score 70 → grade C (70-79)
      const plan = planner.create({
        objective: 'Test threshold plan with a good objective description',
        scope: 'Narrow scope, does not include anything beyond testing',
        decisions: [], // no decisions = major gap from semantic-quality (-15)
        // no alternatives = major gap from alternative-analysis (-15)
        tasks: [
          { title: 'Task 1', description: 'First detailed task description' },
          { title: 'Task 2', description: 'Second detailed task description' },
          { title: 'Task 3', description: 'Third detailed task description' },
        ],
      });
      const check = planner.grade(plan.id);
      // 2 major gaps: no decisions (-15) + no alternatives (-15) = -30, iter 1 minor gaps free
      expect(check.score).toBe(70);
      expect(check.grade).toBe('C');
    });
  });

  describe('meetsGrade', () => {
    it('should return true when plan meets target grade', () => {
      const plan = planner.create({
        objective: 'Build a comprehensive feature for the testing module',
        scope: 'Testing module only, does not include deployment',
        decisions: ['Use vitest because it integrates well with TypeScript due to native support'],
        tasks: [
          { title: 'Write unit tests', description: 'Cover all edge cases in auth module' },
          { title: 'Write integration tests', description: 'End-to-end API tests for auth flow' },
          { title: 'Add CI pipeline', description: 'Run tests on every PR automatically' },
          { title: 'Add coverage report', description: 'Track and verify code coverage metrics' },
        ],
      });
      const result = planner.meetsGrade(plan.id, 'B');
      expect(result.meets).toBe(true);
      expect(result.check.score).toBeGreaterThanOrEqual(80);
    });

    it('should return false when plan does not meet target grade', () => {
      const plan = planner.create({ objective: '', scope: '' });
      const result = planner.meetsGrade(plan.id, 'A+');
      expect(result.meets).toBe(false);
    });
  });

  describe('getCheckHistory', () => {
    it('should return empty array for plan with no checks', () => {
      const plan = planner.create({ objective: 'No checks plan', scope: 'test scope' });
      expect(planner.getCheckHistory(plan.id)).toEqual([]);
    });

    it('should throw for unknown plan', () => {
      expect(() => planner.getCheckHistory('plan-nonexistent')).toThrow('not found');
    });
  });

  describe('getLatestCheck', () => {
    it('should return null for plan with no checks', () => {
      const plan = planner.create({ objective: 'No checks plan', scope: 'test scope' });
      expect(planner.getLatestCheck(plan.id)).toBeNull();
    });

    it('should throw for unknown plan', () => {
      expect(() => planner.getLatestCheck('plan-nonexistent')).toThrow('not found');
    });
  });

  describe('custom gap analysis passes', () => {
    it('should run custom passes alongside built-in ones', () => {
      const customPass = (plan: { objective: string }): PlanGap[] => {
        if (plan.objective.includes('TODO')) {
          return [
            {
              id: generateGapId(),
              severity: 'major',
              category: 'semantic-quality',
              description: 'Objective contains TODO — not ready for grading.',
              recommendation: 'Resolve all TODOs before grading the plan.',
              location: 'objective',
              _trigger: 'custom_todo_check',
            },
          ];
        }
        return [];
      };

      const customPlanner = new Planner(join(tempDir, 'custom-plans.json'), {
        customPasses: [customPass],
      });

      // Plan with TODO should get the custom gap
      const plan = customPlanner.create({
        objective: 'TODO: flesh out this objective for the project',
        scope: 'Backend services only. Does not include frontend.',
        decisions: ['Use TypeScript because it provides type safety due to static analysis'],
        tasks: [
          { title: 'Task A', description: 'First implementation task' },
          { title: 'Task B', description: 'Second implementation task' },
          { title: 'Task C', description: 'Third implementation task' },
        ],
      });
      const check = customPlanner.grade(plan.id);
      const todoGap = check.gaps.find((g) => g._trigger === 'custom_todo_check');
      expect(todoGap).toBeDefined();
      expect(todoGap!.severity).toBe('major');
      // Score should reflect the -15 from the major custom gap
      expect(check.score).toBeLessThan(100);
    });

    it('should not fire custom gaps when condition is not met', () => {
      const customPass = (plan: { objective: string }): PlanGap[] => {
        if (plan.objective.includes('TODO')) {
          return [
            {
              id: generateGapId(),
              severity: 'major',
              category: 'semantic-quality',
              description: 'Contains TODO',
              recommendation: 'Fix it',
            },
          ];
        }
        return [];
      };

      const customPlanner = new Planner(join(tempDir, 'custom-plans2.json'), {
        customPasses: [customPass],
      });

      const plan = customPlanner.create({
        objective: 'Build a clean authentication system for the API endpoints',
        scope: 'Backend services only. Does not include frontend or mobile.',
        decisions: ['Use JWT because it is stateless and works with microservices'],
        tasks: [
          { title: 'Auth middleware', description: 'Create JWT validation middleware' },
          { title: 'Login endpoint', description: 'POST /auth/login with credentials' },
          { title: 'Refresh tokens', description: 'Token refresh flow with rotation' },
        ],
      });
      const check = customPlanner.grade(plan.id);
      const todoGap = check.gaps.find((g) => g.description.includes('TODO'));
      expect(todoGap).toBeUndefined();
    });
  });

  describe('full lifecycle', () => {
    it('should support draft → approved → executing → reconciling → completed with tasks', () => {
      const plan = planner.create({
        objective: 'Full lifecycle test',
        scope: 'integration',
        decisions: ['Use TDD'],
        tasks: [
          { title: 'Write tests', description: 'Write failing tests first' },
          { title: 'Implement', description: 'Make tests pass' },
          { title: 'Refactor', description: 'Clean up' },
        ],
      });
      expect(plan.status).toBe('draft');

      planner.approve(plan.id);
      expect(planner.get(plan.id)!.status).toBe('approved');

      planner.startExecution(plan.id);
      expect(planner.get(plan.id)!.status).toBe('executing');

      planner.updateTask(plan.id, 'task-1', 'in_progress');
      planner.updateTask(plan.id, 'task-1', 'completed');
      planner.updateTask(plan.id, 'task-2', 'in_progress');
      planner.updateTask(plan.id, 'task-2', 'completed');
      planner.updateTask(plan.id, 'task-3', 'skipped');

      planner.startReconciliation(plan.id);
      expect(planner.get(plan.id)!.status).toBe('reconciling');

      const final = planner.complete(plan.id);
      expect(final.status).toBe('completed');
      expect(final.tasks[0].status).toBe('completed');
      expect(final.tasks[1].status).toBe('completed');
      expect(final.tasks[2].status).toBe('skipped');
    });

    it('should support brainstorming → draft → approved → executing lifecycle', () => {
      const plan = planner.create({
        objective: 'Brainstorming lifecycle test',
        scope: 'integration',
        initialStatus: 'brainstorming',
      });
      expect(plan.status).toBe('brainstorming');

      planner.promoteToDraft(plan.id);
      expect(planner.get(plan.id)!.status).toBe('draft');

      planner.approve(plan.id);
      expect(planner.get(plan.id)!.status).toBe('approved');
    });

    it('should support validating state', () => {
      const plan = planner.create({
        objective: 'Validation lifecycle test',
        scope: 'integration',
        tasks: [{ title: 'Task 1', description: 'Test task' }],
      });
      planner.approve(plan.id);
      planner.startExecution(plan.id);
      planner.startValidation(plan.id);
      expect(planner.get(plan.id)!.status).toBe('validating');

      // Can update tasks during validation
      planner.updateTask(plan.id, 'task-1', 'completed');

      // Can go back to executing from validating
      planner.startExecution(plan.id);
      expect(planner.get(plan.id)!.status).toBe('executing');
    });

    it('should support archiving completed plans', () => {
      const plan = planner.create({ objective: 'Archive test', scope: 'test' });
      planner.approve(plan.id);
      planner.startExecution(plan.id);
      planner.startReconciliation(plan.id);
      planner.complete(plan.id);

      const archived = planner.archive();
      expect(archived).toHaveLength(1);
      expect(archived[0].status).toBe('archived');
    });
  });

  describe('fixIterations tracking', () => {
    it('increments fixIterations when task goes completed → in_progress', () => {
      const plan = planner.create({
        objective: 'Rework test',
        scope: 'test',
        tasks: [{ title: 'Task A', description: 'A task' }],
      });
      planner.approve(plan.id);
      planner.startExecution(plan.id);

      planner.updateTask(plan.id, 'task-1', 'in_progress');
      planner.updateTask(plan.id, 'task-1', 'completed');
      planner.updateTask(plan.id, 'task-1', 'in_progress');

      const task = planner.get(plan.id)!.tasks[0];
      expect(task.fixIterations).toBe(1);
    });

    it('increments fixIterations when task goes failed → in_progress', () => {
      const plan = planner.create({
        objective: 'Failed rework test',
        scope: 'test',
        tasks: [{ title: 'Task A', description: 'A task' }],
      });
      planner.approve(plan.id);
      planner.startExecution(plan.id);

      planner.updateTask(plan.id, 'task-1', 'in_progress');
      planner.updateTask(plan.id, 'task-1', 'failed');
      planner.updateTask(plan.id, 'task-1', 'in_progress');

      const task = planner.get(plan.id)!.tasks[0];
      expect(task.fixIterations).toBe(1);
    });

    it('does NOT increment on forward transitions', () => {
      const plan = planner.create({
        objective: 'Forward transition test',
        scope: 'test',
        tasks: [{ title: 'Task A', description: 'A task' }],
      });
      planner.approve(plan.id);
      planner.startExecution(plan.id);

      planner.updateTask(plan.id, 'task-1', 'in_progress');
      planner.updateTask(plan.id, 'task-1', 'completed');

      const task = planner.get(plan.id)!.tasks[0];
      expect(task.fixIterations ?? 0).toBe(0);
    });

    it('accumulates across multiple rework cycles', () => {
      const plan = planner.create({
        objective: 'Multi-rework test',
        scope: 'test',
        tasks: [{ title: 'Task A', description: 'A task' }],
      });
      planner.approve(plan.id);
      planner.startExecution(plan.id);

      planner.updateTask(plan.id, 'task-1', 'in_progress');
      planner.updateTask(plan.id, 'task-1', 'completed');
      planner.updateTask(plan.id, 'task-1', 'in_progress'); // rework 1
      planner.updateTask(plan.id, 'task-1', 'completed');
      planner.updateTask(plan.id, 'task-1', 'in_progress'); // rework 2

      const task = planner.get(plan.id)!.tasks[0];
      expect(task.fixIterations).toBe(2);
    });
  });
});
