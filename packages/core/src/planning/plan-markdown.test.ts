import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serializePlan, parsePlan, buildPlansIndex, PLAN_STORE_VERSION } from './plan-markdown.js';
import { Planner } from './planner.js';
import type { Plan } from './planner-types.js';

/** A minimal plan as produced by createPlanObject for trivial work. */
function minimalPlan(): Plan {
  return {
    id: 'plan-1000000000000-aaaa1111',
    objective: 'Widen scaffold CLI pin for the pre-publish window',
    scope: 'forge scaffold pin only',
    status: 'draft',
    decisions: [],
    tasks: [],
    checks: [],
    createdAt: 1000000000000,
    updatedAt: 1000000000000,
  };
}

/** A fully-populated plan exercising every optional field + nested structure. */
function fullPlan(): Plan {
  return {
    id: 'plan-1775741365371-wmc9u3ab',
    objective: 'Migrate plans to markdown | with a pipe & special: chars',
    scope: 'planning module; excludes vault and flows',
    status: 'reconciling',
    decisions: [
      'Reuse the yaml package already in core',
      { decision: 'Embed a machine data island', rationale: 'Lossless round-trip of rich plans' },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Write serializer',
        description: 'Serialize Plan -> markdown with frontmatter',
        status: 'completed',
        dependsOn: [],
        phase: 'wave-1',
        milestone: 'v2',
        acceptanceCriteria: ['round-trip holds', 'frontmatter minimal'],
        startedAt: 1775741365000,
        completedAt: 1775741365500,
        metrics: { durationMs: 500, iterations: 1, toolCalls: 3, modelTier: 'opus' },
        deliverables: [{ type: 'file', path: 'plan-markdown.ts', hash: 'abc', stale: false }],
        verification: {
          findings: [
            { description: 'edge case with -->', severity: 'medium', proven: true, proof: 'test' },
          ],
        },
        fixIterations: 0,
        verified: true,
        evidence: [
          {
            criterion: 'round-trip holds',
            content: 'test passed',
            type: 'command_output',
            submittedAt: 1775741365400,
          },
        ],
        updatedAt: 1775741365500,
      },
      {
        id: 'task-2',
        title: 'Write parser',
        description: 'Parse markdown -> Plan',
        status: 'in_progress',
        dependsOn: ['task-1'],
        parentTaskId: 'task-1',
        updatedAt: 1775741365600,
      },
    ],
    approach: 'Frontmatter strip + human body + hidden JSON island for fidelity.',
    context: 'ICM WS2 ruling.',
    success_criteria: ['parse(serialize(plan)) === plan', 'README index generated'],
    tool_chain: ['Read', 'Edit', 'Bash'],
    flow: 'developer',
    target_mode: 'build',
    alternatives: [
      {
        approach: 'Encode everything as structured markdown',
        pros: ['no hidden data'],
        cons: ['fragile', 'lossy for gaps/metrics'],
        rejected_reason: 'cannot losslessly reconstruct rich Plan state',
      },
    ],
    reconciliation: {
      planId: 'plan-1775741365371-wmc9u3ab',
      accuracy: 92,
      driftItems: [
        {
          type: 'modified',
          description: 'added dedup | with pipe',
          impact: 'low',
          rationale: 'git-friendliness',
        },
      ],
      summary: 'Minor drift, mostly as planned',
      reconciledAt: 1775741365700,
    },
    reviews: [
      {
        planId: 'plan-1775741365371-wmc9u3ab',
        taskId: 'task-1',
        reviewer: 'icm',
        outcome: 'approved',
        comments: 'lgtm',
        reviewedAt: 1775741365650,
      },
    ],
    latestCheck: {
      checkId: 'chk-1775741365999-a1b2c3d4',
      planId: 'plan-1775741365371-wmc9u3ab',
      grade: 'A',
      score: 92,
      gaps: [
        {
          id: 'gap_1_x',
          severity: 'minor',
          category: 'clarity',
          description: 'scope could be tighter',
          recommendation: 'narrow scope',
          location: 'scope',
          _trigger: 'scope_breadth',
        },
      ],
      iteration: 1,
      checkedAt: 1775741365999,
    },
    checks: [
      {
        checkId: 'chk-1775741365999-a1b2c3d4',
        planId: 'plan-1775741365371-wmc9u3ab',
        grade: 'A',
        score: 92,
        gaps: [
          {
            id: 'gap_1_x',
            severity: 'minor',
            category: 'clarity',
            description: 'scope could be tighter',
            recommendation: 'narrow scope',
            location: 'scope',
            _trigger: 'scope_breadth',
          },
        ],
        iteration: 1,
        checkedAt: 1775741365999,
      },
    ],
    playbookMatch: { label: 'refactor', genericId: 'gen-1', domainId: 'dom-1' },
    playbookSessionId: 'sess-1',
    githubIssue: { owner: 'adrozdenko', repo: 'soleri', number: 833 },
    githubProjection: {
      repo: 'adrozdenko/soleri',
      milestone: 3,
      issues: [{ taskId: 'task-1', issueNumber: 901 }],
      projectedAt: 1775741365800,
    },
    executionSummary: {
      totalDurationMs: 500,
      tasksCompleted: 1,
      tasksSkipped: 0,
      tasksFailed: 0,
      avgTaskDurationMs: 500,
    },
    goalId: 'goal-42',
    constraintAudit: [
      {
        constraintId: 'c1',
        result: 'pass',
        severity: 'major',
        message: 'ok',
        timestamp: 1775741365850,
        source: 'vault',
      },
    ],
    createdAt: 1775741365371,
    updatedAt: 1775741365700,
  };
}

describe('plan-markdown serialize/parse', () => {
  it('round-trips a minimal plan (parse(serialize(plan)) deep-equals plan)', () => {
    const plan = minimalPlan();
    expect(parsePlan(serializePlan(plan))).toEqual(plan);
  });

  it('round-trips a fully-populated plan (deep)', () => {
    const plan = fullPlan();
    expect(parsePlan(serializePlan(plan))).toEqual(plan);
  });

  it('is idempotent — serialize is stable across a round-trip', () => {
    const plan = fullPlan();
    const once = serializePlan(plan);
    const twice = serializePlan(parsePlan(once));
    expect(twice).toBe(once);
  });

  it('emits a minimal frontmatter strip (no tasks/checks/reconciliation)', () => {
    const md = serializePlan(fullPlan());
    const fm = md.slice(md.indexOf('---') + 3, md.indexOf('\n---', 3));
    expect(fm).toContain('id: plan-1775741365371-wmc9u3ab');
    expect(fm).toContain('status: reconciling');
    expect(fm).toContain('grade: A');
    expect(fm).toContain('score: 92');
    expect(fm).toContain('checkId: chk-1775741365999-a1b2c3d4');
    expect(fm).toContain('flow: developer');
    expect(fm).toContain('githubIssue:');
    // Narrative + rich structures must NOT be in the frontmatter strip.
    expect(fm).not.toContain('tasks:');
    expect(fm).not.toContain('checks:');
    expect(fm).not.toContain('reconciliation:');
    expect(fm).not.toContain('gaps:');
  });

  it('renders human body sections mirroring the ICM stage contract', () => {
    const md = serializePlan(fullPlan());
    expect(md).toContain('## Objective');
    expect(md).toContain('## Scope');
    expect(md).toContain('## Approach');
    expect(md).toContain('## Alternatives');
    expect(md).toContain('## Steps');
    expect(md).toContain('- **Process:**');
    expect(md).toContain('## Decisions');
    expect(md).toContain('## Success Criteria');
    expect(md).toContain('## Reconciliation');
  });

  it('treats frontmatter as authoritative — a human status edit wins on parse', () => {
    const md = serializePlan(minimalPlan());
    const edited = md.replace('status: draft', 'status: approved');
    expect(parsePlan(edited).status).toBe('approved');
  });

  it('survives a data island whose JSON contains the closing marker text', () => {
    const plan = minimalPlan();
    plan.objective = 'contains --> inside and <!-- soleri:plan-data v2 too';
    expect(parsePlan(serializePlan(plan))).toEqual(plan);
  });

  it('throws on markdown with no machine data island', () => {
    expect(() => parsePlan('# Plan: x\n\nno island here')).toThrow(/data island/);
  });

  it('builds a README index with id, objective, status, grade', () => {
    const index = buildPlansIndex([fullPlan(), minimalPlan()]);
    expect(index).toContain('| ID | Objective | Status | Grade |');
    expect(index).toContain('plan-1775741365371-wmc9u3ab');
    expect(index).toContain('reconciling');
    expect(index).toContain('| A |');
    // minimal plan has no latestCheck -> grade placeholder.
    expect(index).toContain('| — |');
  });
});

describe('Planner file-first markdown store', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plan-md-test-'));
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes a canonical plans/<id>.md, a README index, and a v2 JSON cache', () => {
    const planner = new Planner(join(tempDir, 'plans.json'));
    const plan = planner.create({ objective: 'Ship markdown plans', scope: 'planning' });

    const mdPath = join(tempDir, 'plans', `${plan.id}.md`);
    expect(existsSync(mdPath)).toBe(true);
    expect(existsSync(join(tempDir, 'plans', 'README.md'))).toBe(true);

    const cache = JSON.parse(readFileSync(join(tempDir, 'plans.json'), 'utf-8')) as {
      version: string;
    };
    expect(cache.version).toBe(PLAN_STORE_VERSION);

    // The .md round-trips back to the stored plan.
    const parsed = parsePlan(readFileSync(mdPath, 'utf-8'));
    expect(parsed.id).toBe(plan.id);
    expect(parsed.objective).toBe('Ship markdown plans');
  });

  it('reloads plans from the .md set in a fresh Planner instance', () => {
    const p1 = new Planner(join(tempDir, 'plans.json'));
    const created = p1.create({ objective: 'Persisted plan', scope: 'x' });

    const p2 = new Planner(join(tempDir, 'plans.json'));
    expect(p2.get(created.id)?.objective).toBe('Persisted plan');
  });

  it('keeps a stable filename across status changes', () => {
    const planner = new Planner(join(tempDir, 'plans.json'), { gradeMinTaskCount: 1 });
    const plan = planner.create({ objective: 'Stable filename plan', scope: 'x' });
    const mdPath = join(tempDir, 'plans', `${plan.id}.md`);
    planner.approve(plan.id);
    planner.startExecution(plan.id);
    expect(existsSync(mdPath)).toBe(true);
    expect(parsePlan(readFileSync(mdPath, 'utf-8')).status).toBe('executing');
  });

  it('removes the .md file when a plan is deleted', () => {
    const planner = new Planner(join(tempDir, 'plans.json'));
    const plan = planner.create({ objective: 'To be removed', scope: 'x' });
    const mdPath = join(tempDir, 'plans', `${plan.id}.md`);
    expect(existsSync(mdPath)).toBe(true);
    planner.remove(plan.id);
    expect(existsSync(mdPath)).toBe(false);
  });

  it('reparses from .md when a file is edited externally (newer than the cache)', () => {
    const p1 = new Planner(join(tempDir, 'plans.json'));
    const plan = p1.create({ objective: 'External edit target', scope: 'x' });
    const mdPath = join(tempDir, 'plans', `${plan.id}.md`);

    // Simulate a human editing the frontmatter and the file becoming newer.
    const edited = readFileSync(mdPath, 'utf-8').replace('status: draft', 'status: approved');
    writeFileSync(mdPath, edited, 'utf-8');
    const future = new Date(Date.now() + 60_000);
    utimesSync(mdPath, future, future);

    const p2 = new Planner(join(tempDir, 'plans.json'));
    expect(p2.get(plan.id)?.status).toBe('approved');
  });
});

describe('one-time migration from legacy plan-store.json', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plan-migrate-test-'));
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('emits plans/<id>.md for every plan in a legacy v1.0 store and bumps the version', () => {
    const legacyPlans: Plan[] = [minimalPlan(), fullPlan()];
    const plansPath = join(tempDir, 'plans.json');
    writeFileSync(
      plansPath,
      JSON.stringify({ version: '1.0', plans: legacyPlans }, null, 2),
      'utf-8',
    );

    // Constructing a Planner triggers the one-time migration on load().
    const planner = new Planner(plansPath);

    for (const plan of legacyPlans) {
      const mdPath = join(tempDir, 'plans', `${plan.id}.md`);
      expect(existsSync(mdPath)).toBe(true);
      // Each migrated .md parses back to the original plan (deep).
      expect(parsePlan(readFileSync(mdPath, 'utf-8'))).toEqual(plan);
    }

    // README index lists both plans.
    const readme = readFileSync(join(tempDir, 'plans', 'README.md'), 'utf-8');
    expect(readme).toContain(legacyPlans[0].id);
    expect(readme).toContain(legacyPlans[1].id);

    // JSON cache bumped to the new on-disk format version.
    const cache = JSON.parse(readFileSync(plansPath, 'utf-8')) as { version: string };
    expect(cache.version).toBe(PLAN_STORE_VERSION);

    // Reload sees both migrated plans.
    expect(planner.list()).toHaveLength(2);
  });
});
