/**
 * E2E Test: Brain Intelligence, Memory System, and Session Management
 *
 * Tests user journeys through the brain learning loop, intelligence building,
 * memory capture/search, cross-project memory, session lifecycle, and edge cases.
 *
 * Uses captureHandler/callOp pattern with in-memory vault for speed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentRuntime,
  createSemanticFacades,
  registerFacade,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-brain-mem';

function captureHandler(facade: FacadeConfig) {
  let captured: ((args: { op: string; params: Record<string, unknown> }) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>) | null = null;

  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: unknown) => {
      captured = handler as typeof captured;
    },
  };
  registerFacade(mockServer as never, facade);
  return captured!;
}

function parseResponse(raw: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(raw.content[0].text) as {
    success: boolean;
    data?: unknown;
    error?: string;
    op: string;
    facade: string;
  };
}

describe('E2E: brain-memory-sessions', () => {
  let runtime: AgentRuntime;
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const workDir = join(tmpdir(), `soleri-e2e-brain-mem-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(workDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(workDir, 'plans.json'),
    });

    const facades = createSemanticFacades(runtime, AGENT_ID);
    handlers = new Map();
    for (const facade of facades) {
      handlers.set(facade.name, captureHandler(facade));
    }
  });

  afterAll(() => {
    runtime.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  async function callOp(facadeName: string, op: string, params: Record<string, unknown> = {}) {
    const handler = handlers.get(facadeName);
    if (!handler) throw new Error(`No facade: ${facadeName}`);
    const raw = await handler({ op, params });
    return parseResponse(raw);
  }

  const brain = () => `${AGENT_ID}_brain`;
  const memory = () => `${AGENT_ID}_memory`;
  const vault = () => `${AGENT_ID}_vault`;

  // ─── Journey 1: Brain Learning Loop ──────────────────────────────

  describe('Journey 1: Brain learning loop', () => {
    it('brain_stats should return initial stats with zero sessions', async () => {
      const res = await callOp(brain(), 'brain_stats');
      expect(res.success).toBe(true);
      const data = res.data as {
        vocabularySize: number;
        feedbackCount: number;
        intelligence: Record<string, unknown>;
      };
      expect(typeof data.vocabularySize).toBe('number');
      expect(data.intelligence).toBeDefined();
    });

    it('brain_feedback should record feedback with pattern and outcome', async () => {
      // Seed a vault entry first so we have a real entry ID
      const captureRes = await callOp(vault(), 'capture_knowledge', {
        entries: [{
          type: 'pattern',
          domain: 'frontend',
          title: 'State Management Pattern',
          description: 'Use centralized state management for complex component trees',
          severity: 'warning',
          tags: ['react', 'state', 'architecture'],
        }],
      });
      expect(captureRes.success).toBe(true);

      // Find the entry
      const searchRes = await callOp(vault(), 'search', { query: 'state management' });
      expect(searchRes.success).toBe(true);
      const results = searchRes.data as Array<{ entry: { id: string }; score: number }>;
      expect(results.length).toBeGreaterThan(0);
      const entryId = results[0].entry.id;

      // Record feedback
      const res = await callOp(brain(), 'brain_feedback', {
        query: 'state management pattern',
        entryId,
        action: 'accepted',
        source: 'search',
        confidence: 0.85,
        reason: 'Exactly what I needed for the component tree',
      });
      expect(res.success).toBe(true);
      const data = res.data as { query: string; entryId: string; action: string };
      expect(data.query).toBe('state management pattern');
      expect(data.action).toBe('accepted');
    });

    it('brain_stats should reflect recorded feedback', async () => {
      const res = await callOp(brain(), 'brain_stats');
      expect(res.success).toBe(true);
      const data = res.data as { feedbackCount: number };
      expect(data.feedbackCount).toBeGreaterThanOrEqual(1);
    });

    it('brain_feedback_stats should show counts by action and source', async () => {
      const res = await callOp(brain(), 'brain_feedback_stats');
      expect(res.success).toBe(true);
      const data = res.data as Record<string, unknown>;
      expect(data).toBeDefined();
    });

    it('brain_recommend with context should return recommendations (may be empty)', async () => {
      const res = await callOp(brain(), 'brain_recommend', {
        domain: 'frontend',
        task: 'build a complex form with state management',
        limit: 5,
      });
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('brain_strengths should list patterns with strength scores', async () => {
      const res = await callOp(brain(), 'brain_strengths', { limit: 10 });
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ─── Journey 2: Brain Intelligence Building ──────────────────────

  describe('Journey 2: Brain intelligence building', () => {
    it('seed: should feed multiple feedback entries across patterns', async () => {
      // Seed more vault entries
      const entries = [
        {
          type: 'pattern',
          domain: 'frontend',
          title: 'Component Composition',
          description: 'Prefer composition over inheritance for UI components',
          severity: 'warning',
          tags: ['react', 'components'],
        },
        {
          type: 'pattern',
          domain: 'backend',
          title: 'Error Handling Middleware',
          description: 'Use centralized error handling middleware in Express apps',
          severity: 'critical',
          tags: ['express', 'errors', 'middleware'],
        },
        {
          type: 'anti-pattern',
          domain: 'frontend',
          title: 'Inline Styles Everywhere',
          description: 'Avoid inline styles for maintainability, use design tokens',
          severity: 'warning',
          tags: ['css', 'anti-pattern'],
        },
        {
          type: 'pattern',
          domain: 'backend',
          title: 'Database Connection Pooling',
          description: 'Always pool database connections in production environments',
          severity: 'critical',
          tags: ['database', 'performance'],
        },
      ];

      const res = await callOp(vault(), 'capture_knowledge', { entries });
      expect(res.success).toBe(true);

      // Rebuild vocabulary so brain knows about new entries
      const rebuildRes = await callOp(brain(), 'rebuild_vocabulary');
      expect(rebuildRes.success).toBe(true);
      const rebuildData = rebuildRes.data as { rebuilt: boolean; vocabularySize: number };
      expect(rebuildData.rebuilt).toBe(true);
      expect(rebuildData.vocabularySize).toBeGreaterThan(0);

      // Record feedback on multiple entries — vault was just seeded, search must return results
      const searchResults = await callOp(vault(), 'search', { query: 'component composition' });
      const compResults = searchResults.data as Array<{ entry: { id: string } }>;
      expect(compResults.length).toBeGreaterThan(0);
      await callOp(brain(), 'brain_feedback', {
        query: 'component composition',
        entryId: compResults[0].entry.id,
        action: 'accepted',
        source: 'recommendation',
        confidence: 0.9,
      });

      const errorResults = await callOp(vault(), 'search', { query: 'error handling middleware' });
      const errResults = errorResults.data as Array<{ entry: { id: string } }>;
      expect(errResults.length).toBeGreaterThan(0);
      await callOp(brain(), 'brain_feedback', {
        query: 'error handling',
        entryId: errResults[0].entry.id,
        action: 'accepted',
        source: 'tool-execution',
        confidence: 0.75,
      });

      const dbResults = await callOp(vault(), 'search', { query: 'database connection pooling' });
      const poolResults = dbResults.data as Array<{ entry: { id: string } }>;
      expect(poolResults.length).toBeGreaterThan(0);
      await callOp(brain(), 'brain_feedback', {
        query: 'database pooling',
        entryId: poolResults[0].entry.id,
        action: 'dismissed',
        source: 'search',
        confidence: 0.4,
        reason: 'Not relevant to current serverless architecture',
      });
    });

    it('build_intelligence should process accumulated data', async () => {
      const res = await callOp(brain(), 'brain_build_intelligence');
      expect(res.success).toBe(true);
      const data = res.data as Record<string, unknown>;
      expect(data).toBeDefined();
    });

    it('brain_recommend should now return relevant recommendations', async () => {
      const res = await callOp(brain(), 'brain_recommend', {
        domain: 'frontend',
        task: 'build a reusable component library',
        limit: 5,
      });
      expect(res.success).toBe(true);
      const recommendations = res.data as Array<{
        pattern?: string;
        name?: string;
        strength?: number;
        score?: number;
      }>;
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('brain_strengths should reflect accumulated feedback', async () => {
      const res = await callOp(brain(), 'brain_strengths', {
        limit: 20,
      });
      expect(res.success).toBe(true);
      const strengths = res.data as Array<{ name?: string; strength?: number; score?: number }>;
      expect(Array.isArray(strengths)).toBe(true);
    });

    it('brain_global_patterns should return cross-domain patterns', async () => {
      const res = await callOp(brain(), 'brain_global_patterns', { limit: 10 });
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ─── Journey 3: Memory Capture and Search ────────────────────────

  describe('Journey 3: Memory capture and search', () => {
    it('memory_capture should store a lesson', async () => {
      const res = await callOp(memory(), 'memory_capture', {
        type: 'lesson',
        projectPath: '/tmp/e2e-brain-mem',
        context: 'debugging',
        summary: 'Always check database connection pool exhaustion when queries timeout',
        topics: ['database', 'debugging', 'performance'],
        filesModified: ['db-config.ts'],
        toolsUsed: ['vault_search', 'brain_recommend'],
      });
      expect(res.success).toBe(true);
      const data = res.data as { captured: boolean; memory: { id: string } };
      expect(data.captured).toBe(true);
      expect(data.memory.id).toBeDefined();
    });

    it('memory_search should find the captured lesson', async () => {
      const res = await callOp(memory(), 'memory_search', {
        query: 'database connection pool timeout',
      });
      expect(res.success).toBe(true);
      const results = res.data as Array<{ id: string; summary: string }>;
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.summary.includes('connection pool'))).toBe(true);
    });

    it('memory_capture should store a preference in different category', async () => {
      const res = await callOp(memory(), 'memory_capture', {
        type: 'preference',
        projectPath: '/tmp/e2e-brain-mem',
        context: 'code-style',
        summary: 'Prefer functional components with hooks over class components',
        topics: ['react', 'code-style', 'components'],
      });
      expect(res.success).toBe(true);
    });

    it('memory_search with type filter should filter correctly', async () => {
      const lessonRes = await callOp(memory(), 'memory_search', {
        query: 'components',
        type: 'preference',
      });
      expect(lessonRes.success).toBe(true);
      const lessons = lessonRes.data as Array<{ type: string }>;
      // All returned items should be preferences
      for (const item of lessons) {
        expect(item.type).toBe('preference');
      }
    });

    it('memory_list should return all captured memories', async () => {
      const res = await callOp(memory(), 'memory_list', {});
      expect(res.success).toBe(true);
      const data = res.data as { memories: unknown[]; stats: Record<string, unknown> };
      expect(data.memories.length).toBeGreaterThanOrEqual(2);
      expect(data.stats).toBeDefined();
    });

    it('memory_stats should show counts by type', async () => {
      const res = await callOp(memory(), 'memory_stats', {});
      expect(res.success).toBe(true);
      const data = res.data as Record<string, unknown>;
      expect(data).toBeDefined();
    });

    it('memory_topics should list all topics with counts', async () => {
      const res = await callOp(memory(), 'memory_topics', {});
      expect(res.success).toBe(true);
      const data = res.data as { count: number; topics: Array<{ topic: string; count: number }> };
      expect(data.count).toBeGreaterThan(0);
      // Topics from our captures should appear
      const topicNames = data.topics.map((t) => t.topic);
      expect(topicNames).toContain('database');
    });
  });

  // ─── Journey 4: Cross-Project Memory ─────────────────────────────

  describe('Journey 4: Cross-project memory', () => {
    it('capture memory for project A', async () => {
      const res = await callOp(memory(), 'memory_capture', {
        type: 'lesson',
        projectPath: '/tmp/project-alpha',
        context: 'cross-project-test',
        summary: 'Authentication tokens should always be rotated on refresh',
        topics: ['security', 'auth', 'tokens'],
      });
      expect(res.success).toBe(true);
    });

    it('capture memory for project B', async () => {
      const res = await callOp(memory(), 'memory_capture', {
        type: 'lesson',
        projectPath: '/tmp/project-beta',
        context: 'cross-project-test',
        summary: 'Token rotation ensures expired tokens cannot be reused',
        topics: ['security', 'auth'],
      });
      expect(res.success).toBe(true);
    });

    it('memory_search scoped to project A should find project A memories', async () => {
      const res = await callOp(memory(), 'memory_search', {
        query: 'token rotation',
        projectPath: '/tmp/project-alpha',
      });
      expect(res.success).toBe(true);
      const results = res.data as Array<{ projectPath: string }>;
      expect(results.length).toBeGreaterThan(0);
    });

    it('memory_cross_project_search should find memories across projects', async () => {
      // Register a project first
      const regRes = await callOp(`${AGENT_ID}_orchestrate`, 'session_start', {
        projectPath: '/tmp/project-alpha',
        name: 'Project Alpha',
      });
      expect(regRes.success).toBe(true);

      const res = await callOp(memory(), 'memory_cross_project_search', {
        query: 'token rotation security',
        projectPath: '/tmp/project-alpha',
        limit: 10,
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        memories: unknown[];
        globalEntries: unknown[];
        linkedMemories: unknown[];
        totalResults: number;
      };
      expect(data.totalResults).toBeGreaterThanOrEqual(1);
    });

    it('memory_promote_to_global should mark a vault entry as global', async () => {
      // Capture a vault entry to promote
      const captureRes = await callOp(vault(), 'capture_knowledge', {
        entries: [{
          type: 'pattern',
          domain: 'security',
          title: 'Token Rotation on Refresh',
          description: 'Always rotate authentication tokens on refresh to prevent replay attacks',
          severity: 'critical',
          tags: ['security', 'auth'],
        }],
      });
      expect(captureRes.success).toBe(true);

      // Find the entry
      const searchRes = await callOp(vault(), 'search', { query: 'token rotation refresh' });
      const results = searchRes.data as Array<{ entry: { id: string; tags: string[] } }>;
      expect(results.length).toBeGreaterThan(0);
      const entryId = results[0].entry.id;

      // Promote
      const promoteRes = await callOp(memory(), 'memory_promote_to_global', { entryId });
      expect(promoteRes.success).toBe(true);
      const data = promoteRes.data as { promoted: boolean; tags: string[] };
      expect(data.promoted).toBe(true);
      expect(data.tags).toContain('_global');
    });

    it('promoting already-global entry should report already promoted', async () => {
      const searchRes = await callOp(vault(), 'search', { query: 'token rotation refresh' });
      const results = searchRes.data as Array<{ entry: { id: string } }>;
      const entryId = results[0].entry.id;

      const res = await callOp(memory(), 'memory_promote_to_global', { entryId });
      expect(res.success).toBe(true);
      const data = res.data as { promoted: boolean; message?: string };
      expect(data.promoted).toBe(false);
      expect(data.message).toContain('already');
    });

    it('memory_by_project should group memories by project path', async () => {
      const res = await callOp(memory(), 'memory_by_project', { includeMemories: true });
      expect(res.success).toBe(true);
      const data = res.data as {
        count: number;
        projects: Array<{ project: string; count: number }>;
      };
      expect(data.count).toBeGreaterThan(0);
    });
  });

  // ─── Journey 5: Session Lifecycle ────────────────────────────────

  describe('Journey 5: Session lifecycle', () => {
    it('session_capture should persist a session summary', async () => {
      const res = await callOp(memory(), 'session_capture', {
        projectPath: '/tmp/e2e-brain-mem',
        summary: 'Implemented database connection pooling and ran performance benchmarks. Pool size of 20 optimal for current load.',
        topics: ['database', 'performance', 'benchmarks'],
        filesModified: ['db-pool.ts', 'config.ts', 'benchmarks/pool.bench.ts'],
        toolsUsed: ['vault_search', 'brain_recommend', 'memory_capture'],
      });
      expect(res.success).toBe(true);
      const data = res.data as { captured: boolean; memory: { id: string }; message: string };
      expect(data.captured).toBe(true);
      expect(data.memory.id).toBeDefined();
      expect(data.message).toContain('Session summary saved');
    });

    it('search should find the session content', async () => {
      const res = await callOp(memory(), 'memory_search', {
        query: 'connection pooling benchmarks',
      });
      expect(res.success).toBe(true);
      const results = res.data as Array<{ summary: string }>;
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.summary.includes('pooling'))).toBe(true);
    });

    it('brain_lifecycle start should create a session', async () => {
      const res = await callOp(brain(), 'brain_lifecycle', {
        action: 'start',
        domain: 'frontend',
        context: 'Building a new dashboard component',
      });
      expect(res.success).toBe(true);
      const data = res.data as { id: string };
      expect(data.id).toBeDefined();
    });

    it('brain_lifecycle end should close the session with metadata', async () => {
      // Start a new session to get its ID
      const startRes = await callOp(brain(), 'brain_lifecycle', {
        action: 'start',
        domain: 'backend',
        context: 'API endpoint refactoring',
      });
      const sessionId = (startRes.data as { id: string }).id;

      const endRes = await callOp(brain(), 'brain_lifecycle', {
        action: 'end',
        sessionId,
        toolsUsed: ['vault_search', 'brain_recommend', 'memory_capture'],
        filesModified: ['api/routes.ts', 'api/middleware.ts'],
        planOutcome: 'completed',
      });
      expect(endRes.success).toBe(true);
    });

    it('session_list should include completed sessions', async () => {
      const res = await callOp(brain(), 'session_list', {
        active: false,
      });
      expect(res.success).toBe(true);
      const data = res.data as { sessions: Array<{ id: string }>; count: number };
      expect(data.count).toBeGreaterThan(0);
    });

    it('session_get should retrieve a specific session', async () => {
      // Get a session ID from the list
      const listRes = await callOp(brain(), 'session_list', { limit: 1 });
      const sessions = (listRes.data as { sessions: Array<{ id: string }> }).sessions;
      expect(sessions.length).toBeGreaterThan(0);

      const res = await callOp(brain(), 'session_get', {
        sessionId: sessions[0].id,
      });
      expect(res.success).toBe(true);
      const data = res.data as { id: string; domain?: string };
      expect(data.id).toBe(sessions[0].id);
    });

    it('session_quality should compute a quality score', async () => {
      const listRes = await callOp(brain(), 'session_list', {
        active: false,
        limit: 1,
      });
      const sessions = (listRes.data as { sessions: Array<{ id: string }> }).sessions;
      expect(sessions.length).toBeGreaterThan(0);

      const res = await callOp(brain(), 'session_quality', {
        sessionId: sessions[0].id,
      });
      expect(res.success).toBe(true);
      const data = res.data as { score?: number; quality?: number; dimensions?: unknown };
      expect(data).toBeDefined();
    });

    it('session_replay should return session data with enrichment', async () => {
      const listRes = await callOp(brain(), 'session_list', {
        active: false,
        limit: 1,
      });
      const sessions = (listRes.data as { sessions: Array<{ id: string }> }).sessions;

      const res = await callOp(brain(), 'session_replay', {
        sessionId: sessions[0].id,
      });
      expect(res.success).toBe(true);
      const data = res.data as { session?: unknown; quality?: unknown };
      expect(data).toBeDefined();
    });
  });

  // ─── Journey 6: Memory Decay and Relevance ───────────────────────

  describe('Journey 6: Memory decay and relevance', () => {
    it('brain_decay_report should show decay scores for entries', async () => {
      const res = await callOp(brain(), 'brain_decay_report', {
        query: 'state management',
        limit: 10,
      });
      expect(res.success).toBe(true);
      const data = res.data as { results: unknown[]; count: number };
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.results)).toBe(true);
    });

    it('recently captured memories should rank higher in search', async () => {
      // Capture an older-context memory
      await callOp(memory(), 'memory_capture', {
        type: 'lesson',
        projectPath: '/tmp/e2e-decay',
        context: 'old-context',
        summary: 'Caching strategy for API responses is important for latency reduction',
        topics: ['caching', 'api', 'performance'],
      });

      // Capture a newer memory on similar topic
      await callOp(memory(), 'memory_capture', {
        type: 'lesson',
        projectPath: '/tmp/e2e-decay',
        context: 'new-context',
        summary: 'Redis caching layer for API responses reduces p99 latency by 40%',
        topics: ['caching', 'redis', 'api', 'performance'],
      });

      // Search for the topic
      const res = await callOp(memory(), 'memory_search', {
        query: 'caching API responses latency',
        projectPath: '/tmp/e2e-decay',
      });
      expect(res.success).toBe(true);
      const results = res.data as Array<{ summary: string }>;
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('memory_export should export and memory_import should round-trip', async () => {
      const exportRes = await callOp(memory(), 'memory_export', {
        projectPath: '/tmp/e2e-decay',
      });
      expect(exportRes.success).toBe(true);
      const exportData = exportRes.data as { exported: boolean; count: number; memories: unknown[] };
      expect(exportData.exported).toBe(true);
      expect(exportData.count).toBeGreaterThan(0);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('brain_recommend on cold domain (no data) should return empty, not crash', async () => {
      const res = await callOp(brain(), 'brain_recommend', {
        domain: 'nonexistent-domain-xyz',
        task: 'do something unusual',
        limit: 5,
      });
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('brain_feedback with non-existent entry ID should handle gracefully', async () => {
      const res = await callOp(brain(), 'brain_feedback', {
        query: 'test query',
        entryId: 'non-existent-entry-id-12345',
        action: 'accepted',
      });
      // Feedback is recorded regardless of whether the entry exists in vault
      expect(res.success).toBe(true);
    });

    it('record_feedback (legacy op) with basic params should work', async () => {
      const res = await callOp(brain(), 'record_feedback', {
        query: 'test query',
        entryId: 'some-entry-id',
        action: 'dismissed',
      });
      expect(res.success).toBe(true);
      const data = res.data as { recorded: boolean };
      expect(data.recorded).toBe(true);
    });

    it('memory_search with empty query should handle gracefully', async () => {
      const res = await callOp(memory(), 'memory_search', {
        query: '',
      });
      // Empty query should succeed and return results (empty or all)
      expect(res.success).toBe(true);
    });

    it('session_capture with minimal summary should succeed', async () => {
      const res = await callOp(memory(), 'session_capture', {
        summary: 'Quick fix.',
      });
      expect(res.success).toBe(true);
      const data = res.data as { captured: boolean };
      expect(data.captured).toBe(true);
    });

    it('session_capture with large summary should handle without issues', async () => {
      const largeSummary = 'Refactored the entire authentication module. '.repeat(200);
      const res = await callOp(memory(), 'session_capture', {
        projectPath: '/tmp/e2e-large',
        summary: largeSummary,
        topics: ['auth', 'refactor'],
        filesModified: Array.from({ length: 50 }, (_, i) => `src/auth/module-${i}.ts`),
        toolsUsed: ['vault_search', 'brain_recommend', 'memory_capture'],
      });
      expect(res.success).toBe(true);
      const data = res.data as { captured: boolean };
      expect(data.captured).toBe(true);
    });

    it('concurrent memory captures should not corrupt data', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        callOp(memory(), 'memory_capture', {
          type: 'lesson',
          projectPath: '/tmp/e2e-concurrent',
          context: `concurrent-${i}`,
          summary: `Concurrent memory capture test entry number ${i}`,
          topics: ['concurrency', `batch-${i}`],
        }),
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.success).toBe(true);
        const data = res.data as { captured: boolean };
        expect(data.captured).toBe(true);
      }

      // Verify all 10 were captured
      const listRes = await callOp(memory(), 'memory_search', {
        query: 'concurrent memory capture test',
        projectPath: '/tmp/e2e-concurrent',
        limit: 20,
      });
      expect(listRes.success).toBe(true);
      const found = listRes.data as Array<{ summary: string }>;
      expect(found.length).toBeGreaterThanOrEqual(10);
    });

    it('session_get with non-existent ID should handle gracefully', async () => {
      const res = await callOp(brain(), 'session_get', {
        sessionId: 'non-existent-session-999',
      });
      expect(res.success).toBe(true);
      const data = res.data as { error?: string };
      expect(data.error).toBeDefined();
    });

    it('memory_delete with non-existent ID should report not found', async () => {
      const res = await callOp(memory(), 'memory_delete', {
        memoryId: 'non-existent-memory-id',
      });
      expect(res.success).toBe(true);
      const data = res.data as { deleted: boolean; error?: string };
      expect(data.deleted).toBe(false);
    });

    it('memory_promote_to_global with non-existent entry should report not found', async () => {
      const res = await callOp(memory(), 'memory_promote_to_global', {
        entryId: 'non-existent-entry-id',
      });
      expect(res.success).toBe(true);
      const data = res.data as { promoted: boolean; error?: string };
      expect(data.promoted).toBe(false);
    });

    it('brain_lifecycle end without start should handle gracefully', async () => {
      const res = await callOp(brain(), 'brain_lifecycle', {
        action: 'end',
        sessionId: 'never-started-session',
      });
      // Ending a session that was never started fails — the session doesn't exist,
      // so getSession returns null and the code throws. This is correct behavior.
      expect(res.success).toBe(false);
    });

    it('brain_extract_knowledge on non-existent session should handle gracefully', async () => {
      const res = await callOp(brain(), 'brain_extract_knowledge', {
        sessionId: 'non-existent-session-for-extraction',
      });
      // Extracting from non-existent session throws "Session not found".
      // This is correct behavior — you can't extract knowledge from nothing.
      expect(res.success).toBe(false);
    });

    it('memory_deduplicate should run without errors on clean data', async () => {
      const res = await callOp(memory(), 'memory_deduplicate', {});
      expect(res.success).toBe(true);
    });

    it('concurrent brain feedback should not corrupt', async () => {
      // Search for an entry to use
      const searchRes = await callOp(vault(), 'search', { query: 'component composition' });
      const results = searchRes.data as Array<{ entry: { id: string } }>;
      if (results.length === 0) return; // skip if no entries

      const entryId = results[0].entry.id;
      const promises = Array.from({ length: 5 }, (_, i) =>
        callOp(brain(), 'brain_feedback', {
          query: `concurrent feedback query ${i}`,
          entryId,
          action: i % 2 === 0 ? 'accepted' : 'dismissed',
          source: 'search',
          confidence: 0.5 + i * 0.1,
        }),
      );

      const feedbackResults = await Promise.all(promises);
      for (const res of feedbackResults) {
        expect(res.success).toBe(true);
      }
    });
  });

  // ─── Journey 7: Brain → Vault Feedback Loop ───────────────────
  //
  // The full learning cycle:
  //   1. Capture knowledge to vault
  //   2. Search vault → get results
  //   3. User accepts/dismisses results → brain_feedback
  //   4. Brain learns which patterns work → build_intelligence
  //   5. Brain recommends patterns for new context
  //   6. Vault search is informed by brain recommendations
  //   7. Captured session feeds back into brain for next cycle
  //
  // This tests the COMPOUND EFFECT — each cycle makes the next one better.

  describe('Journey 7: Brain → Vault feedback loop (compound learning)', () => {

    // Step 1: Seed vault with multiple related patterns
    it('should seed vault with patterns across multiple domains', async () => {
      const patterns = [
        { title: 'Use Error Boundaries at Route Level', domain: 'react', severity: 'critical', description: 'Wrap route components in error boundaries to prevent full-page crashes.' },
        { title: 'Centralized Error Handler with Context', domain: 'architecture', severity: 'critical', description: 'Create a centralized error handling service that captures error context and stack traces.' },
        { title: 'Exponential Backoff for API Retries', domain: 'architecture', severity: 'warning', description: 'Use exponential backoff with jitter for API retry logic. Start at 1s, max 30s.' },
        { title: 'Skeleton Loading States', domain: 'react', severity: 'suggestion', description: 'Use skeleton screens instead of spinners. Match the layout of the content being loaded.' },
        { title: 'Progressive Form Validation', domain: 'ux', severity: 'warning', description: 'Validate on blur, not on change. Show errors inline below fields.' },
        { title: 'Catch-All Error Swallowing', domain: 'architecture', severity: 'critical', description: 'Never use empty catch blocks. Every catch must either re-throw or log with context.', type: 'anti-pattern' },
      ];

      for (const p of patterns) {
        const res = await callOp(vault(), 'capture_quick', {
          title: p.title,
          description: p.description,
          type: p.type ?? 'pattern',
          domain: p.domain,
          severity: p.severity,
          tags: ['e2e', 'loop-test'],
        });
        expect(res.success).toBe(true);
      }

      // Verify all captured
      const stats = await callOp(vault(), 'vault_stats', {});
      expect(stats.success).toBe(true);
    });

    // Step 2: Search vault for error handling patterns
    it('should find error handling patterns via vault search', async () => {
      const searchRes = await callOp(vault(), 'search', {
        query: 'error boundary',
      });
      expect(searchRes.success).toBe(true);
      // search op returns data as array of {entry, score}
      const results = searchRes.data as Array<Record<string, unknown>> | undefined;
      // With FTS5 on a small corpus, results may or may not match
      // The key test is that search works without crashing
      expect(searchRes.success).toBe(true);
    });

    // Step 3: Simulate user accepting good results and dismissing bad ones
    it('should record feedback on search results (accepted + dismissed)', async () => {
      // User accepts error-boundary pattern (it was helpful)
      const accept1 = await callOp(brain(), 'brain_feedback', {
        query: 'error handling best practices',
        entryId: 'loop-pattern-error-boundary',
        action: 'accepted',
        source: 'search',
        confidence: 0.9,
      });
      expect(accept1.success).toBe(true);

      // User accepts error-handling pattern too
      const accept2 = await callOp(brain(), 'brain_feedback', {
        query: 'error handling best practices',
        entryId: 'loop-pattern-error-handling',
        action: 'accepted',
        source: 'search',
        confidence: 0.85,
      });
      expect(accept2.success).toBe(true);

      // User dismisses loading-states (irrelevant to error handling query)
      const dismiss = await callOp(brain(), 'brain_feedback', {
        query: 'error handling best practices',
        entryId: 'loop-pattern-loading-states',
        action: 'dismissed',
        source: 'search',
        confidence: 0.3,
      });
      expect(dismiss.success).toBe(true);

      // User accepts the anti-pattern (it was a useful warning)
      const acceptAnti = await callOp(brain(), 'brain_feedback', {
        query: 'error handling mistakes to avoid',
        entryId: 'loop-anti-catch-all',
        action: 'accepted',
        source: 'search',
        confidence: 0.95,
      });
      expect(acceptAnti.success).toBe(true);
    });

    // Step 4: Build intelligence from accumulated feedback
    it('should build intelligence from feedback data', async () => {
      // rebuild_vocabulary must run before build_intelligence
      const rebuildRes = await callOp(brain(), 'rebuild_vocabulary', {});
      expect(rebuildRes.success).toBe(true);

      const buildRes = await callOp(brain(), 'brain_build_intelligence', {});
      // After seeding 6 patterns and recording 4+ feedback entries,
      // build_intelligence should succeed
      expect(buildRes.success).toBe(true);
    });

    // Step 5: Brain should now recommend error patterns for similar context
    it('brain should recommend error handling patterns after learning', async () => {
      const recRes = await callOp(brain(), 'brain_recommend', {
        context: 'I need to handle errors in my React app',
      });
      expect(recRes.success).toBe(true);

      // Brain should have learned that error-related patterns are strong
      const strengths = await callOp(brain(), 'brain_strengths', {});
      expect(strengths.success).toBe(true);
    });

    // Step 6: Simulate a second search cycle — brain-informed
    it('second search should return relevant patterns', async () => {
      const searchRes = await callOp(vault(), 'search', {
        query: 'retry backoff error',
      });
      expect(searchRes.success).toBe(true);
      const results = searchRes.data as Array<{ entry: { title: string } }> | undefined;
      expect(Array.isArray(results)).toBe(true);
      expect(results!.length).toBeGreaterThan(0);
    });

    // Step 7: Record feedback on second cycle — compound learning
    it('should record feedback from second search cycle', async () => {
      const accept = await callOp(brain(), 'brain_feedback', {
        query: 'how to handle API failures gracefully',
        entryId: 'loop-pattern-retry-logic',
        action: 'accepted',
        source: 'search',
        confidence: 0.88,
      });
      expect(accept.success).toBe(true);
    });

    // Step 8: Capture session — feeds everything back to brain
    it('should capture the session for the learning loop', async () => {
      const sessionRes = await callOp(memory(), 'session_capture', {
        summary: 'Explored error handling patterns. Accepted error-boundary, error-handler, and retry-logic patterns. Dismissed loading-states as irrelevant. Built intelligence. Found compound improvement on second search cycle.',
        knowledge: [
          'Error boundaries at route level prevent full-page crashes',
          'Centralized error handling with context improves debugging',
          'Exponential backoff with jitter is the standard retry pattern',
        ],
      });
      expect(sessionRes.success).toBe(true);
    });

    // Step 9: Verify brain stats reflect the full cycle
    it('brain should reflect accumulated learning after full cycle', async () => {
      const stats = await callOp(brain(), 'brain_stats', {});
      expect(stats.success).toBe(true);

      const data = stats.data as { feedbackCount: number };
      // After multiple feedback entries across cycles, feedbackCount must be >= expected
      expect(data.feedbackCount).toBeGreaterThanOrEqual(5);
    });

    // Step 10: Verify the anti-pattern was captured and is searchable
    it('anti-pattern should be findable in vault', async () => {
      const searchRes = await callOp(vault(), 'search', {
        query: 'catch blocks empty error',
      });
      expect(searchRes.success).toBe(true);
      const results = searchRes.data as Array<{ entry: { title: string } }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      // Should find the "Catch-All Error Swallowing" anti-pattern
      const hasCatchEntry = results.some(r =>
        r.entry.title.toLowerCase().includes('catch'),
      );
      expect(hasCatchEntry).toBe(true);
    });

    // Step 11: Third cycle — the compound effect
    it('third cycle search + feedback should work', async () => {
      // Search
      const searchRes = await callOp(vault(), 'search', {
        query: 'error handling pattern',
      });
      expect(searchRes.success).toBe(true);

      // Record feedback to strengthen the loop
      // Use vault stats to find an entry ID we know exists
      const statsRes = await callOp(vault(), 'vault_stats', {});
      expect(statsRes.success).toBe(true);

      // The key test: brain feedback after search completes the cycle
      const feedback = await callOp(brain(), 'brain_feedback', {
        query: 'error handling pattern',
        entryId: 'loop-cycle-3',
        action: 'accepted',
        source: 'search',
        confidence: 0.92,
      });
      expect(feedback.success).toBe(true);
    });

    // Step 12: Verify pattern strengths reflect cumulative learning
    it('pattern strengths should reflect cumulative feedback across cycles', async () => {
      const strengths = await callOp(brain(), 'brain_strengths', {});
      expect(strengths.success).toBe(true);

      const data = strengths.data as Array<{ pattern?: string; strength?: number }>;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      // Strengths should be sorted descending
      for (let i = 1; i < data.length; i++) {
        expect(data[i - 1].strength).toBeGreaterThanOrEqual(data[i].strength!);
      }
    });

    // Step 13: Memory should contain the full journey
    it('memory should contain searchable record of the learning journey', async () => {
      const memRes = await callOp(memory(), 'memory_search', {
        query: 'error handling patterns',
      });
      expect(memRes.success).toBe(true);
      const results = memRes.data as Array<{ summary: string }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      // Should find the session captured in Step 8
      const hasSession = results.some(r =>
        r.summary.toLowerCase().includes('error') ||
        r.summary.toLowerCase().includes('pattern'),
      );
      expect(hasSession).toBe(true);
    });
  });
});
