import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createMemoryExtraOps } from '../runtime/memory-extra-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createMemoryExtraOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'memory-extra-ops-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-memory-extra',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createMemoryExtraOps(runtime);
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  /** Helper to create a test memory and return its ID */
  function captureTestMemory(overrides?: {
    projectPath?: string;
    type?: 'session' | 'lesson' | 'preference';
    summary?: string;
    topics?: string[];
  }) {
    return runtime.vault.captureMemory({
      projectPath: overrides?.projectPath ?? '/test/project',
      type: overrides?.type ?? 'lesson',
      context: 'Test context',
      summary: overrides?.summary ?? 'Test memory summary',
      topics: overrides?.topics ?? ['testing'],
      filesModified: ['file.ts'],
      toolsUsed: ['tool1'],
    });
  }

  it('should return 8 ops', () => {
    expect(ops.length).toBe(8);
  });

  it('should have all expected op names', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('memory_delete');
    expect(names).toContain('memory_stats');
    expect(names).toContain('memory_export');
    expect(names).toContain('memory_import');
    expect(names).toContain('memory_prune');
    expect(names).toContain('memory_deduplicate');
    expect(names).toContain('memory_topics');
    expect(names).toContain('memory_by_project');
  });

  // ─── memory_delete ──────────────────────────────────────────────

  it('memory_delete should delete an existing memory', async () => {
    const mem = captureTestMemory();
    const result = (await findOp('memory_delete').handler({ memoryId: mem.id })) as {
      deleted: boolean;
      memoryId: string;
    };
    expect(result.deleted).toBe(true);
    expect(result.memoryId).toBe(mem.id);
    expect(runtime.vault.getMemory(mem.id)).toBeNull();
  });

  it('memory_delete should return error for non-existent memory', async () => {
    const result = (await findOp('memory_delete').handler({ memoryId: 'non-existent' })) as {
      deleted: boolean;
      error: string;
    };
    expect(result.deleted).toBe(false);
    expect(result.error).toContain('not found');
  });

  // ─── memory_stats ──────────────────────────────────────────────

  it('memory_stats should return detailed statistics', async () => {
    captureTestMemory({ type: 'lesson', projectPath: '/proj-a' });
    captureTestMemory({ type: 'session', projectPath: '/proj-a' });
    captureTestMemory({ type: 'lesson', projectPath: '/proj-b' });

    const result = (await findOp('memory_stats').handler({})) as {
      total: number;
      byType: Record<string, number>;
      byProject: Record<string, number>;
      oldest: number | null;
      newest: number | null;
      archivedCount: number;
    };
    expect(result.total).toBe(3);
    expect(result.byType['lesson']).toBe(2);
    expect(result.byType['session']).toBe(1);
    expect(result.byProject['/proj-a']).toBe(2);
    expect(result.byProject['/proj-b']).toBe(1);
    expect(result.oldest).toBeTypeOf('number');
    expect(result.newest).toBeTypeOf('number');
    expect(result.archivedCount).toBe(0);
  });

  it('memory_stats should filter by projectPath', async () => {
    captureTestMemory({ projectPath: '/proj-a' });
    captureTestMemory({ projectPath: '/proj-b' });

    const result = (await findOp('memory_stats').handler({ projectPath: '/proj-a' })) as {
      total: number;
    };
    expect(result.total).toBe(1);
  });

  // ─── memory_export ──────────────────────────────────────────────

  it('memory_export should export all memories', async () => {
    captureTestMemory({ summary: 'Export test 1' });
    captureTestMemory({ summary: 'Export test 2' });

    const result = (await findOp('memory_export').handler({})) as {
      exported: boolean;
      count: number;
      memories: unknown[];
    };
    expect(result.exported).toBe(true);
    expect(result.count).toBe(2);
    expect(result.memories.length).toBe(2);
  });

  it('memory_export should filter by project', async () => {
    captureTestMemory({ projectPath: '/proj-a', summary: 'A' });
    captureTestMemory({ projectPath: '/proj-b', summary: 'B' });

    const result = (await findOp('memory_export').handler({ projectPath: '/proj-a' })) as {
      count: number;
    };
    expect(result.count).toBe(1);
  });

  it('memory_export should filter by type', async () => {
    captureTestMemory({ type: 'lesson', summary: 'Lesson' });
    captureTestMemory({ type: 'session', summary: 'Session' });

    const result = (await findOp('memory_export').handler({ type: 'lesson' })) as {
      count: number;
    };
    expect(result.count).toBe(1);
  });

  // ─── memory_import ──────────────────────────────────────────────

  it('memory_import should import new memories', async () => {
    const result = (await findOp('memory_import').handler({
      memories: [
        {
          id: 'import-1',
          projectPath: '/imported',
          type: 'lesson',
          context: 'Imported context',
          summary: 'Imported memory',
          topics: ['imported'],
          filesModified: [],
          toolsUsed: [],
          createdAt: Math.floor(Date.now() / 1000),
          archivedAt: null,
        },
      ],
    })) as { imported: number; skipped: number; total: number };
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.total).toBe(1);

    const mem = runtime.vault.getMemory('import-1');
    expect(mem).not.toBeNull();
    expect(mem!.summary).toBe('Imported memory');
  });

  it('memory_import should skip duplicates', async () => {
    const mem = captureTestMemory();

    const result = (await findOp('memory_import').handler({
      memories: [
        {
          id: mem.id,
          projectPath: mem.projectPath,
          type: mem.type,
          context: mem.context,
          summary: mem.summary,
          topics: mem.topics,
          filesModified: mem.filesModified,
          toolsUsed: mem.toolsUsed,
          createdAt: mem.createdAt,
          archivedAt: null,
        },
      ],
    })) as { imported: number; skipped: number };
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  // ─── memory_prune ──────────────────────────────────────────────

  it('memory_prune should delete old memories', async () => {
    // Insert a memory with an old timestamp directly via db
    const db = runtime.vault.getDb();
    const oldTimestamp = Math.floor(Date.now() / 1000) - 100 * 86400; // 100 days ago
    db.prepare(
      `INSERT INTO memories (id, project_path, type, context, summary, topics, files_modified, tools_used, created_at)
       VALUES ('old-mem', '/test', 'lesson', 'old', 'Old memory', '[]', '[]', '[]', ?)`,
    ).run(oldTimestamp);

    // Also capture a fresh memory
    captureTestMemory({ summary: 'Fresh memory' });

    const result = (await findOp('memory_prune').handler({ olderThanDays: 30 })) as {
      pruned: number;
      olderThanDays: number;
    };
    expect(result.pruned).toBe(1);
    expect(result.olderThanDays).toBe(30);

    // Fresh memory should remain
    const remaining = runtime.vault.listMemories({});
    expect(remaining.length).toBe(1);
    expect(remaining[0].summary).toBe('Fresh memory');
  });

  it('memory_prune should not prune recent memories', async () => {
    captureTestMemory({ summary: 'Recent' });

    const result = (await findOp('memory_prune').handler({ olderThanDays: 1 })) as {
      pruned: number;
    };
    expect(result.pruned).toBe(0);
  });

  // ─── memory_deduplicate ─────────────────────────────────────────

  it('memory_deduplicate should remove duplicates', async () => {
    captureTestMemory({ summary: 'Duplicate summary', projectPath: '/proj', type: 'lesson' });
    captureTestMemory({ summary: 'Duplicate summary', projectPath: '/proj', type: 'lesson' });
    captureTestMemory({ summary: 'Unique summary', projectPath: '/proj', type: 'lesson' });

    const result = (await findOp('memory_deduplicate').handler({})) as {
      removed: number;
      groups: Array<{ kept: string; removed: string[] }>;
    };
    expect(result.removed).toBe(1);
    expect(result.groups.length).toBe(1);
    expect(result.groups[0].removed.length).toBe(1);

    const remaining = runtime.vault.listMemories({});
    expect(remaining.length).toBe(2);
  });

  it('memory_deduplicate should return 0 when no duplicates', async () => {
    captureTestMemory({ summary: 'Unique 1' });
    captureTestMemory({ summary: 'Unique 2' });

    const result = (await findOp('memory_deduplicate').handler({})) as { removed: number };
    expect(result.removed).toBe(0);
  });

  // ─── memory_topics ──────────────────────────────────────────────

  it('memory_topics should list unique topics with counts', async () => {
    captureTestMemory({ topics: ['react', 'testing'] });
    captureTestMemory({ topics: ['react', 'hooks'] });
    captureTestMemory({ topics: ['testing'] });

    const result = (await findOp('memory_topics').handler({})) as {
      count: number;
      topics: Array<{ topic: string; count: number }>;
    };
    expect(result.count).toBe(3); // react, testing, hooks
    // Sorted by frequency descending
    expect(result.topics[0].topic).toBe('react');
    expect(result.topics[0].count).toBe(2);
    expect(result.topics[1].topic).toBe('testing');
    expect(result.topics[1].count).toBe(2);
    expect(result.topics[2].topic).toBe('hooks');
    expect(result.topics[2].count).toBe(1);
  });

  it('memory_topics should return empty when no memories', async () => {
    const result = (await findOp('memory_topics').handler({})) as { count: number };
    expect(result.count).toBe(0);
  });

  // ─── memory_by_project ──────────────────────────────────────────

  it('memory_by_project should group memories by project', async () => {
    captureTestMemory({ projectPath: '/proj-a', summary: 'A1' });
    captureTestMemory({ projectPath: '/proj-a', summary: 'A2' });
    captureTestMemory({ projectPath: '/proj-b', summary: 'B1' });

    const result = (await findOp('memory_by_project').handler({})) as {
      count: number;
      projects: Array<{
        project: string;
        count: number;
        memories: Array<{ summary: string }>;
      }>;
    };
    expect(result.count).toBe(2);
    const projA = result.projects.find((p) => p.project === '/proj-a');
    const projB = result.projects.find((p) => p.project === '/proj-b');
    expect(projA).toBeDefined();
    expect(projA!.count).toBe(2);
    expect(projA!.memories.length).toBe(2);
    expect(projB).toBeDefined();
    expect(projB!.count).toBe(1);
  });

  it('memory_by_project should return counts only when includeMemories=false', async () => {
    captureTestMemory({ projectPath: '/proj-a', summary: 'A1' });

    const result = (await findOp('memory_by_project').handler({ includeMemories: false })) as {
      count: number;
      projects: Array<{ project: string; count: number; memories?: unknown }>;
    };
    expect(result.count).toBe(1);
    expect(result.projects[0].memories).toBeUndefined();
  });

  // ─── Auth levels ────────────────────────────────────────────────

  it('should have correct auth levels', () => {
    expect(findOp('memory_delete').auth).toBe('write');
    expect(findOp('memory_stats').auth).toBe('read');
    expect(findOp('memory_export').auth).toBe('read');
    expect(findOp('memory_import').auth).toBe('write');
    expect(findOp('memory_prune').auth).toBe('admin');
    expect(findOp('memory_deduplicate').auth).toBe('admin');
    expect(findOp('memory_topics').auth).toBe('read');
    expect(findOp('memory_by_project').auth).toBe('read');
  });
});
