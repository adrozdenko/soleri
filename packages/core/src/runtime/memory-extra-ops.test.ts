import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryExtraOps } from './memory-extra-ops.js';
import type { AgentRuntime } from './types.js';

// ---------------------------------------------------------------------------
// Mock runtime factory
// ---------------------------------------------------------------------------

function mockRuntime(): AgentRuntime {
  return {
    vault: {
      getMemory: vi.fn(),
      deleteMemory: vi.fn(),
      memoryStatsDetailed: vi.fn(),
      exportMemories: vi.fn(),
      importMemories: vi.fn(),
      pruneMemories: vi.fn(),
      deduplicateMemories: vi.fn(),
      memoryTopics: vi.fn(),
      memoriesByProject: vi.fn(),
      searchMemories: vi.fn(),
      getProvider: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      }),
      stats: vi.fn().mockReturnValue({
        totalEntries: 10,
        byType: { pattern: 5, 'anti-pattern': 5 },
        byDomain: { general: 10 },
      }),
      get: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      getAgeReport: vi.fn().mockReturnValue([]),
      memoryStats: vi.fn().mockReturnValue({}),
    },
    brain: {
      getStats: vi.fn().mockReturnValue({ vocabularySize: 100, feedbackCount: 5 }),
      enrichAndCapture: vi.fn().mockReturnValue({ id: 'captured-id', captured: true }),
    },
    curator: {
      healthAudit: vi.fn().mockReturnValue({ score: 80, metrics: {}, recommendations: [] }),
      getStatus: vi.fn().mockReturnValue({ initialized: true }),
      detectContradictions: vi.fn().mockReturnValue([]),
    },
    linkManager: {
      getLinks: vi.fn().mockReturnValue([]),
      addLink: vi.fn(),
    },
  } as unknown as AgentRuntime;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findOp(ops: ReturnType<typeof createMemoryExtraOps>, name: string) {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMemoryExtraOps', () => {
  let rt: AgentRuntime;
  let ops: ReturnType<typeof createMemoryExtraOps>;

  beforeEach(() => {
    rt = mockRuntime();
    ops = createMemoryExtraOps(rt);
  });

  // ─── memory_delete ────────────────────────────────────────────

  describe('memory_delete', () => {
    it('returns error when no id provided', async () => {
      const op = findOp(ops, 'memory_delete');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.deleted).toBe(false);
      expect(result.error).toContain('required');
    });

    it('returns error when memory not found', async () => {
      const op = findOp(ops, 'memory_delete');
      vi.mocked(rt.vault.getMemory).mockReturnValue(undefined as never);
      const result = (await op.handler({ memoryId: 'no-exist' })) as Record<string, unknown>;
      expect(result.deleted).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('deletes existing memory by memoryId', async () => {
      const op = findOp(ops, 'memory_delete');
      vi.mocked(rt.vault.getMemory).mockReturnValue({ id: 'm1' } as never);
      vi.mocked(rt.vault.deleteMemory).mockReturnValue(true as never);
      const result = (await op.handler({ memoryId: 'm1' })) as Record<string, unknown>;
      expect(result.deleted).toBe(true);
      expect(result.memoryId).toBe('m1');
    });

    it('accepts id alias', async () => {
      const op = findOp(ops, 'memory_delete');
      vi.mocked(rt.vault.getMemory).mockReturnValue({ id: 'm2' } as never);
      vi.mocked(rt.vault.deleteMemory).mockReturnValue(true as never);
      const result = (await op.handler({ id: 'm2' })) as Record<string, unknown>;
      expect(result.deleted).toBe(true);
    });
  });

  // ─── memory_stats ─────────────────────────────────────────────

  describe('memory_stats', () => {
    it('delegates to vault.memoryStatsDetailed', async () => {
      const op = findOp(ops, 'memory_stats');
      vi.mocked(rt.vault.memoryStatsDetailed).mockReturnValue({ count: 42 } as never);
      const result = await op.handler({ projectPath: '/test' });
      expect(rt.vault.memoryStatsDetailed).toHaveBeenCalledWith({
        projectPath: '/test',
        fromDate: undefined,
        toDate: undefined,
      });
      expect(result).toEqual({ count: 42 });
    });
  });

  // ─── memory_export ────────────────────────────────────────────

  describe('memory_export', () => {
    it('returns exported memories with count', async () => {
      const op = findOp(ops, 'memory_export');
      vi.mocked(rt.vault.exportMemories).mockReturnValue([{ id: 'm1' }] as never);
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.exported).toBe(true);
      expect(result.count).toBe(1);
    });
  });

  // ─── memory_import ────────────────────────────────────────────

  describe('memory_import', () => {
    it('passes memories to vault and returns totals', async () => {
      const op = findOp(ops, 'memory_import');
      vi.mocked(rt.vault.importMemories).mockReturnValue({ imported: 1, skipped: 0 } as never);
      const memories = [
        {
          id: 'm1',
          projectPath: '.',
          type: 'session',
          context: 'ctx',
          summary: 'sum',
          topics: [],
          filesModified: [],
          toolsUsed: [],
          createdAt: Date.now(),
          archivedAt: null,
        },
      ];
      const result = (await op.handler({ memories })) as Record<string, unknown>;
      expect(result.imported).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  // ─── memory_prune ─────────────────────────────────────────────

  describe('memory_prune', () => {
    it('delegates to vault.pruneMemories with correct days', async () => {
      const op = findOp(ops, 'memory_prune');
      vi.mocked(rt.vault.pruneMemories).mockReturnValue({ deleted: 3 } as never);
      const result = (await op.handler({ olderThanDays: 30 })) as Record<string, unknown>;
      expect(rt.vault.pruneMemories).toHaveBeenCalledWith(30);
      expect(result.olderThanDays).toBe(30);
    });
  });

  // ─── memory_deduplicate ───────────────────────────────────────

  describe('memory_deduplicate', () => {
    it('delegates to vault.deduplicateMemories', async () => {
      const op = findOp(ops, 'memory_deduplicate');
      vi.mocked(rt.vault.deduplicateMemories).mockReturnValue({ removed: 2 } as never);
      const result = await op.handler({});
      expect(result).toEqual({ removed: 2 });
    });
  });

  // ─── memory_topics ────────────────────────────────────────────

  describe('memory_topics', () => {
    it('returns topics with count', async () => {
      const op = findOp(ops, 'memory_topics');
      vi.mocked(rt.vault.memoryTopics).mockReturnValue([{ topic: 'a', count: 5 }] as never);
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.count).toBe(1);
    });
  });

  // ─── memory_by_project ────────────────────────────────────────

  describe('memory_by_project', () => {
    it('includes memories when includeMemories is true', async () => {
      const op = findOp(ops, 'memory_by_project');
      vi.mocked(rt.vault.memoriesByProject).mockReturnValue([
        { project: '/a', count: 2, memories: [] },
      ] as never);
      const result = (await op.handler({ includeMemories: true })) as Record<string, unknown>;
      expect(result.count).toBe(1);
      expect((result.projects as Array<{ project: string }>)[0].project).toBe('/a');
    });

    it('excludes memories when includeMemories is false', async () => {
      const op = findOp(ops, 'memory_by_project');
      vi.mocked(rt.vault.memoriesByProject).mockReturnValue([
        { project: '/a', count: 2, memories: [{}] },
      ] as never);
      const result = (await op.handler({ includeMemories: false })) as Record<string, unknown>;
      const projects = result.projects as Array<Record<string, unknown>>;
      expect(projects[0]).not.toHaveProperty('memories');
    });
  });

  // ─── memory_get ───────────────────────────────────────────────

  describe('memory_get', () => {
    it('returns found: false when memory not found', async () => {
      const op = findOp(ops, 'memory_get');
      vi.mocked(rt.vault.getMemory).mockReturnValue(undefined as never);
      const result = (await op.handler({ id: 'gone' })) as Record<string, unknown>;
      expect(result.found).toBe(false);
    });

    it('returns the memory when found', async () => {
      const op = findOp(ops, 'memory_get');
      vi.mocked(rt.vault.getMemory).mockReturnValue({ id: 'm1', summary: 'test' } as never);
      const result = (await op.handler({ id: 'm1' })) as Record<string, unknown>;
      expect(result.id).toBe('m1');
    });
  });

  // ─── session_search ───────────────────────────────────────────

  describe('session_search', () => {
    it('returns results without archived by default', async () => {
      const op = findOp(ops, 'session_search');
      vi.mocked(rt.vault.searchMemories).mockReturnValue([{ id: 's1' }] as never);
      const result = (await op.handler({ query: 'test', limit: 10 })) as { results: unknown[] };
      expect(result.results).toHaveLength(1); // mock returns exactly one session result
    });

    it('includes archived when includeArchived is true', async () => {
      const op = findOp(ops, 'session_search');
      vi.mocked(rt.vault.searchMemories).mockReturnValue([{ id: 's1' }] as never);
      vi.mocked(rt.vault.getProvider().all).mockReturnValue([
        { id: 'a1', summary: 'archived', intent: null, created_at: 100 },
      ] as never);
      const result = (await op.handler({
        query: 'test',
        includeArchived: true,
        limit: 10,
      })) as Record<string, unknown>;
      expect((result as { active: unknown[] }).active).toHaveLength(1); // mock searchMemories returns 1
      expect((result as { archived: unknown[] }).archived).toHaveLength(1); // mock provider.all returns 1
    });
  });

  // ─── knowledge_audit ──────────────────────────────────────────

  describe('knowledge_audit', () => {
    it('returns vault, health, and brain data', async () => {
      const op = findOp(ops, 'knowledge_audit');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result).toHaveProperty('vault');
      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('brain');
    });
  });

  // ─── smart_capture ────────────────────────────────────────────

  describe('smart_capture', () => {
    it('infers anti-pattern type from description', async () => {
      const op = findOp(ops, 'smart_capture');
      const result = (await op.handler({
        title: 'Bad pattern',
        description: 'Never use console.log in production',
      })) as Record<string, unknown>;
      const inferred = result.inferred as { type: string; severity: string };
      expect(inferred.type).toBe('anti-pattern');
    });

    it('infers pattern type for positive descriptions', async () => {
      const op = findOp(ops, 'smart_capture');
      const result = (await op.handler({
        title: 'Good pattern',
        description: 'Use structured logging for better observability',
      })) as Record<string, unknown>;
      const inferred = result.inferred as { type: string; severity: string };
      expect(inferred.type).toBe('pattern');
      expect(inferred.severity).toBe('suggestion');
    });

    it('infers critical severity from must/critical keywords', async () => {
      const op = findOp(ops, 'smart_capture');
      const result = (await op.handler({
        title: 'Critical rule',
        description: 'You must always validate inputs',
      })) as Record<string, unknown>;
      const inferred = result.inferred as { type: string; severity: string };
      expect(inferred.severity).toBe('critical');
    });

    it('infers warning severity from should/important keywords', async () => {
      const op = findOp(ops, 'smart_capture');
      const result = (await op.handler({
        title: 'Important guideline',
        description: 'You should handle edge cases',
      })) as Record<string, unknown>;
      const inferred = result.inferred as { type: string; severity: string };
      expect(inferred.severity).toBe('warning');
    });
  });

  // ─── knowledge_health ─────────────────────────────────────────

  describe('knowledge_health', () => {
    it('returns score, metrics, and recommendations', async () => {
      const op = findOp(ops, 'knowledge_health');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('recommendations');
    });
  });

  // ─── merge_patterns ───────────────────────────────────────────

  describe('merge_patterns', () => {
    it('returns error when keepId not found', async () => {
      const op = findOp(ops, 'merge_patterns');
      vi.mocked(rt.vault.get).mockReturnValue(undefined as never);
      const result = (await op.handler({
        keepId: 'missing',
        removeId: 'other',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });

    it('merges tags and removes the second entry', async () => {
      const op = findOp(ops, 'merge_patterns');
      vi.mocked(rt.vault.get)
        .mockReturnValueOnce({
          id: 'k1',
          title: 'Keep',
          tags: ['a'],
          description: 'Keep desc',
        } as never)
        .mockReturnValueOnce({
          id: 'r1',
          title: 'Remove',
          tags: ['b'],
          description: 'Remove desc',
        } as never);
      const result = (await op.handler({
        keepId: 'k1',
        removeId: 'r1',
      })) as Record<string, unknown>;
      expect(result.merged).toBe(true);
      expect(result.mergedTags).toEqual(['a', 'b']);
      expect(rt.vault.remove).toHaveBeenCalledWith('r1');
    });
  });

  // ─── knowledge_reorganize ─────────────────────────────────────

  describe('knowledge_reorganize', () => {
    it('returns dry run preview by default', async () => {
      const op = findOp(ops, 'knowledge_reorganize');
      vi.mocked(rt.vault.list).mockReturnValue([
        { id: 'e1', domain: 'old', title: 'Entry 1', tags: [] },
      ] as never);
      const result = (await op.handler({
        fromDomain: 'old',
        toDomain: 'new',
        dryRun: true,
      })) as Record<string, unknown>;
      expect(result.dryRun).toBe(true);
      expect(result.affected).toBe(1);
    });

    it('applies changes when dryRun is false', async () => {
      const op = findOp(ops, 'knowledge_reorganize');
      vi.mocked(rt.vault.list).mockReturnValue([
        { id: 'e1', domain: 'old', title: 'Entry 1', tags: ['t1'] },
      ] as never);
      const result = (await op.handler({
        fromDomain: 'old',
        toDomain: 'new',
        dryRun: false,
        addTags: ['new-tag'],
        removeTags: ['t1'],
      })) as Record<string, unknown>;
      expect(result.applied).toBe(true);
      expect(result.updated).toBe(1);
      expect(rt.vault.update).toHaveBeenCalled();
    });
  });

  // ─── list_project_knowledge ───────────────────────────────────

  describe('list_project_knowledge', () => {
    it('filters entries by tier or origin', async () => {
      const op = findOp(ops, 'list_project_knowledge');
      vi.mocked(rt.vault.list).mockReturnValue([
        { id: 'e1', tier: 'project', title: 'T', type: 'pattern', domain: 'd', origin: 'seed' },
        { id: 'e2', tier: 'agent', title: 'T2', type: 'rule', domain: 'd', origin: 'user' },
      ] as never);
      const result = (await op.handler({ project: 'test' })) as Record<string, unknown>;
      expect(result.count).toBe(2);
    });
  });

  // ─── list_projects ────────────────────────────────────────────

  describe('list_projects', () => {
    it('returns domains and types from vault stats', async () => {
      const op = findOp(ops, 'list_projects');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result).toHaveProperty('domains');
      expect(result).toHaveProperty('types');
      expect(result.total).toBe(10);
    });
  });

  // ─── knowledge_debug ──────────────────────────────────────────

  describe('knowledge_debug', () => {
    it('returns vault, brain, curator, and memory state', async () => {
      const op = findOp(ops, 'knowledge_debug');
      (rt.vault as Record<string, unknown>).getRecent = vi.fn().mockReturnValue([]);
      (rt.vault as Record<string, unknown>).memoryStats = vi.fn().mockReturnValue({});
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result).toHaveProperty('vault');
      expect(result).toHaveProperty('brain');
      expect(result).toHaveProperty('curator');
      expect(result).toHaveProperty('memory');
    });
  });
});
