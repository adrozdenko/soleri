import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminOps } from './admin-ops.js';
import type { AgentRuntime } from './types.js';

// ---------------------------------------------------------------------------
// Mock runtime
// ---------------------------------------------------------------------------

function mockRuntime(): AgentRuntime {
  return {
    config: {
      agentId: 'test-agent',
      vaultPath: '/tmp/vault.db',
      plansPath: '/tmp/plans.json',
      dataDir: null,
      logLevel: 'info',
    },
    vault: {
      stats: vi.fn().mockReturnValue({
        totalEntries: 42,
        byDomain: { general: 30, testing: 12 },
        byType: { pattern: 25, 'anti-pattern': 17 },
      }),
    },
    brain: {
      getStats: vi.fn().mockReturnValue({ vocabularySize: 500, feedbackCount: 20 }),
      rebuildVocabulary: vi.fn(),
    },
    brainIntelligence: {
      getStats: vi.fn().mockReturnValue({ strengths: 10, sessions: 5 }),
    },
    llmClient: {
      isAvailable: vi.fn().mockReturnValue({ openai: true, anthropic: false }),
    },
    curator: {
      getStatus: vi.fn().mockReturnValue({ initialized: true }),
    },
    contextHealth: {
      check: vi.fn().mockReturnValue({
        level: 'green',
        estimatedFill: 0.15,
        toolCallCount: 10,
        estimatedTokens: 5000,
        recommendation: 'Context usage is healthy.',
      }),
    },
    createdAt: Date.now() - 60_000, // 1 minute ago
  } as unknown as AgentRuntime;
}

function findOp(ops: ReturnType<typeof createAdminOps>, name: string) {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAdminOps', () => {
  let rt: AgentRuntime;
  let ops: ReturnType<typeof createAdminOps>;

  beforeEach(() => {
    rt = mockRuntime();
    ops = createAdminOps(rt);
  });

  it('returns 11 ops', () => {
    expect(ops.length).toBe(11);
  });

  // ─── admin_health ─────────────────────────────────────────────

  describe('admin_health', () => {
    it('returns ok status with subsystem info', async () => {
      const op = findOp(ops, 'admin_health');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.status).toBe('ok');
      expect(result).toHaveProperty('vault');
      expect(result).toHaveProperty('llm');
      expect(result).toHaveProperty('brain');
      expect(result).toHaveProperty('curator');
    });

    it('reports vault entries count', async () => {
      const op = findOp(ops, 'admin_health');
      const result = (await op.handler({})) as Record<string, unknown>;
      const vault = result.vault as Record<string, unknown>;
      expect(vault.entries).toBe(42);
    });

    it('reports LLM availability', async () => {
      const op = findOp(ops, 'admin_health');
      const result = (await op.handler({})) as Record<string, unknown>;
      const llm = result.llm as Record<string, boolean>;
      expect(llm.openai).toBe(true);
      expect(llm.anthropic).toBe(false);
    });
  });

  // ─── context_health ───────────────────────────────────────────

  describe('context_health', () => {
    it('returns context health status', async () => {
      const op = findOp(ops, 'context_health');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.level).toBe('green');
      expect(result.toolCallCount).toBe(10);
    });
  });

  // ─── admin_tool_list ──────────────────────────────────────────

  describe('admin_tool_list', () => {
    it('returns fallback when no _allOps provided', async () => {
      const op = findOp(ops, 'admin_tool_list');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.count).toBe(8);
    });

    it('returns grouped ops when _allOps provided', async () => {
      const op = findOp(ops, 'admin_tool_list');
      const allOps = [
        { name: 'admin_health', description: 'Health check', auth: 'read' },
        { name: 'vault_search', description: 'Search vault', auth: 'read' },
      ];
      const result = (await op.handler({ _allOps: allOps })) as Record<string, unknown>;
      expect(result.count).toBe(2);
      const grouped = result.ops as Record<string, string[]>;
      expect(grouped.admin).toContain('admin_health');
      expect(grouped.vault).toContain('vault_search');
    });

    it('returns routing hints in grouped mode', async () => {
      const op = findOp(ops, 'admin_tool_list');
      const allOps = [
        { name: 'admin_health', description: 'Health check', auth: 'read' },
      ];
      const result = (await op.handler({ _allOps: allOps })) as Record<string, unknown>;
      const routing = result.routing as Record<string, string>;
      expect(routing).toBeDefined();
      expect(typeof routing).toBe('object');
      // Spot-check a few known intent signals
      expect(routing['search knowledge']).toBe('vault.search_intelligent');
      expect(routing['plan this']).toBe('plan.create_plan');
      expect(routing['health check']).toBe('admin.admin_health');
    });

    it('returns routing hints in fallback mode', async () => {
      const op = findOp(ops, 'admin_tool_list');
      const result = (await op.handler({})) as Record<string, unknown>;
      const routing = result.routing as Record<string, string>;
      expect(routing).toBeDefined();
      expect(Object.keys(routing).length).toBeGreaterThan(0);
    });

    it('returns verbose format when verbose=true', async () => {
      const op = findOp(ops, 'admin_tool_list');
      const allOps = [{ name: 'admin_health', description: 'Health check', auth: 'read' }];
      const result = (await op.handler({
        _allOps: allOps,
        verbose: true,
      })) as Record<string, unknown>;
      const opsList = result.ops as Array<Record<string, string>>;
      expect(opsList[0].name).toBe('admin_health');
      expect(opsList[0].description).toBe('Health check');
    });
  });

  // ─── admin_config ─────────────────────────────────────────────

  describe('admin_config', () => {
    it('returns runtime configuration', async () => {
      const op = findOp(ops, 'admin_config');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.agentId).toBe('test-agent');
      expect(result.vaultPath).toBe('/tmp/vault.db');
      expect(result.logLevel).toBe('info');
    });
  });

  // ─── admin_vault_size ─────────────────────────────────────────

  describe('admin_vault_size', () => {
    it('returns in-memory for :memory: vaults', async () => {
      const rtMem = mockRuntime();
      (rtMem.config as Record<string, unknown>).vaultPath = ':memory:';
      const memOps = createAdminOps(rtMem);
      const memOp = findOp(memOps, 'admin_vault_size');
      const result = (await memOp.handler({})) as Record<string, unknown>;
      expect(result.sizeHuman).toBe('in-memory');
    });
  });

  // ─── admin_uptime ─────────────────────────────────────────────

  describe('admin_uptime', () => {
    it('returns uptime in seconds and human-readable', async () => {
      const op = findOp(ops, 'admin_uptime');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.uptimeSec).toBeGreaterThanOrEqual(0);
      expect(result.uptimeHuman).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });
  });

  // ─── admin_version ────────────────────────────────────────────

  describe('admin_version', () => {
    it('returns version info', async () => {
      const op = findOp(ops, 'admin_version');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.node).toMatch(/^v\d+/);
      expect(result.platform).toBeDefined();
      expect(result.arch).toBeDefined();
    });
  });

  // ─── admin_reset_cache ────────────────────────────────────────

  describe('admin_reset_cache', () => {
    it('rebuilds brain vocabulary', async () => {
      const op = findOp(ops, 'admin_reset_cache');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(rt.brain.rebuildVocabulary).toHaveBeenCalled();
      expect(result.cleared).toContain('brain_vocabulary');
    });
  });

  // ─── operator_context_inspect ────────────────────────────────

  describe('operator_context_inspect', () => {
    it('returns full profile when store is available', async () => {
      const mockContext = {
        expertise: [{ topic: 'TypeScript', level: 'expert', confidence: 0.9, sessionCount: 5, lastObserved: Date.now() }],
        corrections: [],
        interests: [{ tag: 'testing', confidence: 0.7, mentionCount: 3, lastMentioned: Date.now() }],
        patterns: [],
        sessionCount: 5,
        lastUpdated: Date.now(),
      };
      (rt as Record<string, unknown>).operatorContextStore = {
        inspect: vi.fn().mockReturnValue(mockContext),
        deleteItem: vi.fn(),
      };
      const updatedOps = createAdminOps(rt);
      const op = findOp(updatedOps, 'operator_context_inspect');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.available).toBe(true);
      expect(result.expertise).toEqual(mockContext.expertise);
      expect(result.interests).toEqual(mockContext.interests);
    });

    it('returns not-available when store is missing', async () => {
      // Default mock runtime has no operatorContextStore
      const op = findOp(ops, 'operator_context_inspect');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.available).toBe(false);
      expect(result.message).toBe('Operator context not configured');
    });
  });

  // ─── operator_context_delete ───────────────────────────────────

  describe('operator_context_delete', () => {
    it('removes an item successfully', async () => {
      (rt as Record<string, unknown>).operatorContextStore = {
        inspect: vi.fn(),
        deleteItem: vi.fn().mockReturnValue(true),
      };
      const updatedOps = createAdminOps(rt);
      const op = findOp(updatedOps, 'operator_context_delete');
      const result = (await op.handler({ type: 'expertise', id: 'abc-123' })) as Record<string, unknown>;
      expect(result.deleted).toBe(true);
      expect(result.type).toBe('expertise');
      expect(result.id).toBe('abc-123');
    });

    it('returns false for missing item', async () => {
      (rt as Record<string, unknown>).operatorContextStore = {
        inspect: vi.fn(),
        deleteItem: vi.fn().mockReturnValue(false),
      };
      const updatedOps = createAdminOps(rt);
      const op = findOp(updatedOps, 'operator_context_delete');
      const result = (await op.handler({ type: 'pattern', id: 'nonexistent' })) as Record<string, unknown>;
      expect(result.deleted).toBe(false);
      expect(result.message).toBe('Item not found');
    });

    it('returns not-available when store is missing', async () => {
      const op = findOp(ops, 'operator_context_delete');
      const result = (await op.handler({ type: 'expertise', id: 'abc' })) as Record<string, unknown>;
      expect(result.deleted).toBe(false);
      expect(result.message).toBe('Operator context not configured');
    });
  });

  // ─── admin_diagnostic ─────────────────────────────────────────

  describe('admin_diagnostic', () => {
    it('runs all diagnostic checks and returns summary', async () => {
      // Mock LLM as available for this test to get healthy status
      vi.mocked(rt.llmClient.isAvailable).mockReturnValue({ openai: true, anthropic: true });
      const op = findOp(ops, 'admin_diagnostic');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.overall).toBe('healthy');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('summary');
      const checks = result.checks as Array<Record<string, string>>;
      expect(checks.length).toBeGreaterThanOrEqual(5);
    });

    it('reports degraded when LLM unavailable', async () => {
      vi.mocked(rt.llmClient.isAvailable).mockReturnValue({ openai: false, anthropic: false });
      const op = findOp(ops, 'admin_diagnostic');
      const result = (await op.handler({})) as Record<string, unknown>;
      // At least one warn expected for missing LLM keys
      expect(result.overall).toBe('degraded');
    });

    it('reports vault error when vault.stats throws', async () => {
      vi.mocked(rt.vault.stats).mockImplementation(() => {
        throw new Error('DB locked');
      });
      const op = findOp(ops, 'admin_diagnostic');
      const result = (await op.handler({})) as Record<string, unknown>;
      const checks = result.checks as Array<Record<string, string>>;
      const vaultCheck = checks.find((c) => c.name === 'vault');
      expect(vaultCheck?.status).toBe('error');
    });

    it('reports brain vocabulary warn when empty', async () => {
      vi.mocked(rt.brain.getStats).mockReturnValue({
        vocabularySize: 0,
        feedbackCount: 0,
      } as never);
      const op = findOp(ops, 'admin_diagnostic');
      const result = (await op.handler({})) as Record<string, unknown>;
      const checks = result.checks as Array<Record<string, string>>;
      const brainCheck = checks.find((c) => c.name === 'brain_vocabulary');
      expect(brainCheck?.status).toBe('warn');
    });
  });
});
