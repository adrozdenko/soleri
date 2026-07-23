import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serializePlan, parsePlan, buildPlansIndex, PLAN_STORE_VERSION } from './plan-markdown.js';
import { Planner } from './planner.js';
import type { Plan } from './planner-types.js';
import { createAgentRuntime } from '../runtime/runtime.js';

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

/**
 * A fully-populated plan exercising every optional field. `executionSummary`
 * equals computeExecutionSummary(tasks) because it is recomputed on parse.
 */
function fullPlan(): Plan {
  return {
    id: 'plan-1775741365371-wmc9u3ab',
    objective: 'Migrate plans to markdown | with a pipe & special: chars',
    scope: 'planning module; excludes vault and flows',
    status: 'reconciling',
    decisions: [
      'Reuse the yaml package already in core',
      {
        decision: 'Use a visible JSON sidecar',
        rationale: 'Lossless round-trip without a hidden island',
      },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Write serializer',
        description: 'Serialize Plan -> markdown with frontmatter',
        status: 'completed',
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
    approach: 'Frontmatter strip + human body sections + a visible machine-state sidecar.',
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
    // Matches computeExecutionSummary(tasks): 1 completed, 500ms duration.
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

describe('plan-markdown serialize/parse (md + sidecar pair)', () => {
  it('round-trips a minimal plan over the pair (deep-equal, no sidecar)', () => {
    const plan = minimalPlan();
    const { markdown, data } = serializePlan(plan);
    expect(data).toBeNull(); // no machine state -> no sidecar
    expect(parsePlan(markdown, data)).toEqual(plan);
  });

  it('round-trips a fully-populated plan over the pair (deep-equal)', () => {
    const plan = fullPlan();
    const { markdown, data } = serializePlan(plan);
    expect(data).not.toBeNull();
    expect(parsePlan(markdown, data)).toEqual(plan);
  });

  it('is idempotent — serialize is stable across a round-trip', () => {
    const plan = fullPlan();
    const first = serializePlan(plan);
    const second = serializePlan(parsePlan(first.markdown, first.data));
    expect(second.markdown).toBe(first.markdown);
    expect(second.data).toEqual(first.data);
  });

  it('keeps machine-captured state OUT of the .md and human-authored state OUT of the sidecar', () => {
    const { markdown, data } = serializePlan(fullPlan());
    // Machine state is not in the human file.
    expect(markdown).not.toContain('gap_1_x');
    expect(markdown).not.toContain('"evidence"');
    expect(markdown).not.toContain('constraintAudit');
    expect(markdown).not.toContain('submittedAt');
    // Human-authored narrative is not in the sidecar.
    const dataStr = JSON.stringify(data);
    expect(dataStr).not.toContain('Migrate plans to markdown');
    expect(dataStr).not.toContain('Reuse the yaml package');
    expect(dataStr).not.toContain('Write serializer');
    // executionSummary is recomputed, never stored.
    expect(dataStr).not.toContain('executionSummary');
    expect(dataStr).not.toContain('avgTaskDurationMs');
  });

  it('has no hidden HTML-comment data island', () => {
    const { markdown } = serializePlan(fullPlan());
    expect(markdown).not.toContain('<!--');
    expect(markdown).not.toContain('soleri:plan-data');
  });

  it('emits a minimal frontmatter strip (no tasks/checks/reconciliation)', () => {
    const { markdown } = serializePlan(fullPlan());
    const fm = markdown.slice(markdown.indexOf('---') + 3, markdown.indexOf('\n---', 3));
    expect(fm).toContain('id: plan-1775741365371-wmc9u3ab');
    expect(fm).toContain('status: reconciling');
    expect(fm).toContain('grade: A');
    expect(fm).not.toContain('tasks:');
    expect(fm).not.toContain('checks:');
    expect(fm).not.toContain('reconciliation:');
  });

  it('renders human body sections mirroring the ICM stage contract', () => {
    const { markdown } = serializePlan(fullPlan());
    for (const section of [
      '## Objective',
      '## Scope',
      '## Approach',
      '## Context',
      '## Alternatives',
      '## Steps',
      '- **Process:**',
      '## Decisions',
      '## Success Criteria',
      '## Tools',
      '## Reconciliation',
    ]) {
      expect(markdown).toContain(section);
    }
    // Step heading carries the provenance id + status.
    expect(markdown).toContain('`[id: task-1 · status: completed]`');
  });

  it('builds a README index with id, objective, status, grade', () => {
    const index = buildPlansIndex([fullPlan(), minimalPlan()]);
    expect(index).toContain('| ID | Objective | Status | Grade |');
    expect(index).toContain('plan-1775741365371-wmc9u3ab');
    expect(index).toContain('reconciling');
    expect(index).toContain('| A |');
    expect(index).toContain('| — |'); // minimal plan has no grade
  });
});

describe('body-prose propagation (Addendum 2A)', () => {
  it('propagates a human edit to the ## Scope body section', () => {
    const { markdown, data } = serializePlan(fullPlan());
    const edited = markdown.replace('planning module; excludes vault and flows', 'EDITED SCOPE');
    expect(parsePlan(edited, data).scope).toBe('EDITED SCOPE');
  });

  it('propagates a human edit to a step description (Process)', () => {
    const { markdown, data } = serializePlan(fullPlan());
    const edited = markdown.replace(
      'Serialize Plan -> markdown with frontmatter',
      'REWRITTEN by a human',
    );
    expect(parsePlan(edited, data).tasks[0].description).toBe('REWRITTEN by a human');
  });

  it('propagates a human edit to a step title and status', () => {
    const { markdown, data } = serializePlan(fullPlan());
    const edited = markdown
      .replace('### 1. Write serializer', '### 1. Renamed step')
      .replace('status: completed]`', 'status: failed]`');
    const parsed = parsePlan(edited, data);
    expect(parsed.tasks[0].title).toBe('Renamed step');
    expect(parsed.tasks[0].status).toBe('failed');
  });

  it('propagates a human edit to a Decisions bullet', () => {
    const { markdown, data } = serializePlan(fullPlan());
    const edited = markdown.replace(
      '- Reuse the yaml package already in core',
      '- Reuse a hand-rolled serializer',
    );
    expect(parsePlan(edited, data).decisions[0]).toBe('Reuse a hand-rolled serializer');
  });

  it('propagates a human edit to a Success Criteria item', () => {
    const { markdown, data } = serializePlan(fullPlan());
    const edited = markdown.replace('- [ ] README index generated', '- [ ] README auto-updated');
    expect(parsePlan(edited, data).success_criteria).toContain('README auto-updated');
  });

  it('keeps frontmatter authoritative for status (only lives there)', () => {
    const { markdown, data } = serializePlan(minimalPlan());
    const edited = markdown.replace('status: draft', 'status: approved');
    expect(parsePlan(edited, data).status).toBe('approved');
  });
});

describe('adversarial round-trip (reviewer BLOCKER cases)', () => {
  function taskPlan(description: string, over: Partial<Plan> = {}): Plan {
    return {
      ...minimalPlan(),
      tasks: [
        {
          id: 't1',
          title: 'T',
          description,
          status: 'pending',
          updatedAt: 5,
        },
      ],
      ...over,
    };
  }

  it('round-trips a 3-line task description byte-exactly', () => {
    const desc = 'Line one of the description.\nLine two adds detail.\nLine three concludes.';
    const plan = taskPlan(desc);
    const { markdown, data } = serializePlan(plan);
    expect(parsePlan(markdown, data).tasks[0].description).toBe(desc);
    expect(parsePlan(markdown, data)).toEqual(plan);
  });

  it('round-trips a task description whose line starts with "## "', () => {
    const desc = 'first line\n## fake heading\nsecond';
    const plan = taskPlan(desc);
    const { markdown, data } = serializePlan(plan);
    expect(parsePlan(markdown, data).tasks[0].description).toBe(desc);
  });

  it('round-trips prose (approach/scope) containing a "## " line without leaking a section', () => {
    const plan = minimalPlan();
    plan.approach = 'Intro line.\n## Phase 1\nDo the first phase.';
    plan.scope = 'included\n## excluded-looking line\nmore';
    const { markdown, data } = serializePlan(plan);
    const parsed = parsePlan(markdown, data);
    expect(parsed.approach).toBe(plan.approach);
    expect(parsed.scope).toBe(plan.scope);
    // No spurious section leaked: re-serialize is stable.
    expect(serializePlan(parsed).markdown).toBe(markdown);
  });

  it('preserves a human-added unknown "## Custom Section" across a machine re-serialize', () => {
    const plan = minimalPlan();
    plan.approach = 'Some approach.';
    const { markdown, data } = serializePlan(plan);
    const edited = markdown.replace(
      '## Approach\n\nSome approach.\n',
      '## Approach\n\nSome approach.\n\n## Custom Section\n\nHand-written notes that must not vanish.\n',
    );
    const parsed = parsePlan(edited, data);
    expect(parsed.extraSections).toEqual([
      { heading: 'Custom Section', content: 'Hand-written notes that must not vanish.' },
    ]);
    const reserialized = serializePlan(parsed).markdown;
    expect(reserialized).toContain('## Custom Section');
    expect(reserialized).toContain('Hand-written notes that must not vanish.');
  });

  it('cleans leftover **Decision:** markup when a human strips the Rationale separator', () => {
    const { markdown, data } = serializePlan(
      taskPlan('d', { decisions: [{ decision: 'Use sidecar', rationale: 'lossless' }] }),
    );
    const edited = markdown.replace(
      '- **Decision:** Use sidecar — **Rationale:** lossless',
      '- **Decision:** Use sidecar (rationale removed by human)',
    );
    expect(parsePlan(edited, data).decisions[0]).toBe('Use sidecar (rationale removed by human)');
  });
});

describe('Planner file-first markdown store (pair)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plan-md-test-'));
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes plans/<id>.md, a README, and a v2 cache; no sidecar for a fresh draft', () => {
    const planner = new Planner(join(tempDir, 'plans.json'));
    const plan = planner.create({ objective: 'Ship markdown plans', scope: 'planning' });

    expect(existsSync(join(tempDir, 'plans', `${plan.id}.md`))).toBe(true);
    expect(existsSync(join(tempDir, 'plans', 'README.md'))).toBe(true);
    // A fresh draft has no machine state -> no sidecar.
    expect(existsSync(join(tempDir, 'plans', `${plan.id}.data.json`))).toBe(false);

    const cache = JSON.parse(readFileSync(join(tempDir, 'plans.json'), 'utf-8')) as {
      version: string;
    };
    expect(cache.version).toBe(PLAN_STORE_VERSION);
  });

  it('writes a .data.json sidecar once a plan gains machine state (grading)', () => {
    const planner = new Planner(join(tempDir, 'plans.json'), { gradeMinTaskCount: 99 });
    const plan = planner.create({ objective: 'Grade me please', scope: 'x' });
    planner.grade(plan.id);
    expect(existsSync(join(tempDir, 'plans', `${plan.id}.data.json`))).toBe(true);
  });

  it('reloads plans from the pair in a fresh Planner instance', () => {
    const p1 = new Planner(join(tempDir, 'plans.json'), { gradeMinTaskCount: 99 });
    const created = p1.create({ objective: 'Persisted plan', scope: 'x' });
    p1.grade(created.id);

    const p2 = new Planner(join(tempDir, 'plans.json'));
    const reloaded = p2.get(created.id);
    expect(reloaded?.objective).toBe('Persisted plan');
    expect(reloaded?.latestCheck).toBeDefined();
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

  it('removes both files when a plan is deleted', () => {
    const planner = new Planner(join(tempDir, 'plans.json'), { gradeMinTaskCount: 99 });
    const plan = planner.create({ objective: 'To be removed', scope: 'x' });
    planner.grade(plan.id);
    const mdPath = join(tempDir, 'plans', `${plan.id}.md`);
    const dataPath = join(tempDir, 'plans', `${plan.id}.data.json`);
    expect(existsSync(mdPath)).toBe(true);
    expect(existsSync(dataPath)).toBe(true);
    planner.remove(plan.id);
    expect(existsSync(mdPath)).toBe(false);
    expect(existsSync(dataPath)).toBe(false);
  });

  it('reparses a human .md edit (newer than the cache) on reload', () => {
    const p1 = new Planner(join(tempDir, 'plans.json'));
    const plan = p1.create({ objective: 'External edit target', scope: 'original scope' });
    const mdPath = join(tempDir, 'plans', `${plan.id}.md`);

    const edited = readFileSync(mdPath, 'utf-8').replace('original scope', 'human-edited scope');
    writeFileSync(mdPath, edited, 'utf-8');
    const future = new Date(Date.now() + 60_000);
    utimesSync(mdPath, future, future);

    const p2 = new Planner(join(tempDir, 'plans.json'));
    expect(p2.get(plan.id)?.scope).toBe('human-edited scope');
  });

  it('honors an explicit plansDir option (project-root placement)', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'plan-project-'));
    try {
      const planner = new Planner(join(tempDir, 'plans.json'), {
        plansDir: join(projectDir, 'plans'),
      });
      const plan = planner.create({ objective: 'Project-root plan', scope: 'x' });
      expect(existsSync(join(projectDir, 'plans', `${plan.id}.md`))).toBe(true);
      // The JSON cache stays at the store path (agent-home), separate from plans.
      expect(existsSync(join(tempDir, 'plans.json'))).toBe(true);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('falls back beside the cache (agent-home) when no plansDir is given', () => {
    const planner = new Planner(join(tempDir, 'plans.json'));
    const plan = planner.create({ objective: 'Fallback plan', scope: 'x' });
    // Default plansDir = store filename stem beside the cache.
    expect(existsSync(join(tempDir, 'plans', `${plan.id}.md`))).toBe(true);
  });

  // The reviewer's mandated collateral test: a human edits ONE field via plain
  // fs.writeFileSync; reloading through the real Planner must apply that edit and
  // leave every other field byte-identical (the reparse path is where the old
  // lossy parse re-persisted truncated data over both the .md and the cache).
  it('applies a single human edit without corrupting unrelated multi-line fields', () => {
    const p1 = new Planner(join(tempDir, 'plans.json'));
    const created = p1.create({
      objective: 'Original objective',
      scope: 'scope text',
      approach: 'Intro to approach.\n## Phase 1\nDo the first phase of work here.',
      tasks: [
        {
          title: 'Big task',
          description: 'Do step one.\nThen step two.\nFinally step three and ship.',
        },
      ],
    });
    const mdPath = join(tempDir, 'plans', `${created.id}.md`);

    const md = readFileSync(mdPath, 'utf-8');
    const humanEdited = md
      .replace('objective: Original objective', 'objective: Corrected objective')
      .replace('## Objective\n\nOriginal objective', '## Objective\n\nCorrected objective');
    writeFileSync(mdPath, humanEdited, 'utf-8');
    const future = new Date(Date.now() + 120_000);
    utimesSync(mdPath, future, future); // .md newer than cache -> reparse path

    const after = new Planner(join(tempDir, 'plans.json')).get(created.id);
    expect(after?.objective).toBe('Corrected objective'); // intended edit took
    expect(after?.approach).toBe(created.approach); // byte-identical
    expect(after?.tasks[0].description).toBe(created.tasks[0].description); // byte-identical
    expect(after?.scope).toBe(created.scope);
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

  it('emits the pair for every plan in a legacy v1.0 store and bumps the version', () => {
    const legacyPlans: Plan[] = [minimalPlan(), fullPlan()];
    const plansPath = join(tempDir, 'plans.json');
    writeFileSync(plansPath, JSON.stringify({ version: '1.0', plans: legacyPlans }, null, 2));

    // Constructing a Planner triggers the one-time migration on load().
    const planner = new Planner(plansPath);

    for (const plan of legacyPlans) {
      const mdPath = join(tempDir, 'plans', `${plan.id}.md`);
      const dataPath = join(tempDir, 'plans', `${plan.id}.data.json`);
      expect(existsSync(mdPath)).toBe(true);
      const sidecar = existsSync(dataPath)
        ? (JSON.parse(readFileSync(dataPath, 'utf-8')) as import('./plan-markdown.js').PlanSidecar)
        : null;
      expect(parsePlan(readFileSync(mdPath, 'utf-8'), sidecar)).toEqual(plan);
    }

    // The minimal plan has no machine state -> no sidecar; the full plan does.
    expect(existsSync(join(tempDir, 'plans', `${legacyPlans[0].id}.data.json`))).toBe(false);
    expect(existsSync(join(tempDir, 'plans', `${legacyPlans[1].id}.data.json`))).toBe(true);

    const readme = readFileSync(join(tempDir, 'plans', 'README.md'), 'utf-8');
    expect(readme).toContain(legacyPlans[0].id);
    expect(readme).toContain(legacyPlans[1].id);

    const cache = JSON.parse(readFileSync(plansPath, 'utf-8')) as { version: string };
    expect(cache.version).toBe(PLAN_STORE_VERSION);
    expect(planner.list()).toHaveLength(2);
  });
});

describe('runtime projectPath wiring (both branches — Addendum 2B / MINOR 2)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plan-runtime-test-'));
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes plans under <projectPath>/plans when projectPath is set (project branch)', () => {
    const projectDir = join(tempDir, 'project');
    const runtime = createAgentRuntime({
      agentId: 'rt-project',
      vaultPath: ':memory:',
      plansPath: join(tempDir, 'plans.json'),
      projectPath: projectDir,
    });
    const plan = runtime.planner.create({ objective: 'Project-root wiring', scope: 'x' });
    expect(existsSync(join(projectDir, 'plans', `${plan.id}.md`))).toBe(true);
  });

  it('falls back to the agent-home store dir when projectPath is absent (fallback branch)', () => {
    const runtime = createAgentRuntime({
      agentId: 'rt-fallback',
      vaultPath: ':memory:',
      plansPath: join(tempDir, 'plans.json'),
    });
    const plan = runtime.planner.create({ objective: 'Fallback wiring', scope: 'x' });
    expect(existsSync(join(tempDir, 'plans', `${plan.id}.md`))).toBe(true);
  });
});
