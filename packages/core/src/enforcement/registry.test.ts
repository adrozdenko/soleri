import { describe, it, expect, beforeEach } from 'vitest';
import { EnforcementRegistry } from './registry.js';
import { ClaudeCodeAdapter } from './adapters/claude-code.js';
import type { EnforcementRule } from './types.js';

function makeRule(overrides: Partial<EnforcementRule> = {}): EnforcementRule {
  return {
    id: 'test-rule',
    description: 'Test rule',
    trigger: 'pre-tool-use',
    action: 'block',
    message: 'Blocked',
    ...overrides,
  };
}

describe('EnforcementRegistry', () => {
  let registry: EnforcementRegistry;

  beforeEach(() => {
    registry = new EnforcementRegistry();
  });

  // ─── addRule / getRule ───────────────────────────────────────────

  describe('addRule', () => {
    it('adds a rule and retrieves it by ID', () => {
      registry.addRule(makeRule({ id: 'r1' }));
      expect(registry.getRule('r1')).toBeDefined();
      expect(registry.getRule('r1')?.id).toBe('r1');
    });

    it('replaces a rule with the same ID', () => {
      registry.addRule(makeRule({ id: 'r1', message: 'first' }));
      registry.addRule(makeRule({ id: 'r1', message: 'second' }));
      expect(registry.getRules()).toHaveLength(1);
      expect(registry.getRule('r1')?.message).toBe('second');
    });

    it('returns undefined for nonexistent rule', () => {
      expect(registry.getRule('does-not-exist')).toBeUndefined();
    });
  });

  // ─── addRules ───────────────────────────────────────────────────

  describe('addRules', () => {
    it('adds multiple rules at once', () => {
      registry.addRules([makeRule({ id: 'a' }), makeRule({ id: 'b' })]);
      expect(registry.getRules()).toHaveLength(2);
    });

    it('handles empty array', () => {
      registry.addRules([]);
      expect(registry.getRules()).toHaveLength(0);
    });
  });

  // ─── removeRule ─────────────────────────────────────────────────

  describe('removeRule', () => {
    it('returns true when rule existed', () => {
      registry.addRule(makeRule({ id: 'r1' }));
      expect(registry.removeRule('r1')).toBe(true);
      expect(registry.getRules()).toHaveLength(0);
    });

    it('returns false when rule did not exist', () => {
      expect(registry.removeRule('nonexistent')).toBe(false);
    });
  });

  // ─── getEnabledRules / getConfig ────────────────────────────────

  describe('getEnabledRules', () => {
    it('excludes disabled rules', () => {
      registry.addRules([makeRule({ id: 'active' }), makeRule({ id: 'disabled', enabled: false })]);
      const enabled = registry.getEnabledRules();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe('active');
    });

    it('includes rules with enabled=undefined (defaults to true)', () => {
      registry.addRule(makeRule({ id: 'implicit-enabled' }));
      expect(registry.getEnabledRules()).toHaveLength(1);
    });
  });

  describe('getConfig', () => {
    it('returns config with only enabled rules', () => {
      registry.addRules([makeRule({ id: 'on' }), makeRule({ id: 'off', enabled: false })]);
      const config = registry.getConfig();
      expect(config.rules).toHaveLength(1);
      expect(config.rules[0].id).toBe('on');
    });
  });

  // ─── adapter management ─────────────────────────────────────────

  describe('adapters', () => {
    it('registers and retrieves an adapter', () => {
      const adapter = new ClaudeCodeAdapter();
      registry.registerAdapter(adapter);
      expect(registry.getAdapter('claude-code')).toBe(adapter);
    });

    it('lists registered adapter hosts', () => {
      registry.registerAdapter(new ClaudeCodeAdapter());
      expect(registry.listAdapters()).toEqual(['claude-code']);
    });

    it('returns undefined for unregistered host', () => {
      expect(registry.getAdapter('cursor')).toBeUndefined();
    });
  });

  // ─── translate ──────────────────────────────────────────────────

  describe('translate', () => {
    it('returns skipped rules when no adapter matches', () => {
      registry.addRule(makeRule({ id: 'r1' }));
      const result = registry.translate('missing-host');
      expect(result.host).toBe('missing-host');
      expect(result.files).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain('No adapter registered');
    });

    it('delegates to adapter.translate with enabled rules only', () => {
      registry.addRules([
        makeRule({ id: 'r1', pattern: 'console\\.log' }),
        makeRule({ id: 'r2', enabled: false }),
      ]);
      registry.registerAdapter(new ClaudeCodeAdapter());

      const result = registry.translate('claude-code');
      expect(result.host).toBe('claude-code');
      // Only r1 should be translated (r2 is disabled)
      expect(result.files.length).toBeGreaterThan(0);
    });
  });

  // ─── translateAll ───────────────────────────────────────────────

  describe('translateAll', () => {
    it('translates for all registered adapters', () => {
      registry.addRule(makeRule({ id: 'r1', pattern: 'test' }));
      registry.registerAdapter(new ClaudeCodeAdapter());

      const results = registry.translateAll();
      expect(results).toHaveLength(1);
      expect(results[0].host).toBe('claude-code');
    });

    it('returns empty array when no adapters are registered', () => {
      registry.addRule(makeRule());
      expect(registry.translateAll()).toEqual([]);
    });
  });
});

describe('ClaudeCodeAdapter', () => {
  const adapter = new ClaudeCodeAdapter();

  describe('supports', () => {
    it('supports pre-tool-use, post-tool-use, pre-compact, session-start, pre-commit', () => {
      expect(adapter.supports('pre-tool-use')).toBe(true);
      expect(adapter.supports('post-tool-use')).toBe(true);
      expect(adapter.supports('pre-compact')).toBe(true);
      expect(adapter.supports('session-start')).toBe(true);
      expect(adapter.supports('pre-commit')).toBe(true);
    });

    it('does not support on-save', () => {
      expect(adapter.supports('on-save')).toBe(false);
    });
  });

  describe('translate', () => {
    it('creates settings.json for pattern-based pre-tool-use rule', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'no-console', pattern: 'console\\.log', trigger: 'pre-tool-use' })],
      });

      const settings = result.files.find((f) => f.path.includes('settings.json'));
      expect(settings).toBeDefined();
      const parsed = JSON.parse(settings!.content);
      expect(parsed.hooks[0].event).toBe('PreToolUse');
    });

    it('creates hookify file for pre-commit rule', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'check-debug', trigger: 'pre-commit', pattern: 'debugger' })],
      });

      const hookFile = result.files.find((f) => f.path.includes('hookify'));
      expect(hookFile).toBeDefined();
      expect(hookFile!.content).toContain('name: check-debug');
    });

    it('generates block command with exit 1 for action=block', () => {
      const result = adapter.translate({
        rules: [makeRule({ action: 'block', pattern: 'bad' })],
      });
      const settings = result.files.find((f) => f.path.includes('settings.json'));
      const parsed = JSON.parse(settings!.content);
      expect(parsed.hooks[0].command).toContain('exit 1');
      expect(parsed.hooks[0].command).toContain('BLOCKED');
    });

    it('generates warn command without exit 1 for action=warn', () => {
      const result = adapter.translate({
        rules: [makeRule({ action: 'warn', pattern: 'maybe' })],
      });
      const settings = result.files.find((f) => f.path.includes('settings.json'));
      const parsed = JSON.parse(settings!.content);
      expect(parsed.hooks[0].command).toContain('WARNING');
      expect(parsed.hooks[0].command).not.toContain('exit 1');
    });

    it('generates simple echo command for rules without pattern', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'session-hook', trigger: 'session-start' })],
      });
      const settings = result.files.find((f) => f.path.includes('settings.json'));
      const parsed = JSON.parse(settings!.content);
      expect(parsed.hooks[0].event).toBe('SessionStart');
      expect(parsed.hooks[0].command).toContain('echo');
    });

    it('skips unsupported triggers and reports them', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'onsave', trigger: 'on-save' })],
      });
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].ruleId).toBe('onsave');
      expect(result.files).toHaveLength(0);
    });

    it('handles empty rules config', () => {
      const result = adapter.translate({ rules: [] });
      expect(result.files).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });

    it('handles mix of supported and unsupported triggers', () => {
      const result = adapter.translate({
        rules: [
          makeRule({ id: 'ok', trigger: 'pre-tool-use', pattern: 'test' }),
          makeRule({ id: 'bad', trigger: 'on-save' }),
        ],
      });
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].ruleId).toBe('bad');
    });
  });
});
