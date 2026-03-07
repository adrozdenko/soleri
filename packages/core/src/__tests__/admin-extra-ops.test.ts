import { describe, it, expect, afterEach } from 'vitest';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createAdminExtraOps } from '../runtime/admin-extra-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createAdminExtraOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  afterEach(() => {
    runtime?.close();
  });

  function setup() {
    runtime = createAgentRuntime({
      agentId: 'test-admin-extra',
      vaultPath: ':memory:',
    });
    ops = createAdminExtraOps(runtime);
  }

  it('should return 24 ops', () => {
    setup();
    expect(ops).toHaveLength(24);
    const names = ops.map((o) => o.name);
    // Original 10
    expect(names).toContain('admin_telemetry');
    expect(names).toContain('admin_telemetry_recent');
    expect(names).toContain('admin_telemetry_reset');
    expect(names).toContain('admin_permissions');
    expect(names).toContain('admin_vault_analytics');
    expect(names).toContain('admin_search_insights');
    expect(names).toContain('admin_module_status');
    expect(names).toContain('admin_env');
    expect(names).toContain('admin_gc');
    expect(names).toContain('admin_export_config');
    // #157: Key pool
    expect(names).toContain('admin_key_pool_status');
    expect(names).toContain('admin_create_token');
    expect(names).toContain('admin_revoke_token');
    expect(names).toContain('admin_list_tokens');
    // #158: Accounts
    expect(names).toContain('admin_add_account');
    expect(names).toContain('admin_remove_account');
    expect(names).toContain('admin_rotate_account');
    expect(names).toContain('admin_list_accounts');
    expect(names).toContain('admin_account_status');
    // #159: Plugins
    expect(names).toContain('admin_list_plugins');
    expect(names).toContain('admin_plugin_status');
    // #160: Instruction validation
    expect(names).toContain('admin_validate_instructions');
    // #63: Hot reload
    expect(names).toContain('admin_hot_reload');
  });

  // ─── admin_telemetry ────────────────────────────────────────────

  describe('admin_telemetry', () => {
    it('should return zero stats initially', async () => {
      setup();
      const result = (await findOp('admin_telemetry').handler({})) as {
        totalCalls: number;
        successRate: number;
        avgDurationMs: number;
        callsByFacade: Record<string, number>;
        callsByOp: Record<string, number>;
      };

      expect(result.totalCalls).toBe(0);
      expect(result.successRate).toBe(1);
      expect(result.avgDurationMs).toBe(0);
      expect(result.callsByFacade).toEqual({});
      expect(result.callsByOp).toEqual({});
    });

    it('should reflect recorded calls', async () => {
      setup();
      runtime.telemetry.record({ facade: 'core', op: 'search', durationMs: 100, success: true });
      runtime.telemetry.record({ facade: 'core', op: 'search', durationMs: 200, success: true });
      runtime.telemetry.record({
        facade: 'core',
        op: 'register',
        durationMs: 50,
        success: false,
        error: 'test error',
      });

      const result = (await findOp('admin_telemetry').handler({})) as {
        totalCalls: number;
        successRate: number;
        avgDurationMs: number;
        callsByFacade: Record<string, number>;
        callsByOp: Record<string, number>;
        errorsByOp: Record<string, number>;
      };

      expect(result.totalCalls).toBe(3);
      expect(result.successRate).toBe(0.667);
      expect(result.avgDurationMs).toBeGreaterThan(0);
      expect(result.callsByFacade.core).toBe(3);
      expect(result.callsByOp.search).toBe(2);
      expect(result.callsByOp.register).toBe(1);
      expect(result.errorsByOp.register).toBe(1);
    });
  });

  // ─── admin_telemetry_recent ─────────────────────────────────────

  describe('admin_telemetry_recent', () => {
    it('should return recent calls in reverse order', async () => {
      setup();
      runtime.telemetry.record({ facade: 'core', op: 'op_a', durationMs: 10, success: true });
      runtime.telemetry.record({ facade: 'core', op: 'op_b', durationMs: 20, success: true });
      runtime.telemetry.record({ facade: 'core', op: 'op_c', durationMs: 30, success: true });

      const result = (await findOp('admin_telemetry_recent').handler({ limit: 2 })) as Array<{
        op: string;
      }>;

      expect(result).toHaveLength(2);
      expect(result[0].op).toBe('op_c');
      expect(result[1].op).toBe('op_b');
    });

    it('should return empty array when no calls recorded', async () => {
      setup();
      const result = (await findOp('admin_telemetry_recent').handler({})) as unknown[];
      expect(result).toEqual([]);
    });
  });

  // ─── admin_telemetry_reset ──────────────────────────────────────

  describe('admin_telemetry_reset', () => {
    it('should clear telemetry data', async () => {
      setup();
      runtime.telemetry.record({ facade: 'core', op: 'search', durationMs: 100, success: true });

      const resetResult = (await findOp('admin_telemetry_reset').handler({})) as {
        reset: boolean;
      };
      expect(resetResult.reset).toBe(true);

      const stats = (await findOp('admin_telemetry').handler({})) as { totalCalls: number };
      expect(stats.totalCalls).toBe(0);
    });

    it('should have write auth', () => {
      setup();
      expect(findOp('admin_telemetry_reset').auth).toBe('write');
    });
  });

  // ─── admin_permissions ──────────────────────────────────────────

  describe('admin_permissions', () => {
    it('should return moderate as default', async () => {
      setup();
      const result = (await findOp('admin_permissions').handler({ action: 'get' })) as {
        level: string;
      };
      expect(result.level).toBe('moderate');
    });

    it('should allow setting permission level', async () => {
      setup();
      await findOp('admin_permissions').handler({ action: 'set', level: 'strict' });
      const result = (await findOp('admin_permissions').handler({ action: 'get' })) as {
        level: string;
      };
      expect(result.level).toBe('strict');
    });

    it('should not change level when set without level param', async () => {
      setup();
      await findOp('admin_permissions').handler({ action: 'set', level: 'permissive' });
      await findOp('admin_permissions').handler({ action: 'set' });
      const result = (await findOp('admin_permissions').handler({ action: 'get' })) as {
        level: string;
      };
      expect(result.level).toBe('permissive');
    });

    it('should have write auth', () => {
      setup();
      expect(findOp('admin_permissions').auth).toBe('write');
    });
  });

  // ─── admin_vault_analytics ──────────────────────────────────────

  describe('admin_vault_analytics', () => {
    it('should return zeroes for empty vault', async () => {
      setup();
      const result = (await findOp('admin_vault_analytics').handler({})) as {
        totalEntries: number;
        byDomain: Record<string, number>;
        byType: Record<string, number>;
        byAge: Record<string, number>;
        avgTagsPerEntry: number;
        entriesWithoutTags: number;
        entriesWithoutDescription: number;
      };

      expect(result.totalEntries).toBe(0);
      expect(result.byDomain).toEqual({});
      expect(result.byType).toEqual({});
      expect(result.avgTagsPerEntry).toBe(0);
      expect(result.entriesWithoutTags).toBe(0);
      expect(result.entriesWithoutDescription).toBe(0);
    });

    it('should return domain and type breakdowns after seed', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'va-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Analytics Test 1',
          severity: 'warning',
          description: 'Test entry.',
          tags: ['a', 'b'],
        },
        {
          id: 'va-2',
          type: 'anti-pattern',
          domain: 'testing',
          title: 'Analytics Test 2',
          severity: 'critical',
          description: 'Test entry 2.',
          tags: ['c'],
        },
        {
          id: 'va-3',
          type: 'rule',
          domain: 'design',
          title: 'Analytics Test 3',
          severity: 'suggestion',
          description: 'Test entry 3.',
          tags: [],
        },
      ]);

      const result = (await findOp('admin_vault_analytics').handler({})) as {
        totalEntries: number;
        byDomain: Record<string, number>;
        byType: Record<string, number>;
        avgTagsPerEntry: number;
        entriesWithoutTags: number;
      };

      expect(result.totalEntries).toBe(3);
      expect(result.byDomain.testing).toBe(2);
      expect(result.byDomain.design).toBe(1);
      expect(result.byType.pattern).toBe(1);
      expect(result.byType['anti-pattern']).toBe(1);
      expect(result.byType.rule).toBe(1);
      expect(result.avgTagsPerEntry).toBe(1); // (2+1+0)/3 = 1
      expect(result.entriesWithoutTags).toBe(1);
    });
  });

  // ─── admin_search_insights ──────────────────────────────────────

  describe('admin_search_insights', () => {
    it('should return empty insights with no feedback', async () => {
      setup();
      const result = (await findOp('admin_search_insights').handler({})) as {
        totalFeedback: number;
        missRate: number;
        missCount: number;
        topMissedQueries: unknown[];
      };

      expect(result.totalFeedback).toBe(0);
      expect(result.missRate).toBe(0);
      expect(result.missCount).toBe(0);
      expect(result.topMissedQueries).toEqual([]);
    });

    it('should compute miss rate from feedback', async () => {
      setup();
      // Seed entries for feedback to reference
      runtime.vault.seed([
        {
          id: 'si-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Insight Test',
          severity: 'warning',
          description: 'Test.',
          tags: ['test'],
        },
      ]);

      // Record feedback
      runtime.brain.recordFeedback({ query: 'test query', entryId: 'si-1', action: 'accepted' });
      runtime.brain.recordFeedback({ query: 'missed query', entryId: 'si-1', action: 'dismissed' });
      runtime.brain.recordFeedback({ query: 'failed query', entryId: 'si-1', action: 'failed' });

      const result = (await findOp('admin_search_insights').handler({})) as {
        totalFeedback: number;
        missRate: number;
        missCount: number;
        topMissedQueries: Array<{ query: string; count: number }>;
      };

      expect(result.totalFeedback).toBe(3);
      expect(result.missCount).toBe(2);
      expect(result.missRate).toBe(0.667);
      expect(result.topMissedQueries.length).toBeGreaterThan(0);
    });
  });

  // ─── admin_module_status ────────────────────────────────────────

  describe('admin_module_status', () => {
    it('should return all modules as initialized', async () => {
      setup();
      const result = (await findOp('admin_module_status').handler({})) as {
        vault: boolean;
        brain: boolean;
        planner: boolean;
        curator: boolean;
        governance: boolean;
        cognee: { available: boolean };
        loop: { active: boolean };
        llm: { openai: boolean; anthropic: boolean };
      };

      expect(result.vault).toBe(true);
      expect(result.brain).toBe(true);
      expect(result.planner).toBe(true);
      expect(result.curator).toBe(true);
      expect(result.governance).toBe(true);
      expect(result.cognee).toEqual({ available: false });
      expect(result.loop).toEqual({ active: false });
      expect(typeof result.llm.openai).toBe('boolean');
      expect(typeof result.llm.anthropic).toBe('boolean');
    });
  });

  // ─── admin_env ──────────────────────────────────────────────────

  describe('admin_env', () => {
    it('should return node version and platform', async () => {
      setup();
      const result = (await findOp('admin_env').handler({})) as {
        nodeVersion: string;
        platform: string;
        arch: string;
        pid: number;
        memoryUsage: { rss: number };
        cwd: string;
      };

      expect(result.nodeVersion).toMatch(/^v\d+/);
      expect(typeof result.platform).toBe('string');
      expect(typeof result.arch).toBe('string');
      expect(typeof result.pid).toBe('number');
      expect(result.memoryUsage.rss).toBeGreaterThan(0);
      expect(typeof result.cwd).toBe('string');
    });
  });

  // ─── admin_gc ───────────────────────────────────────────────────

  describe('admin_gc', () => {
    it('should return cleared modules list', async () => {
      setup();
      const result = (await findOp('admin_gc').handler({})) as { cleared: string[] };

      expect(result.cleared).toContain('brain');
      expect(result.cleared).toContain('cognee');
      expect(result.cleared).toContain('telemetry');
    });

    it('should have write auth', () => {
      setup();
      expect(findOp('admin_gc').auth).toBe('write');
    });
  });

  // ─── admin_export_config ────────────────────────────────────────

  describe('admin_export_config', () => {
    it('should return agent config without secrets', async () => {
      setup();
      const result = (await findOp('admin_export_config').handler({})) as {
        agentId: string;
        vaultPath: string | null;
        plansPath: string | null;
        logLevel: string;
        modules: string[];
      };

      expect(result.agentId).toBe('test-admin-extra');
      expect(result.vaultPath).toBe(':memory:');
      expect(result.logLevel).toBe('info');
      expect(result.modules).toContain('vault');
      expect(result.modules).toContain('brain');
      expect(result.modules).toContain('telemetry');
      expect(result.modules.length).toBeGreaterThan(5);
    });
  });

  // ─── admin_hot_reload ─────────────────────────────────────────

  describe('admin_hot_reload', () => {
    it('should reload brain, vault FTS, and templates', async () => {
      setup();
      const result = (await findOp('admin_hot_reload').handler({})) as {
        reloaded: string[];
        brainTerms: number;
        templateCount: number;
      };

      expect(result.reloaded).toContain('brain');
      expect(result.reloaded).toContain('vault_fts');
      expect(result.reloaded).toContain('templates');
      expect(typeof result.brainTerms).toBe('number');
      expect(typeof result.templateCount).toBe('number');
    });

    it('should have write auth', () => {
      setup();
      expect(findOp('admin_hot_reload').auth).toBe('write');
    });
  });

  // ─── Auth levels ────────────────────────────────────────────────

  describe('auth levels', () => {
    it('should use read auth for status ops', () => {
      setup();
      const readOps = [
        'admin_telemetry',
        'admin_telemetry_recent',
        'admin_vault_analytics',
        'admin_search_insights',
        'admin_module_status',
        'admin_env',
        'admin_export_config',
      ];
      for (const name of readOps) {
        expect(findOp(name).auth).toBe('read');
      }
    });

    it('should use write auth for mutation ops', () => {
      setup();
      const writeOps = ['admin_telemetry_reset', 'admin_permissions', 'admin_gc'];
      for (const name of writeOps) {
        expect(findOp(name).auth).toBe('write');
      }
    });
  });
});
