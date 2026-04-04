/**
 * Colocated contract tests for brain-facade.ts.
 * Tests every op handler — valid params, error paths, edge cases.
 * All runtime dependencies are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBrainFacadeOps } from './brain-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Mock factories ──────────────────────────────────────────────────

function makeMockBrain() {
  return {
    recordFeedback: vi.fn().mockReturnValue({ id: 'fb-1', recorded: true }),
    getFeedbackStats: vi.fn().mockReturnValue({ total: 5, accepted: 3, dismissed: 2 }),
    rebuildVocabulary: vi.fn(),
    getVocabularySize: vi.fn().mockReturnValue(42),
    getStats: vi.fn().mockReturnValue({ vocabularySize: 42, feedbackCount: 5 }),
    getDecayReport: vi
      .fn()
      .mockResolvedValue([{ id: 'e1', title: 'Test', decayScore: 0.8, status: 'active' }]),
    intelligentSearch: vi.fn().mockResolvedValue([]),
    scanSearch: vi.fn().mockResolvedValue([]),
    enrichAndCapture: vi.fn().mockReturnValue({ captured: true, id: 'cap-1', autoTags: [] }),
  };
}

function makeMockBrainIntelligence() {
  return {
    getStats: vi.fn().mockReturnValue({ pipelineRuns: 3 }),
    getSessionContext: vi.fn().mockReturnValue({ sessions: [], toolUsage: {}, fileChanges: {} }),
    getStrengths: vi.fn().mockReturnValue([{ name: 'test-pattern', strength: 80 }]),
    getGlobalPatterns: vi.fn().mockReturnValue([{ name: 'cross-domain-1' }]),
    recommend: vi.fn().mockReturnValue([{ name: 'recommended-1', score: 0.9 }]),
    buildIntelligence: vi.fn().mockReturnValue({ success: true }),
    exportData: vi.fn().mockReturnValue({ strengths: [], sessions: [], proposals: [] }),
    importData: vi.fn().mockReturnValue({ imported: { strengths: 0, sessions: 0, proposals: 0 } }),
    extractKnowledge: vi.fn().mockReturnValue({ proposals: [], count: 0 }),
    archiveSessions: vi.fn().mockReturnValue({ archived: 2 }),
    promoteProposals: vi.fn().mockReturnValue({ promoted: 1 }),
    lifecycle: vi.fn().mockReturnValue({ sessionId: 'sess-1', action: 'start' }),
    listSessions: vi.fn().mockReturnValue([{ id: 'sess-1', domain: 'test' }]),
    getSessionById: vi.fn().mockReturnValue({ id: 'sess-1', domain: 'test' }),
    computeSessionQuality: vi.fn().mockReturnValue({ score: 75 }),
    replaySession: vi.fn().mockReturnValue({ session: {}, quality: 75 }),
    resetExtracted: vi.fn().mockReturnValue({ reset: 1 }),
    maybeAutoBuildOnFeedback: vi.fn(),
  };
}

function makeMockLlmClient() {
  return {
    isAvailable: vi.fn().mockReturnValue({ openai: true, anthropic: false }),
    getRoutes: vi.fn().mockReturnValue({ enrichment: 'openai' }),
  };
}

function makeMockKeyPool() {
  return {
    openai: { hasKeys: true, getStatus: vi.fn().mockReturnValue({ active: 1, total: 2 }) },
    anthropic: { hasKeys: false, getStatus: vi.fn() },
  };
}

function makeMockLearningRadar() {
  return {
    analyze: vi.fn().mockReturnValue({ action: 'queued', candidateId: 1 }),
    getCandidates: vi.fn().mockReturnValue([{ id: 1, title: 'test' }]),
    approve: vi.fn().mockReturnValue({ approved: true }),
    dismiss: vi.fn().mockReturnValue({ dismissed: true }),
    flush: vi.fn().mockReturnValue({ captured: 2, skipped: 1 }),
    getStats: vi.fn().mockReturnValue({ analyzed: 10, captured: 5, queued: 2 }),
  };
}

function makeMockKnowledgeSynthesizer() {
  return {
    synthesize: vi.fn().mockResolvedValue({
      content: 'Synthesized output',
      format: 'brief',
      sources: [],
      coverageScore: 0.8,
    }),
  };
}

function makeMockGovernance() {
  return {
    evaluateCapture: vi.fn().mockReturnValue({ action: 'capture' }),
  };
}

function makeRuntime(overrides: Partial<Record<string, unknown>> = {}): AgentRuntime {
  return {
    brain: makeMockBrain(),
    brainIntelligence: makeMockBrainIntelligence(),
    llmClient: makeMockLlmClient(),
    keyPool: makeMockKeyPool(),
    governance: makeMockGovernance(),
    learningRadar: makeMockLearningRadar(),
    knowledgeSynthesizer: makeMockKnowledgeSynthesizer(),
    ...overrides,
  } as unknown as AgentRuntime;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('brain-facade', () => {
  let runtime: AgentRuntime;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    runtime = makeRuntime();
    ops = captureOps(createBrainFacadeOps(runtime));
  });

  // ─── record_feedback ───────────────────────────────────────────────

  describe('record_feedback', () => {
    it('records feedback and returns confirmation', async () => {
      const result = await executeOp(ops, 'record_feedback', {
        query: 'test query',
        entryId: 'e-1',
        action: 'accepted',
      });
      expect(result.success).toBe(true);
      const data = result.data as {
        recorded: boolean;
        query: string;
        entryId: string;
        action: string;
      };
      expect(data.recorded).toBe(true);
      expect(data.query).toBe('test query');
      expect(data.entryId).toBe('e-1');
      expect(data.action).toBe('accepted');
    });

    it('calls brain.recordFeedback with positional args', async () => {
      await executeOp(ops, 'record_feedback', {
        query: 'q',
        entryId: 'e',
        action: 'dismissed',
      });
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      expect(brain.recordFeedback).toHaveBeenCalledWith('q', 'e', 'dismissed');
    });

    it('rejects invalid action enum', async () => {
      const result = await executeOp(ops, 'record_feedback', {
        query: 'q',
        entryId: 'e',
        action: 'invalid',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid params');
    });
  });

  // ─── brain_feedback ────────────────────────────────────────────────

  describe('brain_feedback', () => {
    it('records enhanced feedback with all fields', async () => {
      const result = await executeOp(ops, 'brain_feedback', {
        query: 'design tokens',
        entryId: 'e-2',
        action: 'modified',
        source: 'search',
        confidence: 0.9,
        duration: 1200,
        context: '{}',
        reason: 'too verbose',
      });
      expect(result.success).toBe(true);
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      expect(brain.recordFeedback).toHaveBeenCalledWith({
        query: 'design tokens',
        entryId: 'e-2',
        action: 'modified',
        source: 'search',
        confidence: 0.9,
        duration: 1200,
        context: '{}',
        reason: 'too verbose',
      });
    });

    it('works with minimal required fields', async () => {
      const result = await executeOp(ops, 'brain_feedback', {
        query: 'q',
        entryId: 'e',
        action: 'failed',
      });
      expect(result.success).toBe(true);
    });

    it('accepts all 4 action types', async () => {
      const actions = ['accepted', 'dismissed', 'modified', 'failed'];
      const results = await Promise.all(
        actions.map((action) =>
          executeOp(ops, 'brain_feedback', { query: 'q', entryId: 'e', action }),
        ),
      );
      for (const [i, result] of results.entries()) {
        expect(result.success, `action ${actions[i]} should succeed`).toBe(true);
      }
    });
  });

  // ─── brain_feedback_stats ──────────────────────────────────────────

  describe('brain_feedback_stats', () => {
    it('returns feedback stats', async () => {
      const result = await executeOp(ops, 'brain_feedback_stats', {});
      expect(result.success).toBe(true);
      const data = result.data as { total: number; accepted: number };
      expect(data.total).toBe(5);
      expect(data.accepted).toBe(3);
    });
  });

  // ─── rebuild_vocabulary ────────────────────────────────────────────

  describe('rebuild_vocabulary', () => {
    it('rebuilds and returns size', async () => {
      const result = await executeOp(ops, 'rebuild_vocabulary', {});
      expect(result.success).toBe(true);
      const data = result.data as { rebuilt: boolean; vocabularySize: number };
      expect(data.rebuilt).toBe(true);
      expect(data.vocabularySize).toBe(42);
    });

    it('calls brain.rebuildVocabulary', async () => {
      await executeOp(ops, 'rebuild_vocabulary', {});
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      expect(brain.rebuildVocabulary).toHaveBeenCalledOnce();
    });
  });

  // ─── brain_stats ───────────────────────────────────────────────────

  describe('brain_stats', () => {
    it('merges brain and intelligence stats', async () => {
      const result = await executeOp(ops, 'brain_stats', {});
      expect(result.success).toBe(true);
      const data = result.data as {
        vocabularySize: number;
        intelligence: { pipelineRuns: number };
      };
      expect(data.vocabularySize).toBe(42);
      expect(data.intelligence.pipelineRuns).toBe(3);
    });
  });

  // ─── brain_decay_report ────────────────────────────────────────────

  describe('brain_decay_report', () => {
    it('returns decay report with defaults', async () => {
      const result = await executeOp(ops, 'brain_decay_report', { query: 'test' });
      expect(result.success).toBe(true);
      const data = result.data as { results: unknown[]; count: number };
      expect(data.count).toBe(1);
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      expect(brain.getDecayReport).toHaveBeenCalledWith('test', 10);
    });

    it('passes custom limit', async () => {
      await executeOp(ops, 'brain_decay_report', { query: 'test', limit: 5 });
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      expect(brain.getDecayReport).toHaveBeenCalledWith('test', 5);
    });
  });

  // ─── llm_status ────────────────────────────────────────────────────

  describe('llm_status', () => {
    it('returns provider availability and routes', async () => {
      const result = await executeOp(ops, 'llm_status', {});
      expect(result.success).toBe(true);
      const data = result.data as {
        providers: {
          openai: { available: boolean; keyPool: unknown };
          anthropic: { available: boolean; keyPool: unknown };
        };
        routes: unknown;
      };
      expect(data.providers.openai.available).toBe(true);
      expect(data.providers.openai.keyPool).toEqual({ active: 1, total: 2 });
      expect(data.providers.anthropic.available).toBe(false);
      expect(data.providers.anthropic.keyPool).toBeNull();
      expect(data.routes).toEqual({ enrichment: 'openai' });
    });
  });

  // ─── brain_session_context ─────────────────────────────────────────

  describe('brain_session_context', () => {
    it('uses default limit of 10', async () => {
      await executeOp(ops, 'brain_session_context', {});
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.getSessionContext).toHaveBeenCalledWith(10);
    });

    it('passes custom limit', async () => {
      await executeOp(ops, 'brain_session_context', { limit: 25 });
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.getSessionContext).toHaveBeenCalledWith(25);
    });
  });

  // ─── brain_strengths ───────────────────────────────────────────────

  describe('brain_strengths', () => {
    it('returns strengths with defaults', async () => {
      const result = await executeOp(ops, 'brain_strengths', {});
      expect(result.success).toBe(true);
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.getStrengths).toHaveBeenCalledWith({
        domain: undefined,
        minStrength: undefined,
        limit: 50,
      });
    });

    it('passes all filter params', async () => {
      await executeOp(ops, 'brain_strengths', {
        domain: 'design',
        minStrength: 60,
        limit: 10,
      });
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.getStrengths).toHaveBeenCalledWith({
        domain: 'design',
        minStrength: 60,
        limit: 10,
      });
    });
  });

  // ─── brain_global_patterns ─────────────────────────────────────────

  describe('brain_global_patterns', () => {
    it('defaults limit to 20', async () => {
      await executeOp(ops, 'brain_global_patterns', {});
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.getGlobalPatterns).toHaveBeenCalledWith(20);
    });

    it('passes custom limit', async () => {
      await executeOp(ops, 'brain_global_patterns', { limit: 5 });
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.getGlobalPatterns).toHaveBeenCalledWith(5);
    });
  });

  // ─── brain_recommend ───────────────────────────────────────────────

  describe('brain_recommend', () => {
    it('passes all params with defaults', async () => {
      const result = await executeOp(ops, 'brain_recommend', {
        domain: 'css',
        task: 'build button',
      });
      expect(result.success).toBe(true);
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.recommend).toHaveBeenCalledWith({
        domain: 'css',
        task: 'build button',
        source: undefined,
        limit: 5,
      });
    });
  });

  // ─── brain_build_intelligence ──────────────────────────────────────

  describe('brain_build_intelligence', () => {
    it('runs the full pipeline', async () => {
      const result = await executeOp(ops, 'brain_build_intelligence', {});
      expect(result.success).toBe(true);
      expect((result.data as { success: boolean }).success).toBe(true);
    });
  });

  // ─── brain_export / brain_import ───────────────────────────────────

  describe('brain_export', () => {
    it('returns exported data', async () => {
      const result = await executeOp(ops, 'brain_export', {});
      expect(result.success).toBe(true);
      const data = result.data as { strengths: unknown[] };
      expect(data.strengths).toEqual([]);
    });
  });

  describe('brain_import', () => {
    it('imports data', async () => {
      const importData = { strengths: [], sessions: [], proposals: [] };
      const result = await executeOp(ops, 'brain_import', { data: importData });
      expect(result.success).toBe(true);
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.importData).toHaveBeenCalledWith(importData);
    });
  });

  // ─── brain_extract_knowledge ───────────────────────────────────────

  describe('brain_extract_knowledge', () => {
    it('extracts from session', async () => {
      const result = await executeOp(ops, 'brain_extract_knowledge', {
        sessionId: 'sess-1',
      });
      expect(result.success).toBe(true);
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.extractKnowledge).toHaveBeenCalledWith('sess-1');
    });
  });

  // ─── brain_archive_sessions ────────────────────────────────────────

  describe('brain_archive_sessions', () => {
    it('defaults to 30 days', async () => {
      await executeOp(ops, 'brain_archive_sessions', {});
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.archiveSessions).toHaveBeenCalledWith(30);
    });

    it('passes custom days', async () => {
      await executeOp(ops, 'brain_archive_sessions', { olderThanDays: 7 });
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.archiveSessions).toHaveBeenCalledWith(7);
    });
  });

  // ─── brain_promote_proposals ───────────────────────────────────────

  describe('brain_promote_proposals', () => {
    it('promotes with governance and default project path', async () => {
      const result = await executeOp(ops, 'brain_promote_proposals', {
        proposalIds: ['p1', 'p2'],
      });
      expect(result.success).toBe(true);
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.promoteProposals).toHaveBeenCalledWith(['p1', 'p2'], runtime.governance, '.');
    });

    it('uses custom project path', async () => {
      await executeOp(ops, 'brain_promote_proposals', {
        proposalIds: ['p1'],
        projectPath: '/my/project',
      });
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.promoteProposals).toHaveBeenCalledWith(['p1'], runtime.governance, '/my/project');
    });
  });

  // ─── brain_lifecycle ───────────────────────────────────────────────

  describe('brain_lifecycle', () => {
    it('starts a session', async () => {
      const result = await executeOp(ops, 'brain_lifecycle', {
        action: 'start',
        domain: 'test',
      });
      expect(result.success).toBe(true);
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.lifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'start', domain: 'test' }),
      );
    });

    it('ends a session with all metadata', async () => {
      await executeOp(ops, 'brain_lifecycle', {
        action: 'end',
        sessionId: 's1',
        toolsUsed: ['search', 'capture'],
        filesModified: ['a.ts'],
        planId: 'plan-1',
        planOutcome: 'success',
      });
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.lifecycle).toHaveBeenCalledWith({
        action: 'end',
        sessionId: 's1',
        domain: undefined,
        context: undefined,
        toolsUsed: ['search', 'capture'],
        filesModified: ['a.ts'],
        planId: 'plan-1',
        planOutcome: 'success',
      });
    });
  });

  // ─── session_list ──────────────────────────────────────────────────

  describe('session_list', () => {
    it('returns sessions with default pagination', async () => {
      const result = await executeOp(ops, 'session_list', {});
      expect(result.success).toBe(true);
      const data = result.data as { sessions: unknown[]; count: number };
      expect(data.count).toBe(1);
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.listSessions).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50, offset: 0 }),
      );
    });

    it('passes all filter params', async () => {
      await executeOp(ops, 'session_list', {
        domain: 'design',
        active: true,
        extracted: false,
        limit: 10,
        offset: 5,
      });
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.listSessions).toHaveBeenCalledWith({
        domain: 'design',
        active: true,
        extracted: false,
        limit: 10,
        offset: 5,
      });
    });
  });

  // ─── session_get ───────────────────────────────────────────────────

  describe('session_get', () => {
    it('returns session by id', async () => {
      const result = await executeOp(ops, 'session_get', { sessionId: 'sess-1' });
      expect(result.success).toBe(true);
      expect((result.data as { id: string }).id).toBe('sess-1');
    });

    it('returns error when session not found', async () => {
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      bi.getSessionById.mockReturnValue(null);
      const result = await executeOp(ops, 'session_get', { sessionId: 'missing' });
      expect(result.success).toBe(true);
      expect((result.data as { error: string }).error).toBe('Session not found');
    });
  });

  // ─── session_quality ───────────────────────────────────────────────

  describe('session_quality', () => {
    it('computes quality score', async () => {
      const result = await executeOp(ops, 'session_quality', { sessionId: 'sess-1' });
      expect(result.success).toBe(true);
      expect((result.data as { score: number }).score).toBe(75);
    });
  });

  // ─── session_replay ────────────────────────────────────────────────

  describe('session_replay', () => {
    it('replays session', async () => {
      const result = await executeOp(ops, 'session_replay', { sessionId: 'sess-1' });
      expect(result.success).toBe(true);
      expect((result.data as { quality: number }).quality).toBe(75);
    });
  });

  // ─── brain_reset_extracted ─────────────────────────────────────────

  describe('brain_reset_extracted', () => {
    it('resets by session id', async () => {
      await executeOp(ops, 'brain_reset_extracted', { sessionId: 'sess-1' });
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.resetExtracted).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        since: undefined,
        all: undefined,
      });
    });

    it('resets all', async () => {
      await executeOp(ops, 'brain_reset_extracted', { all: true });
      const bi = runtime.brainIntelligence as ReturnType<typeof makeMockBrainIntelligence>;
      expect(bi.resetExtracted).toHaveBeenCalledWith({
        sessionId: undefined,
        since: undefined,
        all: true,
      });
    });
  });

  // ─── radar_analyze ─────────────────────────────────────────────────

  describe('radar_analyze', () => {
    it('analyzes a learning signal', async () => {
      const result = await executeOp(ops, 'radar_analyze', {
        type: 'correction',
        title: 'Token naming',
        description: 'Use semantic tokens over primitives',
      });
      expect(result.success).toBe(true);
      const data = result.data as { action: string; candidateId: number };
      expect(data.action).toBe('queued');
      expect(data.candidateId).toBe(1);
    });

    it('passes all optional fields', async () => {
      await executeOp(ops, 'radar_analyze', {
        type: 'search_miss',
        title: 't',
        description: 'd',
        suggestedType: 'anti-pattern',
        confidence: 0.95,
        sourceQuery: 'tokens',
        context: 'extra',
      });
      const radar = runtime.learningRadar as ReturnType<typeof makeMockLearningRadar>;
      expect(radar.analyze).toHaveBeenCalledWith({
        type: 'search_miss',
        title: 't',
        description: 'd',
        suggestedType: 'anti-pattern',
        confidence: 0.95,
        sourceQuery: 'tokens',
        context: 'extra',
      });
    });
  });

  // ─── radar_candidates ──────────────────────────────────────────────

  describe('radar_candidates', () => {
    it('returns candidates with default limit', async () => {
      const result = await executeOp(ops, 'radar_candidates', {});
      expect(result.success).toBe(true);
      const radar = runtime.learningRadar as ReturnType<typeof makeMockLearningRadar>;
      expect(radar.getCandidates).toHaveBeenCalledWith(20);
    });
  });

  // ─── radar_approve / radar_dismiss ─────────────────────────────────

  describe('radar_approve', () => {
    it('approves a candidate', async () => {
      const result = await executeOp(ops, 'radar_approve', { candidateId: 1 });
      expect(result.success).toBe(true);
      expect((result.data as { approved: boolean }).approved).toBe(true);
    });
  });

  describe('radar_dismiss', () => {
    it('dismisses a candidate', async () => {
      const result = await executeOp(ops, 'radar_dismiss', { candidateId: 1 });
      expect(result.success).toBe(true);
      expect((result.data as { dismissed: boolean }).dismissed).toBe(true);
    });
  });

  // ─── radar_flush ───────────────────────────────────────────────────

  describe('radar_flush', () => {
    it('flushes with default confidence', async () => {
      const result = await executeOp(ops, 'radar_flush', {});
      expect(result.success).toBe(true);
      const radar = runtime.learningRadar as ReturnType<typeof makeMockLearningRadar>;
      expect(radar.flush).toHaveBeenCalledWith(0.8);
    });

    it('uses custom confidence threshold', async () => {
      await executeOp(ops, 'radar_flush', { minConfidence: 0.5 });
      const radar = runtime.learningRadar as ReturnType<typeof makeMockLearningRadar>;
      expect(radar.flush).toHaveBeenCalledWith(0.5);
    });
  });

  // ─── radar_stats ───────────────────────────────────────────────────

  describe('radar_stats', () => {
    it('returns stats', async () => {
      const result = await executeOp(ops, 'radar_stats', {});
      expect(result.success).toBe(true);
      const data = result.data as { analyzed: number; captured: number };
      expect(data.analyzed).toBe(10);
      expect(data.captured).toBe(5);
    });
  });

  // ─── synthesize ────────────────────────────────────────────────────

  describe('synthesize', () => {
    it('synthesizes with all params', async () => {
      const result = await executeOp(ops, 'synthesize', {
        query: 'design tokens',
        format: 'brief',
        maxEntries: 5,
        audience: 'technical',
      });
      expect(result.success).toBe(true);
      const data = result.data as { content: string; coverageScore: number };
      expect(data.content).toBe('Synthesized output');
      expect(data.coverageScore).toBe(0.8);
    });

    it('uses default audience and maxEntries', async () => {
      await executeOp(ops, 'synthesize', {
        query: 'test',
        format: 'outline',
      });
      const synth = runtime.knowledgeSynthesizer as ReturnType<typeof makeMockKnowledgeSynthesizer>;
      expect(synth.synthesize).toHaveBeenCalledWith('test', {
        format: 'outline',
        maxEntries: 10,
        audience: 'general',
      });
    });

    it('rejects invalid format', async () => {
      const result = await executeOp(ops, 'synthesize', {
        query: 'test',
        format: 'invalid',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid params');
    });
  });
});
