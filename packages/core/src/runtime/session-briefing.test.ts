/**
 * Unit tests for session-briefing — session_briefing op + buildAdaptationSummary.
 */

import { describe, it, expect } from 'vitest';
import { captureOps, executeOp } from '../engine/test-helpers.js';
import { createSessionBriefingOps, buildAdaptationSummary } from './session-briefing.js';
import type { AgentRuntime } from './types.js';
import type { OperatorProfile } from '../operator/operator-types.js';

function makeRuntime(overrides?: {
  vaultStats?: { totalEntries: number; byType?: Record<string, number> };
  sessions?: Array<{
    endedAt: string | null;
    domain: string | null;
    context: string | null;
    toolsUsed: string[];
    filesModified: string[];
  }>;
  memories?: Array<{
    id?: string;
    createdAt: number;
    projectPath?: string;
    summary?: string;
    context?: string;
    type?: string;
  }>;
  plans?: Array<{
    id: string;
    status: string;
    objective?: string;
    tasks: Array<{ status: string }>;
  }>;
  recentEntries?: Array<{ title: string }>;
  recommendations?: Array<{ pattern: string; strength: number }>;
  proposals?: Array<{ title: string; confidence: number; type: string; promoted: boolean }>;
  healthScore?: number;
  healthRecs?: string[];
  operatorProfile?: OperatorProfile | null;
}) {
  const o = overrides ?? {};

  return {
    brainIntelligence: {
      listSessions: (_opts: { limit: number; active: boolean }) => o.sessions ?? [],
      recommend: (_opts: { limit: number }) => o.recommendations ?? [],
      getProposals: (_opts: { promoted: boolean }) => o.proposals ?? [],
    },
    planner: {
      list: () => o.plans ?? [],
      closeStale: () => ({ closedIds: [], closedPlans: [] }),
    },
    vault: {
      stats: () => o.vaultStats ?? { totalEntries: 50, byType: { playbook: 5 } },
      getRecent: (_n: number) => o.recentEntries ?? [],
      listMemories: () => o.memories ?? [],
    },
    curator: {
      healthAudit: () => ({
        score: o.healthScore ?? 85,
        recommendations: o.healthRecs ?? [],
      }),
    },
    operatorProfile: {
      getProfile: () => o.operatorProfile ?? null,
    },
  } as unknown as AgentRuntime;
}

describe('session-briefing', () => {
  describe('session_briefing op', () => {
    it('returns minimal briefing when all subsystems are empty', async () => {
      const runtime = makeRuntime();
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      expect(res.success).toBe(true);
      const data = res.data as {
        sections: Array<{ label: string }>;
        generatedAt: number;
        dataPointsConsulted: number;
      };
      expect(data.generatedAt).toBeGreaterThan(0);
      expect(Array.isArray(data.sections)).toBe(true);
    });

    it('shows Welcome section when vault has few entries', async () => {
      const runtime = makeRuntime({ vaultStats: { totalEntries: 3, byType: { playbook: 0 } } });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string; content: string }> };
      const welcome = data.sections.find((s) => s.label === 'Welcome');
      expect(welcome).toBeDefined();
      expect(welcome!.content).toContain('3 knowledge entries');
    });

    it('skips Welcome when vault has enough entries', async () => {
      const runtime = makeRuntime({ vaultStats: { totalEntries: 50, byType: { playbook: 5 } } });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string }> };
      expect(data.sections.find((s) => s.label === 'Welcome')).toBeUndefined();
    });

    it('includes Last session from cross-project memories when fresh', async () => {
      const runtime = makeRuntime({
        memories: [
          {
            id: 'mem-1',
            createdAt: Date.now() - 600_000, // 10 min ago (ms)
            projectPath: '/Users/me/projects/other-app',
            summary: 'Fixed KPI card layout in the dashboard',
            type: 'session',
          },
        ],
      });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string; content: string }> };
      const session = data.sections.find((s) => s.label === 'Last session');
      expect(session).toBeDefined();
      expect(session!.content).toContain('other-app');
      expect(session!.content).toContain('Fixed KPI card layout');
    });

    it('falls back to brain sessions when no fresh memories exist', async () => {
      const runtime = makeRuntime({
        memories: [], // no memories
        sessions: [
          {
            endedAt: new Date(Date.now() - 3600_000).toISOString(), // 1h ago
            domain: 'frontend',
            context: 'Refactored button component',
            toolsUsed: ['vault_search', 'brain_recommend'],
            filesModified: ['src/button.tsx'],
          },
        ],
      });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string; content: string }> };
      const session = data.sections.find((s) => s.label === 'Last session');
      expect(session).toBeDefined();
      expect(session!.content).toContain('[frontend]');
      expect(session!.content).toContain('Refactored button component');
    });

    it('skips Last session when all sessions are stale', async () => {
      const staleTs = Date.now() - 72 * 3600_000; // 72h ago — beyond default 48h
      const runtime = makeRuntime({
        memories: [
          {
            id: 'mem-old',
            createdAt: staleTs,
            projectPath: '/old-project',
            summary: 'Ancient session',
            type: 'session',
          },
        ],
        sessions: [
          {
            endedAt: new Date(staleTs).toISOString(),
            domain: 'old',
            context: 'Ancient brain session',
            toolsUsed: [],
            filesModified: [],
          },
        ],
      });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string; content: string }> };
      const session = data.sections.find((s) => s.label === 'Last session');
      expect(session).toBeUndefined();
    });

    it('respects custom recencyHours parameter', async () => {
      const runtime = makeRuntime({
        memories: [
          {
            id: 'mem-3h',
            createdAt: Date.now() - 3 * 3600_000, // 3h ago
            projectPath: '/recent-project',
            summary: 'Recent work',
            type: 'session',
          },
        ],
      });
      const ops = captureOps(createSessionBriefingOps(runtime));

      // With 1h window — should skip
      const narrow = await executeOp(ops, 'session_briefing', { recencyHours: 1 });
      const narrowData = narrow.data as { sections: Array<{ label: string }> };
      expect(narrowData.sections.find((s) => s.label === 'Last session')).toBeUndefined();

      // With 4h window — should include
      const wide = await executeOp(ops, 'session_briefing', { recencyHours: 4 });
      const wideData = wide.data as { sections: Array<{ label: string; content: string }> };
      const session = wideData.sections.find((s) => s.label === 'Last session');
      expect(session).toBeDefined();
      expect(session!.content).toContain('Recent work');
    });

    it('includes Active plans section', async () => {
      const runtime = makeRuntime({
        plans: [
          {
            id: 'p1',
            status: 'executing',
            objective: 'Build dashboard',
            tasks: [{ status: 'completed' }, { status: 'pending' }],
          },
          { id: 'p2', status: 'completed', objective: 'Done', tasks: [] },
        ],
      });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string; content: string }> };
      const plans = data.sections.find(
        (s) => s.label === 'Active plan' || s.label.startsWith('Active plans'),
      );
      expect(plans).toBeDefined();
      expect(plans!.content).toContain('Build dashboard');
      expect(plans!.content).toContain('1/2 tasks');
    });

    it('includes Recent captures section', async () => {
      const runtime = makeRuntime({
        recentEntries: [
          { title: 'Semantic token pattern' },
          { title: 'Error boundary anti-pattern' },
        ],
      });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string; content: string }> };
      const captures = data.sections.find((s) => s.label === 'Recent captures');
      expect(captures).toBeDefined();
      expect(captures!.content).toContain('Semantic token pattern');
    });

    it('includes Brain recommends section', async () => {
      const runtime = makeRuntime({
        recommendations: [
          { pattern: 'TDD', strength: 0.92 },
          { pattern: 'Vault-first', strength: 0.85 },
        ],
      });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string; content: string }> };
      const brain = data.sections.find((s) => s.label === 'Brain recommends');
      expect(brain).toBeDefined();
      expect(brain!.content).toContain('TDD');
    });

    it('includes Attention section when health is low', async () => {
      const runtime = makeRuntime({ healthScore: 50, healthRecs: ['Run curator groom'] });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string; content: string }> };
      const attention = data.sections.find((s) => s.label === 'Attention');
      expect(attention).toBeDefined();
      expect(attention!.content).toContain('50/100');
    });

    it('respects maxSections limit', async () => {
      const runtime = makeRuntime({
        vaultStats: { totalEntries: 2, byType: {} },
        sessions: [
          {
            endedAt: new Date().toISOString(),
            domain: 'd',
            context: 'c',
            toolsUsed: ['t'],
            filesModified: ['f'],
          },
        ],
        plans: [{ id: 'p', status: 'executing', objective: 'o', tasks: [] }],
        recentEntries: [{ title: 't' }],
        recommendations: [{ pattern: 'p', strength: 0.9 }],
        healthScore: 40,
        healthRecs: ['Fix it'],
      });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', { maxSections: 2 });

      const data = res.data as { sections: unknown[] };
      expect(data.sections.length).toBeLessThanOrEqual(2);
    });

    it('gracefully handles subsystem errors', async () => {
      const runtime = {
        brainIntelligence: {
          listSessions: () => {
            throw new Error('DB closed');
          },
          recommend: () => {
            throw new Error('DB closed');
          },
          getProposals: () => {
            throw new Error('DB closed');
          },
        },
        planner: {
          list: () => {
            throw new Error('no plans');
          },
        },
        vault: {
          stats: () => {
            throw new Error('no vault');
          },
          getRecent: () => {
            throw new Error('no vault');
          },
          listMemories: () => {
            throw new Error('no vault');
          },
        },
        curator: {
          healthAudit: () => {
            throw new Error('no curator');
          },
        },
        operatorProfile: {
          getProfile: () => {
            throw new Error('no profile');
          },
        },
      } as unknown as AgentRuntime;

      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});
      expect(res.success).toBe(true);
      const data = res.data as { sections: unknown[] };
      expect(data.sections).toEqual([]);
    });

    it('includes Pending proposals when present', async () => {
      const runtime = makeRuntime({
        proposals: [
          {
            title: 'Use TDD for all new features',
            confidence: 0.8,
            type: 'pattern',
            promoted: false,
          },
          { title: 'Low confidence', confidence: 0.2, type: 'anti-pattern', promoted: false },
        ],
      });
      const ops = captureOps(createSessionBriefingOps(runtime));
      const res = await executeOp(ops, 'session_briefing', {});

      const data = res.data as { sections: Array<{ label: string; content: string }> };
      const proposals = data.sections.find((s) => s.label === 'Pending proposals');
      expect(proposals).toBeDefined();
      expect(proposals!.content).toContain('Use TDD');
      // Low confidence (0.2 < 0.4) should be filtered out
      expect(proposals!.content).not.toContain('Low confidence');
    });
  });

  describe('buildAdaptationSummary', () => {
    function makeProfile(overrides?: Partial<OperatorProfile>): OperatorProfile {
      return {
        id: 'test',
        operatorId: 'op',
        version: 1,
        identity: { name: null, timezone: null, locale: null, personalDetails: [] },
        cognition: {
          learningStyle: 'visual',
          decisionStyle: 'analytical',
          abstractionPreference: 0.5,
          detailOrientation: 0.5,
          attentionPatterns: [],
        },
        communication: {
          style: 'mixed',
          formality: 0.5,
          verbosity: 0.5,
          preferredFormats: [],
          reactionPatterns: [],
        },
        workingRules: { rules: [], inferredPriorities: [] },
        trustModel: {
          level: 'new',
          currentLevel: 0.5,
          challengeThreshold: 0.5,
          autonomyGrants: [],
          corrections: [],
        },
        tasteProfile: { aestheticPreferences: [], toolPreferences: [], workflowPreferences: [] },
        growthEdges: { observed: [], selfReported: [], progressNotes: [] },
        technicalContext: {
          primaryLanguages: [],
          frameworks: [],
          expertiseLevels: [],
          environmentDetails: [],
        },
        sessionCount: 0,
        lastSynthesis: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
      } as OperatorProfile;
    }

    it('returns null when profile has no distinguishing data', () => {
      const result = buildAdaptationSummary(makeProfile());
      expect(result).toBeNull();
    });

    it('includes communication style when not mixed', () => {
      const result = buildAdaptationSummary(
        makeProfile({
          communication: {
            style: 'terse',
            formality: 0.8,
            verbosity: 0.3,
            preferredFormats: [],
            reactionPatterns: [],
          },
        }),
      );
      expect(result).toContain('Communication: terse, formal');
    });

    it('includes trust level when not new', () => {
      const result = buildAdaptationSummary(
        makeProfile({
          trustModel: {
            level: 'established',
            currentLevel: 0.8,
            challengeThreshold: 0.5,
            autonomyGrants: [],
            corrections: [],
          },
        }),
      );
      expect(result).toContain('Trust: established');
      expect(result).toContain('high autonomy');
    });

    it('includes working rules as priorities', () => {
      const result = buildAdaptationSummary(
        makeProfile({
          workingRules: {
            rules: [
              {
                rule: 'Always write tests first',
                source: 'observed',
                confidence: 0.9,
                addedAt: '',
              },
              { rule: 'Prefer small PRs', source: 'observed', confidence: 0.8, addedAt: '' },
            ],
            inferredPriorities: [],
          },
        }),
      );
      expect(result).toContain('Priorities:');
      expect(result).toContain('Always write tests first');
    });

    it('includes growth edges', () => {
      const result = buildAdaptationSummary(
        makeProfile({
          growthEdges: {
            observed: [
              {
                area: 'TypeScript generics',
                evidence: 'struggled with mapped types',
                observedAt: '',
              },
            ],
            selfReported: [],
            progressNotes: [],
          },
        }),
      );
      expect(result).toContain('Growth edges: TypeScript generics');
    });

    it('shows casual for low formality', () => {
      const result = buildAdaptationSummary(
        makeProfile({
          communication: {
            style: 'conversational',
            formality: 0.2,
            verbosity: 0.5,
            preferredFormats: [],
            reactionPatterns: [],
          },
        }),
      );
      expect(result).toContain('casual');
    });

    it('shows check before acting for low trust level', () => {
      const result = buildAdaptationSummary(
        makeProfile({
          trustModel: {
            level: 'developing',
            currentLevel: 0.2,
            challengeThreshold: 0.5,
            autonomyGrants: [],
            corrections: [],
          },
        }),
      );
      expect(result).toContain('check before acting');
    });
  });
});
