import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../../vault/vault.js';
import { OperatorProfileStore } from '../../operator/operator-profile.js';
import { ProjectRegistry } from '../../project/project-registry.js';
import { createMemoryFacadeOps } from './memory-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeRuntime(vault: Vault): AgentRuntime {
  const operatorProfile = new OperatorProfileStore(vault);
  const projectRegistry = new ProjectRegistry(vault.getProvider());
  return { vault, operatorProfile, projectRegistry } as unknown as AgentRuntime;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('memory-facade', () => {
  let vault: Vault;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    vault = new Vault(':memory:');
    ops = captureOps(createMemoryFacadeOps(makeRuntime(vault)));
  });

  afterEach(() => {
    vault.close();
  });

  it('registers base + extra + cross-project ops', () => {
    // 4 base + 18 extra + 3 cross-project = 25
    expect(ops.size).toBeGreaterThanOrEqual(25);
    expect([...ops.keys()]).toContain('memory_search');
    expect([...ops.keys()]).toContain('memory_capture');
    expect([...ops.keys()]).toContain('memory_list');
    expect([...ops.keys()]).toContain('session_capture');
    expect([...ops.keys()]).toContain('memory_delete');
    expect([...ops.keys()]).toContain('memory_promote_to_global');
  });

  it('has correct auth levels for base ops', () => {
    expect(ops.get('memory_search')!.auth).toBe('read');
    expect(ops.get('memory_capture')!.auth).toBe('write');
    expect(ops.get('memory_list')!.auth).toBe('read');
    expect(ops.get('session_capture')!.auth).toBe('write');
  });

  // ─── memory_capture ────────────────────────────────────────────

  it('memory_capture stores a memory', async () => {
    const result = await executeOp(ops, 'memory_capture', {
      projectPath: '/test',
      type: 'lesson',
      context: 'learned about tokens',
      summary: 'Token migration pattern',
      topics: ['tokens'],
    });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).captured).toBe(true);
  });

  // ─── memory_search ─────────────────────────────────────────────

  it('memory_search returns empty for no matches', async () => {
    const result = await executeOp(ops, 'memory_search', { query: 'nonexistent' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).total).toBe(0);
  });

  it('memory_search finds captured memories', async () => {
    await executeOp(ops, 'memory_capture', {
      projectPath: '/test',
      type: 'lesson',
      context: 'context',
      summary: 'Token migration best practices',
    });
    const result = await executeOp(ops, 'memory_search', { query: 'token migration' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).total).toBeGreaterThanOrEqual(1);
  });

  it('memory_search returns summaries by default', async () => {
    await executeOp(ops, 'memory_capture', {
      projectPath: '/test',
      type: 'lesson',
      context: 'ctx',
      summary: 'short summary',
    });
    const result = await executeOp(ops, 'memory_search', { query: 'short summary' });
    expect(result.success).toBe(true);
    const data = result.data as { results: Array<{ summary: string }> };
    expect(data.results[0]).toHaveProperty('summary');
    expect(data.results[0]).not.toHaveProperty('context');
  });

  it('memory_search returns full objects with verbose:true', async () => {
    await executeOp(ops, 'memory_capture', {
      projectPath: '/test',
      type: 'lesson',
      context: 'ctx',
      summary: 'verbose test',
    });
    const result = await executeOp(ops, 'memory_search', { query: 'verbose test', verbose: true });
    expect(result.success).toBe(true);
    const data = result.data as { results: Array<Record<string, unknown>> };
    expect(data.results[0]).toHaveProperty('context');
  });

  // ─── memory_list ───────────────────────────────────────────────

  it('memory_list returns entries with stats', async () => {
    await executeOp(ops, 'memory_capture', {
      projectPath: '/test',
      type: 'session',
      context: 'ctx',
      summary: 'session 1',
    });
    const result = await executeOp(ops, 'memory_list', {});
    expect(result.success).toBe(true);
    const data = result.data as { entries: unknown[]; total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('memory_list filters by type', async () => {
    await executeOp(ops, 'memory_capture', {
      projectPath: '/test', type: 'lesson', context: 'c', summary: 'lesson',
    });
    await executeOp(ops, 'memory_capture', {
      projectPath: '/test', type: 'preference', context: 'c', summary: 'pref',
    });
    const result = await executeOp(ops, 'memory_list', { type: 'lesson' });
    expect(result.success).toBe(true);
    const data = result.data as { entries: unknown[]; total: number };
    expect(data.entries.length).toBe(1);
  });

  it('memory_list verbose returns full objects', async () => {
    await executeOp(ops, 'memory_capture', {
      projectPath: '/test', type: 'lesson', context: 'c', summary: 'verbose list',
    });
    const result = await executeOp(ops, 'memory_list', { verbose: true });
    expect(result.success).toBe(true);
    const data = result.data as { memories: Array<Record<string, unknown>> };
    expect(data.memories[0]).toHaveProperty('context');
  });

  // ─── session_capture ───────────────────────────────────────────

  it('session_capture stores with summary', async () => {
    const result = await executeOp(ops, 'session_capture', {
      summary: 'Built token migration feature',
      topics: ['tokens'],
    });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).captured).toBe(true);
  });

  it('session_capture accepts conversationContext alias', async () => {
    const result = await executeOp(ops, 'session_capture', {
      conversationContext: 'aliased summary',
    });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).captured).toBe(true);
  });

  it('session_capture fails without summary or conversationContext', async () => {
    const result = await executeOp(ops, 'session_capture', { topics: ['test'] });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).captured).toBe(false);
  });

  it('session_capture stores rich fields', async () => {
    const result = await executeOp(ops, 'session_capture', {
      summary: 'test session',
      intent: 'BUILD',
      decisions: ['used pattern X'],
      currentState: 'half done',
      nextSteps: ['finish Y'],
      vaultEntriesReferenced: ['entry-1'],
      filesModified: ['src/app.ts'],
      toolsUsed: ['vault_search'],
    });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).captured).toBe(true);
  });

  // ─── memory_delete ─────────────────────────────────────────────

  it('memory_delete removes a memory', async () => {
    const captureResult = await executeOp(ops, 'memory_capture', {
      projectPath: '/test', type: 'lesson', context: 'c', summary: 'to delete',
    });
    const memoryId = ((captureResult.data as Record<string, unknown>).memory as Record<string, unknown>).id as string;
    const result = await executeOp(ops, 'memory_delete', { memoryId });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).deleted).toBe(true);
  });

  it('memory_delete returns false for nonexistent memory', async () => {
    const result = await executeOp(ops, 'memory_delete', { memoryId: 'nonexistent' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).deleted).toBe(false);
  });

  it('memory_delete accepts id alias', async () => {
    const result = await executeOp(ops, 'memory_delete', { id: 'nonexistent' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).deleted).toBe(false);
  });

  it('memory_delete fails without any id param', async () => {
    const result = await executeOp(ops, 'memory_delete', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).deleted).toBe(false);
    expect((result.data as Record<string, unknown>).error).toContain('required');
  });

  // ─── memory_stats ──────────────────────────────────────────────

  it('memory_stats returns statistics', async () => {
    const result = await executeOp(ops, 'memory_stats', {});
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('total');
  });

  // ─── memory_topics ─────────────────────────────────────────────

  it('memory_topics returns empty initially', async () => {
    const result = await executeOp(ops, 'memory_topics', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(0);
  });

  // ─── memory_deduplicate ────────────────────────────────────────

  it('memory_deduplicate runs without error', async () => {
    const result = await executeOp(ops, 'memory_deduplicate', {});
    expect(result.success).toBe(true);
  });

  // ─── memory_promote_to_global ──────────────────────────────────

  it('memory_promote_to_global fails on missing entry', async () => {
    const result = await executeOp(ops, 'memory_promote_to_global', { entryId: 'missing' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).promoted).toBe(false);
  });

  it('memory_promote_to_global adds _global tag', async () => {
    vault.add({
      id: 'test-entry',
      type: 'pattern',
      domain: 'general',
      title: 'test',
      description: 'test',
      severity: 'suggestion',
      tags: ['foo'],
    });
    const result = await executeOp(ops, 'memory_promote_to_global', { entryId: 'test-entry' });
    expect(result.success).toBe(true);
    const data = result.data as { promoted: boolean; tags: string[] };
    expect(data.promoted).toBe(true);
    expect(data.tags).toContain('_global');
  });
});
