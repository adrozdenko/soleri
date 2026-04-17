import { describe, it, expect } from 'vitest';
import {
  evaluateTaskConstraints,
  TaskConstraintError,
  appendConstraintAudit,
} from './constraint-gate.js';
import type {
  PlanTask,
  Plan,
  ConstraintDefinition,
  ConstraintAuditEntry,
} from './planner-types.js';
import { createConstraintPass, validateCompositionRules } from './gap-analysis.js';
import type { CompositionRule } from './planner-types.js';

// ─── Helpers ────────────────────────────────────────────────────

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'task-1',
    title: 'Test task',
    description: 'A test task description',
    status: 'pending',
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-test',
    objective: 'Test objective',
    scope: 'Test scope',
    status: 'draft',
    decisions: [],
    tasks: [],
    checks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeConstraint(overrides: Partial<ConstraintDefinition> = {}): ConstraintDefinition {
  return {
    id: 'constraint-1',
    name: 'No direct DB access',
    severity: 'critical',
    pattern: 'direct.*database.*access',
    description: 'Direct database access is forbidden',
    ...overrides,
  };
}

// ─── createConstraintPass ───────────────────────────────────────

describe('createConstraintPass', () => {
  it('returns empty gaps for empty constraints', () => {
    const pass = createConstraintPass([]);
    const gaps = pass(makePlan());
    expect(gaps).toEqual([]);
  });

  it('returns empty gaps for undefined constraints', () => {
    const pass = createConstraintPass(undefined);
    const gaps = pass(makePlan());
    expect(gaps).toEqual([]);
  });

  it('detects constraint violation in objective', () => {
    const constraint = makeConstraint({
      pattern: 'direct.*database',
    });
    const pass = createConstraintPass([constraint]);
    const plan = makePlan({ objective: 'Implement direct database queries' });
    const gaps = pass(plan);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].category).toBe('constraint');
    expect(gaps[0].severity).toBe('critical');
    expect(gaps[0].location).toBe('objective');
  });

  it('detects constraint violation in task descriptions', () => {
    const constraint = makeConstraint({
      pattern: 'skip.*tests',
      severity: 'major',
    });
    const pass = createConstraintPass([constraint]);
    const plan = makePlan({
      objective: 'Add feature',
      tasks: [makeTask({ title: 'Skip tests for speed', description: 'no testing needed' })],
    });
    const gaps = pass(plan);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].severity).toBe('major');
    expect(gaps[0].location).toBe('tasks[0]');
  });

  it('no gaps when constraint does not match', () => {
    const constraint = makeConstraint({ pattern: 'forbidden.*pattern' });
    const pass = createConstraintPass([constraint]);
    const plan = makePlan({ objective: 'A perfectly fine plan' });
    const gaps = pass(plan);
    expect(gaps).toEqual([]);
  });

  it('handles multiple constraints with mixed results', () => {
    const constraints = [
      makeConstraint({ id: 'c1', pattern: 'forbidden', severity: 'critical' }),
      makeConstraint({ id: 'c2', pattern: 'allowed', severity: 'minor' }),
    ];
    const pass = createConstraintPass(constraints);
    const plan = makePlan({ objective: 'This is forbidden content' });
    const gaps = pass(plan);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]._trigger).toBe('constraint:c1');
  });

  it('skips malformed regex patterns', () => {
    const constraint = makeConstraint({ pattern: '[invalid regex' });
    const pass = createConstraintPass([constraint]);
    const plan = makePlan({ objective: 'anything' });
    const gaps = pass(plan);
    expect(gaps).toEqual([]);
  });

  it('only reports one gap per constraint (first matching field)', () => {
    const constraint = makeConstraint({ pattern: 'shared.*keyword' });
    const pass = createConstraintPass([constraint]);
    const plan = makePlan({
      objective: 'shared keyword here',
      scope: 'shared keyword there too',
    });
    const gaps = pass(plan);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].location).toBe('objective');
  });
});

// ─── validateCompositionRules ───────────────────────────────────

describe('validateCompositionRules', () => {
  it('returns empty for empty rules', () => {
    const gaps = validateCompositionRules([], [makeTask()]);
    expect(gaps).toEqual([]);
  });

  it('returns empty for empty tasks', () => {
    const rule: CompositionRule = {
      trigger: 'migration',
      requires: ['rollback'],
      severity: 'major',
    };
    const gaps = validateCompositionRules([rule], []);
    expect(gaps).toEqual([]);
  });

  it('returns empty when trigger does not match any task', () => {
    const rule: CompositionRule = {
      trigger: 'migration',
      requires: ['rollback'],
      severity: 'major',
    };
    const gaps = validateCompositionRules([rule], [makeTask({ title: 'Add feature' })]);
    expect(gaps).toEqual([]);
  });

  it('flags missing companion task when trigger matches', () => {
    const rule: CompositionRule = {
      trigger: 'migration',
      requires: ['rollback'],
      severity: 'major',
    };
    const tasks = [makeTask({ title: 'Run database migration' })];
    const gaps = validateCompositionRules([rule], tasks);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].severity).toBe('major');
    expect(gaps[0].category).toBe('constraint');
    expect(gaps[0]._trigger).toContain('composition:');
  });

  it('passes when companion task exists', () => {
    const rule: CompositionRule = {
      trigger: 'migration',
      requires: ['rollback'],
      severity: 'major',
    };
    const tasks = [
      makeTask({ id: 'task-1', title: 'Run database migration' }),
      makeTask({ id: 'task-2', title: 'Add rollback procedure' }),
    ];
    const gaps = validateCompositionRules([rule], tasks);
    expect(gaps).toEqual([]);
  });

  it('flags multiple missing companions', () => {
    const rule: CompositionRule = {
      trigger: 'deploy',
      requires: ['rollback', 'monitoring'],
      severity: 'critical',
    };
    const tasks = [makeTask({ title: 'Deploy to production' })];
    const gaps = validateCompositionRules([rule], tasks);
    expect(gaps).toHaveLength(2);
  });

  it('skips malformed trigger regex', () => {
    const rule: CompositionRule = {
      trigger: '[bad regex',
      requires: ['anything'],
      severity: 'minor',
    };
    const gaps = validateCompositionRules([rule], [makeTask()]);
    expect(gaps).toEqual([]);
  });
});

// ─── evaluateTaskConstraints ────────────────────────────────────

describe('evaluateTaskConstraints', () => {
  it('returns empty for empty constraints', () => {
    const results = evaluateTaskConstraints(makeTask(), []);
    expect(results).toEqual([]);
  });

  it('returns pass result when constraint not violated', () => {
    const constraint = makeConstraint({ pattern: 'forbidden' });
    const results = evaluateTaskConstraints(makeTask({ title: 'Safe task' }), [constraint]);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('returns fail result for major violation (does not throw)', () => {
    const constraint = makeConstraint({ severity: 'major', pattern: 'test.*task' });
    const results = evaluateTaskConstraints(makeTask(), [constraint]);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe('major');
  });

  it('throws TaskConstraintError for critical violation', () => {
    const constraint = makeConstraint({ severity: 'critical', pattern: 'test.*task' });
    expect(() => evaluateTaskConstraints(makeTask(), [constraint])).toThrow(TaskConstraintError);
  });

  it('includes evidence in failed result', () => {
    const constraint = makeConstraint({ severity: 'minor', pattern: 'test' });
    const results = evaluateTaskConstraints(makeTask(), [constraint]);
    const failed = results.find((r) => !r.passed);
    expect(failed?.evidence).toBeDefined();
  });

  it('skips malformed regex and marks as passed', () => {
    const constraint = makeConstraint({ pattern: '[bad' });
    const results = evaluateTaskConstraints(makeTask(), [constraint]);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain('Skipped');
  });
});

// ─── appendConstraintAudit ──────────────────────────────────────

describe('appendConstraintAudit', () => {
  it('creates constraintAudit array if missing', () => {
    const plan = makePlan();
    const entry: ConstraintAuditEntry = {
      constraintId: 'c1',
      result: 'pass',
      severity: 'minor',
      message: 'OK',
      timestamp: 1000,
      source: 'vault',
    };
    appendConstraintAudit(plan, [entry]);
    expect(plan.constraintAudit).toHaveLength(1);
    expect(plan.constraintAudit![0].constraintId).toBe('c1');
  });

  it('deduplicates by constraintId + taskId + timestamp', () => {
    const plan = makePlan();
    const entry: ConstraintAuditEntry = {
      constraintId: 'c1',
      taskId: 'task-1',
      result: 'pass',
      severity: 'minor',
      message: 'OK',
      timestamp: 1000,
      source: 'vault',
    };
    appendConstraintAudit(plan, [entry]);
    appendConstraintAudit(plan, [entry]); // duplicate
    expect(plan.constraintAudit).toHaveLength(1);
  });

  it('allows different timestamps for same constraint', () => {
    const plan = makePlan();
    const entry1: ConstraintAuditEntry = {
      constraintId: 'c1',
      result: 'pass',
      severity: 'minor',
      message: 'OK',
      timestamp: 1000,
      source: 'vault',
    };
    const entry2: ConstraintAuditEntry = {
      ...entry1,
      timestamp: 2000,
    };
    appendConstraintAudit(plan, [entry1, entry2]);
    expect(plan.constraintAudit).toHaveLength(2);
  });

  it('handles empty entries array', () => {
    const plan = makePlan();
    appendConstraintAudit(plan, []);
    expect(plan.constraintAudit).toBeUndefined();
  });
});
