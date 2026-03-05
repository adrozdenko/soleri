import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Planner } from '../planning/planner.js';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Planner', () => {
  let tempDir: string;
  let planner: Planner;

  beforeEach(() => {
    tempDir = join(tmpdir(), `planner-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
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
      expect(() => planner.approve(plan.id)).toThrow('must be');
    });

    it('should throw for unknown plan', () => {
      expect(() => planner.approve('plan-xxx')).toThrow('not found');
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
      expect(() => planner.startExecution(plan.id)).toThrow('must be');
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
    it('should transition executing to completed', () => {
      const plan = planner.create({ objective: 'Complete me', scope: 'test' });
      planner.approve(plan.id);
      planner.startExecution(plan.id);
      const completed = planner.complete(plan.id);
      expect(completed.status).toBe('completed');
    });

    it('should throw when completing non-executing plan', () => {
      const plan = planner.create({ objective: 'Not executing', scope: 'test' });
      expect(() => planner.complete(plan.id)).toThrow('must be');
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
    it('should return draft, approved, and executing plans', () => {
      planner.create({ objective: 'Draft', scope: 'a' });
      const p2 = planner.create({ objective: 'Approved', scope: 'b' });
      const p3 = planner.create({ objective: 'Executing', scope: 'c' });
      const p4 = planner.create({ objective: 'Completed', scope: 'd' });
      planner.approve(p2.id);
      planner.approve(p3.id);
      planner.startExecution(p3.id);
      planner.approve(p4.id);
      planner.startExecution(p4.id);
      planner.complete(p4.id);
      const active = planner.getActive();
      expect(active).toHaveLength(3);
      expect(active.map((p) => p.status).sort()).toEqual(['approved', 'draft', 'executing']);
    });
  });

  describe('grade', () => {
    it('should grade a well-formed plan highly', () => {
      const plan = planner.create({
        objective: 'Implement caching layer',
        scope: 'API backend',
        decisions: ['Use Redis', 'TTL of 5 min', 'Cache invalidation on write'],
        tasks: [
          { title: 'Set up Redis client', description: 'Connect to Redis instance' },
          { title: 'Add cache middleware', description: 'Express middleware for caching' },
          { title: 'Add invalidation logic', description: 'Purge on write operations' },
          { title: 'Write integration tests', description: 'Test cache hit/miss scenarios' },
          { title: 'Add monitoring', description: 'Track cache hit rate metrics' },
        ],
      });
      const check = planner.grade(plan.id);
      expect(check.score).toBeGreaterThanOrEqual(85);
      expect(check.grade).toMatch(/^A/);
      expect(check.gaps.length).toBeLessThanOrEqual(2);
      expect(check.checkId).toMatch(/^chk-/);
    });

    it('should give low score to empty plan', () => {
      const plan = planner.create({ objective: '', scope: '' });
      const check = planner.grade(plan.id);
      expect(check.score).toBeLessThanOrEqual(40);
      expect(check.gaps.length).toBeGreaterThan(0);
    });

    it('should detect duplicate task titles', () => {
      const plan = planner.create({
        objective: 'Test duplicates',
        scope: 'test',
        decisions: ['Use approach A', 'Use approach B'],
        tasks: [
          { title: 'Same title', description: 'First task' },
          { title: 'Same title', description: 'Second task' },
          { title: 'Unique title', description: 'Third task' },
        ],
      });
      const check = planner.grade(plan.id);
      const dupGap = check.gaps.find((g) => g.description.includes('Duplicate'));
      expect(dupGap).toBeDefined();
    });

    it('should detect tasks missing descriptions', () => {
      const plan = planner.create({
        objective: 'Test descriptions',
        scope: 'test',
        decisions: ['Decision A'],
        tasks: [
          { title: 'Task with desc', description: 'Has description' },
          { title: 'Task without desc', description: '' },
          { title: 'Another task', description: 'Has description' },
        ],
      });
      const check = planner.grade(plan.id);
      const descGap = check.gaps.find((g) => g.description.includes('missing descriptions'));
      expect(descGap).toBeDefined();
    });

    it('should store check in plan history', () => {
      const plan = planner.create({ objective: 'History test', scope: 'test' });
      planner.grade(plan.id);
      planner.grade(plan.id);
      const history = planner.getCheckHistory(plan.id);
      expect(history).toHaveLength(2);
      expect(history[0].checkId).not.toBe(history[1].checkId);
    });

    it('should persist latestCheck', () => {
      const plan = planner.create({ objective: 'Persist test', scope: 'test' });
      const check = planner.grade(plan.id);
      const latest = planner.getLatestCheck(plan.id);
      expect(latest).not.toBeNull();
      expect(latest!.checkId).toBe(check.checkId);
    });
  });

  describe('meetsGrade', () => {
    it('should return true when plan meets target grade', () => {
      const plan = planner.create({
        objective: 'Good plan',
        scope: 'test',
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
      const result = planner.meetsGrade(plan.id, 'B');
      expect(result.meets).toBe(true);
      expect(result.check.score).toBeGreaterThanOrEqual(70);
    });

    it('should return false when plan does not meet target grade', () => {
      const plan = planner.create({ objective: '', scope: '' });
      const result = planner.meetsGrade(plan.id, 'A+');
      expect(result.meets).toBe(false);
    });
  });

  describe('getCheckHistory', () => {
    it('should return empty array for plan with no checks', () => {
      const plan = planner.create({ objective: 'No checks', scope: 'test' });
      expect(planner.getCheckHistory(plan.id)).toEqual([]);
    });

    it('should throw for unknown plan', () => {
      expect(() => planner.getCheckHistory('plan-nonexistent')).toThrow('not found');
    });
  });

  describe('getLatestCheck', () => {
    it('should return null for plan with no checks', () => {
      const plan = planner.create({ objective: 'No checks', scope: 'test' });
      expect(planner.getLatestCheck(plan.id)).toBeNull();
    });

    it('should throw for unknown plan', () => {
      expect(() => planner.getLatestCheck('plan-nonexistent')).toThrow('not found');
    });
  });

  describe('full lifecycle', () => {
    it('should support draft → approved → executing → completed with tasks', () => {
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

      const final = planner.complete(plan.id);
      expect(final.status).toBe('completed');
      expect(final.tasks[0].status).toBe('completed');
      expect(final.tasks[1].status).toBe('completed');
      expect(final.tasks[2].status).toBe('skipped');
    });
  });
});
