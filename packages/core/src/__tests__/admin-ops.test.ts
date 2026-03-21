import { describe, it, expect, afterEach } from 'vitest';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createAdminOps } from '../runtime/admin-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createAdminOps', () => {
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
      agentId: 'test-admin',
      vaultPath: ':memory:',
    });
    ops = createAdminOps(runtime);
  }

  it('should return 8 ops', () => {
    setup();
    expect(ops).toHaveLength(8);
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'admin_health',
      'admin_tool_list',
      'admin_config',
      'admin_vault_size',
      'admin_uptime',
      'admin_version',
      'admin_reset_cache',
      'admin_diagnostic',
    ]);
  });

  // ─── admin_health ──────────────────────────────────────────────

  describe('admin_health', () => {
    it('should return comprehensive health status', async () => {
      setup();
      const result = (await findOp('admin_health').handler({})) as Record<string, unknown>;

      expect(result.status).toBe('ok');
      expect(result.vault).toEqual({ entries: 0, domains: [] });
      expect(result.llm).toHaveProperty('openai');
      expect(result.llm).toHaveProperty('anthropic');
      expect(result.brain).toHaveProperty('vocabularySize');
      expect(result.brain).toHaveProperty('feedbackCount');
      expect(result.curator).toEqual({ initialized: true });
    });

    it('should reflect vault entries after seed', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'ah-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Health Test',
          severity: 'warning',
          description: 'Test entry.',
          tags: ['test'],
        },
      ]);
      const result = (await findOp('admin_health').handler({})) as Record<string, unknown>;
      const vault = result.vault as { entries: number; domains: string[] };
      expect(vault.entries).toBe(1);
      expect(vault.domains).toContain('testing');
    });
  });

  // ─── admin_tool_list ───────────────────────────────────────────

  describe('admin_tool_list', () => {
    it('should return fallback grouped list without _allOps', async () => {
      setup();
      const result = (await findOp('admin_tool_list').handler({})) as {
        count: number;
        ops: Record<string, string[]>;
      };

      expect(result.count).toBe(8);
      expect(result.ops.admin).toContain('admin_health');
      expect(result.ops.admin).toContain('admin_diagnostic');
    });

    it('should return grouped ops when _allOps is provided (default non-verbose)', async () => {
      setup();
      const allOps = [
        { name: 'search', description: 'Search vault', auth: 'read' },
        { name: 'admin_health', description: 'Health check', auth: 'read' },
      ];
      const result = (await findOp('admin_tool_list').handler({ _allOps: allOps })) as {
        count: number;
        ops: Record<string, string[]>;
      };

      expect(result.count).toBe(2);
      // 'search' has no underscore so grouped under 'core'
      expect(result.ops.core).toContain('search');
      expect(result.ops.admin).toContain('admin_health');
    });

    it('should return full ops when verbose: true with _allOps', async () => {
      setup();
      const allOps = [
        { name: 'search', description: 'Search vault', auth: 'read' },
        { name: 'admin_health', description: 'Health check', auth: 'read' },
      ];
      const result = (await findOp('admin_tool_list').handler({ _allOps: allOps, verbose: true })) as {
        count: number;
        ops: Array<{ name: string; description: string; auth: string }>;
      };

      expect(result.count).toBe(2);
      expect(result.ops[0].name).toBe('search');
      expect(result.ops[0].description).toBe('Search vault');
      expect(result.ops[1].name).toBe('admin_health');
    });
  });

  // ─── admin_config ──────────────────────────────────────────────

  describe('admin_config', () => {
    it('should return runtime config', async () => {
      setup();
      const result = (await findOp('admin_config').handler({})) as Record<string, unknown>;

      expect(result.agentId).toBe('test-admin');
      expect(result.vaultPath).toBe(':memory:');
      expect(result.logLevel).toBe('info');
    });
  });

  // ─── admin_vault_size ──────────────────────────────────────────

  describe('admin_vault_size', () => {
    it('should return null size for in-memory vault', async () => {
      setup();
      const result = (await findOp('admin_vault_size').handler({})) as Record<string, unknown>;

      expect(result.path).toBe(':memory:');
      expect(result.sizeBytes).toBeNull();
      expect(result.sizeHuman).toBe('in-memory');
    });
  });

  // ─── admin_uptime ──────────────────────────────────────────────

  describe('admin_uptime', () => {
    it('should return uptime since creation', async () => {
      setup();
      const result = (await findOp('admin_uptime').handler({})) as Record<string, unknown>;

      expect(result.createdAt).toBeDefined();
      expect(typeof result.uptimeMs).toBe('number');
      expect(typeof result.uptimeSec).toBe('number');
      expect(typeof result.uptimeHuman).toBe('string');
      expect(result.uptimeMs as number).toBeGreaterThanOrEqual(0);
      expect(result.uptimeMs as number).toBeLessThan(5000); // should be nearly instant
    });

    it('should have valid ISO date in createdAt', async () => {
      setup();
      const result = (await findOp('admin_uptime').handler({})) as { createdAt: string };
      const parsed = new Date(result.createdAt);
      expect(parsed.getTime()).toBeGreaterThan(0);
    });
  });

  // ─── admin_version ─────────────────────────────────────────────

  describe('admin_version', () => {
    it('should return version information', async () => {
      setup();
      const result = (await findOp('admin_version').handler({})) as Record<string, unknown>;

      expect(typeof result.core).toBe('string');
      expect(result.node).toMatch(/^v\d+/);
      expect(typeof result.platform).toBe('string');
      expect(typeof result.arch).toBe('string');
    });
  });

  // ─── admin_reset_cache ─────────────────────────────────────────

  describe('admin_reset_cache', () => {
    it('should clear caches and return status', async () => {
      setup();
      const result = (await findOp('admin_reset_cache').handler({})) as Record<string, unknown>;

      expect(result.cleared).toContain('brain_vocabulary');
      expect(typeof (result as { brainVocabularySize: number }).brainVocabularySize).toBe('number');
    });

    it('should have write auth', () => {
      setup();
      const op = findOp('admin_reset_cache');
      expect(op.auth).toBe('write');
    });
  });

  // ─── admin_diagnostic ──────────────────────────────────────────

  describe('admin_diagnostic', () => {
    it('should return diagnostic report with all checks', async () => {
      setup();
      const result = (await findOp('admin_diagnostic').handler({})) as {
        overall: string;
        checks: Array<{ name: string; status: string; detail: string }>;
        summary: string;
      };

      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.overall);
      expect(result.checks.length).toBeGreaterThanOrEqual(6);

      const checkNames = result.checks.map((c) => c.name);
      expect(checkNames).toContain('vault');
      expect(checkNames).toContain('brain_vocabulary');
      expect(checkNames).toContain('brain_intelligence');
      expect(checkNames).toContain('llm_openai');
      expect(checkNames).toContain('llm_anthropic');
      expect(checkNames).toContain('curator');
    });

    it('should report vault as ok for empty vault', async () => {
      setup();
      const result = (await findOp('admin_diagnostic').handler({})) as {
        checks: Array<{ name: string; status: string }>;
      };

      const vaultCheck = result.checks.find((c) => c.name === 'vault');
      expect(vaultCheck?.status).toBe('ok');
    });

    it('should report curator as ok', async () => {
      setup();
      const result = (await findOp('admin_diagnostic').handler({})) as {
        checks: Array<{ name: string; status: string }>;
      };

      const curatorCheck = result.checks.find((c) => c.name === 'curator');
      expect(curatorCheck?.status).toBe('ok');
    });

    it('should include summary string', async () => {
      setup();
      const result = (await findOp('admin_diagnostic').handler({})) as { summary: string };
      expect(result.summary).toMatch(/\d+ checks:/);
    });
  });

  // ─── Auth levels ───────────────────────────────────────────────

  describe('auth levels', () => {
    it('should use read auth for status ops', () => {
      setup();
      const readOps = [
        'admin_health',
        'admin_tool_list',
        'admin_config',
        'admin_vault_size',
        'admin_uptime',
        'admin_version',
        'admin_diagnostic',
      ];
      for (const name of readOps) {
        expect(findOp(name).auth).toBe('read');
      }
    });

    it('should use write auth for mutation ops', () => {
      setup();
      expect(findOp('admin_reset_cache').auth).toBe('write');
    });
  });
});
