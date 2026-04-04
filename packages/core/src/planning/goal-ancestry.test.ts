import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GoalAncestry, JsonGoalRepository, generateGoalId } from './goal-ancestry.js';
import type { Goal, GoalRepository } from './goal-ancestry.js';
import { Planner } from './planner.js';
import { formatIssueBody } from './github-projection.js';

// ─── In-memory repository for unit tests ──────────────────────────

class InMemoryGoalRepository implements GoalRepository {
  private goals: Goal[] = [];

  getById(id: string): Goal | null {
    return this.goals.find((g) => g.id === id) ?? null;
  }

  getByParentId(parentId: string): Goal[] {
    return this.goals.filter((g) => g.parentId === parentId);
  }

  create(goal: Omit<Goal, 'createdAt' | 'updatedAt'>): Goal {
    const now = Date.now();
    const full: Goal = { ...goal, createdAt: now, updatedAt: now };
    this.goals.push(full);
    return full;
  }

  updateStatus(id: string, status: Goal['status']): Goal {
    const goal = this.getById(id);
    if (!goal) throw new Error(`Goal not found: ${id}`);
    goal.status = status;
    goal.updatedAt = Date.now();
    return goal;
  }

  list(): Goal[] {
    return [...this.goals];
  }

  /** Test helper — seed a goal directly */
  seed(goal: Goal): void {
    this.goals.push(goal);
  }
}

describe('GoalAncestry', () => {
  let repo: InMemoryGoalRepository;
  let ancestry: GoalAncestry;

  beforeEach(() => {
    repo = new InMemoryGoalRepository();
    ancestry = new GoalAncestry(repo);
  });

  describe('getAncestors', () => {
    it('should return empty array for goal with no parent', () => {
      repo.seed({
        id: 'g1',
        title: 'Root',
        level: 'objective',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const ancestors = ancestry.getAncestors('g1');
      expect(ancestors).toEqual([]);
    });

    it('should return one ancestor for 1-level depth', () => {
      repo.seed({
        id: 'root',
        title: 'Root Objective',
        level: 'objective',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      repo.seed({
        id: 'child',
        title: 'Project A',
        level: 'project',
        parentId: 'root',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const ancestors = ancestry.getAncestors('child');
      expect(ancestors).toHaveLength(1);
      expect(ancestors[0].id).toBe('root');
    });

    it('should walk 3 levels of ancestry', () => {
      repo.seed({
        id: 'obj',
        title: 'Objective',
        level: 'objective',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      });
      repo.seed({
        id: 'proj',
        title: 'Project',
        level: 'project',
        parentId: 'obj',
        status: 'active',
        createdAt: 2,
        updatedAt: 2,
      });
      repo.seed({
        id: 'plan',
        title: 'Plan',
        level: 'plan',
        parentId: 'proj',
        status: 'active',
        createdAt: 3,
        updatedAt: 3,
      });
      repo.seed({
        id: 'task',
        title: 'Task',
        level: 'task',
        parentId: 'plan',
        status: 'planned',
        createdAt: 4,
        updatedAt: 4,
      });

      const ancestors = ancestry.getAncestors('task');
      expect(ancestors).toHaveLength(3);
      // Closest first: plan, proj, obj
      expect(ancestors[0].id).toBe('plan');
      expect(ancestors[1].id).toBe('proj');
      expect(ancestors[2].id).toBe('obj');
    });

    it('should stop at max 10 levels', () => {
      // Build a chain of 12 goals
      for (let i = 0; i < 12; i++) {
        repo.seed({
          id: `g${i}`,
          title: `Goal ${i}`,
          level: 'project',
          parentId: i > 0 ? `g${i - 1}` : undefined,
          status: 'active',
          createdAt: i,
          updatedAt: i,
        });
      }

      const ancestors = ancestry.getAncestors('g11');
      expect(ancestors.length).toBeLessThanOrEqual(10);
    });

    it('should throw on cycle detection', () => {
      repo.seed({
        id: 'a',
        title: 'A',
        level: 'project',
        parentId: 'b',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      });
      repo.seed({
        id: 'b',
        title: 'B',
        level: 'project',
        parentId: 'a',
        status: 'active',
        createdAt: 2,
        updatedAt: 2,
      });

      expect(() => ancestry.getAncestors('a')).toThrow(/[Cc]ycle/);
    });

    it('should return empty for nonexistent goal', () => {
      const ancestors = ancestry.getAncestors('nonexistent');
      expect(ancestors).toEqual([]);
    });
  });

  describe('getContext', () => {
    it('should render markdown hierarchy from root to current', () => {
      repo.seed({
        id: 'obj',
        title: 'Ship v2',
        level: 'objective',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      });
      repo.seed({
        id: 'proj',
        title: 'Auth System',
        level: 'project',
        parentId: 'obj',
        status: 'active',
        createdAt: 2,
        updatedAt: 2,
      });
      repo.seed({
        id: 'plan',
        title: 'JWT Implementation',
        level: 'plan',
        parentId: 'proj',
        status: 'active',
        createdAt: 3,
        updatedAt: 3,
      });

      const md = ancestry.getContext('plan');
      expect(md).toContain('## Goal Context');
      expect(md).toContain('[objective] Ship v2');
      expect(md).toContain('[project] Auth System');
      expect(md).toContain('[plan] JWT Implementation');
    });

    it('should return empty string for nonexistent goal', () => {
      expect(ancestry.getContext('nope')).toBe('');
    });

    it('should mark current goal with bold arrow', () => {
      repo.seed({
        id: 'obj',
        title: 'Objective',
        level: 'objective',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      });
      const md = ancestry.getContext('obj');
      expect(md).toContain('**→**');
    });
  });

  describe('inject', () => {
    it('should add goalAncestry to config', () => {
      repo.seed({
        id: 'obj',
        title: 'Ship v2',
        level: 'objective',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      });
      repo.seed({
        id: 'task',
        title: 'Do thing',
        level: 'task',
        parentId: 'obj',
        status: 'planned',
        createdAt: 2,
        updatedAt: 2,
      });

      const ctx = { config: { timeout: 5000 } };
      const enriched = ancestry.inject(ctx, 'task');
      expect(enriched.config?.goalAncestry).toContain('## Goal Context');
      expect(enriched.config?.timeout).toBe(5000);
    });

    it('should return original context if goal not found', () => {
      const ctx = { config: { foo: 'bar' } };
      const result = ancestry.inject(ctx, 'nonexistent');
      expect(result).toEqual(ctx);
    });
  });
});

describe('JsonGoalRepository', () => {
  let tempDir: string;
  let repo: JsonGoalRepository;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'goal-repo-test-'));
    repo = new JsonGoalRepository(join(tempDir, 'goals.json'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create and retrieve a goal', () => {
    const before = Date.now();
    const goal = repo.create({ id: 'g1', title: 'Ship it', level: 'objective', status: 'planned' });
    expect(goal.createdAt).toBeGreaterThanOrEqual(before);
    expect(goal.createdAt).toBeLessThanOrEqual(Date.now());
    expect(repo.getById('g1')?.title).toBe('Ship it');
  });

  it('should list goals by parent', () => {
    repo.create({ id: 'parent', title: 'Parent', level: 'objective', status: 'active' });
    repo.create({
      id: 'child1',
      title: 'Child 1',
      level: 'project',
      parentId: 'parent',
      status: 'planned',
    });
    repo.create({
      id: 'child2',
      title: 'Child 2',
      level: 'project',
      parentId: 'parent',
      status: 'planned',
    });

    const children = repo.getByParentId('parent');
    expect(children).toHaveLength(2);
  });

  it('should update status', () => {
    repo.create({ id: 'g1', title: 'Goal', level: 'plan', status: 'planned' });
    const updated = repo.updateStatus('g1', 'completed');
    expect(updated.status).toBe('completed');
    expect(repo.getById('g1')?.status).toBe('completed');
  });

  it('should throw when updating nonexistent goal', () => {
    expect(() => repo.updateStatus('nope', 'active')).toThrow(/not found/);
  });

  it('should persist across instances', () => {
    const filePath = join(tempDir, 'goals.json');
    const repo1 = new JsonGoalRepository(filePath);
    repo1.create({ id: 'g1', title: 'Persisted', level: 'objective', status: 'active' });

    const repo2 = new JsonGoalRepository(filePath);
    expect(repo2.getById('g1')?.title).toBe('Persisted');
  });
});

describe('generateGoalId', () => {
  it('should include the level in the ID', () => {
    expect(generateGoalId('objective')).toMatch(/^goal-objective-/);
    expect(generateGoalId('task')).toMatch(/^goal-task-/);
  });
});

describe('Planner goalId integration', () => {
  let tempDir: string;
  let planner: Planner;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'planner-goal-test-'));
    planner = new Planner(join(tempDir, 'plans.json'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should store goalId on created plan', () => {
    const plan = planner.create({
      objective: 'Add auth',
      scope: 'backend',
      goalId: 'goal-plan-123',
    });
    expect(plan.goalId).toBe('goal-plan-123');
  });

  it('should create plan without goalId (backward compat)', () => {
    const plan = planner.create({ objective: 'Add auth', scope: 'backend' });
    expect(plan.goalId).toBeUndefined();
  });

  it('should preserve goalId through split', () => {
    const plan = planner.create({
      objective: 'Add auth',
      scope: 'backend',
      goalId: 'goal-plan-456',
    });

    planner.splitTasks(plan.id, [
      { title: 'JWT', description: 'Implement JWT' },
      { title: 'Middleware', description: 'Auth middleware' },
    ]);

    const updated = planner.get(plan.id)!;
    expect(updated.goalId).toBe('goal-plan-456');
    expect(updated.tasks).toHaveLength(2);
  });
});

describe('formatIssueBody with goal context', () => {
  it('should include goal context section when provided', () => {
    const body = formatIssueBody(
      {
        planId: 'plan-1',
        grade: 'A',
        score: 92,
        objective: 'Build auth',
        decisions: [],
        tasks: [{ id: 'task-1', title: 'JWT', description: 'Implement JWT' }],
      },
      'JWT',
      'Implement JWT tokens',
      { goalContext: '## Goal Context\n\n- [objective] Ship v2 (active)' },
    );

    expect(body).toContain('## Goal Context');
    expect(body).toContain('[objective] Ship v2');
  });

  it('should not include section when no goal context', () => {
    const body = formatIssueBody(
      {
        planId: 'plan-1',
        grade: 'A',
        score: 92,
        objective: 'Build auth',
        decisions: [],
        tasks: [],
      },
      'JWT',
      'Implement JWT tokens',
    );

    expect(body).not.toContain('## Goal Context');
  });
});
