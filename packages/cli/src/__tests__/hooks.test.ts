import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installHooks, removeHooks, detectInstalledHooks } from '../hooks/generator.js';
import { SUPPORTED_EDITORS } from '../hooks/templates.js';

describe('hooks commands', () => {
  let tempDir: string;
  let agentDir: string;

  function createMinimalAgent(): void {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'hook-test-mcp' }));
  }

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-hooks-test-${Date.now()}`);
    agentDir = join(tempDir, 'hook-test');
    mkdirSync(tempDir, { recursive: true });
    createMinimalAgent();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('installHooks', () => {
    it('should create claude-code settings.json', () => {
      const files = installHooks('claude-code', agentDir);

      expect(files).toContain('.claude/settings.json');
      expect(existsSync(join(agentDir, '.claude', 'settings.json'))).toBe(true);

      const settings = JSON.parse(
        readFileSync(join(agentDir, '.claude', 'settings.json'), 'utf-8'),
      );
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PreToolUse).toBeDefined();
      expect(settings.hooks.SessionStart).toBeDefined();
    });

    it('should create cursor rules file', () => {
      const files = installHooks('cursor', agentDir);

      expect(files).toContain('.cursorrules');
      const content = readFileSync(join(agentDir, '.cursorrules'), 'utf-8');
      expect(content).toContain('hook-test');
      expect(content).toContain('Cursor Rules');
    });

    it('should create windsurf rules file', () => {
      const files = installHooks('windsurf', agentDir);

      expect(files).toContain('.windsurfrules');
      const content = readFileSync(join(agentDir, '.windsurfrules'), 'utf-8');
      expect(content).toContain('Windsurf Rules');
    });

    it('should create copilot instructions', () => {
      const files = installHooks('copilot', agentDir);

      expect(files).toContain('.github/copilot-instructions.md');
      expect(existsSync(join(agentDir, '.github', 'copilot-instructions.md'))).toBe(true);
    });

    it('should include agent ID in generated files', () => {
      installHooks('cursor', agentDir);
      const content = readFileSync(join(agentDir, '.cursorrules'), 'utf-8');
      expect(content).toContain('hook-test');
    });
  });

  describe('removeHooks', () => {
    it('should remove installed hook files', () => {
      installHooks('cursor', agentDir);
      expect(existsSync(join(agentDir, '.cursorrules'))).toBe(true);

      const removed = removeHooks('cursor', agentDir);
      expect(removed).toContain('.cursorrules');
      expect(existsSync(join(agentDir, '.cursorrules'))).toBe(false);
    });

    it('should return empty array if no hooks installed', () => {
      const removed = removeHooks('cursor', agentDir);
      expect(removed).toEqual([]);
    });

    it('should remove claude-code settings', () => {
      installHooks('claude-code', agentDir);
      expect(existsSync(join(agentDir, '.claude', 'settings.json'))).toBe(true);

      const removed = removeHooks('claude-code', agentDir);
      expect(removed).toContain('.claude/settings.json');
    });
  });

  describe('detectInstalledHooks', () => {
    it('should detect no hooks when none installed', () => {
      const installed = detectInstalledHooks(agentDir);
      expect(installed).toEqual([]);
    });

    it('should detect installed hooks', () => {
      installHooks('cursor', agentDir);
      installHooks('claude-code', agentDir);

      const installed = detectInstalledHooks(agentDir);
      expect(installed).toContain('cursor');
      expect(installed).toContain('claude-code');
      expect(installed).not.toContain('windsurf');
    });

    it('should detect all 4 editors when all installed', () => {
      for (const editor of SUPPORTED_EDITORS) {
        installHooks(editor, agentDir);
      }

      const installed = detectInstalledHooks(agentDir);
      expect(installed).toHaveLength(4);
    });
  });

  describe('SUPPORTED_EDITORS', () => {
    it('should have 4 editors', () => {
      expect(SUPPORTED_EDITORS).toHaveLength(4);
      expect(SUPPORTED_EDITORS).toContain('claude-code');
      expect(SUPPORTED_EDITORS).toContain('cursor');
      expect(SUPPORTED_EDITORS).toContain('windsurf');
      expect(SUPPORTED_EDITORS).toContain('copilot');
    });
  });
});
