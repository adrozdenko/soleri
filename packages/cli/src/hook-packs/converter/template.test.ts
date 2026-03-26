import { describe, it, expect } from 'vitest';
import { generateHookScript, generateManifest, HOOK_EVENTS, ACTION_LEVELS } from './template.js';
import type { HookConversionConfig } from './template.js';

describe('generateHookScript', () => {
  const baseConfig: HookConversionConfig = {
    name: 'test-hook',
    event: 'PreToolUse',
    toolMatcher: 'Write|Edit',
    filePatterns: ['**/marketing/**'],
    action: 'remind',
    message: 'Check brand guidelines before editing marketing files',
  };

  it('should generate a valid POSIX shell script', () => {
    const script = generateHookScript(baseConfig);
    expect(script).toContain('#!/bin/sh');
    expect(script).toContain('set -eu');
    expect(script).toContain('INPUT=$(cat)');
  });

  it('should include tool matcher for PreToolUse', () => {
    const script = generateHookScript(baseConfig);
    expect(script).toContain('TOOL_NAME=');
    expect(script).toContain('Write|Edit');
    expect(script).toContain('case "$TOOL_NAME" in');
  });

  it('should include file pattern matching', () => {
    const script = generateHookScript(baseConfig);
    expect(script).toContain('FILE_PATH=');
    expect(script).toContain('MATCHED=false');
    expect(script).toContain('marketing');
  });

  it('should output remind action by default', () => {
    const script = generateHookScript(baseConfig);
    expect(script).toContain('REMINDER:');
    expect(script).toContain('continue: true');
  });

  it('should output warn action', () => {
    const script = generateHookScript({ ...baseConfig, action: 'warn' });
    expect(script).toContain('WARNING:');
    expect(script).toContain('continue: true');
  });

  it('should output block action', () => {
    const script = generateHookScript({ ...baseConfig, action: 'block' });
    expect(script).toContain('BLOCKED:');
    expect(script).toContain('continue: false');
  });

  it('should skip tool matcher for non-tool events', () => {
    const script = generateHookScript({ ...baseConfig, event: 'PreCompact' });
    expect(script).not.toContain('TOOL_NAME');
    expect(script).not.toContain('case');
  });

  it('should skip file pattern matching when no patterns', () => {
    const script = generateHookScript({ ...baseConfig, filePatterns: undefined });
    expect(script).not.toContain('FILE_PATH');
    expect(script).not.toContain('MATCHED');
  });

  it('should generate scripts for all 5 hook events', () => {
    for (const event of HOOK_EVENTS) {
      const script = generateHookScript({ ...baseConfig, event });
      expect(script).toContain(`# Event: ${event}`);
      expect(script).toContain('#!/bin/sh');
    }
  });

  it('should escape single quotes in messages', () => {
    const script = generateHookScript({ ...baseConfig, message: "Don't forget the guidelines" });
    // Should not have unbalanced quotes
    expect(script).toContain('forget');
  });
});

describe('generateManifest', () => {
  const config: HookConversionConfig = {
    name: 'my-hook',
    event: 'PreToolUse',
    toolMatcher: 'Write',
    action: 'remind',
    message: 'Test message',
  };

  it('should generate valid manifest with required fields', () => {
    const manifest = generateManifest(config);
    expect(manifest.name).toBe('my-hook');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.hooks).toEqual([]);
    expect(manifest.scripts).toHaveLength(1);
    expect(manifest.lifecycleHooks).toHaveLength(1);
  });

  it('should set script name and file correctly', () => {
    const manifest = generateManifest(config);
    expect(manifest.scripts![0].name).toBe('my-hook');
    expect(manifest.scripts![0].file).toBe('my-hook.sh');
    expect(manifest.scripts![0].targetDir).toBe('hooks');
  });

  it('should set lifecycle hook event and command', () => {
    const manifest = generateManifest(config);
    const lc = manifest.lifecycleHooks![0];
    expect(lc.event).toBe('PreToolUse');
    expect(lc.command).toBe('sh ~/.claude/hooks/my-hook.sh');
    expect(lc.type).toBe('command');
    expect(lc.timeout).toBe(10);
  });

  it('should use description from config or fallback to message', () => {
    expect(generateManifest(config).description).toBe('Test message');
    expect(generateManifest({ ...config, description: 'Custom desc' }).description).toBe(
      'Custom desc',
    );
  });

  it('should include actionLevel', () => {
    expect(generateManifest(config).actionLevel).toBe('remind');
    expect(generateManifest({ ...config, action: 'block' }).actionLevel).toBe('block');
  });

  it('should generate manifests for all action levels', () => {
    for (const action of ACTION_LEVELS) {
      const manifest = generateManifest({ ...config, action });
      expect(manifest.actionLevel).toBe(action);
    }
  });
});
