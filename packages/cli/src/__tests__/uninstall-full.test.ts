import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock @clack/prompts to suppress console output during tests
vi.mock('@clack/prompts', () => ({
  log: {
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
  confirm: vi.fn(),
  isCancel: vi.fn(),
}));

import {
  detectArtifacts,
  removeDirectory,
  removeClaudeMdBlock,
  removePermissionEntries,
  removeLauncherScript,
} from '../utils/agent-artifacts.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTempDir(suffix: string): string {
  const dir = join(
    tmpdir(),
    `uninstall-full-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// detectArtifacts
// ---------------------------------------------------------------------------

describe('detectArtifacts', () => {
  let tempDir: string;
  let originalHome: string;

  beforeEach(() => {
    tempDir = makeTempDir('detect');
    originalHome = process.env.HOME ?? '';
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalHome) process.env.USERPROFILE = originalHome;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects an existing agent project directory', () => {
    const agentDir = join(tempDir, 'my-agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'agent.yaml'), 'name: test\n');

    const manifest = detectArtifacts('my-agent', agentDir);
    expect(manifest.projectDir).not.toBeNull();
    expect(manifest.projectDir!.exists).toBe(true);
    expect(manifest.projectDir!.path).toBe(agentDir);
  });

  it('returns exists: false for a non-existent agent directory', () => {
    const nonExistent = join(tempDir, 'does-not-exist');
    const manifest = detectArtifacts('ghost-agent', nonExistent);

    expect(manifest.projectDir).not.toBeNull();
    expect(manifest.projectDir!.exists).toBe(false);
    expect(manifest.claudeMdBlocks).toEqual([]);
    expect(manifest.mcpServerEntries).toEqual([]);
    expect(manifest.permissionEntries).toEqual([]);
  });

  it('detects CLAUDE.md block with matching markers', () => {
    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    const content = [
      '# My Config',
      '',
      '<!-- agent:test-agent:mode -->',
      '## Test Agent Mode',
      'Some content here.',
      '<!-- /agent:test-agent:mode -->',
      '',
      '# Other stuff',
    ].join('\n');
    writeFileSync(claudeMdPath, content);

    const manifest = detectArtifacts('test-agent', join(tempDir, 'nope'));
    expect(manifest.claudeMdBlocks.length).toBe(1);
    expect(manifest.claudeMdBlocks[0].startLine).toBe(3);
    expect(manifest.claudeMdBlocks[0].endLine).toBe(6);
    expect(manifest.claudeMdBlocks[0].path).toBe(claudeMdPath);
  });

  it('returns empty blocks when end marker is missing', () => {
    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    const content = [
      '# My Config',
      '<!-- agent:test-agent:mode -->',
      '## Test Agent Mode',
      'Some content here.',
      // Missing end marker
    ].join('\n');
    writeFileSync(claudeMdPath, content);

    const manifest = detectArtifacts('test-agent', join(tempDir, 'nope'));
    expect(manifest.claudeMdBlocks).toEqual([]);
  });

  it('detects permission entries with matching prefix', () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.local.json');
    const settings = {
      permissions: {
        allow: [
          'mcp__maria__design_check',
          'mcp__maria__color_pairs',
          'mcp__ernesto__vault_search',
          'mcp__ernesto__memory_capture',
          'Bash(*)',
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    const manifest = detectArtifacts('maria', join(tempDir, 'nope'));
    expect(manifest.permissionEntries.length).toBe(1);
    expect(manifest.permissionEntries[0].matches).toEqual([
      'mcp__maria__design_check',
      'mcp__maria__color_pairs',
    ]);
    // Ernesto entries should NOT be included
    expect(manifest.permissionEntries[0].matches).not.toContain('mcp__ernesto__vault_search');
  });

  it('does not match permission prefix that is a substring of another agent', () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.local.json');
    const settings = {
      permissions: {
        allow: ['mcp__marianne__some_op', 'mcp__maria__design_check'],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    const manifest = detectArtifacts('maria', join(tempDir, 'nope'));
    expect(manifest.permissionEntries.length).toBe(1);
    // Only the exact prefix match — mcp__maria__ does NOT match mcp__marianne__
    expect(manifest.permissionEntries[0].matches).toEqual(['mcp__maria__design_check']);
  });
});

// ---------------------------------------------------------------------------
// removeDirectory
// ---------------------------------------------------------------------------

describe('removeDirectory', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('rmdir');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes a directory with files', async () => {
    const target = join(tempDir, 'to-remove');
    mkdirSync(join(target, 'sub'), { recursive: true });
    writeFileSync(join(target, 'file.txt'), 'data');
    writeFileSync(join(target, 'sub', 'nested.txt'), 'nested');

    const result = await removeDirectory(target);
    expect(result.removed).toBe(true);
    expect(result.path).toBe(target);
    expect(existsSync(target)).toBe(false);
  });

  it('returns removed: false when called on a non-existent path (idempotent)', async () => {
    const gone = join(tempDir, 'already-gone');
    const result = await removeDirectory(gone);
    expect(result.removed).toBe(false);
    expect(result.path).toBe(gone);
    expect(result.error).toBeUndefined();
  });

  it('is idempotent — second call after removal returns removed: false', async () => {
    const target = join(tempDir, 'once');
    mkdirSync(target);
    writeFileSync(join(target, 'f.txt'), 'x');

    const first = await removeDirectory(target);
    expect(first.removed).toBe(true);

    const second = await removeDirectory(target);
    expect(second.removed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// removeClaudeMdBlock
// ---------------------------------------------------------------------------

describe('removeClaudeMdBlock', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('claudemd');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes the block including markers', async () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    const content = [
      '# Config',
      '',
      '<!-- agent:foo:mode -->',
      '## Foo Mode',
      'content',
      '<!-- /agent:foo:mode -->',
      '',
      '# Other',
    ].join('\n');
    writeFileSync(filePath, content);

    const result = await removeClaudeMdBlock(filePath, 3, 6);
    expect(result.removed).toBe(true);

    const after = readFileSync(filePath, 'utf-8');
    expect(after).not.toContain('<!-- agent:foo:mode -->');
    expect(after).not.toContain('## Foo Mode');
    expect(after).not.toContain('<!-- /agent:foo:mode -->');
    expect(after).toContain('# Config');
    expect(after).toContain('# Other');
  });

  it('collapses triple blank lines after removal', async () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    const content = [
      '# Config',
      '',
      '',
      '<!-- agent:foo:mode -->',
      'stuff',
      '<!-- /agent:foo:mode -->',
      '',
      '',
      '# Other',
    ].join('\n');
    writeFileSync(filePath, content);

    const result = await removeClaudeMdBlock(filePath, 4, 6);
    expect(result.removed).toBe(true);

    const after = readFileSync(filePath, 'utf-8');
    // Should not have 3+ consecutive newlines
    expect(after).not.toMatch(/\n{3,}/);
  });

  it('returns removed: false for a non-existent file', async () => {
    const result = await removeClaudeMdBlock(join(tempDir, 'nope.md'), 1, 3);
    expect(result.removed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// removePermissionEntries
// ---------------------------------------------------------------------------

describe('removePermissionEntries', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('perms');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes only the matching agent entries, keeps others', async () => {
    const filePath = join(tempDir, 'settings.local.json');
    const settings = {
      permissions: {
        allow: [
          'mcp__maria__design_check',
          'mcp__maria__color_pairs',
          'mcp__ernesto__vault_search',
          'Bash(*)',
        ],
      },
    };
    writeFileSync(filePath, JSON.stringify(settings, null, 2));

    const result = await removePermissionEntries(filePath, 'maria');
    expect(result.removed).toBe(true);

    const after = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(after.permissions.allow).toEqual(['mcp__ernesto__vault_search', 'Bash(*)']);
  });

  it('preserves 2-space JSON indentation', async () => {
    const filePath = join(tempDir, 'settings.local.json');
    const settings = {
      permissions: {
        allow: ['mcp__agent__op', 'other'],
      },
    };
    writeFileSync(filePath, JSON.stringify(settings, null, 2));

    await removePermissionEntries(filePath, 'agent');

    const raw = readFileSync(filePath, 'utf-8');
    // Verify 2-space indent is present
    expect(raw).toContain('  "permissions"');
    // Should end with trailing newline
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('returns removed: false when no entries match', async () => {
    const filePath = join(tempDir, 'settings.local.json');
    const settings = {
      permissions: {
        allow: ['mcp__other__op', 'Bash(*)'],
      },
    };
    writeFileSync(filePath, JSON.stringify(settings, null, 2));

    const result = await removePermissionEntries(filePath, 'maria');
    expect(result.removed).toBe(false);
  });

  it('returns removed: false for a non-existent file', async () => {
    const result = await removePermissionEntries(join(tempDir, 'nope.json'), 'agent');
    expect(result.removed).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('handles empty settings file with no permissions key', async () => {
    const filePath = join(tempDir, 'settings.local.json');
    writeFileSync(filePath, JSON.stringify({}, null, 2));

    const result = await removePermissionEntries(filePath, 'agent');
    expect(result.removed).toBe(false);
  });

  it('handles malformed JSON without throwing', async () => {
    const filePath = join(tempDir, 'settings.local.json');
    writeFileSync(filePath, '{ not valid json');

    const result = await removePermissionEntries(filePath, 'agent');
    expect(result.removed).toBe(false);
    expect(result.error).toBe('Failed to parse JSON');
  });
});

// ---------------------------------------------------------------------------
// removeLauncherScript
// ---------------------------------------------------------------------------

describe('removeLauncherScript', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('launcher');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes an existing file', async () => {
    const scriptPath = join(tempDir, 'my-agent');
    writeFileSync(scriptPath, '#!/bin/bash\necho hello\n');

    const result = await removeLauncherScript(scriptPath);
    expect(result.removed).toBe(true);
    expect(result.path).toBe(scriptPath);
    expect(existsSync(scriptPath)).toBe(false);
  });

  it('returns removed: false for a non-existent path', async () => {
    const result = await removeLauncherScript(join(tempDir, 'nope'));
    expect(result.removed).toBe(false);
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration test: full detect → remove → verify cycle
// ---------------------------------------------------------------------------

describe('integration: detect → remove → verify', () => {
  let tempDir: string;
  let originalHome: string;
  const AGENT_ID = 'test-agent';

  beforeEach(() => {
    tempDir = makeTempDir('integration');
    originalHome = process.env.HOME ?? '';
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;

    // 1. Project directory
    const projectDir = join(tempDir, 'projects', AGENT_ID);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'agent.yaml'), 'name: test-agent\n');

    // 2. Legacy data directory
    const legacyDir = join(tempDir, `.${AGENT_ID}`);
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, 'vault.db'), 'fake-db');

    // 3. CLAUDE.md with agent block
    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    const claudeMdContent = [
      '# Home Config',
      '',
      `<!-- agent:${AGENT_ID}:mode -->`,
      `## ${AGENT_ID} Mode`,
      'Agent instructions here.',
      `<!-- /agent:${AGENT_ID}:mode -->`,
      '',
      '# Other Stuff',
    ].join('\n');
    writeFileSync(claudeMdPath, claudeMdContent);

    // 4. Permissions in settings.local.json
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.local.json');
    const settings = {
      permissions: {
        allow: [
          `mcp__${AGENT_ID}__vault_search`,
          `mcp__${AGENT_ID}__memory_capture`,
          'mcp__other__something',
          'Bash(*)',
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalHome) process.env.USERPROFILE = originalHome;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects all artifacts, removes them, and verifies clean state', async () => {
    const projectDir = join(tempDir, 'projects', AGENT_ID);
    const legacyDir = join(tempDir, `.${AGENT_ID}`);
    const claudeMdPath = join(tempDir, 'CLAUDE.md');
    const settingsPath = join(tempDir, '.claude', 'settings.local.json');

    // --- Phase 1: Detect ---
    const manifest = detectArtifacts(AGENT_ID, projectDir);

    expect(manifest.agentId).toBe(AGENT_ID);
    expect(manifest.projectDir!.exists).toBe(true);
    expect(manifest.dataDirLegacy!.exists).toBe(true);
    expect(manifest.claudeMdBlocks.length).toBe(1);
    expect(manifest.permissionEntries.length).toBe(1);
    expect(manifest.permissionEntries[0].matches.length).toBe(2);

    // --- Phase 2: Remove ---
    // Permission entries
    const permResult = await removePermissionEntries(settingsPath, AGENT_ID);
    expect(permResult.removed).toBe(true);

    // CLAUDE.md block
    const block = manifest.claudeMdBlocks[0];
    const blockResult = await removeClaudeMdBlock(block.path, block.startLine, block.endLine);
    expect(blockResult.removed).toBe(true);

    // Directories
    const projResult = await removeDirectory(projectDir);
    expect(projResult.removed).toBe(true);

    const legacyResult = await removeDirectory(legacyDir);
    expect(legacyResult.removed).toBe(true);

    // --- Phase 3: Verify clean state ---
    expect(existsSync(projectDir)).toBe(false);
    expect(existsSync(legacyDir)).toBe(false);

    // CLAUDE.md should not contain agent markers
    const claudeAfter = readFileSync(claudeMdPath, 'utf-8');
    expect(claudeAfter).not.toContain(`<!-- agent:${AGENT_ID}:mode -->`);
    expect(claudeAfter).toContain('# Home Config');
    expect(claudeAfter).toContain('# Other Stuff');

    // Settings should not contain agent permissions but keep other entries
    const settingsAfter = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settingsAfter.permissions.allow).toEqual(['mcp__other__something', 'Bash(*)']);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  let tempDir: string;
  let originalHome: string;

  beforeEach(() => {
    tempDir = makeTempDir('edge');
    originalHome = process.env.HOME ?? '';
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalHome) process.env.USERPROFILE = originalHome;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('partial install: only project dir exists, no configs', () => {
    const projectDir = join(tempDir, 'projects', 'partial-agent');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'agent.yaml'), 'name: partial\n');

    const manifest = detectArtifacts('partial-agent', projectDir);
    expect(manifest.projectDir!.exists).toBe(true);
    expect(manifest.claudeMdBlocks).toEqual([]);
    expect(manifest.mcpServerEntries).toEqual([]);
    expect(manifest.permissionEntries).toEqual([]);
  });

  it('empty settings.local.json (valid JSON, no permissions key)', () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'settings.local.json'), '{}');

    const manifest = detectArtifacts('some-agent', join(tempDir, 'nope'));
    expect(manifest.permissionEntries).toEqual([]);
  });

  it('malformed JSON in settings file does not throw', () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'settings.local.json'), '{ broken json !!!');

    expect(() => {
      const manifest = detectArtifacts('some-agent', join(tempDir, 'nope'));
      expect(manifest.permissionEntries).toEqual([]);
    }).not.toThrow();
  });
});
