import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOrchestrateOps } from './orchestrate-ops.js';
import type { AgentRuntime } from './types.js';

// ---------------------------------------------------------------------------
// Mocks for external modules
// ---------------------------------------------------------------------------

vi.mock('../flows/plan-builder.js', () => ({
  buildPlan: vi.fn().mockResolvedValue({
    planId: 'flow-plan-1',
    intent: 'BUILD',
    flowId: 'build-flow',
    steps: [{ id: 's1' }],
    skipped: [],
    warnings: [],
    estimatedTools: 3,
    summary: 'Build something',
    context: { probes: {}, projectPath: '.' },
  }),
}));

vi.mock('../flows/executor.js', () => ({
  FlowExecutor: class {
    execute = vi.fn().mockResolvedValue({
      status: 'completed',
      stepsCompleted: 1,
      totalSteps: 1,
      toolsCalled: ['tool1'],
      durationMs: 100,
    });
  },
}));

vi.mock('../flows/dispatch-registry.js', () => ({
  createDispatcher: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('../flows/epilogue.js', () => ({
  runEpilogue: vi.fn().mockResolvedValue({ captured: 1 }),
}));

vi.mock('./github-integration.js', () => ({
  extractIssueNumber: vi.fn().mockReturnValue(null),
  detectGitHubRemote: vi.fn().mockResolvedValue(null),
  getIssueDetails: vi.fn().mockResolvedValue(null),
}));

vi.mock('../planning/github-projection.js', () => ({
  detectGitHubContext: vi.fn().mockReturnValue(null),
  findMatchingMilestone: vi.fn(),
  findDuplicateIssue: vi.fn(),
  formatIssueBody: vi.fn().mockReturnValue('body'),
  createGitHubIssue: vi.fn(),
  updateGitHubIssueBody: vi.fn(),
}));

vi.mock('../planning/rationalization-detector.js', () => ({
  detectRationalizations: vi.fn().mockReturnValue({ detected: false, items: [] }),
}));

vi.mock('../planning/impact-analyzer.js', () => ({
  ImpactAnalyzer: vi.fn().mockImplementation(() => ({
    analyzeImpact: vi.fn().mockReturnValue({ riskLevel: 'low', consumers: [] }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock runtime
// ---------------------------------------------------------------------------

function mockRuntime(): AgentRuntime {
  return {
    config: { agentId: 'test-agent' },
    vault: {
      search: vi.fn().mockReturnValue([]),
      add: vi.fn(),
      stats: vi.fn().mockReturnValue({ totalEntries: 10, byDomain: {}, byType: {} }),
      captureMemory: vi.fn(),
    },
    brain: {},
    brainIntelligence: {
      recommend: vi.fn().mockReturnValue([]),
      lifecycle: vi.fn().mockReturnValue({ id: 'session-1' }),
      getSessionByPlanId: vi.fn().mockReturnValue(null),
      getSessionContext: vi.fn().mockReturnValue({}),
      getStats: vi.fn().mockReturnValue({ strengths: 0, sessions: 0 }),
      extractKnowledge: vi.fn().mockReturnValue(null),
    },
    planner: {
      create: vi.fn().mockReturnValue({
        id: 'plan-1',
        objective: 'test',
        decisions: [],
        tasks: [],
      }),
      get: vi.fn().mockReturnValue({
        id: 'plan-1',
        objective: 'test',
        tasks: [],
        scope: 'test scope',
      }),
      getActive: vi.fn().mockReturnValue([]),
      startExecution: vi.fn().mockReturnValue({ id: 'plan-1', status: 'executing' }),
      complete: vi.fn().mockReturnValue({ id: 'plan-1', status: 'completed' }),
      setGitHubProjection: vi.fn(),
    },
    contextHealth: {
      track: vi.fn(),
      check: vi.fn().mockReturnValue({
        level: 'green',
        estimatedFill: 0.1,
        toolCallCount: 5,
        estimatedTokens: 2000,
        recommendation: 'healthy',
      }),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: ReturnType<typeof createOrchestrateOps>, name: string) {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createOrchestrateOps', () => {
  let rt: AgentRuntime;
  let ops: ReturnType<typeof createOrchestrateOps>;

  beforeEach(() => {
    vi.clearAllMocks();
    rt = mockRuntime();
    ops = createOrchestrateOps(rt);
  });

  it('returns all orchestrate ops', () => {
    expect(ops.length).toBeGreaterThanOrEqual(5);
    const names = ops.map((o) => o.name);
    expect(names).toContain('orchestrate_plan');
    expect(names).toContain('orchestrate_execute');
    expect(names).toContain('orchestrate_complete');
    expect(names).toContain('orchestrate_status');
    expect(names).toContain('orchestrate_quick_capture');
  });

  // ─── orchestrate_plan ─────────────────────────────────────────

  describe('orchestrate_plan', () => {
    it('detects intent and builds a plan', async () => {
      const op = findOp(ops, 'orchestrate_plan');
      const result = (await op.handler({
        prompt: 'Build a new dashboard component',
        projectPath: '.',
      })) as Record<string, unknown>;
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('flow');
      expect(result).toHaveProperty('recommendations');
      const flow = result.flow as Record<string, unknown>;
      expect(flow.intent).toBe('BUILD');
    });

    it('falls back to vault search when brain has no recommendations', async () => {
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brainIntelligence.recommend).mockImplementation(() => {
        throw new Error('no data');
      });
      vi.mocked(rt.vault.search).mockReturnValue([
        { entry: { id: 'e1', title: 'Pattern A' }, score: 0.8 },
      ] as never);
      const result = (await op.handler({ prompt: 'fix a bug' })) as Record<string, unknown>;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      expect(recs.length).toBe(1);
      expect(recs[0].pattern).toBe('Pattern A');
    });

    it('creates a planner plan for lifecycle tracking', async () => {
      const op = findOp(ops, 'orchestrate_plan');
      await op.handler({ prompt: 'Build something' });
      expect(rt.planner.create).toHaveBeenCalled();
    });
  });

  // ─── orchestrate_execute ──────────────────────────────────────

  describe('orchestrate_execute', () => {
    it('falls back to legacy planner when no flow plan found', async () => {
      const op = findOp(ops, 'orchestrate_execute');
      const result = (await op.handler({
        planId: 'legacy-plan',
        domain: 'test',
      })) as Record<string, unknown>;
      expect(rt.planner.startExecution).toHaveBeenCalledWith('legacy-plan');
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('session');
    });

    it('executes a flow plan when found in plan store', async () => {
      // First create a plan to populate the store
      const planOp = findOp(ops, 'orchestrate_plan');
      await planOp.handler({ prompt: 'Build test' });

      const execOp = findOp(ops, 'orchestrate_execute');
      const result = (await execOp.handler({
        planId: 'flow-plan-1',
      })) as Record<string, unknown>;
      const execution = result.execution as Record<string, unknown>;
      expect(execution.status).toBe('completed');
      expect(execution.stepsCompleted).toBe(1);
    });

    it('tracks context health during execution', async () => {
      const op = findOp(ops, 'orchestrate_execute');
      await op.handler({ planId: 'legacy-plan' });
      expect(rt.contextHealth.track).toHaveBeenCalled();
      expect(rt.contextHealth.check).toHaveBeenCalled();
    });
  });

  // ─── orchestrate_complete ─────────────────────────────────────

  describe('orchestrate_complete', () => {
    it('completes a plan and ends brain session', async () => {
      const op = findOp(ops, 'orchestrate_complete');
      const result = (await op.handler({
        planId: 'plan-1',
        sessionId: 'session-1',
        outcome: 'completed',
      })) as Record<string, unknown>;
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('session');
      expect(rt.planner.complete).toHaveBeenCalledWith('plan-1');
    });

    it('attempts knowledge extraction', async () => {
      const op = findOp(ops, 'orchestrate_complete');
      await op.handler({ planId: 'plan-1', sessionId: 'session-1' });
      expect(rt.brainIntelligence.extractKnowledge).toHaveBeenCalledWith('session-1');
    });

    it('works without a preceding plan', async () => {
      const op = findOp(ops, 'orchestrate_complete');
      const result = (await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        summary: 'Fixed a typo in the README',
      })) as Record<string, unknown>;

      // Should not call planner.complete
      expect(rt.planner.complete).not.toHaveBeenCalled();

      // Should return a lightweight completion record
      const plan = result.plan as Record<string, unknown>;
      expect(plan.status).toBe('completed');
      expect(plan.objective).toBe('Fixed a typo in the README');
    });

    it('captures knowledge even without plan', async () => {
      const op = findOp(ops, 'orchestrate_complete');
      await op.handler({
        sessionId: 'session-1',
        summary: 'Refactored utility function',
      });

      // Brain session end and knowledge extraction still run
      expect(rt.brainIntelligence.lifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'end', sessionId: 'session-1' }),
      );
      expect(rt.brainIntelligence.extractKnowledge).toHaveBeenCalledWith('session-1');
    });

    it('skips anti-rationalization gate when no criteria', async () => {
      const { detectRationalizations } = await import('../planning/rationalization-detector.js');
      const op = findOp(ops, 'orchestrate_complete');

      await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        summary: 'This was basically done already',
      });

      // detectRationalizations should never be called since there are no criteria
      expect(detectRationalizations).not.toHaveBeenCalled();
      // Should still complete successfully
      expect(rt.brainIntelligence.lifecycle).toHaveBeenCalled();
    });

    it('still runs brain session end without plan', async () => {
      const op = findOp(ops, 'orchestrate_complete');
      const result = (await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        toolsUsed: ['grep', 'edit'],
        filesModified: [],
      })) as Record<string, unknown>;

      expect(rt.brainIntelligence.lifecycle).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'end',
          sessionId: 'session-1',
          planOutcome: 'completed',
          toolsUsed: ['grep', 'edit'],
        }),
      );
      expect(result.session).toBeDefined();
    });
  });

  // ─── orchestrate_status ───────────────────────────────────────

  describe('orchestrate_status', () => {
    it('returns combined status', async () => {
      const op = findOp(ops, 'orchestrate_status');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result).toHaveProperty('activePlans');
      expect(result).toHaveProperty('sessionContext');
      expect(result).toHaveProperty('vaultStats');
      expect(result).toHaveProperty('brainStats');
      expect(result).toHaveProperty('flowPlans');
    });
  });

  // ─── orchestrate_quick_capture ────────────────────────────────

  describe('orchestrate_quick_capture', () => {
    it('starts and ends a brain session in one call', async () => {
      const op = findOp(ops, 'orchestrate_quick_capture');
      const result = (await op.handler({
        domain: 'testing',
        context: 'Tested the login flow',
      })) as Record<string, unknown>;
      expect(result).toHaveProperty('session');
      expect(rt.brainIntelligence.lifecycle).toHaveBeenCalledTimes(2);
    });
  });

  // ─── orchestrate_project_to_github ────────────────────────────

  describe('orchestrate_project_to_github', () => {
    it('returns skipped when no GitHub remote detected', async () => {
      const op = findOp(ops, 'orchestrate_project_to_github');
      vi.mocked(rt.planner.get).mockReturnValue({
        id: 'plan-1',
        tasks: [{ id: 't1', title: 'Task 1' }],
      } as never);
      const result = (await op.handler({ planId: 'plan-1' })) as Record<string, unknown>;
      expect(result.status).toBe('skipped');
    });

    it('throws when plan has no tasks', async () => {
      const op = findOp(ops, 'orchestrate_project_to_github');
      vi.mocked(rt.planner.get).mockReturnValue({
        id: 'plan-1',
        tasks: [],
      } as never);
      await expect(op.handler({ planId: 'plan-1' })).rejects.toThrow('no tasks');
    });

    it('throws when plan not found', async () => {
      const op = findOp(ops, 'orchestrate_project_to_github');
      vi.mocked(rt.planner.get).mockReturnValue(null as never);
      await expect(op.handler({ planId: 'missing' })).rejects.toThrow('not found');
    });
  });
});
