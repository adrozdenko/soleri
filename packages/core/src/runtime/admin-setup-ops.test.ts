import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminSetupOps, syncHooksToClaudeSettings } from './admin-setup-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

// ─── Mock Node.js fs/os modules ────────────────────────────────────────

/** Normalize path separators so Windows backslash paths match forward-slash keys */
const norm = (p: string): string => p.replace(/\\/g, '/');

const mockFs: Record<string, string> = {};
const mockDirs = new Set<string>();

vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: string) => norm(p) in mockFs || mockDirs.has(norm(p))),
  readFileSync: vi.fn((p: string) => {
    const key = norm(p);
    if (key in mockFs) return mockFs[key];
    throw new Error(`ENOENT: ${p}`);
  }),
  writeFileSync: vi.fn((p: string, content: string) => {
    mockFs[norm(p)] = content;
  }),
  mkdirSync: vi.fn((_p: string) => undefined),
  copyFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 1024 })),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  // Always use posix path semantics so mock filesystem keys (forward slashes) work on all platforms
  return { ...actual.posix, default: actual.posix };
});

vi.mock('./claude-md-helpers.js', () => ({
  hasSections: vi.fn(() => false),
  removeSections: vi.fn((content: string) => content),
  injectAtPosition: vi.fn((_existing: string, injection: string) => `INJECTED:${injection}`),
  buildInjectionContent: vi.fn(() => '## Mock Agent Section'),
  injectEngineRulesBlock: vi.fn((content: string) => content),
}));

vi.mock('../paths.js', () => ({
  agentPlansPath: vi.fn(() => '/mock-home/.soleri/test-agent/plans.json'),
  agentVaultPath: vi.fn(() => '/mock-home/.soleri/test-agent/vault.db'),
}));

vi.mock('../skills/sync-skills.js', () => ({
  discoverSkills: vi.fn(() => [{ name: 'skill-1', path: '/mock/skills/skill-1' }]),
  syncSkillsToClaudeCode: vi.fn(() => ({
    installed: ['skill-1'],
    updated: [],
    skipped: [],
    failed: [],
    removed: [],
    cleanedGlobal: [],
  })),
}));

// ─── Mock Runtime Factory ──────────────────────────────────────────────

function createMockRuntime(): AgentRuntime {
  return {
    config: {
      agentId: 'test-agent',
      vaultPath: '/mock-home/.test-agent/vault.db',
      plansPath: '/mock-home/.test-agent/plans.json',
      dataDir: '/mock/agent-data',
      agentDir: '/mock/agent-dir',
    },
    persona: { name: 'TestBot' },
    vault: {
      getProvider: vi.fn(() => ({
        backend: 'sqlite',
        get: vi.fn(() => ({ count: 5 })),
      })),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op not found: ${name}`);
  return op;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('createAdminSetupOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  beforeEach(() => {
    // Reset mock filesystem
    for (const key of Object.keys(mockFs)) delete mockFs[key];
    mockDirs.clear();
    vi.clearAllMocks();

    runtime = createMockRuntime();
    ops = createAdminSetupOps(runtime);
  });

  describe('admin_inject_claude_md', () => {
    it('returns error when CLAUDE.md not found and createIfMissing is false', async () => {
      const result = (await findOp(ops, 'admin_inject_claude_md').handler({
        projectPath: '/some/project',
        createIfMissing: false,
      })) as Record<string, unknown>;
      expect(result.action).toBe('error');
      expect(result.error).toBe('CLAUDE.md not found');
    });

    it('creates new CLAUDE.md when createIfMissing is true', async () => {
      const result = (await findOp(ops, 'admin_inject_claude_md').handler({
        projectPath: '/some/project',
        createIfMissing: true,
        includeIntegration: true,
        position: 'after-title',
        dryRun: false,
        global: false,
      })) as Record<string, unknown>;
      expect(result.action).toBe('created');
      expect(result.agentId).toBe('test-agent');
    });

    it('dry run previews without writing', async () => {
      const result = (await findOp(ops, 'admin_inject_claude_md').handler({
        projectPath: '/some/project',
        createIfMissing: true,
        dryRun: true,
        global: false,
        includeIntegration: true,
        position: 'after-title',
      })) as Record<string, unknown>;
      expect(result.action).toBe('would_inject');
      expect(result.preview).toBeDefined();
    });

    it('injects into existing CLAUDE.md', async () => {
      mockFs['/some/project/CLAUDE.md'] = '# My Project\n\nExisting content.';
      const result = (await findOp(ops, 'admin_inject_claude_md').handler({
        projectPath: '/some/project',
        includeIntegration: true,
        position: 'after-title',
        dryRun: false,
        global: false,
        createIfMissing: false,
      })) as Record<string, unknown>;
      expect(result.action).toBe('injected');
    });

    it('updates existing agent sections', async () => {
      mockFs['/some/project/CLAUDE.md'] =
        '# Project\n<!-- agent:test-agent -->\nOld\n<!-- /agent:test-agent -->';
      const { hasSections } = await import('./claude-md-helpers.js');
      vi.mocked(hasSections).mockReturnValueOnce(true);
      const result = (await findOp(ops, 'admin_inject_claude_md').handler({
        projectPath: '/some/project',
        includeIntegration: true,
        position: 'after-title',
        dryRun: false,
        global: false,
        createIfMissing: false,
      })) as Record<string, unknown>;
      expect(result.action).toBe('updated');
    });

    it('injects into global CLAUDE.md', async () => {
      mockFs['/mock-home/.claude/CLAUDE.md'] = '# Global\n';
      // Ensure hasSections returns false for this test (fresh injection)
      const { hasSections } = await import('./claude-md-helpers.js');
      vi.mocked(hasSections).mockReturnValueOnce(false);
      const result = (await findOp(ops, 'admin_inject_claude_md').handler({
        projectPath: '.',
        global: true,
        includeIntegration: true,
        position: 'after-title',
        dryRun: false,
        createIfMissing: false,
      })) as Record<string, unknown>;
      expect(result.action).toBe('injected');
    });
  });

  describe('admin_setup_global', () => {
    it('dry run returns preview of what would be installed', async () => {
      const result = (await findOp(ops, 'admin_setup_global').handler({
        install: false,
        hooksOnly: false,
        settingsJsonOnly: false,
        skillsOnly: false,
      })) as Record<string, unknown>;
      expect(result.dryRun).toBe(true);
      expect(result.agentId).toBe('test-agent');
      expect(result.message).toContain('Dry run');
    });

    it('installs skills when install is true', async () => {
      const result = (await findOp(ops, 'admin_setup_global').handler({
        install: true,
        hooksOnly: false,
        settingsJsonOnly: false,
        skillsOnly: true,
      })) as Record<string, unknown>;
      expect(result.dryRun).toBe(false);
      const { syncSkillsToClaudeCode } = await import('../skills/sync-skills.js');
      expect(syncSkillsToClaudeCode).toHaveBeenCalled();
    });

    it('installs settings.json hooks when install is true', async () => {
      // Pre-populate settings.json
      mockFs['/mock-home/.claude/settings.json'] = JSON.stringify({});
      const result = (await findOp(ops, 'admin_setup_global').handler({
        install: true,
        hooksOnly: false,
        settingsJsonOnly: true,
        skillsOnly: false,
      })) as Record<string, unknown>;
      expect(result.dryRun).toBe(false);
      expect((result.settingsJson as Record<string, string[]>).installed.length).toBeGreaterThan(0);
    });

    it('skips skills when hooksOnly is true', async () => {
      const result = (await findOp(ops, 'admin_setup_global').handler({
        install: false,
        hooksOnly: true,
        settingsJsonOnly: false,
        skillsOnly: false,
      })) as Record<string, unknown>;
      expect((result.skills as Record<string, string[]>).installed).toHaveLength(0);
    });
  });

  describe('admin_setup_project', () => {
    it('analyze mode returns hook analysis', async () => {
      mockDirs.add('/some/project');
      const result = (await findOp(ops, 'admin_setup_project').handler({
        projectPath: '/some/project',
        cleanup: false,
        install: false,
      })) as Record<string, unknown>;
      expect(result.mode).toBe('analyze');
      expect(result).toHaveProperty('globalHooks');
      expect(result).toHaveProperty('projectHooks');
    });

    it('returns error for non-existent project', async () => {
      const result = (await findOp(ops, 'admin_setup_project').handler({
        projectPath: '/nonexistent',
        cleanup: false,
        install: false,
      })) as Record<string, unknown>;
      expect(result.error).toBe('PROJECT_NOT_FOUND');
    });

    it('cleanup mode removes duplicates', async () => {
      mockDirs.add('/some/project');
      const result = (await findOp(ops, 'admin_setup_project').handler({
        projectPath: '/some/project',
        cleanup: true,
        install: false,
      })) as Record<string, unknown>;
      expect(result.mode).toBe('cleanup');
      expect(result).toHaveProperty('removed');
    });

    it('install mode copies hooks to project', async () => {
      mockDirs.add('/some/project');
      const result = (await findOp(ops, 'admin_setup_project').handler({
        projectPath: '/some/project',
        cleanup: false,
        install: true,
      })) as Record<string, unknown>;
      expect(result.mode).toBe('install');
      expect(result).toHaveProperty('installed');
      expect(result).toHaveProperty('skipped');
    });
  });

  describe('syncHooksToClaudeSettings', () => {
    it('installs SessionStart, PreCompact, and Stop hooks on fresh settings', () => {
      const result = syncHooksToClaudeSettings('test-agent');
      const written = mockFs['/mock-home/.claude/settings.json'];
      expect(written).toBeDefined();
      const settings = JSON.parse(written);
      expect(settings.hooks.SessionStart).toHaveLength(2);
      expect(settings.hooks.PreCompact).toHaveLength(1);
      expect(settings.hooks.Stop).toHaveLength(1);
      expect(result.installed).toContain('SessionStart');
      expect(result.installed).toContain('PreCompact');
      expect(result.installed).toContain('Stop');
      expect(result.updated).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('includes the {agentId}-mode skill hook in SessionStart', () => {
      syncHooksToClaudeSettings('test-agent');
      const settings = JSON.parse(mockFs['/mock-home/.claude/settings.json']);
      const commands = settings.hooks.SessionStart.flatMap((g: { hooks: { command?: string }[] }) =>
        g.hooks.map((h) => h.command),
      );
      expect(commands.some((c: string) => c.includes('test-agent-mode skill'))).toBe(true);
    });

    it('includes the admin_health hook in SessionStart', () => {
      syncHooksToClaudeSettings('test-agent');
      const settings = JSON.parse(mockFs['/mock-home/.claude/settings.json']);
      const commands = settings.hooks.SessionStart.flatMap((g: { hooks: { command?: string }[] }) =>
        g.hooks.map((h) => h.command),
      );
      expect(commands.some((c: string) => c.includes('admin_health'))).toBe(true);
    });

    it('is idempotent — running twice produces the same output', () => {
      syncHooksToClaudeSettings('test-agent');
      const after1 = mockFs['/mock-home/.claude/settings.json'];
      const result2 = syncHooksToClaudeSettings('test-agent');
      const after2 = mockFs['/mock-home/.claude/settings.json'];
      expect(after1).toBe(after2);
      expect(result2.skipped).toContain('SessionStart');
      expect(result2.installed).toHaveLength(0);
      expect(result2.updated).toHaveLength(0);
    });

    it('preserves non-agent hooks already in settings', () => {
      mockFs['/mock-home/.claude/settings.json'] = JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: 'echo existing' }] }],
        },
      });
      syncHooksToClaudeSettings('test-agent');
      const settings = JSON.parse(mockFs['/mock-home/.claude/settings.json']);
      const commands = settings.hooks.SessionStart.flatMap((g: { hooks: { command?: string }[] }) =>
        g.hooks.map((h) => h.command),
      );
      expect(commands).toContain('echo existing');
      expect(commands.some((c: string) => c.includes('admin_health'))).toBe(true);
    });

    it('updates stale agent hooks to match current defaults', () => {
      // A stale hook contains the agent marker but outdated content
      mockFs['/mock-home/.claude/settings.json'] = JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: `root=$(git rev-parse --show-toplevel 2>/dev/null || echo "."); if grep -q '"test-agent"' "$root/.mcp.json" 2>/dev/null; then echo 'Call mcp__test-agent__test-agent_admin op:OLD_STALE_OP'; fi`,
                  timeout: 5000,
                },
              ],
            },
          ],
        },
      });
      const result = syncHooksToClaudeSettings('test-agent');
      const settings = JSON.parse(mockFs['/mock-home/.claude/settings.json']);
      const commands = settings.hooks.SessionStart.flatMap((g: { hooks: { command?: string }[] }) =>
        g.hooks.map((h) => h.command),
      );
      expect(commands.some((c: string) => c.includes('OLD_STALE_OP'))).toBe(false);
      expect(commands.some((c: string) => c.includes('admin_health'))).toBe(true);
      expect(result.updated).toContain('SessionStart');
      expect(result.error).toBeUndefined();
    });

    it('returns error field when write fails', async () => {
      const { writeFileSync } = await import('node:fs');
      vi.mocked(writeFileSync).mockImplementationOnce(() => {
        throw new Error('EACCES: permission denied');
      });
      const result = syncHooksToClaudeSettings('test-agent');
      expect(result.error).toMatch(/EACCES/);
      expect(result.installed).toHaveLength(0);
      expect(result.updated).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });
  });

  describe('multi-agent hook coexistence', () => {
    type HookGroup = { hooks: { command?: string }[] };

    function getSessionStartCommands(): string[] {
      const settings = JSON.parse(mockFs['/mock-home/.claude/settings.json']);
      return (settings.hooks.SessionStart as HookGroup[]).flatMap((g) =>
        g.hooks.map((h) => h.command ?? ''),
      );
    }

    function getAgentCommands(agentId: string): string[] {
      const settings = JSON.parse(mockFs['/mock-home/.claude/settings.json']);
      return (settings.hooks.SessionStart as HookGroup[])
        .flatMap((g) => g.hooks)
        .map((h) => h.command ?? '')
        .filter((c) => c.includes(agentId));
    }

    it('install A then B — both sets present, no overlap', () => {
      syncHooksToClaudeSettings('agent-a');
      syncHooksToClaudeSettings('agent-b');

      const commands = getSessionStartCommands();

      // Both agents must have hooks present
      expect(commands.some((c) => c.includes('agent-a'))).toBe(true);
      expect(commands.some((c) => c.includes('agent-b'))).toBe(true);

      // agent-a commands must not mention agent-b and vice versa
      const aCommands = getAgentCommands('agent-a');
      const bCommands = getAgentCommands('agent-b');

      expect(aCommands.every((c) => !c.includes('agent-b'))).toBe(true);
      expect(bCommands.every((c) => !c.includes('agent-a'))).toBe(true);
    });

    it('re-install A after B — B hooks untouched', () => {
      syncHooksToClaudeSettings('agent-a');
      syncHooksToClaudeSettings('agent-b');

      const beforeB = getAgentCommands('agent-b');

      syncHooksToClaudeSettings('agent-a'); // re-run A (e.g. after update)

      const afterB = getAgentCommands('agent-b');

      expect(afterB).toEqual(beforeB);
    });

    it('no duplicates after running both twice', () => {
      syncHooksToClaudeSettings('agent-a');
      syncHooksToClaudeSettings('agent-b');

      const settings1 = JSON.parse(mockFs['/mock-home/.claude/settings.json']);
      const groupCountAfterTwo = (settings1.hooks.SessionStart as HookGroup[]).length;

      syncHooksToClaudeSettings('agent-a');
      syncHooksToClaudeSettings('agent-b');

      const settings2 = JSON.parse(mockFs['/mock-home/.claude/settings.json']);
      const groupCountAfterFour = (settings2.hooks.SessionStart as HookGroup[]).length;

      expect(groupCountAfterFour).toBe(groupCountAfterTwo);
    });

    it('manually added non-agent hook survives all agent installs', () => {
      // Pre-populate settings with a non-agent hook in SessionStart
      mockFs['/mock-home/.claude/settings.json'] = JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: 'echo custom-non-agent-hook' }] }],
        },
      });

      syncHooksToClaudeSettings('agent-a');
      syncHooksToClaudeSettings('agent-b');
      syncHooksToClaudeSettings('agent-a');

      const commands = getSessionStartCommands();
      expect(commands).toContain('echo custom-non-agent-hook');
    });
  });

  describe('admin_check_persistence', () => {
    it('returns NO_STORAGE_DIRECTORY when nothing exists', async () => {
      const result = (await findOp(ops, 'admin_check_persistence').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.agentId).toBe('test-agent');
      expect(result.status).toBe('NO_STORAGE_DIRECTORY');
      expect(result.recommendation).toContain('Storage directory not found');
    });

    it('returns PERSISTENCE_ACTIVE when vault and plans exist', async () => {
      mockDirs.add('/mock-home/.test-agent');
      mockFs['/mock-home/.test-agent/vault.db'] = 'binary';
      mockFs['/mock-home/.test-agent/plans.json'] = JSON.stringify({ items: {} });
      const result = (await findOp(ops, 'admin_check_persistence').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.status).toBe('PERSISTENCE_ACTIVE');
    });

    it('detects active plans needing reconciliation', async () => {
      mockDirs.add('/mock-home/.test-agent');
      mockFs['/mock-home/.test-agent/vault.db'] = 'binary';
      mockFs['/mock-home/.test-agent/plans.json'] = JSON.stringify({
        items: {
          'plan-1': { status: 'executing' },
          'plan-2': { status: 'completed' },
        },
      });
      const result = (await findOp(ops, 'admin_check_persistence').handler({})) as Record<
        string,
        unknown
      >;
      const activePlans = result.activePlans as Array<{ id: string; status: string }>;
      expect(activePlans).toHaveLength(1);
      expect(activePlans[0].status).toBe('executing');
      expect(result.recommendation).toContain('need attention');
    });

    it('uses configured or resolved .soleri plan paths and understands planner stores', async () => {
      runtime = {
        ...createMockRuntime(),
        config: {
          agentId: 'test-agent',
          dataDir: '/mock/agent-data',
          agentDir: '/mock/agent-dir',
        },
      } as unknown as AgentRuntime;
      ops = createAdminSetupOps(runtime);

      mockDirs.add('/mock-home/.soleri/test-agent');
      mockFs['/mock-home/.soleri/test-agent/vault.db'] = 'binary';
      mockFs['/mock-home/.soleri/test-agent/plans.json'] = JSON.stringify({
        version: '1.0',
        plans: [
          { id: 'plan-1', status: 'executing' },
          { id: 'plan-2', status: 'completed' },
        ],
      });

      const result = (await findOp(ops, 'admin_check_persistence').handler({})) as Record<
        string,
        unknown
      >;

      expect((result.storageDirectory as Record<string, unknown>).path).toBe(
        '/mock-home/.soleri/test-agent',
      );
      expect(
        ((result.files as Record<string, unknown>).plans as Record<string, unknown>).path,
      ).toBe('/mock-home/.soleri/test-agent/plans.json');
      expect(
        ((result.files as Record<string, unknown>).plans as Record<string, unknown>).items,
      ).toBe(2);
      expect(result.status).toBe('PERSISTENCE_ACTIVE');
      expect(result.activePlans).toEqual([{ id: 'plan-1', status: 'executing' }]);
    });
  });
});
