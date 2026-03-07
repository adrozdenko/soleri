import { describe, it, expect } from 'vitest';
import { EnforcementRegistry } from '../enforcement/registry.js';
import { ClaudeCodeAdapter } from '../enforcement/adapters/claude-code.js';
import type { EnforcementRule } from '../enforcement/types.js';

const makeRule = (overrides: Partial<EnforcementRule> = {}): EnforcementRule => ({
  id: 'test-rule',
  description: 'Test rule',
  trigger: 'pre-tool-use',
  action: 'block',
  message: 'This is blocked',
  ...overrides,
});

describe('EnforcementRegistry', () => {
  it('adds and retrieves rules', () => {
    const reg = new EnforcementRegistry();
    reg.addRule(makeRule({ id: 'r1' }));
    reg.addRule(makeRule({ id: 'r2' }));
    expect(reg.getRules()).toHaveLength(2);
    expect(reg.getRule('r1')?.id).toBe('r1');
  });

  it('replaces rules with same ID', () => {
    const reg = new EnforcementRegistry();
    reg.addRule(makeRule({ id: 'r1', message: 'old' }));
    reg.addRule(makeRule({ id: 'r1', message: 'new' }));
    expect(reg.getRules()).toHaveLength(1);
    expect(reg.getRule('r1')?.message).toBe('new');
  });

  it('removes rules by ID', () => {
    const reg = new EnforcementRegistry();
    reg.addRule(makeRule({ id: 'r1' }));
    expect(reg.removeRule('r1')).toBe(true);
    expect(reg.removeRule('r1')).toBe(false);
    expect(reg.getRules()).toHaveLength(0);
  });

  it('filters disabled rules', () => {
    const reg = new EnforcementRegistry();
    reg.addRule(makeRule({ id: 'active' }));
    reg.addRule(makeRule({ id: 'disabled', enabled: false }));
    expect(reg.getEnabledRules()).toHaveLength(1);
    expect(reg.getEnabledRules()[0].id).toBe('active');
  });

  it('addRules adds multiple', () => {
    const reg = new EnforcementRegistry();
    reg.addRules([makeRule({ id: 'a' }), makeRule({ id: 'b' }), makeRule({ id: 'c' })]);
    expect(reg.getRules()).toHaveLength(3);
  });

  it('registers and lists adapters', () => {
    const reg = new EnforcementRegistry();
    reg.registerAdapter(new ClaudeCodeAdapter());
    expect(reg.listAdapters()).toEqual(['claude-code']);
    expect(reg.getAdapter('claude-code')).toBeDefined();
  });

  it('translate returns skipped when no adapter', () => {
    const reg = new EnforcementRegistry();
    reg.addRule(makeRule({ id: 'r1' }));
    const result = reg.translate('unknown-host');
    expect(result.host).toBe('unknown-host');
    expect(result.files).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].ruleId).toBe('r1');
  });

  it('translateAll translates for all adapters', () => {
    const reg = new EnforcementRegistry();
    reg.addRule(makeRule());
    reg.registerAdapter(new ClaudeCodeAdapter());
    const results = reg.translateAll();
    expect(results).toHaveLength(1);
    expect(results[0].host).toBe('claude-code');
  });
});

describe('ClaudeCodeAdapter', () => {
  const adapter = new ClaudeCodeAdapter();

  it('supports expected triggers', () => {
    expect(adapter.supports('pre-tool-use')).toBe(true);
    expect(adapter.supports('post-tool-use')).toBe(true);
    expect(adapter.supports('pre-compact')).toBe(true);
    expect(adapter.supports('session-start')).toBe(true);
    expect(adapter.supports('pre-commit')).toBe(true);
    expect(adapter.supports('on-save')).toBe(false);
  });

  it('translates pre-tool-use with pattern to settings.json hook', () => {
    const result = adapter.translate({
      rules: [makeRule({ id: 'no-console', pattern: 'console\\.log', trigger: 'pre-tool-use' })],
    });
    expect(result.files.length).toBeGreaterThan(0);
    const settingsFile = result.files.find((f) => f.path.includes('settings.json'));
    expect(settingsFile).toBeDefined();
    const parsed = JSON.parse(settingsFile!.content);
    expect(parsed.hooks).toHaveLength(1);
    expect(parsed.hooks[0].event).toBe('PreToolUse');
    expect(parsed.hooks[0].command).toContain('console\\.log');
  });

  it('translates pre-commit to hookify file', () => {
    const result = adapter.translate({
      rules: [makeRule({ id: 'no-debug', trigger: 'pre-commit', pattern: 'debugger' })],
    });
    const hookFile = result.files.find((f) => f.path.includes('hookify.no-debug'));
    expect(hookFile).toBeDefined();
    expect(hookFile!.content).toContain('name: no-debug');
    expect(hookFile!.content).toContain('debugger');
  });

  it('skips unsupported triggers', () => {
    const result = adapter.translate({
      rules: [makeRule({ id: 'on-save-rule', trigger: 'on-save' })],
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].ruleId).toBe('on-save-rule');
  });

  it('generates block command with exit 1', () => {
    const result = adapter.translate({
      rules: [makeRule({ id: 'blocker', action: 'block', pattern: 'bad-thing' })],
    });
    const settings = result.files.find((f) => f.path.includes('settings.json'));
    const parsed = JSON.parse(settings!.content);
    expect(parsed.hooks[0].command).toContain('exit 1');
    expect(parsed.hooks[0].command).toContain('BLOCKED');
  });

  it('generates warn command without exit 1', () => {
    const result = adapter.translate({
      rules: [makeRule({ id: 'warner', action: 'warn', pattern: 'maybe-bad' })],
    });
    const settings = result.files.find((f) => f.path.includes('settings.json'));
    const parsed = JSON.parse(settings!.content);
    expect(parsed.hooks[0].command).toContain('WARNING');
    expect(parsed.hooks[0].command).not.toContain('exit 1');
  });

  it('handles rules without patterns', () => {
    const result = adapter.translate({
      rules: [makeRule({ id: 'simple', trigger: 'session-start' })],
    });
    const settings = result.files.find((f) => f.path.includes('settings.json'));
    const parsed = JSON.parse(settings!.content);
    expect(parsed.hooks[0].event).toBe('SessionStart');
    expect(parsed.hooks[0].command).toContain('simple');
  });
});
