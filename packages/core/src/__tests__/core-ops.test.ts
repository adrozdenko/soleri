import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createCoreOps } from '../runtime/core-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createCoreOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'core-ops-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-core-ops',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createCoreOps(runtime);
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

  it('should return 26 ops', () => {
    expect(ops.length).toBe(26);
  });

  it('should have all expected op names', () => {
    const names = ops.map((o) => o.name);
    // Search/Vault
    expect(names).toContain('search');
    expect(names).toContain('vault_stats');
    expect(names).toContain('list_all');
    expect(names).toContain('register');
    // Memory
    expect(names).toContain('memory_search');
    expect(names).toContain('memory_capture');
    expect(names).toContain('memory_list');
    expect(names).toContain('session_capture');
    // Export
    expect(names).toContain('export');
    // Planning
    expect(names).toContain('create_plan');
    expect(names).toContain('get_plan');
    expect(names).toContain('approve_plan');
    expect(names).toContain('update_task');
    expect(names).toContain('complete_plan');
    // Brain
    expect(names).toContain('record_feedback');
    expect(names).toContain('rebuild_vocabulary');
    expect(names).toContain('brain_stats');
    expect(names).toContain('llm_status');
    // Curator
    expect(names).toContain('curator_status');
    expect(names).toContain('curator_detect_duplicates');
    expect(names).toContain('curator_contradictions');
    expect(names).toContain('curator_resolve_contradiction');
    expect(names).toContain('curator_groom');
    expect(names).toContain('curator_groom_all');
    expect(names).toContain('curator_consolidate');
    expect(names).toContain('curator_health_audit');
  });

  it('search should query vault via brain', async () => {
    runtime.vault.seed([
      {
        id: 'co-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Test pattern for core ops',
        severity: 'warning',
        description: 'Core ops test.',
        tags: ['test'],
      },
    ]);
    runtime.brain.rebuildVocabulary();

    // Re-create ops since brain state changed
    ops = createCoreOps(runtime);
    const results = (await findOp('search').handler({ query: 'core ops test' })) as unknown[];
    expect(results.length).toBeGreaterThan(0);
  });

  it('vault_stats should return counts', async () => {
    runtime.vault.seed([
      {
        id: 'vs-1',
        type: 'pattern',
        domain: 'd1',
        title: 'T',
        severity: 'warning',
        description: 'D',
        tags: ['t'],
      },
    ]);
    const stats = (await findOp('vault_stats').handler({})) as { totalEntries: number };
    expect(stats.totalEntries).toBe(1);
  });

  it('create_plan + get_plan should work', async () => {
    const created = (await findOp('create_plan').handler({
      objective: 'Test plan',
      scope: 'core-ops test',
      tasks: [{ title: 'Task 1', description: 'Do something' }],
    })) as { created: boolean; plan: { id: string; status: string } };
    expect(created.created).toBe(true);
    expect(created.plan.status).toBe('draft');

    const plan = (await findOp('get_plan').handler({ planId: created.plan.id })) as { id: string };
    expect(plan.id).toBe(created.plan.id);
  });

  it('brain_stats should return stats', async () => {
    const stats = (await findOp('brain_stats').handler({})) as {
      vocabularySize: number;
      feedbackCount: number;
    };
    expect(stats.vocabularySize).toBe(0);
    expect(stats.feedbackCount).toBe(0);
  });

  it('llm_status should return provider info', async () => {
    const status = (await findOp('llm_status').handler({})) as {
      providers: {
        openai: { available: boolean };
        anthropic: { available: boolean };
      };
      routes: unknown[];
    };
    expect(typeof status.providers.openai.available).toBe('boolean');
    expect(typeof status.providers.anthropic.available).toBe('boolean');
    expect(Array.isArray(status.routes)).toBe(true);
  });

  it('curator_status should return initialized', async () => {
    const status = (await findOp('curator_status').handler({})) as { initialized: boolean };
    expect(status.initialized).toBe(true);
  });

  it('curator_health_audit should return score', async () => {
    runtime.vault.seed([
      {
        id: 'ha-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Health pattern',
        severity: 'warning',
        description: 'Testing health.',
        tags: ['health'],
      },
    ]);
    runtime.curator.groomAll();
    const result = (await findOp('curator_health_audit').handler({})) as { score: number };
    expect(result.score).toBeGreaterThan(0);
  });

  it('memory_capture + memory_search should work', async () => {
    await findOp('memory_capture').handler({
      projectPath: '/test',
      type: 'lesson',
      context: 'Testing core ops',
      summary: 'Core ops memory test works',
      topics: ['testing'],
      filesModified: [],
      toolsUsed: [],
    });

    const results = (await findOp('memory_search').handler({
      query: 'core ops memory',
    })) as unknown[];
    expect(results.length).toBeGreaterThan(0);
  });

  it('export should return bundles', async () => {
    runtime.vault.seed([
      {
        id: 'exp-1',
        type: 'pattern',
        domain: 'security',
        title: 'Export test',
        severity: 'warning',
        description: 'Testing export.',
        tags: ['export'],
      },
    ]);
    const result = (await findOp('export').handler({})) as {
      exported: boolean;
      totalEntries: number;
    };
    expect(result.exported).toBe(true);
    expect(result.totalEntries).toBe(1);
  });
});
