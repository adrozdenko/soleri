import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeCodeAdapter } from './claude-code.js';
import type { EnforcementConfig, EnforcementRule } from '../types.js';

// ─── Test Factories ─────────────────────────────────────────────────

function createRule(overrides: Partial<EnforcementRule> = {}): EnforcementRule {
  return {
    id: 'test-rule',
    description: 'Test rule description',
    trigger: 'pre-tool-use',
    action: 'warn',
    message: 'Test warning message',
    ...overrides,
  };
}

function createConfig(rules: EnforcementRule[]): EnforcementConfig {
  return { rules };
}

// ─── ClaudeCodeAdapter ──────────────────────────────────────────────

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter();
  });

  describe('host', () => {
    it('should identify as claude-code', () => {
      expect(adapter.host).toBe('claude-code');
    });
  });

  describe('supports', () => {
    it('should support pre-tool-use trigger', () => {
      expect(adapter.supports('pre-tool-use')).toBe(true);
    });

    it('should support post-tool-use trigger', () => {
      expect(adapter.supports('post-tool-use')).toBe(true);
    });

    it('should support pre-compact trigger', () => {
      expect(adapter.supports('pre-compact')).toBe(true);
    });

    it('should support session-start trigger', () => {
      expect(adapter.supports('session-start')).toBe(true);
    });

    it('should support pre-commit trigger', () => {
      expect(adapter.supports('pre-commit')).toBe(true);
    });

    it('should not support on-save trigger', () => {
      expect(adapter.supports('on-save')).toBe(false);
    });
  });

  describe('translate', () => {
    it('should return empty files and skipped when no rules', () => {
      const result = adapter.translate(createConfig([]));
      expect(result.host).toBe('claude-code');
      expect(result.files).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it('should skip rules with unsupported triggers', () => {
      const rule = createRule({ id: 'save-rule', trigger: 'on-save' });
      const result = adapter.translate(createConfig([rule]));

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toEqual({
        ruleId: 'save-rule',
        reason: "Trigger 'on-save' not supported",
      });
      expect(result.files).toEqual([]);
    });

    it('should generate settings.json for pre-tool-use with pattern', () => {
      const rule = createRule({
        id: 'no-console',
        trigger: 'pre-tool-use',
        pattern: 'console\\.log',
        action: 'warn',
        message: 'No console.log',
      });
      const result = adapter.translate(createConfig([rule]));

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('.claude/settings.json');

      const parsed = JSON.parse(result.files[0].content);
      expect(parsed.hooks).toHaveLength(1);
      expect(parsed.hooks[0].event).toBe('PreToolUse');
      expect(parsed.hooks[0].command).toContain('console\\.log');
      expect(parsed.hooks[0].command).toContain('WARNING');
    });

    it('should generate block command for block action', () => {
      const rule = createRule({
        id: 'block-secrets',
        trigger: 'pre-tool-use',
        pattern: 'API_KEY',
        action: 'block',
        message: 'Do not commit secrets',
      });
      const result = adapter.translate(createConfig([rule]));

      const parsed = JSON.parse(result.files[0].content);
      expect(parsed.hooks[0].command).toContain('BLOCKED');
      expect(parsed.hooks[0].command).toContain('exit 1');
    });

    it('should generate simple echo command when no pattern', () => {
      const rule = createRule({
        id: 'session-check',
        trigger: 'session-start',
        message: 'Session started',
      });
      const result = adapter.translate(createConfig([rule]));

      const parsed = JSON.parse(result.files[0].content);
      expect(parsed.hooks[0].event).toBe('SessionStart');
      expect(parsed.hooks[0].command).toBe('echo "[session-check] Session started"');
    });

    it('should generate hookify file for pre-commit trigger', () => {
      const rule = createRule({
        id: 'no-console-log',
        trigger: 'pre-commit',
        pattern: 'console\\.log',
        message: 'No console.log in commits',
        description: 'Blocks console.log statements',
      });
      const result = adapter.translate(createConfig([rule]));

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('.claude/hookify.no-console-log.local.md');

      const content = result.files[0].content;
      expect(content).toContain('name: no-console-log');
      expect(content).toContain('Blocks console.log statements');
      expect(content).toContain('Pattern: `console\\.log`');
      expect(content).toContain('No console.log in commits');
    });

    it('should generate hookify file without pattern when none provided', () => {
      const rule = createRule({
        id: 'commit-check',
        trigger: 'pre-commit',
        description: 'General commit check',
        message: 'Check before commit',
      });
      const result = adapter.translate(createConfig([rule]));

      const content = result.files[0].content;
      expect(content).toContain('name: commit-check');
      expect(content).not.toContain('Pattern:');
    });

    it('should handle mixed rules with hooks and hookify files', () => {
      const rules = [
        createRule({ id: 'tool-check', trigger: 'pre-tool-use', pattern: 'rm -rf' }),
        createRule({ id: 'commit-check', trigger: 'pre-commit' }),
        createRule({ id: 'unsupported', trigger: 'on-save' }),
      ];
      const result = adapter.translate(createConfig(rules));

      expect(result.files).toHaveLength(2);
      expect(result.skipped).toHaveLength(1);

      const settingsFile = result.files.find((f) => f.path === '.claude/settings.json');
      const hookFile = result.files.find((f) => f.path.includes('hookify'));
      expect(settingsFile).toBeDefined();
      expect(hookFile).toBeDefined();
    });

    it('should combine multiple hook events into single settings.json', () => {
      const rules = [
        createRule({ id: 'rule-1', trigger: 'pre-tool-use', pattern: 'test1' }),
        createRule({ id: 'rule-2', trigger: 'pre-compact', pattern: 'test2' }),
        createRule({ id: 'rule-3', trigger: 'session-start', message: 'hello' }),
      ];
      const result = adapter.translate(createConfig(rules));

      const settingsFile = result.files.find((f) => f.path === '.claude/settings.json');
      expect(settingsFile).toBeDefined();

      const parsed = JSON.parse(settingsFile!.content);
      expect(parsed.hooks).toHaveLength(3);
      expect(parsed.hooks[0].event).toBe('PreToolUse');
      expect(parsed.hooks[1].event).toBe('PreCompact');
      expect(parsed.hooks[2].event).toBe('SessionStart');
    });

    it('should map post-tool-use to PostToolUse event', () => {
      const rule = createRule({ id: 'post-check', trigger: 'post-tool-use', pattern: 'error' });
      const result = adapter.translate(createConfig([rule]));

      const parsed = JSON.parse(result.files[0].content);
      expect(parsed.hooks[0].event).toBe('PostToolUse');
    });

    it('should not generate settings.json when only pre-commit rules exist', () => {
      const rule = createRule({ id: 'commit-only', trigger: 'pre-commit' });
      const result = adapter.translate(createConfig([rule]));

      const settingsFile = result.files.find((f) => f.path === '.claude/settings.json');
      expect(settingsFile).toBeUndefined();
    });
  });
});
