import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminExtraOps } from './admin-extra-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

// ─── Mock Runtime Factory ──────────────────────────────────────────────

function createMockRuntime(): AgentRuntime {
  return {
    config: {
      agentId: 'test-agent',
      vaultPath: '/tmp/vault.db',
      plansPath: '/tmp/plans.json',
      logLevel: 'info',
    },
    authPolicy: { mode: 'permissive', callerLevel: 'admin' },
    vault: {
      getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => ({ count: 0 })),
        })),
      })),
      add: vi.fn(),
      remove: vi.fn(() => true),
      get: vi.fn((id: string) => (id.includes('not-found') ? null : { id, tags: ['read'] })),
      list: vi.fn(() => []),
      stats: vi.fn(() => ({ totalEntries: 10, byDomain: { admin: 5 } })),
      getDomains: vi.fn(() => [
        { domain: 'admin', count: 5 },
        { domain: 'design', count: 3 },
      ]),
      rebuildFtsIndex: vi.fn(),
      getProvider: vi.fn(() => ({
        backend: 'sqlite',
        get: vi.fn(() => ({ count: 42 })),
      })),
    },
    brain: {
      getFeedbackStats: vi.fn(() => ({
        total: 100,
        byAction: { accepted: 70, dismissed: 20, failed: 10 },
      })),
      rebuildVocabulary: vi.fn(),
      getStats: vi.fn(() => ({ vocabularySize: 500 })),
    },
    telemetry: {
      getStats: vi.fn(() => ({ totalCalls: 42, successRate: 0.95 })),
      getRecent: vi.fn((limit: number) => Array.from({ length: limit }, (_, i) => ({ id: i }))),
      reset: vi.fn(),
    },
    llmClient: {
      isAvailable: vi.fn(() => ({ openai: true, anthropic: false })),
    },
    loop: {
      getStatus: vi.fn(() => null),
    },
    curator: {
      getStatus: vi.fn(() => ({ initialized: true })),
    },
    templateManager: {
      load: vi.fn(),
      listTemplates: vi.fn(() => ['template1', 'template2']),
    },
    health: {
      snapshot: vi.fn(() => ({
        overall: 'healthy',
        subsystems: { vault: { status: 'healthy' }, brain: { status: 'healthy' } },
      })),
      get: vi.fn((name: string) => (name === 'vault' ? { status: 'healthy', failures: 0 } : null)),
    },
    flags: {
      getAll: vi.fn(() => ({
        'auth-enforcement': { enabled: true, source: 'default', description: 'Auth check' },
      })),
      set: vi.fn(),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op not found: ${name}`);
  return op;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('createAdminExtraOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  beforeEach(() => {
    runtime = createMockRuntime();
    ops = createAdminExtraOps(runtime);
  });

  describe('admin_telemetry', () => {
    it('returns telemetry stats', async () => {
      const result = await findOp(ops, 'admin_telemetry').handler({});
      expect(result).toEqual({ totalCalls: 42, successRate: 0.95 });
    });
  });

  describe('admin_telemetry_recent', () => {
    it('returns recent calls with default limit', async () => {
      const result = await findOp(ops, 'admin_telemetry_recent').handler({});
      expect(runtime.telemetry.getRecent).toHaveBeenCalledWith(50);
      expect(Array.isArray(result)).toBe(true);
    });

    it('respects custom limit', async () => {
      await findOp(ops, 'admin_telemetry_recent').handler({ limit: 10 });
      expect(runtime.telemetry.getRecent).toHaveBeenCalledWith(10);
    });
  });

  describe('admin_telemetry_reset', () => {
    it('resets telemetry and returns confirmation', async () => {
      const result = await findOp(ops, 'admin_telemetry_reset').handler({});
      expect(runtime.telemetry.reset).toHaveBeenCalled();
      expect(result).toEqual({ reset: true, message: 'Telemetry counters cleared.' });
    });
  });

  describe('admin_permissions', () => {
    it('returns current auth policy on get', async () => {
      const result = (await findOp(ops, 'admin_permissions').handler({
        action: 'get',
      })) as Record<string, unknown>;
      expect(result.authPolicy).toEqual({ mode: 'permissive', callerLevel: 'admin' });
    });

    it('sets mode and syncs legacy level', async () => {
      const result = (await findOp(ops, 'admin_permissions').handler({
        action: 'set',
        mode: 'enforce',
      })) as Record<string, unknown>;
      expect(runtime.authPolicy.mode).toBe('enforce');
      expect(result.level).toBe('strict');
    });

    it('sets callerLevel', async () => {
      await findOp(ops, 'admin_permissions').handler({
        action: 'set',
        callerLevel: 'read',
      });
      expect(runtime.authPolicy.callerLevel).toBe('read');
    });
  });

  describe('admin_vault_analytics', () => {
    it('returns analytics from vault db', async () => {
      const result = (await findOp(ops, 'admin_vault_analytics').handler({})) as Record<
        string,
        unknown
      >;
      expect(result).toHaveProperty('totalEntries');
      expect(result).toHaveProperty('byDomain');
      expect(result).toHaveProperty('byType');
      expect(result).toHaveProperty('byAge');
      expect(result).toHaveProperty('avgTagsPerEntry');
    });

    it('returns error on db failure', async () => {
      vi.mocked(runtime.vault.getDb).mockImplementation(() => {
        throw new Error('DB gone');
      });
      const result = (await findOp(ops, 'admin_vault_analytics').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.error).toBe('Failed to compute vault analytics');
    });
  });

  describe('admin_search_insights', () => {
    it('returns feedback stats and miss rate', async () => {
      const result = (await findOp(ops, 'admin_search_insights').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.totalFeedback).toBe(100);
      expect(result.missRate).toBe(0.3);
      expect(result.missCount).toBe(30);
    });

    it('returns defaults on error', async () => {
      vi.mocked(runtime.brain.getFeedbackStats).mockImplementation(() => {
        throw new Error('fail');
      });
      const result = (await findOp(ops, 'admin_search_insights').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.totalFeedback).toBe(0);
      expect(result.note).toBe('No feedback data available');
    });
  });

  describe('admin_module_status', () => {
    it('returns module status object', async () => {
      const result = (await findOp(ops, 'admin_module_status').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.vault).toBe(true);
      expect(result.brain).toBe(true);
      expect(result.planner).toBe(true);
      expect((result.llm as Record<string, boolean>).openai).toBe(true);
    });
  });

  describe('admin_env', () => {
    it('returns safe env info without secrets', async () => {
      const result = (await findOp(ops, 'admin_env').handler({})) as Record<string, unknown>;
      expect(result.nodeVersion).toBe(process.version);
      expect(result.platform).toBe(process.platform);
      expect(result).toHaveProperty('memoryUsage');
    });
  });

  describe('admin_gc', () => {
    it('clears brain and telemetry', async () => {
      const result = (await findOp(ops, 'admin_gc').handler({})) as { cleared: string[] };
      expect(result.cleared).toContain('brain');
      expect(result.cleared).toContain('telemetry');
    });

    it('handles brain rebuild failure gracefully', async () => {
      vi.mocked(runtime.brain.rebuildVocabulary).mockImplementation(() => {
        throw new Error('fail');
      });
      const result = (await findOp(ops, 'admin_gc').handler({})) as { cleared: string[] };
      expect(result.cleared).not.toContain('brain');
      expect(result.cleared).toContain('telemetry');
    });
  });

  describe('admin_export_config', () => {
    it('returns config without secrets', async () => {
      const result = (await findOp(ops, 'admin_export_config').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.agentId).toBe('test-agent');
      expect(result.modules).toContain('vault');
      expect(result.modules).toContain('brain');
    });
  });

  describe('admin_key_pool_status', () => {
    it('returns LLM availability', async () => {
      const result = (await findOp(ops, 'admin_key_pool_status').handler({})) as Record<
        string,
        unknown
      >;
      expect((result.openai as Record<string, boolean>).available).toBe(true);
      expect((result.anthropic as Record<string, boolean>).available).toBe(false);
    });
  });

  describe('admin_create_token', () => {
    it('creates token and stores in vault', async () => {
      const result = (await findOp(ops, 'admin_create_token').handler({
        name: 'my-token',
        role: 'read',
      })) as Record<string, unknown>;
      expect(result.created).toBe(true);
      expect(result.name).toBe('my-token');
      expect(runtime.vault.add).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'api-token-my-token' }),
      );
    });
  });

  describe('admin_revoke_token', () => {
    it('revokes token from vault', async () => {
      const result = (await findOp(ops, 'admin_revoke_token').handler({
        name: 'my-token',
      })) as Record<string, unknown>;
      expect(result.revoked).toBe(true);
      expect(runtime.vault.remove).toHaveBeenCalledWith('api-token-my-token');
    });
  });

  describe('admin_list_tokens', () => {
    it('returns filtered token entries', async () => {
      vi.mocked(runtime.vault.list).mockReturnValue([
        { id: 'api-token-tok1', tags: ['api-token', 'read'] },
        { id: 'api-token-tok2', tags: ['api-token', 'admin'] },
        { id: 'unrelated-entry', tags: ['other'] },
      ] as unknown);
      const result = (await findOp(ops, 'admin_list_tokens').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.count).toBe(2);
    });
  });

  describe('admin_add_account', () => {
    it('adds account profile to vault', async () => {
      const result = (await findOp(ops, 'admin_add_account').handler({
        name: 'prod',
        provider: 'openai',
      })) as Record<string, unknown>;
      expect(result.added).toBe(true);
      expect(result.provider).toBe('openai');
    });
  });

  describe('admin_remove_account', () => {
    it('removes account from vault', async () => {
      const result = (await findOp(ops, 'admin_remove_account').handler({
        name: 'prod',
      })) as Record<string, unknown>;
      expect(result.removed).toBe(true);
    });
  });

  describe('admin_rotate_account', () => {
    it('returns error when profile not found', async () => {
      vi.mocked(runtime.vault.get).mockReturnValue(null as unknown);
      const result = (await findOp(ops, 'admin_rotate_account').handler({
        name: 'missing',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });

    it('returns rotated when profile exists', async () => {
      vi.mocked(runtime.vault.get).mockReturnValue({ id: 'account-profile-prod' } as unknown);
      const result = (await findOp(ops, 'admin_rotate_account').handler({
        name: 'prod',
      })) as Record<string, unknown>;
      expect(result.rotated).toBe(true);
    });
  });

  describe('admin_list_accounts', () => {
    it('returns filtered account entries', async () => {
      vi.mocked(runtime.vault.list).mockReturnValue([
        { id: 'account-profile-prod', tags: ['account-profile', 'openai'] },
      ] as unknown);
      const result = (await findOp(ops, 'admin_list_accounts').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.count).toBe(1);
    });
  });

  describe('admin_list_plugins', () => {
    it('returns non-admin/planning domains as plugins', async () => {
      const result = (await findOp(ops, 'admin_list_plugins').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.count).toBe(1); // 'design' only (admin filtered out)
    });
  });

  describe('admin_plugin_status', () => {
    it('returns error for empty domain', async () => {
      vi.mocked(runtime.vault.list).mockReturnValue([]);
      const result = (await findOp(ops, 'admin_plugin_status').handler({
        pluginId: 'nonexistent',
      })) as Record<string, unknown>;
      expect(result.error).toContain('not found or empty');
    });

    it('returns status for domain with entries', async () => {
      vi.mocked(runtime.vault.list).mockReturnValue([{ id: 'entry-1' }] as unknown);
      const result = (await findOp(ops, 'admin_plugin_status').handler({
        pluginId: 'design',
      })) as Record<string, unknown>;
      expect(result.status).toBe('active');
      expect(result.entryCount).toBe(1);
    });
  });

  describe('admin_hot_reload', () => {
    it('reloads brain, vault FTS, and templates', async () => {
      const result = (await findOp(ops, 'admin_hot_reload').handler({})) as Record<string, unknown>;
      expect((result.reloaded as string[]).length).toBe(3);
      expect(result.brainTerms).toBe(500);
      expect(result.templateCount).toBe(2);
    });

    it('handles partial failures gracefully', async () => {
      vi.mocked(runtime.vault.rebuildFtsIndex).mockImplementation(() => {
        throw new Error('fail');
      });
      const result = (await findOp(ops, 'admin_hot_reload').handler({})) as Record<string, unknown>;
      expect(result.reloaded).not.toContain('vault_fts');
    });
  });

  describe('admin_validate_instructions', () => {
    it('returns error for non-existent file', async () => {
      const result = (await findOp(ops, 'admin_validate_instructions').handler({
        filePath: '/tmp/nonexistent.md',
      })) as Record<string, unknown>;
      expect(result.valid).toBe(false);
    });
  });

  describe('admin_health_snapshot', () => {
    it('returns full health snapshot', async () => {
      const result = (await findOp(ops, 'admin_health_snapshot').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.overall).toBe('healthy');
    });
  });

  describe('admin_subsystem_health', () => {
    it('returns subsystem health for known subsystem', async () => {
      const result = (await findOp(ops, 'admin_subsystem_health').handler({
        subsystem: 'vault',
      })) as Record<string, unknown>;
      expect(result.status).toBe('healthy');
    });

    it('returns error for unknown subsystem', async () => {
      const result = (await findOp(ops, 'admin_subsystem_health').handler({
        subsystem: 'nonexistent',
      })) as Record<string, unknown>;
      expect(result.error).toContain('Unknown subsystem');
      expect(result.available).toBeDefined();
    });
  });

  describe('admin_list_flags', () => {
    it('returns all feature flags', async () => {
      const result = (await findOp(ops, 'admin_list_flags').handler({})) as Record<string, unknown>;
      expect(result).toHaveProperty('auth-enforcement');
    });
  });

  describe('admin_get_flag', () => {
    it('returns specific flag info', async () => {
      const result = (await findOp(ops, 'admin_get_flag').handler({
        flag: 'auth-enforcement',
      })) as Record<string, unknown>;
      expect(result.flag).toBe('auth-enforcement');
      expect(result.enabled).toBe(true);
    });

    it('returns error for unknown flag', async () => {
      const result = (await findOp(ops, 'admin_get_flag').handler({
        flag: 'nonexistent',
      })) as Record<string, unknown>;
      expect(result.error).toContain('Unknown flag');
    });
  });

  describe('admin_set_flag', () => {
    it('sets flag and confirms', async () => {
      const result = (await findOp(ops, 'admin_set_flag').handler({
        flag: 'auth-enforcement',
        enabled: false,
      })) as Record<string, unknown>;
      expect(result.persisted).toBe(true);
      expect(runtime.flags.set).toHaveBeenCalledWith('auth-enforcement', false);
    });
  });

  describe('admin_persistence_info', () => {
    it('returns backend and table counts', async () => {
      const result = (await findOp(ops, 'admin_persistence_info').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.backend).toBe('sqlite');
      expect(result.tables).toBeDefined();
    });
  });

  describe('admin_setup_check', () => {
    it('returns readiness with per-subsystem checks', async () => {
      const result = (await findOp(ops, 'admin_setup_check').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.agentId).toBe('test-agent');
      expect(result.checks).toBeDefined();
      expect(typeof result.ready).toBe('boolean');
    });
  });

  describe('admin_setup_run', () => {
    it('runs setup actions', async () => {
      const result = (await findOp(ops, 'admin_setup_run').handler({})) as Record<string, unknown>;
      expect(result.setup).toBe(true);
      expect((result.actions as string[]).length).toBeGreaterThan(0);
    });
  });
});
