import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminSetupOps } from './admin-setup-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

// ─── Mock Node.js fs/os modules ────────────────────────────────────────

const mockFs: Record<string, string> = {};
const mockDirs = new Set<string>();

vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: string) => p in mockFs || mockDirs.has(p)),
  readFileSync: vi.fn((p: string) => {
    if (p in mockFs) return mockFs[p];
    throw new Error(`ENOENT: ${p}`);
  }),
  writeFileSync: vi.fn((p: string, content: string) => {
    mockFs[p] = content;
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
  return actual;
});

vi.mock('./claude-md-helpers.js', () => ({
  hasSections: vi.fn(() => false),
  removeSections: vi.fn((content: string) => content),
  injectAtPosition: vi.fn((_existing: string, injection: string) => `INJECTED:${injection}`),
  buildInjectionContent: vi.fn(() => '## Mock Agent Section'),
  injectEngineRulesBlock: vi.fn((content: string) => content),
}));

vi.mock('../skills/sync-skills.js', () => ({
  discoverSkills: vi.fn(() => [
    { name: 'skill-1', path: '/mock/skills/skill-1' },
  ]),
  syncSkillsToClaudeCode: vi.fn(() => ({
    installed: ['skill-1'],
    updated: [],
    skipped: [],
    failed: [],
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

  it('returns 4 ops', () => {
    expect(ops).toHaveLength(4);
  });

  it('all ops have required fields', () => {
    for (const op of ops) {
      expect(op.name).toBeTruthy();
      expect(op.handler).toBeDefined();
      expect(['read', 'write', 'admin']).toContain(op.auth);
    }
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
      mockFs['/some/project/CLAUDE.md'] = '# Project\n<!-- agent:test-agent -->\nOld\n<!-- /agent:test-agent -->';
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
  });
});
