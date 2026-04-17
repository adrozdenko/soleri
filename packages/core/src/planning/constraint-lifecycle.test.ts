/**
 * E2E lifecycle test: constraint-aware planning.
 * Exercises the full flow: create plan → grade with constraints → fix → re-grade → task gate → audit trail.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Planner } from './planner.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ConstraintDefinition, CompositionRule, PlanAlternative } from './planner-types.js';
import {
  evaluateTaskConstraints,
  TaskConstraintError,
  appendConstraintAudit,
} from './constraint-gate.js';
import type { GapAnalysisOptions } from './gap-analysis.js';

const TWO_ALTERNATIVES: PlanAlternative[] = [
  {
    approach: 'Approach A',
    pros: ['Pro A'],
    cons: ['Con A'],
    rejected_reason: 'Not suitable',
  },
  {
    approach: 'Approach B',
    pros: ['Pro B'],
    cons: ['Con B'],
    rejected_reason: 'Too complex',
  },
];

describe('Constraint Lifecycle E2E', () => {
  let tempDir: string;
  let planner: Planner;

  // Simulated vault constraint entries
  const constraints: ConstraintDefinition[] = [
    {
      id: 'vault-constraint-no-eval',
      name: 'No eval() usage',
      severity: 'critical',
      pattern: 'eval\\(',
      description: 'eval() is forbidden for security reasons',
      domain: 'security',
    },
    {
      id: 'vault-constraint-no-any',
      name: 'No any types',
      severity: 'major',
      pattern: '\\bany\\b.*type',
      description: 'Avoid using any types in TypeScript',
      domain: 'typescript',
    },
  ];

  const compositionRules: CompositionRule[] = [
    {
      trigger: 'migration',
      requires: ['rollback'],
      severity: 'major',
      description: 'Database migrations must have a rollback task',
    },
  ];

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'constraint-e2e-'));
    planner = new Planner(join(tempDir, 'plans.json'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('full lifecycle: create → grade (fail) → fix → re-grade (pass) → task gate → audit', () => {
    // ─── Step 1: Create a plan that violates a constraint ───────
    const plan = planner.create({
      objective:
        'Build a data parser using eval() for dynamic expression evaluation with proper sandboxing',
      scope: 'packages/core/src/parser — new module. Excluded: CLI, forge.',
      decisions: [
        {
          decision: 'Use eval() for expression parsing',
          rationale: 'Simplest approach for dynamic expressions',
        },
        { decision: 'Add sandboxing layer', rationale: 'Mitigate eval security risks' },
      ],
      alternatives: TWO_ALTERNATIVES,
      tasks: [
        { title: 'Implement eval()-based parser', description: 'Core parsing logic using eval()' },
        { title: 'Add sandbox wrapper', description: 'Security layer around eval' },
        { title: 'Unit tests', description: 'Test parser edge cases' },
      ],
    });

    expect(plan.status).toBe('draft');

    // ─── Step 2: Grade with vault constraints — expect constraint gap ───
    const runtimeOptions: GapAnalysisOptions = {
      constraints,
      compositionRules,
    };
    const check1 = planner.grade(plan.id, runtimeOptions);

    // Should have constraint gaps (eval pattern matches objective and task descriptions)
    const constraintGaps = check1.gaps.filter((g) => g.category === 'constraint');
    expect(constraintGaps.length).toBeGreaterThan(0);

    const evalGap = constraintGaps.find(
      (g) => g._trigger === 'constraint:vault-constraint-no-eval',
    );
    expect(evalGap).toBeDefined();
    expect(evalGap!.severity).toBe('critical');

    // ─── Step 3: Fix the plan — remove eval() references ────────
    planner.iterate(plan.id, {
      objective: 'Build a data parser using a safe expression engine with proper sandboxing',
      tasks: undefined, // keep existing tasks — we'll iterate them differently
    });

    // Replace tasks with clean ones
    planner.splitTasks(plan.id, [
      {
        title: 'Implement safe expression parser',
        description: 'Core parsing logic using AST-based approach',
      },
      { title: 'Add security validation', description: 'Input validation layer' },
      { title: 'Unit tests', description: 'Test parser edge cases' },
    ]);

    // ─── Step 4: Re-grade — constraint should now pass ──────────
    const check2 = planner.grade(plan.id, runtimeOptions);

    const constraintGaps2 = check2.gaps.filter(
      (g) => g.category === 'constraint' && g._trigger === 'constraint:vault-constraint-no-eval',
    );
    expect(constraintGaps2).toHaveLength(0);

    // ─── Step 5: Test composition rule (no migration = no trigger) ──
    // Current plan has no migration tasks, so composition rule should not fire
    const compositionGaps = check2.gaps.filter((g) => g._trigger?.startsWith('composition:'));
    expect(compositionGaps).toHaveLength(0);

    // ─── Step 6: Task-level constraint gate ─────────────────────
    const updatedPlan = planner.get(plan.id)!;
    const safeTask = updatedPlan.tasks[0];

    // Safe task should pass gate
    const results = evaluateTaskConstraints(safeTask, constraints);
    const failures = results.filter((r) => !r.passed);
    expect(failures).toHaveLength(0);

    // Dangerous task should be blocked
    const dangerousTask = {
      ...safeTask,
      id: 'task-danger',
      title: 'Run eval() on user input',
      description: 'Parse user expressions with eval()',
    };
    expect(() => evaluateTaskConstraints(dangerousTask, constraints)).toThrow(TaskConstraintError);

    // ─── Step 7: Audit trail records all evaluations ────────────
    const auditPlan = planner.get(plan.id)!;

    // Record grading audit entries
    for (const gap of check1.gaps.filter((g) => g.category === 'constraint')) {
      appendConstraintAudit(auditPlan, [
        {
          constraintId: gap._trigger?.replace('constraint:', '') ?? 'unknown',
          result: 'fail',
          severity: gap.severity as 'critical' | 'major' | 'minor',
          message: gap.description,
          timestamp: check1.checkedAt,
          source: 'vault',
        },
      ]);
    }

    // Record task gate audit entries
    appendConstraintAudit(
      auditPlan,
      results.map((r) => ({
        constraintId: r.constraintId,
        taskId: safeTask.id,
        result: r.passed ? ('pass' as const) : ('fail' as const),
        severity: r.severity,
        message: r.message,
        timestamp: Date.now(),
        source: 'vault' as const,
      })),
    );

    // Verify audit trail
    expect(auditPlan.constraintAudit).toBeDefined();
    expect(auditPlan.constraintAudit!.length).toBeGreaterThan(0);

    // Should have both grading failures and task gate passes
    const auditFails = auditPlan.constraintAudit!.filter((a) => a.result === 'fail');
    const auditPasses = auditPlan.constraintAudit!.filter((a) => a.result === 'pass');
    expect(auditFails.length).toBeGreaterThan(0);
    expect(auditPasses.length).toBeGreaterThan(0);

    // Dedup should work — adding same entries again shouldn't grow the array
    const sizeBefore = auditPlan.constraintAudit!.length;
    appendConstraintAudit(
      auditPlan,
      results.map((r) => ({
        constraintId: r.constraintId,
        taskId: safeTask.id,
        result: r.passed ? ('pass' as const) : ('fail' as const),
        severity: r.severity,
        message: r.message,
        timestamp: Date.now() + 1, // different timestamp = not a dupe
        source: 'vault' as const,
      })),
    );
    // Different timestamp = new entry. Same-(constraintId, taskId, timestamp) dedup
    // is covered in constraint-gate.test.ts.
    expect(auditPlan.constraintAudit!.length).toBeGreaterThan(sizeBefore);
  });

  it('composition rule: migration without rollback triggers gap', () => {
    const plan = planner.create({
      objective: 'Migrate user table schema to v2 with backward compatibility and phased rollout',
      scope: 'Database layer only',
      decisions: [{ decision: 'Use phased migration', rationale: 'Minimize downtime risk' }],
      alternatives: TWO_ALTERNATIVES,
      tasks: [
        { title: 'Write database migration script', description: 'Alter user table schema' },
        { title: 'Update ORM models', description: 'Reflect new schema in code' },
        // NOTE: no rollback task!
      ],
    });

    const check = planner.grade(plan.id, { compositionRules });
    const compGaps = check.gaps.filter((g) => g._trigger?.startsWith('composition:'));
    expect(compGaps.length).toBeGreaterThan(0);
    expect(compGaps[0].severity).toBe('major');
    expect(compGaps[0]._trigger).toContain('rollback');
  });

  it('composition rule: migration with rollback passes', () => {
    const plan = planner.create({
      objective: 'Migrate user table schema to v2 with backward compatibility and phased rollout',
      scope: 'Database layer only',
      decisions: [{ decision: 'Use phased migration', rationale: 'Minimize downtime risk' }],
      alternatives: TWO_ALTERNATIVES,
      tasks: [
        { title: 'Write database migration script', description: 'Alter user table schema' },
        { title: 'Write rollback script', description: 'Revert schema changes if needed' },
        { title: 'Update ORM models', description: 'Reflect new schema in code' },
      ],
    });

    const check = planner.grade(plan.id, { compositionRules });
    const compGaps = check.gaps.filter((g) => g._trigger?.startsWith('composition:'));
    expect(compGaps).toHaveLength(0);
  });

  it('graceful degradation: grading works without constraints', () => {
    const plan = planner.create({
      objective: 'Simple feature with clear measurable target of 95% coverage',
      scope: 'Single file change',
      decisions: [{ decision: 'Direct implementation', rationale: 'Simple enough' }],
      alternatives: TWO_ALTERNATIVES,
      tasks: [{ title: 'Implement', description: 'Write the code' }],
    });

    // No constraints passed — should grade normally
    const check = planner.grade(plan.id);
    expect(check.grade).toBeDefined();
    expect(check.score).toBeGreaterThanOrEqual(0);
    const constraintGaps = check.gaps.filter((g) => g.category === 'constraint');
    expect(constraintGaps).toHaveLength(0);
  });
});
