/**
 * Tests for evidence-collector.ts — git evidence collection and
 * verification gap detection for plan reconciliation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Plan, PlanTask } from './planner.js';
import type { GitTaskEvidence } from './evidence-collector.js';
import { collectGitEvidence, collectVerificationGaps } from './evidence-collector.js';

// Mock child_process.execFileSync
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
const mockExecFileSync = vi.mocked(execFileSync);

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-test-123',
    objective: 'Implement authentication module',
    scope: 'Auth only. Not including OAuth.',
    status: 'executing',
    decisions: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Add auth middleware',
        description: 'Create auth middleware for Express',
        status: 'completed',
        updatedAt: Date.now(),
      },
      {
        id: 'task-2',
        title: 'Add login endpoint',
        description: 'POST /auth/login endpoint',
        status: 'completed',
        updatedAt: Date.now(),
      },
      {
        id: 'task-3',
        title: 'Add JWT utils',
        description: 'JWT signing and verification utilities',
        status: 'pending',
        updatedAt: Date.now(),
      },
    ],
    checks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'task-1',
    title: 'Fix auth bug',
    description: 'Fix the authentication timeout bug',
    status: 'completed',
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('collectGitEvidence', () => {
  it('returns report with matched task evidence', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n') // git rev-parse
      .mockReturnValueOnce('M\tsrc/auth/middleware.ts\nA\tsrc/auth/login.ts\nM\tsrc/auth/jwt.ts\n'); // git diff

    const plan = makePlan();
    const report = collectGitEvidence(plan, '/project', 'main');

    expect(report.planId).toBe('plan-test-123');
    expect(report.planObjective).toBe('Implement authentication module');
    expect(report.evidenceSources).toEqual(['git']);
    expect(report.taskEvidence).toHaveLength(3);
  });

  it('marks tasks as DONE when status is completed and files match', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n')
      .mockReturnValueOnce('M\tsrc/auth/middleware.ts\nA\tsrc/auth/login.ts\n');

    const plan = makePlan();
    const report = collectGitEvidence(plan, '/project', 'main');

    const middlewareTask = report.taskEvidence.find((te) => te.taskId === 'task-1');
    expect(middlewareTask?.verdict).toBe('DONE');
  });

  it('marks tasks as MISSING when no files match', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n')
      .mockReturnValueOnce('M\tsrc/unrelated/file.ts\n');

    const plan = makePlan();
    const report = collectGitEvidence(plan, '/project', 'main');

    // All tasks should be MISSING since "unrelated" doesn't match any task keywords
    const missing = report.taskEvidence.filter((te) => te.verdict === 'MISSING');
    expect(missing.length).toBeGreaterThan(0);
  });

  it('marks skipped tasks as SKIPPED', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n')
      .mockReturnValueOnce('M\tsrc/auth/middleware.ts\n');

    const plan = makePlan({
      tasks: [
        {
          id: 'task-1',
          title: 'Add auth middleware',
          description: 'Auth middleware',
          status: 'skipped',
          updatedAt: Date.now(),
        },
      ],
    });
    const report = collectGitEvidence(plan, '/project', 'main');

    expect(report.taskEvidence[0].verdict).toBe('SKIPPED');
  });

  it('identifies unplanned changes', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n')
      .mockReturnValueOnce('M\tsrc/auth/middleware.ts\nM\tsrc/config/database.ts\n');

    const plan = makePlan({
      tasks: [
        {
          id: 'task-1',
          title: 'Add auth middleware',
          description: 'Auth middleware',
          status: 'completed',
          updatedAt: Date.now(),
        },
      ],
    });
    const report = collectGitEvidence(plan, '/project', 'main');

    expect(report.unplannedChanges.length).toBeGreaterThanOrEqual(1);
    const configChange = report.unplannedChanges.find(
      (uc) => uc.file.path === 'src/config/database.ts',
    );
    expect(configChange).toBeDefined();
    expect(configChange?.possibleReason).toBe('configuration change');
  });

  it('calculates accuracy score', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n')
      .mockReturnValueOnce('M\tsrc/auth/middleware.ts\nA\tsrc/auth/login.ts\n');

    const plan = makePlan({
      tasks: [
        {
          id: 'task-1',
          title: 'Add auth middleware',
          description: 'Auth middleware',
          status: 'completed',
          updatedAt: Date.now(),
        },
        {
          id: 'task-2',
          title: 'Add login endpoint',
          description: 'Login endpoint',
          status: 'completed',
          updatedAt: Date.now(),
        },
      ],
    });
    const report = collectGitEvidence(plan, '/project', 'main');

    expect(report.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.accuracy).toBeLessThanOrEqual(100);
  });

  it('returns 100% accuracy for empty task list', () => {
    mockExecFileSync.mockReturnValueOnce('main\n').mockReturnValueOnce('');

    const plan = makePlan({ tasks: [] });
    const report = collectGitEvidence(plan, '/project', 'main');

    expect(report.accuracy).toBe(100);
  });

  it('handles git failures gracefully', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('Not a git repository');
    });

    const plan = makePlan();
    const report = collectGitEvidence(plan, '/not-a-repo', 'main');

    expect(report.taskEvidence).toHaveLength(3);
    expect(report.taskEvidence.every((te) => te.verdict === 'MISSING')).toBe(true);
    expect(report.unplannedChanges).toHaveLength(0);
  });

  it('falls back to HEAD~5 when branch diff fails', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n') // rev-parse
      .mockImplementationOnce(() => {
        throw new Error('bad revision');
      }) // main...HEAD fails
      .mockReturnValueOnce('M\tsrc/auth/middleware.ts\n'); // HEAD~5 fallback

    const plan = makePlan({
      tasks: [
        {
          id: 'task-1',
          title: 'Add auth middleware',
          description: 'Auth middleware',
          status: 'completed',
          updatedAt: Date.now(),
        },
      ],
    });
    const report = collectGitEvidence(plan, '/project', 'main');

    expect(report.taskEvidence).toHaveLength(1);
    expect(report.taskEvidence[0].verdict).toBe('DONE');
  });

  it('uses HEAD~10 when on the base branch', () => {
    mockExecFileSync
      .mockReturnValueOnce('main\n') // on main branch
      .mockReturnValueOnce('A\tsrc/auth/login.ts\n'); // diff HEAD~10

    const plan = makePlan({
      tasks: [
        {
          id: 'task-1',
          title: 'Add login endpoint',
          description: 'Login endpoint',
          status: 'completed',
          updatedAt: Date.now(),
        },
      ],
    });
    collectGitEvidence(plan, '/project', 'main');

    // Second call should use HEAD~10, not main...HEAD
    const diffCall = mockExecFileSync.mock.calls[1];
    const diffArgs = diffCall[1] as string[];
    expect(diffArgs.some((arg: string) => arg.includes('HEAD~10'))).toBe(true);
  });

  it('parses renamed files correctly', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n')
      .mockReturnValueOnce('R100\tsrc/old-auth.ts\tsrc/auth/middleware.ts\n');

    const plan = makePlan({
      tasks: [
        {
          id: 'task-1',
          title: 'Add auth middleware',
          description: 'Auth middleware',
          status: 'completed',
          updatedAt: Date.now(),
        },
      ],
    });
    const report = collectGitEvidence(plan, '/project', 'main');

    // Should use the new path (after tab) for matching
    const task = report.taskEvidence[0];
    expect(task.matchedFiles.length).toBeGreaterThanOrEqual(1);
    expect(task.matchedFiles[0].status).toBe('renamed');
  });

  it('parses deleted files', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n')
      .mockReturnValueOnce('D\tsrc/auth/old-middleware.ts\n');

    const plan = makePlan({
      tasks: [
        {
          id: 'task-1',
          title: 'Remove old auth middleware',
          description: 'Delete old auth middleware files',
          status: 'completed',
          updatedAt: Date.now(),
        },
      ],
    });
    const report = collectGitEvidence(plan, '/project', 'main');

    const task = report.taskEvidence[0];
    if (task.matchedFiles.length > 0) {
      expect(task.matchedFiles[0].status).toBe('deleted');
    }
  });

  it('builds a human-readable summary', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n')
      .mockReturnValueOnce('M\tsrc/auth/middleware.ts\n');

    const plan = makePlan();
    const report = collectGitEvidence(plan, '/project', 'main');

    expect(report.summary).toContain('/');
    expect(report.summary).toContain('tasks verified by git evidence');
  });

  it('infers reasons for unplanned changes', () => {
    mockExecFileSync
      .mockReturnValueOnce('feature/auth\n')
      .mockReturnValueOnce(
        'M\tpackage.json\n' +
          'M\tsrc/types/auth.d.ts\n' +
          'A\tsrc/tests/auth.test.ts\n' +
          'M\tREADME.md\n' +
          'M\tsrc/index.ts\n' +
          'M\tsrc/random/file.ts\n',
      );

    const plan = makePlan({ tasks: [] });
    const report = collectGitEvidence(plan, '/project', 'main');

    const reasons = report.unplannedChanges.map((uc) => uc.possibleReason);
    expect(reasons).toContain('dependency update');
    expect(reasons).toContain('type definition update');
    expect(reasons).toContain('test file');
    expect(reasons).toContain('documentation');
    expect(reasons).toContain('likely re-export update');
    expect(reasons).toContain('unplanned scope');
  });
});

describe('collectVerificationGaps', () => {
  it('returns empty array when no tasks have verification', () => {
    const tasks: PlanTask[] = [makeTask()];
    const evidence: GitTaskEvidence[] = [
      {
        taskId: 'task-1',
        taskTitle: 'Fix auth bug',
        plannedStatus: 'completed',
        matchedFiles: [{ path: 'src/auth.ts', status: 'modified' }],
        verdict: 'DONE',
      },
    ];

    const gaps = collectVerificationGaps(tasks, evidence);
    expect(gaps).toHaveLength(0);
  });

  it('flags unproven findings on tasks that modify existing code', () => {
    const tasks: PlanTask[] = [
      makeTask({
        verification: {
          findings: [{ description: 'Auth timeout under load', severity: 'high', proven: false }],
        },
      }),
    ];
    const evidence: GitTaskEvidence[] = [
      {
        taskId: 'task-1',
        taskTitle: 'Fix auth bug',
        plannedStatus: 'completed',
        matchedFiles: [{ path: 'src/auth.ts', status: 'modified' }],
        verdict: 'DONE',
      },
    ];

    const gaps = collectVerificationGaps(tasks, evidence);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].message).toContain('Unproven finding');
    expect(gaps[0].message).toContain('Auth timeout under load');
  });

  it('does not flag proven findings', () => {
    const tasks: PlanTask[] = [
      makeTask({
        verification: {
          findings: [
            {
              description: 'Auth timeout under load',
              severity: 'high',
              proven: true,
              proof: 'Reproduced with load test',
            },
          ],
        },
      }),
    ];
    const evidence: GitTaskEvidence[] = [
      {
        taskId: 'task-1',
        taskTitle: 'Fix auth bug',
        plannedStatus: 'completed',
        matchedFiles: [{ path: 'src/auth.ts', status: 'modified' }],
        verdict: 'DONE',
      },
    ];

    const gaps = collectVerificationGaps(tasks, evidence);
    expect(gaps).toHaveLength(0);
  });

  it('does not flag tasks that only add new files', () => {
    const tasks: PlanTask[] = [
      makeTask({
        verification: {
          findings: [{ description: 'Some finding', severity: 'medium', proven: false }],
        },
      }),
    ];
    const evidence: GitTaskEvidence[] = [
      {
        taskId: 'task-1',
        taskTitle: 'Fix auth bug',
        plannedStatus: 'completed',
        matchedFiles: [{ path: 'src/new-auth.ts', status: 'added' }],
        verdict: 'DONE',
      },
    ];

    const gaps = collectVerificationGaps(tasks, evidence);
    expect(gaps).toHaveLength(0);
  });

  it('does not flag tasks with no evidence', () => {
    const tasks: PlanTask[] = [
      makeTask({
        verification: {
          findings: [{ description: 'Some finding', severity: 'medium', proven: false }],
        },
      }),
    ];
    const evidence: GitTaskEvidence[] = []; // no evidence at all

    const gaps = collectVerificationGaps(tasks, evidence);
    expect(gaps).toHaveLength(0);
  });

  it('flags multiple unproven findings on the same task', () => {
    const tasks: PlanTask[] = [
      makeTask({
        verification: {
          findings: [
            { description: 'Finding A', severity: 'high', proven: false },
            { description: 'Finding B', severity: 'medium', proven: false },
            { description: 'Finding C', severity: 'low', proven: true },
          ],
        },
      }),
    ];
    const evidence: GitTaskEvidence[] = [
      {
        taskId: 'task-1',
        taskTitle: 'Fix auth bug',
        plannedStatus: 'completed',
        matchedFiles: [{ path: 'src/auth.ts', status: 'modified' }],
        verdict: 'DONE',
      },
    ];

    const gaps = collectVerificationGaps(tasks, evidence);
    expect(gaps).toHaveLength(2);
    expect(gaps[0].message).toContain('Finding A');
    expect(gaps[1].message).toContain('Finding B');
  });

  it('handles tasks across multiple task IDs', () => {
    const tasks: PlanTask[] = [
      makeTask({
        id: 'task-1',
        verification: {
          findings: [{ description: 'Bug A', severity: 'high', proven: false }],
        },
      }),
      makeTask({
        id: 'task-2',
        title: 'Fix other bug',
        verification: {
          findings: [{ description: 'Bug B', severity: 'medium', proven: false }],
        },
      }),
    ];
    const evidence: GitTaskEvidence[] = [
      {
        taskId: 'task-1',
        taskTitle: 'Fix auth bug',
        plannedStatus: 'completed',
        matchedFiles: [{ path: 'src/auth.ts', status: 'modified' }],
        verdict: 'DONE',
      },
      {
        taskId: 'task-2',
        taskTitle: 'Fix other bug',
        plannedStatus: 'completed',
        matchedFiles: [{ path: 'src/other.ts', status: 'modified' }],
        verdict: 'DONE',
      },
    ];

    const gaps = collectVerificationGaps(tasks, evidence);
    expect(gaps).toHaveLength(2);
    expect(gaps[0].taskId).toBe('task-1');
    expect(gaps[1].taskId).toBe('task-2');
  });
});
