import { describe, it, expect, vi } from 'vitest';
import { createMemoryCrossProjectOps } from './memory-cross-project-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

function makeMockRuntime(overrides: Record<string, unknown> = {}) {
  return {
    vault: {
      get: vi.fn().mockReturnValue({ id: 'e1', tags: ['pattern'] }),
      update: vi.fn(),
      searchMemories: vi.fn().mockReturnValue([{ id: 'm1', content: 'memory 1' }]),
      search: vi.fn().mockReturnValue([
        { entry: { id: 'g1', tags: ['_global'] }, score: 0.9 },
        { entry: { id: 'g2', tags: ['other'] }, score: 0.8 },
      ]),
      ...overrides,
    },
    projectRegistry: {
      getByPath: vi.fn().mockReturnValue({
        id: 'proj-1',
        name: 'test-project',
        path: '/test',
        metadata: { memoryConfig: { crossProjectEnabled: true, extraPaths: ['/extra'] } },
      }),
      register: vi.fn(),
      getLinkedProjects: vi
        .fn()
        .mockReturnValue([{ project: { path: '/linked', name: 'linked-project' } }]),
    },
  } as unknown as AgentRuntime;
}

describe('createMemoryCrossProjectOps', () => {
  let ops: OpDefinition[];

  function findOp(name: string, opList?: OpDefinition[]): OpDefinition {
    const list = opList ?? ops;
    const op = list.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  describe('memory_promote_to_global', () => {
    it('promotes entry by adding _global tag', async () => {
      const runtime = makeMockRuntime();
      ops = createMemoryCrossProjectOps(runtime);
      const result = (await findOp('memory_promote_to_global').handler({
        entryId: 'e1',
      })) as Record<string, unknown>;
      expect(result.promoted).toBe(true);
      expect(result.tags).toContain('_global');
      expect(runtime.vault.update).toHaveBeenCalledWith('e1', { tags: ['pattern', '_global'] });
    });

    it('returns error when entry not found', async () => {
      const runtime = makeMockRuntime({ get: vi.fn().mockReturnValue(null) });
      ops = createMemoryCrossProjectOps(runtime);
      const result = (await findOp('memory_promote_to_global').handler({
        entryId: 'missing',
      })) as Record<string, unknown>;
      expect(result.promoted).toBe(false);
      expect(result.error).toContain('Entry not found');
    });

    it('skips if already global', async () => {
      const runtime = makeMockRuntime({
        get: vi.fn().mockReturnValue({ id: 'e1', tags: ['_global'] }),
      });
      ops = createMemoryCrossProjectOps(runtime);
      const result = (await findOp('memory_promote_to_global').handler({
        entryId: 'e1',
      })) as Record<string, unknown>;
      expect(result.promoted).toBe(false);
      expect(result.message).toContain('already promoted');
    });
  });

  describe('memory_configure', () => {
    it('updates memory config for a project', async () => {
      const runtime = makeMockRuntime();
      ops = createMemoryCrossProjectOps(runtime);
      const result = (await findOp('memory_configure').handler({
        projectPath: '/test',
        crossProjectEnabled: false,
        extraPaths: ['/new-path'],
      })) as Record<string, unknown>;

      expect(result.configured).toBe(true);
      expect(runtime.projectRegistry.register).toHaveBeenCalled();
    });

    it('returns error for unregistered project', async () => {
      const runtime = makeMockRuntime();
      (runtime.projectRegistry.getByPath as ReturnType<typeof vi.fn>).mockReturnValue(null);
      ops = createMemoryCrossProjectOps(runtime);
      const result = (await findOp('memory_configure').handler({
        projectPath: '/unknown',
      })) as Record<string, unknown>;
      expect(result.configured).toBe(false);
      expect(result.error).toContain('not registered');
    });
  });

  describe('memory_cross_project_search', () => {
    it('returns weighted results from current, global, and linked', async () => {
      const runtime = makeMockRuntime();
      ops = createMemoryCrossProjectOps(runtime);
      const result = (await findOp('memory_cross_project_search').handler({
        query: 'pattern',
        projectPath: '/test',
      })) as Record<string, unknown>;

      expect(result.memories).toBeTruthy();
      expect(result.globalEntries).toBeTruthy();
      // Global entries should only include _global tagged ones
      const globals = result.globalEntries as Array<Record<string, unknown>>;
      expect(globals).toHaveLength(1);
      expect((globals[0].entry as Record<string, unknown>).id).toBe('g1');
    });

    it('searches linked projects and extra paths', async () => {
      const runtime = makeMockRuntime();
      ops = createMemoryCrossProjectOps(runtime);
      await findOp('memory_cross_project_search').handler({
        query: 'test',
        projectPath: '/test',
      });

      // Should search current project, linked project, and extra path
      const searchCalls = (runtime.vault.searchMemories as ReturnType<typeof vi.fn>).mock.calls;
      const searchedPaths = searchCalls.map(
        (c: unknown[]) => (c[1] as Record<string, unknown>).projectPath,
      );
      expect(searchedPaths).toContain('/test');
      expect(searchedPaths).toContain('/linked');
      expect(searchedPaths).toContain('/extra');
    });

    it('deduplicates memories by ID', async () => {
      const runtime = makeMockRuntime();
      // Return same memory ID from linked project
      (runtime.vault.searchMemories as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'm1', content: 'memory 1' },
      ]);
      ops = createMemoryCrossProjectOps(runtime);
      const result = (await findOp('memory_cross_project_search').handler({
        query: 'test',
        projectPath: '/test',
      })) as Record<string, unknown>;

      // linkedMemories should be empty because m1 was already in current results
      const linked = result.linkedMemories as unknown[];
      expect(linked).toHaveLength(0);
    });

    it('skips linked search when cross-project disabled', async () => {
      const runtime = makeMockRuntime();
      (runtime.projectRegistry.getByPath as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'proj-1',
        name: 'test',
        path: '/test',
        metadata: { memoryConfig: { crossProjectEnabled: false } },
      });
      ops = createMemoryCrossProjectOps(runtime);
      const result = (await findOp('memory_cross_project_search').handler({
        query: 'test',
        projectPath: '/test',
      })) as Record<string, unknown>;

      expect(runtime.projectRegistry.getLinkedProjects).not.toHaveBeenCalled();
      expect((result.linkedMemories as unknown[]).length).toBe(0);
    });
  });
});
