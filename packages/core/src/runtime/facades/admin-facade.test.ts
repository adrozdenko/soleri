import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminFacadeOps } from './admin-facade.js';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';

function mockRuntime(): AgentRuntime {
  return {
    config: {
      agentId: 'test-agent',
      vaultPath: ':memory:',
      plansPath: '/tmp/plans.json',
      logLevel: 'info',
    },
    llmClient: {
      complete: vi.fn(),
      isAvailable: vi.fn().mockReturnValue({ openai: true, anthropic: false }),
    },
    keyPool: {
      openai: {
        hasKeys: true,
        rotateOnError: vi.fn().mockReturnValue('new-key'),
        activeKeyIndex: 1,
        poolSize: 3,
        exhausted: false,
      },
      anthropic: {
        hasKeys: false,
        rotateOnError: vi.fn().mockReturnValue(null),
        activeKeyIndex: 0,
        poolSize: 0,
        exhausted: true,
      },
    },
    templateManager: {
      render: vi.fn().mockReturnValue('rendered template'),
      listTemplates: vi.fn().mockReturnValue(['greeting', 'summary']),
      load: vi.fn(),
    },
    vault: {
      stats: vi.fn().mockReturnValue({ totalEntries: 10, byDomain: { core: 5, design: 5 } }),
      getDb: vi.fn(),
      getDomains: vi.fn().mockReturnValue([]),
      list: vi.fn().mockReturnValue([]),
      add: vi.fn(),
      remove: vi.fn(),
      get: vi.fn(),
      rebuildFtsIndex: vi.fn(),
      getProvider: vi.fn().mockReturnValue({ backend: 'sqlite', get: vi.fn() }),
    },
    brain: {
      getStats: vi.fn().mockReturnValue({ vocabularySize: 100, feedbackCount: 50 }),
      rebuildVocabulary: vi.fn(),
      getFeedbackStats: vi.fn().mockReturnValue({
        total: 10,
        byAction: { dismissed: 2, failed: 1 },
      }),
    },
    brainIntelligence: {
      getStats: vi.fn().mockReturnValue({ strengths: 5, sessions: 10 }),
    },
    curator: {
      getStatus: vi.fn().mockReturnValue({ initialized: true }),
    },
    telemetry: {
      getStats: vi.fn().mockReturnValue({ totalCalls: 100 }),
      getRecent: vi.fn().mockReturnValue([]),
      reset: vi.fn(),
    },
    loop: {
      getStatus: vi.fn().mockReturnValue(null),
    },
    contextHealth: {
      check: vi.fn().mockReturnValue({ level: 'green', estimatedFill: 0 }),
    },
    authPolicy: { mode: 'permissive', callerLevel: 'admin' },
    flags: {
      getAll: vi.fn().mockReturnValue({}),
      set: vi.fn(),
    },
    health: {
      snapshot: vi.fn().mockReturnValue({ overall: 'healthy', subsystems: {} }),
      get: vi.fn(),
    },
    pluginRegistry: {
      get: vi.fn(),
    },
    packInstaller: {},
    createdAt: Date.now() - 60000,
    persona: { name: 'TestAgent' },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found among: ${ops.map((o) => o.name).join(', ')}`);
  return op;
}

describe('createAdminFacadeOps', () => {
  let runtime: ReturnType<typeof mockRuntime>;
  let ops: OpDefinition[];

  beforeEach(() => {
    runtime = mockRuntime();
    ops = createAdminFacadeOps(runtime);
  });

  it('returns inline ops (llm_rotate, llm_call, render_prompt, list_templates)', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('llm_rotate');
    expect(names).toContain('llm_call');
    expect(names).toContain('render_prompt');
    expect(names).toContain('list_templates');
  });

  it('includes satellite ops from admin-ops', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('admin_health');
    expect(names).toContain('admin_diagnostic');
    expect(names).toContain('admin_config');
  });

  it('includes satellite ops from admin-extra-ops', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('admin_telemetry');
    expect(names).toContain('admin_permissions');
    expect(names).toContain('admin_vault_analytics');
  });

  it('includes satellite ops from admin-setup-ops', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('admin_inject_claude_md');
    expect(names).toContain('admin_setup_global');
    expect(names).toContain('admin_check_persistence');
  });

  it('includes session briefing ops', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('session_briefing');
  });

  describe('llm_rotate', () => {
    it('rotates openai key pool', async () => {
      const result = (await findOp(ops, 'llm_rotate').handler({
        provider: 'openai',
      })) as Record<string, unknown>;
      expect(result.rotated).toBe(true);
      expect(result.activeKeyIndex).toBe(1);
      expect(result.poolSize).toBe(3);
    });

    it('returns error when provider has no keys', async () => {
      const result = (await findOp(ops, 'llm_rotate').handler({
        provider: 'anthropic',
      })) as Record<string, unknown>;
      expect(result.rotated).toBe(false);
      expect(result.error).toContain('No anthropic keys');
    });
  });

  describe('llm_call', () => {
    it('calls LLM with provided params', async () => {
      vi.mocked(runtime.llmClient.complete).mockResolvedValue({ text: 'Hello' } as never);

      const result = await findOp(ops, 'llm_call').handler({
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
        temperature: 0.5,
        maxTokens: 100,
      });
      expect(result).toEqual({ text: 'Hello' });
      expect(runtime.llmClient.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'You are helpful',
          userPrompt: 'Say hello',
          temperature: 0.5,
          maxTokens: 100,
          caller: 'core-ops',
        }),
      );
    });

    it('defaults caller to core-ops', async () => {
      vi.mocked(runtime.llmClient.complete).mockResolvedValue({} as never);

      await findOp(ops, 'llm_call').handler({
        systemPrompt: 'sys',
        userPrompt: 'usr',
      });
      expect(runtime.llmClient.complete).toHaveBeenCalledWith(
        expect.objectContaining({ caller: 'core-ops' }),
      );
    });
  });

  describe('render_prompt', () => {
    it('renders template with variables', async () => {
      const result = (await findOp(ops, 'render_prompt').handler({
        template: 'greeting',
        variables: { name: 'World' },
        strict: true,
      })) as Record<string, unknown>;
      expect(result.rendered).toBe('rendered template');
      expect(runtime.templateManager.render).toHaveBeenCalledWith(
        'greeting',
        { name: 'World' },
        { strict: true },
      );
    });

    it('defaults to empty variables', async () => {
      await findOp(ops, 'render_prompt').handler({ template: 'summary' });
      expect(runtime.templateManager.render).toHaveBeenCalledWith(
        'summary',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('list_templates', () => {
    it('returns template list', async () => {
      const result = (await findOp(ops, 'list_templates').handler({})) as Record<string, unknown>;
      expect(result.templates).toEqual(['greeting', 'summary']);
    });
  });

  describe('admin_health (from satellite)', () => {
    it('returns health status', async () => {
      const result = (await findOp(ops, 'admin_health').handler({})) as Record<string, unknown>;
      expect(result.status).toBe('ok');
      expect(result.vault).toBeDefined();
      expect(result.brain).toBeDefined();
    });
  });

  describe('admin_config (from satellite)', () => {
    it('returns runtime config', async () => {
      const result = (await findOp(ops, 'admin_config').handler({})) as Record<string, unknown>;
      expect(result.agentId).toBe('test-agent');
      expect(result.logLevel).toBe('info');
    });
  });

  describe('admin_vault_size (from satellite)', () => {
    it('returns in-memory for :memory: vault', async () => {
      const result = (await findOp(ops, 'admin_vault_size').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.path).toBe(':memory:');
      expect(result.sizeHuman).toBe('in-memory');
    });
  });

  describe('admin_uptime (from satellite)', () => {
    it('returns uptime info', async () => {
      const result = (await findOp(ops, 'admin_uptime').handler({})) as Record<string, unknown>;
      expect(result.uptimeMs).toBeGreaterThan(0);
      expect(result.createdAt).toBeDefined();
    });
  });

  describe('admin_version (from satellite)', () => {
    it('returns version info', async () => {
      const result = (await findOp(ops, 'admin_version').handler({})) as Record<string, unknown>;
      expect(result.node).toBe(process.version);
      expect(result.platform).toBe(process.platform);
    });
  });

  describe('context_health (from satellite)', () => {
    it('returns context health', async () => {
      const result = (await findOp(ops, 'context_health').handler({})) as Record<string, unknown>;
      expect(result.level).toBe('green');
    });
  });

  describe('admin_reset_cache (from satellite)', () => {
    it('clears brain vocabulary', async () => {
      const result = (await findOp(ops, 'admin_reset_cache').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.cleared).toContain('brain_vocabulary');
      expect(runtime.brain.rebuildVocabulary).toHaveBeenCalled();
    });
  });

  describe('admin_telemetry (from admin-extra)', () => {
    it('returns telemetry stats', async () => {
      const result = (await findOp(ops, 'admin_telemetry').handler({})) as Record<string, unknown>;
      expect(result.totalCalls).toBe(100);
    });
  });

  describe('admin_permissions (from admin-extra)', () => {
    it('gets current permissions', async () => {
      const result = (await findOp(ops, 'admin_permissions').handler({
        action: 'get',
      })) as Record<string, unknown>;
      expect(result.authPolicy).toBeDefined();
    });

    it('sets permissions', async () => {
      const result = (await findOp(ops, 'admin_permissions').handler({
        action: 'set',
        mode: 'enforce',
        callerLevel: 'write',
      })) as Record<string, unknown>;
      expect(runtime.authPolicy.mode).toBe('enforce');
      expect(runtime.authPolicy.callerLevel).toBe('write');
      expect(result.level).toBe('strict');
    });
  });

  describe('admin_health_snapshot (from admin-extra)', () => {
    it('returns health snapshot', async () => {
      const result = (await findOp(ops, 'admin_health_snapshot').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.overall).toBe('healthy');
    });
  });

  describe('admin_list_flags (from admin-extra)', () => {
    it('returns feature flags', async () => {
      const result = await findOp(ops, 'admin_list_flags').handler({});
      expect(result).toEqual({});
    });
  });
});
