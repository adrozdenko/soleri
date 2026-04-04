import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOrchestrateOps, mapVaultResults } from './orchestrate-ops.js';
import { assessTaskComplexity } from '../planning/task-complexity-assessor.js';
import type { AgentRuntime } from './types.js';

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

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

vi.mock('../planning/evidence-collector.js', () => ({
  collectGitEvidence: vi.fn().mockReturnValue({
    planId: 'plan-1',
    planObjective: 'test',
    accuracy: 85,
    evidenceSources: ['git'],
    taskEvidence: [],
    unplannedChanges: [],
    missingWork: [],
    verificationGaps: [],
    summary: '0/0 tasks verified by git evidence',
  }),
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
    brain: {
      recordFeedback: vi.fn(),
      intelligentSearch: vi.fn().mockResolvedValue([]),
    },
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

    it('vault results appear when brain recommend has no data', async () => {
      // intelligentSearch succeeds; vault results appear even when brain.recommend throws.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brainIntelligence.recommend).mockImplementation(() => {
        throw new Error('no data');
      });
      vi.mocked(rt.brain.intelligentSearch).mockResolvedValue([
        { entry: { id: 'e1', title: 'Pattern A' }, score: 0.8 },
      ] as never);
      const result = (await op.handler({ prompt: 'fix a bug' })) as Record<string, unknown>;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      expect(recs.length).toBe(1);
      expect(recs[0].pattern).toBe('Pattern A');
      expect(recs[0].source).toBe('vault');
    });

    it('intelligentSearch is called for vault retrieval — semantic search is primary', async () => {
      // The primary vault retrieval path must use semantic search, not keyword search.
      // If intelligentSearch were not called, ranking would fall back to TF-IDF keyword
      // frequency, missing semantically related entries.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brainIntelligence.recommend).mockReturnValue([
        { pattern: 'Brain Pattern', strength: 70 },
      ] as never);
      vi.mocked(rt.brain.intelligentSearch).mockResolvedValue([
        { entry: { id: 'v1', title: 'Vault Pattern' }, score: 0.9 },
      ] as never);
      await op.handler({ prompt: 'build a feature' });
      expect(rt.brain.intelligentSearch).toHaveBeenCalled();
    });

    it('vault results precede brain results and brain does not duplicate vault entries', async () => {
      // Vault patterns come first; brain adds only novel patterns.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brain.intelligentSearch).mockResolvedValue([
        { entry: { id: 'v1', title: 'Vault Pattern' }, score: 0.9 },
      ] as never);
      vi.mocked(rt.brainIntelligence.recommend).mockReturnValue([
        { pattern: 'Vault Pattern', strength: 70 }, // duplicate — should be dropped
        { pattern: 'Brain Pattern', strength: 60 }, // novel — should be appended
      ] as never);
      const result = (await op.handler({ prompt: 'build something' })) as Record<string, unknown>;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      expect(recs).toHaveLength(2);
      expect(recs[0].source).toBe('vault');
      expect(recs[0].pattern).toBe('Vault Pattern');
      expect(recs[1].source).toBe('brain');
      expect(recs[1].pattern).toBe('Brain Pattern');
    });

    it('falls back to vault.search when intelligentSearch throws', async () => {
      // If the semantic layer is unavailable, keyword search covers it.
      // Without this fallback, any intelligentSearch failure would silently drop all vault results.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brain.intelligentSearch).mockRejectedValue(new Error('embedding unavailable'));
      vi.mocked(rt.vault.search).mockReturnValue([
        { entry: { id: 'k1', title: 'Keyword Pattern' }, score: 0.6 },
      ] as never);
      const result = (await op.handler({ prompt: 'fix bug' })) as Record<string, unknown>;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      expect(recs).toHaveLength(1);
      expect(recs[0].pattern).toBe('Keyword Pattern');
      expect(recs[0].source).toBe('vault');
    });

    it('brain results used alone when both vault search paths are unavailable', async () => {
      // If intelligentSearch and vault.search both fail, brain results cover the gap.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brain.intelligentSearch).mockRejectedValue(new Error('down'));
      vi.mocked(rt.vault.search).mockImplementation(() => {
        throw new Error('vault down');
      });
      vi.mocked(rt.brainIntelligence.recommend).mockReturnValue([
        { pattern: 'Brain Only Pattern', strength: 65 },
      ] as never);
      const result = (await op.handler({ prompt: 'fix bug' })) as Record<string, unknown>;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      expect(recs).toHaveLength(1);
      expect(recs[0].source).toBe('brain');
      expect(recs[0].pattern).toBe('Brain Only Pattern');
    });

    it('includes context and example from vault entry body in recommendations', async () => {
      // RankedResult.entry contains the full IntelligenceEntry — context and example
      // must be forwarded into the recommendations payload, not dropped.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brain.intelligentSearch).mockResolvedValue([
        {
          entry: {
            id: 'e-full',
            title: 'Anti-Pattern: Skip Tests',
            context: 'Never skip tests when under time pressure.',
            example: 'Adding --passWithNoTests to CI.',
          },
          score: 0.9,
        },
      ] as never);
      const result = (await op.handler({ prompt: 'write tests quickly' })) as Record<
        string,
        unknown
      >;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      expect(recs[0].context).toBe('Never skip tests when under time pressure.');
      expect(recs[0].example).toBe('Adding --passWithNoTests to CI.');
    });

    it('omits context key when vault entry has no body', async () => {
      // Title-only entries must not surface context: null or context: "" — the key should
      // be absent so consumers can reliably check `if (rec.context)`.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brain.intelligentSearch).mockResolvedValue([
        { entry: { id: 'e-bare', title: 'Pattern B' }, score: 0.7 },
      ] as never);
      const result = (await op.handler({ prompt: 'build something' })) as Record<string, unknown>;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      expect('context' in recs[0]).toBe(false);
      expect('example' in recs[0]).toBe(false);
    });

    it('sets mandatory:true for critical vault entries', async () => {
      // A critical entry must surface as mandatory so gate injection can promote
      // it to a hard stop. If severity is ignored, critical rules are treated
      // identically to suggestions — the whole enforcement chain breaks.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brain.intelligentSearch).mockResolvedValue([
        { entry: { id: 'c1', title: 'Critical Rule', severity: 'critical' }, score: 0.95 },
        { entry: { id: 'w1', title: 'Warning Rule', severity: 'warning' }, score: 0.75 },
        { entry: { id: 's1', title: 'Suggestion', severity: 'suggestion' }, score: 0.5 },
      ] as never);
      const result = (await op.handler({ prompt: 'plan something' })) as Record<string, unknown>;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      const critical = recs.find((r) => r.pattern === 'Critical Rule');
      const warning = recs.find((r) => r.pattern === 'Warning Rule');
      const suggestion = recs.find((r) => r.pattern === 'Suggestion');
      expect(critical?.mandatory).toBe(true);
      expect(critical?.strength).toBe(100);
      expect(warning?.mandatory).toBe(false);
      expect(suggestion?.mandatory).toBe(false);
    });

    it('sets mandatory:false for all brain-sourced recommendations', async () => {
      // Brain learns from usage frequency, not from curated rules — it cannot
      // declare a rule mandatory. If brain recs were mandatory, spurious patterns
      // from frequent usage would block plans with no policy basis.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brain.intelligentSearch).mockResolvedValue([] as never);
      vi.mocked(rt.brainIntelligence.recommend).mockReturnValue([
        { pattern: 'Brain Pattern', strength: 75 },
      ] as never);
      const result = (await op.handler({ prompt: 'build feature' })) as Record<string, unknown>;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      expect(recs[0].source).toBe('brain');
      expect(recs[0].mandatory).toBe(false);
    });

    it('creates a planner plan for lifecycle tracking', async () => {
      const op = findOp(ops, 'orchestrate_plan');
      await op.handler({ prompt: 'Build something' });
      expect(rt.planner.create).toHaveBeenCalled();
    });

    it('builds plan with no recommendations when all three retrieval paths fail', async () => {
      // Triple-failure: intelligentSearch down, vault.search down, brain.recommend down.
      // The plan must still build — missing recommendations are non-fatal.
      const op = findOp(ops, 'orchestrate_plan');
      vi.mocked(rt.brain.intelligentSearch).mockRejectedValue(new Error('down'));
      vi.mocked(rt.vault.search).mockImplementation(() => {
        throw new Error('vault down');
      });
      vi.mocked(rt.brainIntelligence.recommend).mockImplementation(() => {
        throw new Error('brain down');
      });
      const result = (await op.handler({ prompt: 'fix bug' })) as Record<string, unknown>;
      const recs = result.recommendations as Array<Record<string, unknown>>;
      expect(recs).toHaveLength(0);
      expect(result.flow).toBeDefined();
    });
  });

  // ─── mapVaultResults isolation ─────────────────────────────────

  describe('mapVaultResults', () => {
    it('maps critical severity to mandatory:true and strength:100', () => {
      const results = [
        {
          entry: {
            id: 'e1',
            title: 'No skipping tests',
            severity: 'critical',
            type: 'anti-pattern',
          },
          score: 0.9,
          breakdown: {} as never,
        },
      ];
      const recs = mapVaultResults(results);
      expect(recs[0].mandatory).toBe(true);
      expect(recs[0].strength).toBe(100);
      expect(recs[0].source).toBe('vault');
      expect(recs[0].entryType).toBe('anti-pattern');
    });

    it('maps warning severity to mandatory:false and strength:80', () => {
      const results = [
        {
          entry: { id: 'e2', title: 'Warning Rule', severity: 'warning', type: 'pattern' },
          score: 0.7,
          breakdown: {} as never,
        },
      ];
      const recs = mapVaultResults(results);
      expect(recs[0].mandatory).toBe(false);
      expect(recs[0].strength).toBe(80);
    });

    it('forwards context and example when present', () => {
      const results = [
        {
          entry: {
            id: 'e3',
            title: 'Rule',
            severity: 'warning',
            type: 'pattern',
            context: 'ctx',
            example: 'ex',
          },
          score: 0.5,
          breakdown: {} as never,
        },
      ];
      const recs = mapVaultResults(results);
      expect(recs[0].context).toBe('ctx');
      expect(recs[0].example).toBe('ex');
    });

    it('does not set context or example keys when absent', () => {
      const results = [
        {
          entry: { id: 'e4', title: 'Bare Rule', severity: 'suggestion', type: 'pattern' },
          score: 0.4,
          breakdown: {} as never,
        },
      ];
      const recs = mapVaultResults(results);
      expect('context' in recs[0]).toBe(false);
      expect('example' in recs[0]).toBe(false);
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

    // ─── Post-dispatch cleanup (subagent path) ─────────────────
    describe('post-dispatch cleanup', () => {
      function addSubagentDispatcher(
        runtime: AgentRuntime,
        opts: {
          dispatchResult?: Record<string, unknown>;
          dispatchError?: Error;
          reapResult?: string[];
          reapThrows?: boolean;
        } = {},
      ) {
        const dispatchMock = opts.dispatchError
          ? vi.fn().mockRejectedValue(opts.dispatchError)
          : vi.fn().mockResolvedValue(
              opts.dispatchResult ?? {
                status: 'completed',
                totalTasks: 1,
                completed: 1,
                failed: 0,
                durationMs: 100,
                totalUsage: {},
              },
            );
        const reapMock = opts.reapThrows
          ? vi.fn().mockImplementation(() => {
              throw new Error('reap failed');
            })
          : vi.fn().mockReturnValue({
              reaped: opts.reapResult ?? [],
              alive: [],
            });
        const cleanupMock = vi.fn();

        (runtime as Record<string, unknown>).subagentDispatcher = {
          dispatch: dispatchMock,
          reapOrphans: reapMock,
          cleanup: cleanupMock,
        };

        return { dispatchMock, reapMock, cleanupMock };
      }

      it('calls reapOrphans after successful subagent dispatch', async () => {
        const { reapMock } = addSubagentDispatcher(rt);
        ops = createOrchestrateOps(rt);

        const op = findOp(ops, 'orchestrate_execute');
        await op.handler({ planId: 'legacy-plan', subagent: true });

        expect(reapMock).toHaveBeenCalledTimes(1);
      });

      it('calls reapOrphans even when dispatch fails', async () => {
        const { reapMock } = addSubagentDispatcher(rt, {
          dispatchError: new Error('dispatch boom'),
        });
        ops = createOrchestrateOps(rt);

        const op = findOp(ops, 'orchestrate_execute');
        await expect(op.handler({ planId: 'legacy-plan', subagent: true })).rejects.toThrow(
          'dispatch boom',
        );

        expect(reapMock).toHaveBeenCalledTimes(1);
      });

      it('includes reapedOrphans in result when orphans found', async () => {
        addSubagentDispatcher(rt, {
          reapResult: ['t1'],
        });
        ops = createOrchestrateOps(rt);

        const op = findOp(ops, 'orchestrate_execute');
        const result = (await op.handler({
          planId: 'legacy-plan',
          subagent: true,
        })) as Record<string, unknown>;

        expect(result).toHaveProperty('reapedOrphans');
        const reaped = result.reapedOrphans as Array<{ taskId: string }>;
        expect(reaped).toHaveLength(1);
        expect(reaped[0].taskId).toBe('t1');
      });

      it('omits reapedOrphans from result when none found', async () => {
        addSubagentDispatcher(rt, { reapResult: [] });
        ops = createOrchestrateOps(rt);

        const op = findOp(ops, 'orchestrate_execute');
        const result = (await op.handler({
          planId: 'legacy-plan',
          subagent: true,
        })) as Record<string, unknown>;

        expect(result).not.toHaveProperty('reapedOrphans');
      });

      it('does not throw when reapOrphans fails', async () => {
        addSubagentDispatcher(rt, { reapThrows: true });
        ops = createOrchestrateOps(rt);

        const op = findOp(ops, 'orchestrate_execute');
        // Should complete successfully despite reap failure
        const result = (await op.handler({
          planId: 'legacy-plan',
          subagent: true,
        })) as Record<string, unknown>;

        expect(result).toHaveProperty('subagent');
        expect(result).not.toHaveProperty('reapedOrphans');
      });

      it('logs reaped orphans to stderr', async () => {
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        addSubagentDispatcher(rt, {
          reapResult: ['t1', 't2'],
        });
        ops = createOrchestrateOps(rt);

        const op = findOp(ops, 'orchestrate_execute');
        await op.handler({ planId: 'legacy-plan', subagent: true });

        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('Reaped 2 orphaned subagent(s)'),
        );
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('t1'));
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('t2'));
        stderrSpy.mockRestore();
      });
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

    it('includes evidenceReport when completing a plan', async () => {
      const op = findOp(ops, 'orchestrate_complete');
      const result = (await op.handler({
        planId: 'plan-1',
        sessionId: 'session-1',
        outcome: 'completed',
        projectPath: '.',
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('evidenceReport');
      const report = result.evidenceReport as Record<string, unknown>;
      expect(report.accuracy).toBe(85);
      expect(report.evidenceSources).toEqual(['git']);
    });

    it('succeeds without blocking when git is unavailable', async () => {
      const { collectGitEvidence } = await import('../planning/evidence-collector.js');
      vi.mocked(collectGitEvidence).mockImplementationOnce(() => {
        throw new Error('git not found');
      });

      const op = findOp(ops, 'orchestrate_complete');
      const result = (await op.handler({
        planId: 'plan-1',
        sessionId: 'session-1',
        outcome: 'completed',
      })) as Record<string, unknown>;

      // Should complete successfully with evidenceReport: null
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('session');
      expect(result.evidenceReport).toBeNull();
    });

    it('adds warning when evidence accuracy is below 50%', async () => {
      const { collectGitEvidence } = await import('../planning/evidence-collector.js');
      vi.mocked(collectGitEvidence).mockReturnValueOnce({
        planId: 'plan-1',
        planObjective: 'test',
        accuracy: 30,
        evidenceSources: ['git'],
        taskEvidence: [],
        unplannedChanges: [],
        missingWork: [],
        verificationGaps: [],
        summary: '0/2 tasks verified by git evidence',
      });

      const op = findOp(ops, 'orchestrate_complete');
      const result = (await op.handler({
        planId: 'plan-1',
        sessionId: 'session-1',
        outcome: 'completed',
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('evidenceReport');
      expect(result).toHaveProperty('warnings');
      const warnings = result.warnings as string[];
      expect(warnings.some((w) => w.includes('Low evidence accuracy (30%)'))).toBe(true);
    });

    it('runs evidence collection for abandoned plans too', async () => {
      const { collectGitEvidence } = await import('../planning/evidence-collector.js');
      vi.mocked(collectGitEvidence).mockReturnValueOnce({
        planId: 'plan-1',
        planObjective: 'test',
        accuracy: 60,
        evidenceSources: ['git'],
        taskEvidence: [
          {
            taskId: 't1',
            taskTitle: 'Task 1',
            plannedStatus: 'pending',
            matchedFiles: [],
            verdict: 'MISSING',
          },
        ],
        unplannedChanges: [],
        missingWork: [],
        verificationGaps: [],
        summary: '0/1 tasks verified by git evidence',
      });

      const op = findOp(ops, 'orchestrate_complete');
      const result = (await op.handler({
        planId: 'plan-1',
        sessionId: 'session-1',
        outcome: 'abandoned',
        projectPath: '.',
      })) as Record<string, unknown>;

      expect(collectGitEvidence).toHaveBeenCalled();
      expect(result).toHaveProperty('evidenceReport');
      const report = result.evidenceReport as Record<string, unknown>;
      expect(report.accuracy).toBe(60);
      expect(Array.isArray(report.taskEvidence)).toBe(true);
    });

    it('returns evidenceReport as null when no plan is provided', async () => {
      const op = findOp(ops, 'orchestrate_complete');
      const result = (await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        summary: 'Direct task without a plan',
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('evidenceReport');
      expect(result.evidenceReport).toBeNull();
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

  // ─── task auto-assessment routing ────────────────────────────
  //
  // Integration-style tests that verify the full assess → route → complete flow:
  // 1. Use TaskComplexityAssessor to classify the task
  // 2. Route to direct execution (simple) or planning (complex)
  // 3. Complete via orchestrate_complete in both paths

  describe('task auto-assessment routing', () => {
    it('simple task routes to direct execution + complete', async () => {
      // Step 1: Assess — "fix typo in README" should be simple
      const assessment = assessTaskComplexity({ prompt: 'fix typo in README' });
      expect(assessment.classification).toBe('simple');

      // Step 2: Skip planning, go straight to complete without a planId
      const completeOp = findOp(ops, 'orchestrate_complete');
      const result = (await completeOp.handler({
        sessionId: 'session-simple',
        outcome: 'completed',
        summary: 'Fixed typo in README',
      })) as Record<string, unknown>;

      // Should not touch the planner at all
      expect(rt.planner.complete).not.toHaveBeenCalled();

      // Should still produce a valid completion record
      const plan = result.plan as Record<string, unknown>;
      expect(plan.status).toBe('completed');
      expect(plan.objective).toBe('Fixed typo in README');

      // Knowledge should still be captured
      expect(rt.brainIntelligence.extractKnowledge).toHaveBeenCalledWith('session-simple');
    });

    it('complex task routes through planning + complete', async () => {
      // Step 1: Assess — cross-cutting auth task should be complex
      const assessment = assessTaskComplexity({
        prompt: 'add authentication across all API routes',
        filesEstimated: 8,
      });
      expect(assessment.classification).toBe('complex');

      // Step 2: Create a plan via orchestrate_plan
      const planOp = findOp(ops, 'orchestrate_plan');
      const planResult = (await planOp.handler({
        prompt: 'add authentication across all API routes',
      })) as Record<string, unknown>;
      expect(planResult).toHaveProperty('plan');
      expect(planResult).toHaveProperty('flow');

      // Step 3: Complete with the planId
      const completeOp = findOp(ops, 'orchestrate_complete');
      const result = (await completeOp.handler({
        planId: 'plan-1',
        sessionId: 'session-complex',
        outcome: 'completed',
        summary: 'Added authentication middleware to all API routes',
      })) as Record<string, unknown>;

      // Should complete via the planner lifecycle
      expect(rt.planner.complete).toHaveBeenCalledWith('plan-1');

      // Knowledge should be captured
      expect(rt.brainIntelligence.lifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'end', sessionId: 'session-complex' }),
      );
      expect(rt.brainIntelligence.extractKnowledge).toHaveBeenCalledWith('session-complex');

      // Plan should be marked completed
      const completedPlan = result.plan as Record<string, unknown>;
      expect(completedPlan.status).toBe('completed');
    });

    it('orchestrate_complete captures knowledge in both paths', async () => {
      // ── Simple path (no planId) ──
      vi.clearAllMocks();
      rt = mockRuntime();
      ops = createOrchestrateOps(rt);

      await findOp(ops, 'orchestrate_complete').handler({
        sessionId: 'session-simple',
        outcome: 'completed',
        summary: 'Renamed a variable',
      });

      // Brain session end called
      expect(rt.brainIntelligence.lifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'end', sessionId: 'session-simple' }),
      );
      // Knowledge extraction called
      expect(rt.brainIntelligence.extractKnowledge).toHaveBeenCalledWith('session-simple');
      // Planner.complete NOT called (no plan)
      expect(rt.planner.complete).not.toHaveBeenCalled();

      // ── Complex path (with planId) ──
      vi.clearAllMocks();
      rt = mockRuntime();
      ops = createOrchestrateOps(rt);

      await findOp(ops, 'orchestrate_complete').handler({
        planId: 'plan-1',
        sessionId: 'session-complex',
        outcome: 'completed',
        summary: 'Implemented full auth layer',
      });

      // Brain session end called
      expect(rt.brainIntelligence.lifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'end', sessionId: 'session-complex' }),
      );
      // Knowledge extraction called
      expect(rt.brainIntelligence.extractKnowledge).toHaveBeenCalledWith('session-complex');
      // Planner.complete IS called (has plan)
      expect(rt.planner.complete).toHaveBeenCalledWith('plan-1');
    });

    it('assessment result includes non-empty reasoning for simple tasks', () => {
      const result = assessTaskComplexity({ prompt: 'fix typo in README' });
      expect(result.classification).toBe('simple');
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('orchestrate_complete compounds operator signals when provided', async () => {
      const compoundSignalsMock = vi.fn();
      (rt as Record<string, unknown>).operatorContextStore = {
        compoundSignals: compoundSignalsMock,
        hasDrifted: vi.fn().mockReturnValue(false),
        renderContextFile: vi.fn(),
      };
      ops = createOrchestrateOps(rt);

      const op = findOp(ops, 'orchestrate_complete');
      await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        operatorSignals: {
          expertise: [{ topic: 'typescript', level: 'expert', confidence: 0.9 }],
          corrections: [{ rule: 'use conventional commits', scope: 'global' }],
          interests: [{ tag: 'coffee' }],
          patterns: [{ pattern: 'prefers small PRs', frequency: 'frequent' }],
        },
      });

      expect(compoundSignalsMock).toHaveBeenCalledWith(
        {
          expertise: [{ topic: 'typescript', level: 'expert', confidence: 0.9 }],
          corrections: [{ rule: 'use conventional commits', scope: 'global' }],
          interests: [{ tag: 'coffee' }],
          patterns: [{ pattern: 'prefers small PRs', frequency: 'frequent' }],
        },
        'session-1',
      );
    });

    it('orchestrate_complete handles empty operator signals gracefully', async () => {
      const compoundSignalsMock = vi.fn();
      (rt as Record<string, unknown>).operatorContextStore = {
        compoundSignals: compoundSignalsMock,
        hasDrifted: vi.fn().mockReturnValue(false),
        renderContextFile: vi.fn(),
      };
      ops = createOrchestrateOps(rt);

      const op = findOp(ops, 'orchestrate_complete');
      await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        operatorSignals: {},
      });

      // Empty object with default arrays should be passed through
      expect(compoundSignalsMock).toHaveBeenCalledTimes(1);
      const [passedSignals, passedSessionId] = compoundSignalsMock.mock.calls[0];
      expect(passedSessionId).toBe('session-1');
      // Zod defaults produce empty arrays for each field
      expect(passedSignals).toBeDefined();
      expect(Array.isArray(passedSignals.expertise ?? [])).toBe(true);
      expect(Array.isArray(passedSignals.corrections ?? [])).toBe(true);
      expect(Array.isArray(passedSignals.interests ?? [])).toBe(true);
      expect(Array.isArray(passedSignals.patterns ?? [])).toBe(true);
    });

    it('orchestrate_complete works when operatorContextStore not available', async () => {
      // Ensure no operatorContextStore on runtime (backward compat)
      delete (rt as Record<string, unknown>).operatorContextStore;
      ops = createOrchestrateOps(rt);

      const op = findOp(ops, 'orchestrate_complete');
      const result = (await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        operatorSignals: {
          expertise: [{ topic: 'react', level: 'intermediate' }],
          corrections: [],
          interests: [],
          patterns: [],
        },
      })) as Record<string, unknown>;

      // Should complete normally without errors
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('session');
    });

    it('orchestrate_complete re-renders context file when drift detected', async () => {
      const compoundSignalsMock = vi.fn();
      const hasDriftedMock = vi.fn().mockReturnValue(true);
      const renderContextFileMock = vi
        .fn()
        .mockReturnValue(
          '# Operator Context\n\n**Expertise:** typescript (expert, 1 sessions, confidence 0.90).',
        );
      (rt as Record<string, unknown>).operatorContextStore = {
        compoundSignals: compoundSignalsMock,
        hasDrifted: hasDriftedMock,
        renderContextFile: renderContextFileMock,
      };
      rt.config.agentDir = '/tmp/test-agent';
      ops = createOrchestrateOps(rt);

      const op = findOp(ops, 'orchestrate_complete');
      await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        operatorSignals: {
          expertise: [{ topic: 'typescript', level: 'expert', confidence: 0.9 }],
          corrections: [],
          interests: [],
          patterns: [],
        },
      });

      expect(compoundSignalsMock).toHaveBeenCalled();
      expect(hasDriftedMock).toHaveBeenCalled();
      expect(renderContextFileMock).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/tmp/test-agent', 'instructions'), {
        recursive: true,
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/tmp/test-agent', 'instructions', 'operator-context.md'),
        '# Operator Context\n\n**Expertise:** typescript (expert, 1 sessions, confidence 0.90).',
        'utf-8',
      );
    });

    it('orchestrate_complete skips file write when no agentDir', async () => {
      const compoundSignalsMock = vi.fn();
      const hasDriftedMock = vi.fn().mockReturnValue(true);
      const renderContextFileMock = vi.fn().mockReturnValue('# Operator Context');
      (rt as Record<string, unknown>).operatorContextStore = {
        compoundSignals: compoundSignalsMock,
        hasDrifted: hasDriftedMock,
        renderContextFile: renderContextFileMock,
      };
      // agentDir is NOT set
      delete (rt.config as Record<string, unknown>).agentDir;
      ops = createOrchestrateOps(rt);

      vi.mocked(fs.mkdirSync).mockClear();
      vi.mocked(fs.writeFileSync).mockClear();

      const op = findOp(ops, 'orchestrate_complete');
      await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        operatorSignals: {
          expertise: [{ topic: 'react', level: 'intermediate' }],
          corrections: [],
          interests: [],
          patterns: [],
        },
      });

      expect(compoundSignalsMock).toHaveBeenCalled();
      expect(hasDriftedMock).toHaveBeenCalled();
      // Should NOT write to disk since agentDir is missing
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('orchestrate_complete skips file write when no drift', async () => {
      const compoundSignalsMock = vi.fn();
      const hasDriftedMock = vi.fn().mockReturnValue(false);
      const renderContextFileMock = vi.fn();
      (rt as Record<string, unknown>).operatorContextStore = {
        compoundSignals: compoundSignalsMock,
        hasDrifted: hasDriftedMock,
        renderContextFile: renderContextFileMock,
      };
      rt.config.agentDir = '/tmp/test-agent';
      ops = createOrchestrateOps(rt);

      vi.mocked(fs.mkdirSync).mockClear();
      vi.mocked(fs.writeFileSync).mockClear();

      const op = findOp(ops, 'orchestrate_complete');
      await op.handler({
        sessionId: 'session-1',
        outcome: 'completed',
        operatorSignals: {
          expertise: [],
          corrections: [],
          interests: [],
          patterns: [],
        },
      });

      expect(compoundSignalsMock).toHaveBeenCalled();
      expect(hasDriftedMock).toHaveBeenCalled();
      // No drift means no file write
      expect(renderContextFileMock).not.toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('assessment result includes non-empty reasoning for complex tasks', () => {
      const result = assessTaskComplexity({
        prompt: 'add authentication across all API routes',
        filesEstimated: 8,
        domains: ['auth', 'api', 'middleware'],
      });
      expect(result.classification).toBe('complex');
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });
});
