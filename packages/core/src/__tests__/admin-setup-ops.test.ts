import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createAdminSetupOps } from '../runtime/admin-setup-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';
import {
  hasSections,
  removeSections,
  injectAtPosition,
  buildInjectionContent,
  wrapInMarkers,
  composeAgentModeSection,
  composeIntegrationSection,
} from '../runtime/claude-md-helpers.js';

// ─── claude-md-helpers tests ──────────────────────────────────────────

describe('claude-md-helpers', () => {
  const agentId = 'test-agent';
  const config = { agentId } as any;

  describe('hasSections', () => {
    it('returns true when markers present', () => {
      const content = `# Hello\n<!-- agent:${agentId}:mode -->\nstuff\n<!-- /agent:${agentId}:mode -->\n`;
      expect(hasSections(content, agentId)).toBe(true);
    });

    it('returns false when no markers', () => {
      expect(hasSections('# Hello\nWorld', agentId)).toBe(false);
    });

    it('returns false for different agent', () => {
      const content = `<!-- agent:other:mode -->\nstuff\n<!-- /agent:other:mode -->`;
      expect(hasSections(content, agentId)).toBe(false);
    });
  });

  describe('removeSections', () => {
    it('removes agent section cleanly', () => {
      const content = `# Hello\n\n<!-- agent:${agentId}:mode -->\nstuff\n<!-- /agent:${agentId}:mode -->\n\n# Footer`;
      const result = removeSections(content, agentId);
      expect(result).not.toContain('stuff');
      expect(result).toContain('# Hello');
      expect(result).toContain('# Footer');
    });

    it('returns unchanged content if no markers', () => {
      const content = '# Hello\nWorld';
      expect(removeSections(content, agentId)).toBe(content);
    });
  });

  describe('injectAtPosition', () => {
    const section = '## Injected';

    it('injects at start', () => {
      const result = injectAtPosition('# Hello', section, 'start');
      expect(result.startsWith('## Injected')).toBe(true);
    });

    it('injects at end', () => {
      const result = injectAtPosition('# Hello', section, 'end');
      expect(result.endsWith('## Injected\n')).toBe(true);
    });

    it('injects after title', () => {
      const content = '# My Project\n\nSome content here.';
      const result = injectAtPosition(content, section, 'after-title');
      const lines = result.split('\n');
      const titleIdx = lines.indexOf('# My Project');
      expect(titleIdx).toBe(0);
      // Section should appear before "Some content here."
      expect(result.indexOf('## Injected')).toBeLessThan(result.indexOf('Some content here.'));
    });

    it('falls back to start if no title found', () => {
      const content = 'No heading here.';
      const result = injectAtPosition(content, section, 'after-title');
      expect(result.startsWith('## Injected')).toBe(true);
    });
  });

  describe('wrapInMarkers', () => {
    it('wraps content in agent markers', () => {
      const result = wrapInMarkers(agentId, 'hello');
      expect(result).toContain(`<!-- agent:${agentId}:mode -->`);
      expect(result).toContain('hello');
      expect(result).toContain(`<!-- /agent:${agentId}:mode -->`);
    });
  });

  describe('composeAgentModeSection', () => {
    it('generates activation commands', () => {
      const result = composeAgentModeSection(config);
      expect(result).toContain('## Test-agent Mode');
      expect(result).toContain('test-agent_core op:activate');
      expect(result).toContain('deactivate: true');
    });
  });

  describe('composeIntegrationSection', () => {
    it('generates default tools table when no facades provided', () => {
      const result = composeIntegrationSection(config);
      expect(result).toContain('## Test-agent Integration');
      expect(result).toContain('test-agent_vault');
      expect(result).toContain('test-agent_admin');
    });

    it('uses provided facades', () => {
      const facades = [{ name: 'test-agent_custom', ops: ['op_a', 'op_b'] }];
      const result = composeIntegrationSection(config, facades);
      expect(result).toContain('test-agent_custom');
      expect(result).toContain('`op_a`');
    });
  });

  describe('buildInjectionContent', () => {
    it('wraps in markers', () => {
      const result = buildInjectionContent(config);
      expect(result).toContain(`<!-- agent:${agentId}:mode -->`);
      expect(result).toContain(`<!-- /agent:${agentId}:mode -->`);
    });

    it('excludes integration when disabled', () => {
      const result = buildInjectionContent(config, { includeIntegration: false });
      expect(result).toContain('Mode');
      expect(result).not.toContain('Integration');
    });
  });
});

// ─── admin-setup-ops tests ────────────────────────────────────────────

describe('createAdminSetupOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let tmpDir: string;

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  beforeEach(() => {
    tmpDir = join(tmpdir(), `soleri-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: 'test-setup',
      vaultPath: ':memory:',
    });
    ops = createAdminSetupOps(runtime);
  });

  afterEach(() => {
    runtime?.close();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it('should return 4 ops', () => {
    expect(ops).toHaveLength(4);
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'admin_inject_claude_md',
      'admin_setup_global',
      'admin_setup_project',
      'admin_check_persistence',
    ]);
  });

  // ─── inject_claude_md ───────────────────────────────────────────

  describe('admin_inject_claude_md', () => {
    it('creates CLAUDE.md when createIfMissing is true', async () => {
      const result = (await findOp('admin_inject_claude_md').handler({
        projectPath: tmpDir,
        createIfMissing: true,
        includeIntegration: true,
        position: 'after-title',
        dryRun: false,
        global: false,
      })) as any;

      expect(result.action).toBe('created');
      expect(existsSync(result.path)).toBe(true);
      const content = readFileSync(result.path, 'utf-8');
      expect(content).toContain('<!-- agent:test-setup:mode -->');
      expect(content).toContain('test-setup_core op:activate');
    });

    it('errors when CLAUDE.md not found and createIfMissing is false', async () => {
      const result = (await findOp('admin_inject_claude_md').handler({
        projectPath: tmpDir,
        createIfMissing: false,
        includeIntegration: true,
        position: 'after-title',
        dryRun: false,
        global: false,
      })) as any;

      expect(result.action).toBe('error');
      expect(result.error).toContain('not found');
    });

    it('injects into existing CLAUDE.md', async () => {
      writeFileSync(join(tmpDir, 'CLAUDE.md'), '# My Project\n\nExisting content.\n');

      const result = (await findOp('admin_inject_claude_md').handler({
        projectPath: tmpDir,
        createIfMissing: false,
        includeIntegration: true,
        position: 'after-title',
        dryRun: false,
        global: false,
      })) as any;

      expect(result.action).toBe('injected');
      const content = readFileSync(result.path, 'utf-8');
      expect(content).toContain('# My Project');
      expect(content).toContain('<!-- agent:test-setup:mode -->');
      expect(content).toContain('Existing content.');
    });

    it('is idempotent — updates existing sections', async () => {
      writeFileSync(join(tmpDir, 'CLAUDE.md'), '# My Project\n\nExisting content.\n');

      // First injection
      await findOp('admin_inject_claude_md').handler({
        projectPath: tmpDir,
        createIfMissing: false,
        includeIntegration: true,
        position: 'after-title',
        dryRun: false,
        global: false,
      });

      // Second injection — should update, not duplicate
      const result = (await findOp('admin_inject_claude_md').handler({
        projectPath: tmpDir,
        createIfMissing: false,
        includeIntegration: true,
        position: 'after-title',
        dryRun: false,
        global: false,
      })) as any;

      expect(result.action).toBe('updated');
      const content = readFileSync(result.path, 'utf-8');
      // Should have exactly one pair of markers
      const markerCount = (content.match(/<!-- agent:test-setup:mode -->/g) ?? []).length;
      expect(markerCount).toBe(1);
    });

    it('supports dry-run mode', async () => {
      writeFileSync(join(tmpDir, 'CLAUDE.md'), '# My Project\n');

      const result = (await findOp('admin_inject_claude_md').handler({
        projectPath: tmpDir,
        createIfMissing: false,
        includeIntegration: true,
        position: 'after-title',
        dryRun: true,
        global: false,
      })) as any;

      expect(result.action).toBe('would_inject');
      expect(result.preview).toBeDefined();
      // File should not be modified
      const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
      expect(content).not.toContain('agent:test-setup:mode');
    });
  });

  // ─── setup_global ───────────────────────────────────────────────

  describe('admin_setup_global', () => {
    it('returns dry-run analysis when install is false', async () => {
      const result = (await findOp('admin_setup_global').handler({
        install: false,
        hooksOnly: false,
        settingsJsonOnly: false,
        skillsOnly: false,
      })) as any;

      expect(result.dryRun).toBe(true);
      expect(result.agentId).toBe('test-setup');
      expect(result.hookifyRules).toBeDefined();
      expect(result.skills).toBeDefined();
      expect(result.settingsJson).toBeDefined();
    });
  });

  // ─── setup_project ─────────────────────────────────────────────

  describe('admin_setup_project', () => {
    it('returns analysis in default mode', async () => {
      const result = (await findOp('admin_setup_project').handler({
        projectPath: tmpDir,
        cleanup: false,
        install: false,
      })) as any;

      expect(result.mode).toBe('analyze');
      expect(result.projectPath).toBe(tmpDir);
      expect(typeof result.globalHooks).toBe('number');
      expect(typeof result.projectHooks).toBe('number');
    });

    it('returns error for non-existent project', async () => {
      const result = (await findOp('admin_setup_project').handler({
        projectPath: '/nonexistent/path',
        cleanup: false,
        install: false,
      })) as any;

      expect(result.error).toBe('PROJECT_NOT_FOUND');
    });
  });

  // ─── check_persistence ──────────────────────────────────────────

  describe('admin_check_persistence', () => {
    it('returns persistence diagnostic', async () => {
      const result = (await findOp('admin_check_persistence').handler({})) as any;

      expect(result.agentId).toBe('test-setup');
      expect(result.storageDirectory).toBeDefined();
      expect(result.files).toBeDefined();
      expect(result.files.plans).toBeDefined();
      expect(result.files.vault).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.recommendation).toBeDefined();
      expect(Array.isArray(result.activePlans)).toBe(true);
    });

    it('reports correct status for in-memory vault', async () => {
      const result = (await findOp('admin_check_persistence').handler({})) as any;

      // In-memory vault + no plans file = NO_STORAGE_DIRECTORY or PERSISTENCE_CONFIGURED_BUT_INCOMPLETE
      expect([
        'NO_STORAGE_DIRECTORY',
        'PERSISTENCE_CONFIGURED_BUT_INCOMPLETE',
        'PERSISTENCE_ACTIVE',
      ]).toContain(result.status);
    });
  });
});
