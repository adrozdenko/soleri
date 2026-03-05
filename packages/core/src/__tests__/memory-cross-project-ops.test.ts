import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createCoreOps } from '../runtime/core-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('Memory Cross-Project Ops', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), 'cross-project-test-' + Date.now());
    mkdirSync(tempDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-cross-project',
      vaultPath: ':memory:',
      plansPath: join(tempDir, 'plans.json'),
    });
    ops = createCoreOps(runtime);
  });

  afterEach(() => {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  describe('memory_promote_to_global', () => {
    it('should add _global tag to a vault entry', async () => {
      // Add an entry first
      runtime.vault.add({
        id: 'test-entry-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Test Pattern',
        severity: 'suggestion',
        description: 'A test pattern for cross-project sharing',
        tags: ['test'],
      });

      const result = (await findOp('memory_promote_to_global').handler({
        entryId: 'test-entry-1',
      })) as { promoted: boolean; tags: string[] };

      expect(result.promoted).toBe(true);
      expect(result.tags).toContain('_global');
      expect(result.tags).toContain('test');

      // Verify the entry actually has the tag
      const entry = runtime.vault.get('test-entry-1');
      expect(entry!.tags).toContain('_global');
    });

    it('should return error for non-existent entry', async () => {
      const result = (await findOp('memory_promote_to_global').handler({
        entryId: 'nonexistent',
      })) as { promoted: boolean; error: string };

      expect(result.promoted).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should not duplicate _global tag', async () => {
      runtime.vault.add({
        id: 'test-entry-2',
        type: 'pattern',
        domain: 'testing',
        title: 'Already Global',
        severity: 'suggestion',
        description: 'Already promoted',
        tags: ['_global'],
      });

      const result = (await findOp('memory_promote_to_global').handler({
        entryId: 'test-entry-2',
      })) as { promoted: boolean; message: string };

      expect(result.promoted).toBe(false);
      expect(result.message).toContain('already promoted');
    });
  });

  describe('memory_configure', () => {
    it('should configure cross-project settings', async () => {
      // Register a project first
      runtime.projectRegistry.register('/test/project-a', 'project-a');

      const result = (await findOp('memory_configure').handler({
        projectPath: '/test/project-a',
        crossProjectEnabled: true,
        extraPaths: ['/test/shared'],
      })) as { configured: boolean; memoryConfig: Record<string, unknown> };

      expect(result.configured).toBe(true);
      expect(result.memoryConfig.crossProjectEnabled).toBe(true);
      expect(result.memoryConfig.extraPaths).toEqual(['/test/shared']);
    });

    it('should return error for unregistered project', async () => {
      const result = (await findOp('memory_configure').handler({
        projectPath: '/unregistered/path',
        crossProjectEnabled: true,
      })) as { configured: boolean; error: string };

      expect(result.configured).toBe(false);
      expect(result.error).toContain('not registered');
    });

    it('should preserve existing metadata when updating config', async () => {
      runtime.projectRegistry.register('/test/project-b', 'project-b', { custom: 'value' });

      await findOp('memory_configure').handler({
        projectPath: '/test/project-b',
        crossProjectEnabled: false,
      });

      const project = runtime.projectRegistry.getByPath('/test/project-b');
      expect(project!.metadata.custom).toBe('value');
      expect((project!.metadata.memoryConfig as Record<string, unknown>).crossProjectEnabled).toBe(false);
    });
  });

  describe('memory_cross_project_search', () => {
    it('should search current project memories', async () => {
      runtime.projectRegistry.register('/test/current', 'current');

      // Capture a memory
      runtime.vault.captureMemory({
        projectPath: '/test/current',
        type: 'lesson',
        context: 'testing',
        summary: 'Always use vitest for TypeScript projects',
        topics: ['testing', 'vitest'],
        filesModified: [],
        toolsUsed: [],
      });

      const result = (await findOp('memory_cross_project_search').handler({
        query: 'vitest',
        projectPath: '/test/current',
      })) as { memories: Array<{ weight: number; source: string }>; totalResults: number };

      expect(result.memories.length).toBeGreaterThanOrEqual(1);
      expect(result.memories[0].weight).toBe(1.0);
      expect(result.memories[0].source).toBe('current');
    });

    it('should include global entries in results', async () => {
      runtime.projectRegistry.register('/test/current', 'current');

      // Add a global entry
      runtime.vault.add({
        id: 'global-pattern',
        type: 'pattern',
        domain: 'testing',
        title: 'Global Testing Pattern',
        severity: 'suggestion',
        description: 'A globally promoted testing pattern for vitest',
        tags: ['_global', 'testing'],
      });

      const result = (await findOp('memory_cross_project_search').handler({
        query: 'testing',
        projectPath: '/test/current',
      })) as { globalEntries: Array<{ weight: number; source: string }> };

      expect(result.globalEntries.length).toBeGreaterThanOrEqual(1);
      expect(result.globalEntries[0].weight).toBe(0.9);
      expect(result.globalEntries[0].source).toBe('global');
    });

    it('should search linked project memories', async () => {
      const projA = runtime.projectRegistry.register('/test/project-a', 'project-a');
      const projB = runtime.projectRegistry.register('/test/project-b', 'project-b');
      runtime.projectRegistry.link(projA.id, projB.id, 'related');

      // Configure cross-project for project A
      await findOp('memory_configure').handler({
        projectPath: '/test/project-a',
        crossProjectEnabled: true,
      });

      // Capture memory in project B
      runtime.vault.captureMemory({
        projectPath: '/test/project-b',
        type: 'lesson',
        context: 'architecture',
        summary: 'Use facade pattern for clean separation',
        topics: ['architecture', 'facade'],
        filesModified: [],
        toolsUsed: [],
      });

      const result = (await findOp('memory_cross_project_search').handler({
        query: 'facade',
        projectPath: '/test/project-a',
      })) as {
        linkedMemories: Array<{ weight: number; source: string; linkedProject: string }>;
      };

      expect(result.linkedMemories.length).toBeGreaterThanOrEqual(1);
      expect(result.linkedMemories[0].weight).toBe(0.8);
      expect(result.linkedMemories[0].source).toBe('linked');
      expect(result.linkedMemories[0].linkedProject).toBe('/test/project-b');
    });

    it('should respect crossProjectEnabled=false', async () => {
      const projA = runtime.projectRegistry.register('/test/disabled-a', 'disabled-a');
      const projB = runtime.projectRegistry.register('/test/disabled-b', 'disabled-b');
      runtime.projectRegistry.link(projA.id, projB.id, 'related');

      // Explicitly disable cross-project
      await findOp('memory_configure').handler({
        projectPath: '/test/disabled-a',
        crossProjectEnabled: false,
      });

      // Capture memory in project B
      runtime.vault.captureMemory({
        projectPath: '/test/disabled-b',
        type: 'lesson',
        context: 'testing',
        summary: 'This should not appear in cross-project search',
        topics: ['hidden'],
        filesModified: [],
        toolsUsed: [],
      });

      const result = (await findOp('memory_cross_project_search').handler({
        query: 'hidden',
        projectPath: '/test/disabled-a',
      })) as { linkedMemories: unknown[] };

      expect(result.linkedMemories).toEqual([]);
    });
  });
});
