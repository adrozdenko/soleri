import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPlanningExtraOps } from './planning-extra-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

// ─── Mock Modules ──────────────────────────────────────────────────────

vi.mock('../planning/evidence-collector.js', () => ({
  collectGitEvidence: vi.fn(() => ({
    planId: 'plan-1',
    matched: 2,
    missing: 0,
    unplanned: 1,
  })),
}));

vi.mock('../playbooks/index.js', () => ({
  matchPlaybooks: vi.fn(() => ({
    playbook: {
      label: 'build-feature',
      generic: { brainstormSections: ['design', 'scope'] },
      domain: { brainstormSections: ['tokens'] },
      mergedGates: ['brainstorm'],
      mergedTools: ['vault_search'],
    },
    genericMatch: 'build',
    domainMatch: 'feature',
  })),
  entryToPlaybookDefinition: vi.fn((e: Record<string, unknown>) =>
    e.type === 'playbook' ? { id: e.id, label: e.title } : null,
  ),
}));

vi.mock('./github-integration.js', () => ({
  closeIssueWithComment: vi.fn(),
}));

// ─── Mock Runtime Factory ──────────────────────────────────────────────

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    objective: 'Test objective',
    scope: 'test',
    status: 'draft',
    tasks: [
      {
        id: 'task-1',
        title: 'Task 1',
        status: 'pending',
        metrics: null,
        evidence: [],
        deliverables: [],
      },
    ],
    decisions: [],
    reviews: [],
    reconciliation: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    githubIssue: null,
    executionSummary: null,
    ...overrides,
  };
}

function createMockRuntime(): AgentRuntime {
  const plan = makePlan();

  return {
    planner: {
      iterate: vi.fn(() => ({ plan, mutated: 1 })),
      splitTasks: vi.fn(() => ({
        ...plan,
        tasks: [plan.tasks[0], { id: 'task-2', title: 'Task 2' }],
      })),
      reconcile: vi.fn(() => ({
        ...plan,
        status: 'reconciling',
        reconciliation: {
          accuracy: 85,
          driftItems: [{ type: 'added', description: 'Extra test' }],
        },
      })),
      get: vi.fn(() => plan),
      getDispatch: vi.fn(() => ({ task: plan.tasks[0], ready: true, unmetDeps: [] })),
      addReview: vi.fn(() => ({ ...plan, reviews: [{ reviewer: 'test' }] })),
      archive: vi.fn(() => [plan]),
      stats: vi.fn(() => ({ totalPlans: 5, byStatus: { draft: 2, executing: 1 } })),
      submitEvidence: vi.fn(() => ({ id: 'task-1', evidence: [{ criterion: 'works' }] })),
      verifyTask: vi.fn(() => ({ verified: true, taskId: 'task-1' })),
      verifyPlan: vi.fn(() => ({ valid: true, issues: [] })),
      generateReviewSpec: vi.fn(() => ({ prompt: 'Review spec compliance', taskId: 'task-1' })),
      generateReviewQuality: vi.fn(() => ({ prompt: 'Review code quality', taskId: 'task-1' })),
      autoReconcile: vi.fn(() => ({
        ...plan,
        reconciliation: { accuracy: 95, driftItems: [] },
      })),
      submitDeliverable: vi.fn(() => ({ id: 'task-1', deliverables: [{ type: 'file' }] })),
      verifyDeliverables: vi.fn(() => ({ verified: true, stale: 0 })),
      list: vi.fn(() => [plan]),
      remove: vi.fn(),
    },
    vault: {
      add: vi.fn(),
      get: vi.fn(() => null),
      list: vi.fn(() => []),
    },
    brain: {
      recordFeedback: vi.fn(),
    },
    brainIntelligence: {
      lifecycle: vi.fn(() => ({ id: 'session-1' })),
      getSessionByPlanId: vi.fn(() => null),
      extractKnowledge: vi.fn(() => ({ proposals: [] })),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op not found: ${name}`);
  return op;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('createPlanningExtraOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  beforeEach(() => {
    runtime = createMockRuntime();
    ops = createPlanningExtraOps(runtime);
  });

  it('returns expected op count', () => {
    expect(ops.length).toBeGreaterThanOrEqual(22);
  });

  it('all ops have required fields', () => {
    for (const op of ops) {
      expect(op.name).toBeTruthy();
      expect(op.handler).toBeDefined();
      expect(['read', 'write', 'admin']).toContain(op.auth);
    }
  });

  describe('plan_iterate', () => {
    it('iterates a draft plan', async () => {
      const result = (await findOp(ops, 'plan_iterate').handler({
        planId: 'plan-1',
        objective: 'New objective',
      })) as Record<string, unknown>;
      expect(result.iterated).toBe(true);
      expect(runtime.planner.iterate).toHaveBeenCalledWith(
        'plan-1',
        expect.objectContaining({ objective: 'New objective' }),
      );
    });

    it('returns iterated: false when no changes detected', async () => {
      vi.mocked(runtime.planner.iterate).mockReturnValue({
        plan: makePlan() as unknown,
        mutated: 0,
      } as unknown);
      const result = (await findOp(ops, 'plan_iterate').handler({
        planId: 'plan-1',
      })) as Record<string, unknown>;
      expect(result.iterated).toBe(false);
      expect(result.reason).toBe('no changes detected');
    });

    it('passes alternatives to planner.iterate', async () => {
      const result = (await findOp(ops, 'plan_iterate').handler({
        planId: 'plan-1',
        alternatives: [
          { approach: 'Alt A', pros: ['fast'], cons: ['fragile'], rejected_reason: 'Too risky' },
        ],
      })) as Record<string, unknown>;
      expect(result.iterated).toBe(true);
      expect(runtime.planner.iterate).toHaveBeenCalledWith(
        'plan-1',
        expect.objectContaining({
          alternatives: [expect.objectContaining({ approach: 'Alt A' })],
        }),
      );
    });

    it('passes decisions to planner.iterate', async () => {
      const result = (await findOp(ops, 'plan_iterate').handler({
        planId: 'plan-1',
        decisions: [{ decision: 'Use FTS5', rationale: 'Performance' }],
      })) as Record<string, unknown>;
      expect(result.iterated).toBe(true);
      expect(runtime.planner.iterate).toHaveBeenCalledWith(
        'plan-1',
        expect.objectContaining({
          decisions: [{ decision: 'Use FTS5', rationale: 'Performance' }],
        }),
      );
    });

    it('returns error on failure', async () => {
      vi.mocked(runtime.planner.iterate).mockImplementation(() => {
        throw new Error('Not a draft');
      });
      const result = (await findOp(ops, 'plan_iterate').handler({ planId: 'x' })) as Record<
        string,
        unknown
      >;
      expect(result.error).toBe('Not a draft');
    });
  });

  describe('plan_split', () => {
    it('splits tasks and starts brain session', async () => {
      const result = (await findOp(ops, 'plan_split').handler({
        planId: 'plan-1',
        tasks: [{ title: 'A', description: 'Do A' }],
      })) as Record<string, unknown>;
      expect(result.split).toBe(true);
      expect(result.brainSessionId).toBe('session-1');
    });

    it('handles brain session failure gracefully', async () => {
      vi.mocked(runtime.brainIntelligence.lifecycle).mockImplementation(() => {
        throw new Error('brain error');
      });
      const result = (await findOp(ops, 'plan_split').handler({
        planId: 'plan-1',
        tasks: [{ title: 'A', description: 'Do A' }],
      })) as Record<string, unknown>;
      expect(result.split).toBe(true);
      expect(result.brainSessionId).toBeNull();
    });
  });

  describe('plan_reconcile', () => {
    it('reconciles with accuracy and drift count', async () => {
      const result = (await findOp(ops, 'plan_reconcile').handler({
        planId: 'plan-1',
        actualOutcome: 'All tasks completed',
      })) as Record<string, unknown>;
      expect(result.reconciled).toBe(true);
      expect(result.accuracy).toBe(85);
      expect(result.driftCount).toBe(1);
    });
  });

  describe('plan_complete_lifecycle', () => {
    it('captures patterns and anti-patterns to vault', async () => {
      vi.mocked(runtime.planner.get).mockReturnValue(
        makePlan({
          status: 'completed',
          reconciliation: { accuracy: 90, driftItems: [] },
          decisions: [],
        }) as unknown,
      );
      const result = (await findOp(ops, 'plan_complete_lifecycle').handler({
        planId: 'plan-1',
        patterns: ['Pattern A'],
        antiPatterns: ['Anti B'],
      })) as Record<string, unknown>;
      expect(result.completed).toBe(true);
      expect(result.patternsAdded).toBe(1);
      expect(result.antiPatternsAdded).toBe(1);
      expect(result.knowledgeCaptured).toBe(2);
    });

    it('returns error for non-completed plan', async () => {
      vi.mocked(runtime.planner.get).mockReturnValue(makePlan({ status: 'draft' }) as unknown);
      const result = (await findOp(ops, 'plan_complete_lifecycle').handler({
        planId: 'plan-1',
      })) as Record<string, unknown>;
      expect(result.error).toContain('must be completed');
    });

    it('returns error for missing plan', async () => {
      vi.mocked(runtime.planner.get).mockReturnValue(null as unknown);
      const result = (await findOp(ops, 'plan_complete_lifecycle').handler({
        planId: 'x',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });

    it('records feedback for decisions with entryId references', async () => {
      vi.mocked(runtime.planner.get).mockReturnValue(
        makePlan({
          status: 'completed',
          reconciliation: { accuracy: 90, driftItems: [] },
          decisions: ['Used pattern [entryId:abc-123] for auth'],
        }) as unknown,
      );
      const result = (await findOp(ops, 'plan_complete_lifecycle').handler({
        planId: 'plan-1',
      })) as Record<string, unknown>;
      expect(result.feedbackRecorded).toBe(1);
    });

    it('closes GitHub issue when linked', async () => {
      vi.mocked(runtime.planner.get).mockReturnValue(
        makePlan({
          status: 'completed',
          reconciliation: { accuracy: 90, driftItems: [] },
          githubIssue: { owner: 'org', repo: 'repo', number: 42 },
          decisions: [],
        }) as unknown,
      );
      const { closeIssueWithComment } = await import('./github-integration.js');
      const result = (await findOp(ops, 'plan_complete_lifecycle').handler({
        planId: 'plan-1',
      })) as Record<string, unknown>;
      expect(result.githubIssueClosed).toBe(42);
      expect(closeIssueWithComment).toHaveBeenCalled();
    });
  });

  describe('plan_dispatch', () => {
    it('returns dispatch info for a task', async () => {
      const result = (await findOp(ops, 'plan_dispatch').handler({
        planId: 'plan-1',
        taskId: 'task-1',
      })) as Record<string, unknown>;
      expect(result.ready).toBe(true);
    });
  });

  describe('plan_review', () => {
    it('adds review and returns count', async () => {
      const result = (await findOp(ops, 'plan_review').handler({
        planId: 'plan-1',
        reviewer: 'alice',
        outcome: 'approved',
        comments: 'LGTM',
      })) as Record<string, unknown>;
      expect(result.reviewed).toBe(true);
      expect(result.totalReviews).toBe(1);
    });
  });

  describe('plan_archive', () => {
    it('archives old plans', async () => {
      const result = (await findOp(ops, 'plan_archive').handler({
        olderThanDays: 30,
      })) as Record<string, unknown>;
      expect(result.archived).toBe(1);
    });
  });

  describe('plan_list_tasks', () => {
    it('lists all tasks for a plan', async () => {
      const result = (await findOp(ops, 'plan_list_tasks').handler({
        planId: 'plan-1',
      })) as Record<string, unknown>;
      expect(result.total).toBe(1);
      expect(result.filtered).toBe(1);
    });

    it('filters tasks by status', async () => {
      const result = (await findOp(ops, 'plan_list_tasks').handler({
        planId: 'plan-1',
        status: 'completed',
      })) as Record<string, unknown>;
      expect(result.filtered).toBe(0);
    });

    it('returns error for missing plan', async () => {
      vi.mocked(runtime.planner.get).mockReturnValue(null as unknown);
      const result = (await findOp(ops, 'plan_list_tasks').handler({
        planId: 'x',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });
  });

  describe('plan_stats', () => {
    it('returns planning statistics', async () => {
      const result = (await findOp(ops, 'plan_stats').handler({})) as Record<string, unknown>;
      expect(result).toHaveProperty('totalPlans');
    });
  });

  describe('plan_submit_evidence', () => {
    it('submits evidence for a task', async () => {
      const result = (await findOp(ops, 'plan_submit_evidence').handler({
        planId: 'plan-1',
        taskId: 'task-1',
        criterion: 'tests pass',
        content: 'npm test output: 42 tests passed',
        type: 'command_output',
      })) as Record<string, unknown>;
      expect(result.submitted).toBe(true);
      expect(result.evidenceCount).toBe(1);
    });
  });

  describe('plan_verify_task', () => {
    it('verifies task evidence', async () => {
      const result = (await findOp(ops, 'plan_verify_task').handler({
        planId: 'plan-1',
        taskId: 'task-1',
      })) as Record<string, unknown>;
      expect(result.verified).toBe(true);
    });
  });

  describe('plan_verify_plan', () => {
    it('verifies all tasks in plan', async () => {
      const result = (await findOp(ops, 'plan_verify_plan').handler({
        planId: 'plan-1',
      })) as Record<string, unknown>;
      expect(result.valid).toBe(true);
    });
  });

  describe('plan_review_spec', () => {
    it('generates spec review prompt', async () => {
      const result = (await findOp(ops, 'plan_review_spec').handler({
        planId: 'plan-1',
        taskId: 'task-1',
      })) as Record<string, unknown>;
      expect(result.prompt).toContain('spec');
    });
  });

  describe('plan_review_quality', () => {
    it('generates quality review prompt', async () => {
      const result = (await findOp(ops, 'plan_review_quality').handler({
        planId: 'plan-1',
        taskId: 'task-1',
      })) as Record<string, unknown>;
      expect(result.prompt).toContain('quality');
    });
  });

  describe('plan_review_outcome', () => {
    it('records review with type prefix', async () => {
      const result = (await findOp(ops, 'plan_review_outcome').handler({
        planId: 'plan-1',
        taskId: 'task-1',
        reviewType: 'spec',
        reviewer: 'subagent-1',
        outcome: 'approved',
        comments: 'All good',
      })) as Record<string, unknown>;
      expect(result.recorded).toBe(true);
      expect(runtime.planner.addReview).toHaveBeenCalledWith(
        'plan-1',
        expect.objectContaining({ reviewer: 'spec-review:subagent-1' }),
      );
    });
  });

  describe('plan_brainstorm', () => {
    it('matches playbook and returns brainstorm sections', async () => {
      vi.mocked(runtime.vault.list).mockReturnValue([]);
      const result = (await findOp(ops, 'plan_brainstorm').handler({
        text: 'Build a new auth feature',
        intent: 'BUILD',
      })) as Record<string, unknown>;
      expect(result.matched).toBe(true);
      expect(result.sections).toBeDefined();
    });

    it('returns not-matched when no playbook fits', async () => {
      const { matchPlaybooks } = await import('../playbooks/index.js');
      vi.mocked(matchPlaybooks).mockReturnValue({ playbook: null } as unknown);
      const result = (await findOp(ops, 'plan_brainstorm').handler({
        text: 'random',
      })) as Record<string, unknown>;
      expect(result.matched).toBe(false);
    });
  });

  describe('plan_auto_reconcile', () => {
    it('auto-reconciles when drift is minor', async () => {
      const result = (await findOp(ops, 'plan_auto_reconcile').handler({
        planId: 'plan-1',
      })) as Record<string, unknown>;
      expect(result.autoReconciled).toBe(true);
      expect(result.accuracy).toBe(95);
    });

    it('returns false when drift is too significant', async () => {
      vi.mocked(runtime.planner.autoReconcile).mockReturnValue(null as unknown);
      const result = (await findOp(ops, 'plan_auto_reconcile').handler({
        planId: 'plan-1',
      })) as Record<string, unknown>;
      expect(result.autoReconciled).toBe(false);
      expect(result.reason).toContain('too significant');
    });
  });

  describe('plan_execution_metrics', () => {
    it('returns task-level metrics', async () => {
      const result = (await findOp(ops, 'plan_execution_metrics').handler({
        planId: 'plan-1',
      })) as Record<string, unknown>;
      expect(result.planId).toBe('plan-1');
      expect(result.taskMetrics).toBeDefined();
    });

    it('returns error for missing plan', async () => {
      vi.mocked(runtime.planner.get).mockReturnValue(null as unknown);
      const result = (await findOp(ops, 'plan_execution_metrics').handler({
        planId: 'x',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });
  });

  describe('plan_record_task_metrics', () => {
    it('records metrics on a task', async () => {
      const taskWithMetrics = {
        id: 'task-1',
        title: 'Task 1',
        status: 'completed',
        metrics: {},
        updatedAt: 0,
      };
      vi.mocked(runtime.planner.get).mockReturnValue(
        makePlan({ tasks: [taskWithMetrics] }) as unknown,
      );
      const result = (await findOp(ops, 'plan_record_task_metrics').handler({
        planId: 'plan-1',
        taskId: 'task-1',
        toolCalls: 15,
        modelTier: 'opus',
      })) as Record<string, unknown>;
      expect(result.recorded).toBe(true);
      expect((result.metrics as Record<string, unknown>).toolCalls).toBe(15);
    });

    it('returns error for missing task', async () => {
      const result = (await findOp(ops, 'plan_record_task_metrics').handler({
        planId: 'plan-1',
        taskId: 'nonexistent',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });
  });

  describe('plan_submit_deliverable', () => {
    it('submits deliverable on a task', async () => {
      const result = (await findOp(ops, 'plan_submit_deliverable').handler({
        planId: 'plan-1',
        taskId: 'task-1',
        type: 'file',
        path: '/src/auth.ts',
      })) as Record<string, unknown>;
      expect(result.submitted).toBe(true);
      expect(result.deliverableCount).toBe(1);
    });
  });

  describe('plan_verify_deliverables', () => {
    it('verifies deliverables for a task', async () => {
      const result = (await findOp(ops, 'plan_verify_deliverables').handler({
        planId: 'plan-1',
        taskId: 'task-1',
      })) as Record<string, unknown>;
      expect(result.verified).toBe(true);
      expect(result.stale).toBe(0);
    });
  });

  describe('plan_reconcile_with_evidence', () => {
    it('produces evidence-based drift report', async () => {
      const result = (await findOp(ops, 'plan_reconcile_with_evidence').handler({
        planId: 'plan-1',
        projectPath: '/tmp/project',
        baseBranch: 'main',
      })) as Record<string, unknown>;
      expect(result.planId).toBe('plan-1');
      expect(result.matched).toBe(2);
    });

    it('returns error for missing plan', async () => {
      vi.mocked(runtime.planner.get).mockReturnValue(null as unknown);
      const result = (await findOp(ops, 'plan_reconcile_with_evidence').handler({
        planId: 'x',
        projectPath: '/tmp',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });
  });

  describe('plan_purge', () => {
    it('dry run previews purge candidates', async () => {
      vi.mocked(runtime.planner.list).mockReturnValue([
        makePlan({ status: 'archived' }),
      ] as unknown);
      const result = (await findOp(ops, 'plan_purge').handler({
        mode: 'archived',
        dryRun: true,
      })) as Record<string, unknown>;
      expect(result.dryRun).toBe(true);
      expect(result.wouldPurge).toBe(1);
    });

    it('purges archived plans', async () => {
      vi.mocked(runtime.planner.list).mockReturnValue([
        makePlan({ status: 'archived' }),
      ] as unknown);
      const result = (await findOp(ops, 'plan_purge').handler({
        mode: 'archived',
        dryRun: false,
      })) as Record<string, unknown>;
      expect(result.purged).toBe(1);
      expect(runtime.planner.remove).toHaveBeenCalled();
    });

    it('purges stale draft plans', async () => {
      vi.mocked(runtime.planner.list).mockReturnValue([
        makePlan({ status: 'draft', createdAt: Date.now() - 48 * 60 * 60 * 1000 }),
      ] as unknown);
      const result = (await findOp(ops, 'plan_purge').handler({
        mode: 'stale',
        dryRun: false,
      })) as Record<string, unknown>;
      expect(result.purged).toBe(1);
    });

    it('purges specific plans by ID', async () => {
      vi.mocked(runtime.planner.list).mockReturnValue([makePlan({ id: 'plan-1' })] as unknown);
      const result = (await findOp(ops, 'plan_purge').handler({
        mode: 'specific',
        planIds: ['plan-1'],
        dryRun: false,
      })) as Record<string, unknown>;
      expect(result.purged).toBe(1);
    });
  });
});
