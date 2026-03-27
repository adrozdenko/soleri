import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateHookScript,
  generateManifest,
  HOOK_EVENTS,
  ACTION_LEVELS,
} from '../hook-packs/converter/template.js';
import type { HookConversionConfig } from '../hook-packs/converter/template.js';

const tempDir = join(tmpdir(), `hooks-convert-test-${Date.now()}`);

describe('hooks convert', () => {
  beforeEach(() => {
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateManifest', () => {
    it('should produce valid JSON with correct fields', () => {
      const config: HookConversionConfig = {
        name: 'brand-voice',
        event: 'PreToolUse',
        toolMatcher: 'Write|Edit',
        action: 'remind',
        message: 'Follow brand voice guidelines',
      };

      const manifest = generateManifest(config);

      expect(manifest.name).toBe('brand-voice');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.description).toBe('Follow brand voice guidelines');
      expect(manifest.hooks).toEqual([]);
      expect(manifest.scripts).toHaveLength(1);
      expect(manifest.scripts![0].name).toBe('brand-voice');
      expect(manifest.scripts![0].file).toBe('brand-voice.sh');
      expect(manifest.scripts![0].targetDir).toBe('hooks');
      expect(manifest.lifecycleHooks).toHaveLength(1);
      expect(manifest.lifecycleHooks![0].event).toBe('PreToolUse');
      expect(manifest.lifecycleHooks![0].matcher).toBe('Write|Edit');
      expect(manifest.actionLevel).toBe('remind');

      // Verify it serializes to valid JSON
      const json = JSON.stringify(manifest);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should use message as description when no description provided', () => {
      const config: HookConversionConfig = {
        name: 'test-hook',
        event: 'PreCompact',
        action: 'warn',
        message: 'Save session state',
      };

      const manifest = generateManifest(config);
      expect(manifest.description).toBe('Save session state');
    });

    it('should use custom description when provided', () => {
      const config: HookConversionConfig = {
        name: 'test-hook',
        event: 'PreCompact',
        action: 'warn',
        message: 'Save session state',
        description: 'Custom description here',
      };

      const manifest = generateManifest(config);
      expect(manifest.description).toBe('Custom description here');
    });

    it('should set empty matcher for non-tool events', () => {
      const config: HookConversionConfig = {
        name: 'compact-hook',
        event: 'PreCompact',
        action: 'remind',
        message: 'Capture session',
      };

      const manifest = generateManifest(config);
      expect(manifest.lifecycleHooks![0].matcher).toBe('');
    });
  });

  describe('generateHookScript', () => {
    it('should produce a valid shell script with shebang', () => {
      const config: HookConversionConfig = {
        name: 'test-hook',
        event: 'PreToolUse',
        toolMatcher: 'Write',
        action: 'remind',
        message: 'Check before writing',
      };

      const script = generateHookScript(config);

      expect(script).toMatch(/^#!\/bin\/sh/);
      expect(script).toContain('set -eu');
      expect(script).toContain('INPUT=$(cat)');
    });

    it('should include tool matcher case statement for PreToolUse', () => {
      const config: HookConversionConfig = {
        name: 'write-guard',
        event: 'PreToolUse',
        toolMatcher: 'Write|Edit',
        action: 'warn',
        message: 'Be careful with writes',
      };

      const script = generateHookScript(config);

      expect(script).toContain('TOOL_NAME=');
      expect(script).toContain('case "$TOOL_NAME" in');
      expect(script).toContain('Write|Edit');
    });

    it('should include file pattern matching when patterns provided', () => {
      const config: HookConversionConfig = {
        name: 'marketing-guard',
        event: 'PreToolUse',
        toolMatcher: 'Write',
        filePatterns: ['**/marketing/**'],
        action: 'block',
        message: 'Marketing files require review',
      };

      const script = generateHookScript(config);

      expect(script).toContain('FILE_PATH=');
      expect(script).toContain('MATCHED=false');
      expect(script).toContain('grep -qE');
    });

    it('should output block JSON for action=block', () => {
      const config: HookConversionConfig = {
        name: 'blocker',
        event: 'PreToolUse',
        action: 'block',
        message: 'Blocked operation',
      };

      const script = generateHookScript(config);

      expect(script).toContain('continue: false');
      expect(script).toContain('BLOCKED:');
    });

    it('should output warn JSON for action=warn', () => {
      const config: HookConversionConfig = {
        name: 'warner',
        event: 'PreToolUse',
        action: 'warn',
        message: 'Warning message',
      };

      const script = generateHookScript(config);

      expect(script).toContain('continue: true');
      expect(script).toContain('WARNING:');
    });

    it('should output remind JSON for action=remind', () => {
      const config: HookConversionConfig = {
        name: 'reminder',
        event: 'PreToolUse',
        action: 'remind',
        message: 'Reminder message',
      };

      const script = generateHookScript(config);

      expect(script).toContain('continue: true');
      expect(script).toContain('REMINDER:');
    });

    it('should not include tool matching for PreCompact event', () => {
      const config: HookConversionConfig = {
        name: 'compact-hook',
        event: 'PreCompact',
        action: 'remind',
        message: 'Save state before compaction',
      };

      const script = generateHookScript(config);

      expect(script).not.toContain('TOOL_NAME');
      expect(script).not.toContain('case');
    });

    it('should not include tool matching for Notification event', () => {
      const config: HookConversionConfig = {
        name: 'notify-hook',
        event: 'Notification',
        action: 'remind',
        message: 'Notification handler',
      };

      const script = generateHookScript(config);

      expect(script).not.toContain('TOOL_NAME');
    });

    it('should not include tool matching for Stop event', () => {
      const config: HookConversionConfig = {
        name: 'stop-hook',
        event: 'Stop',
        action: 'remind',
        message: 'Stop handler',
      };

      const script = generateHookScript(config);

      expect(script).not.toContain('TOOL_NAME');
    });
  });

  describe('constants', () => {
    it('HOOK_EVENTS should contain all 5 events', () => {
      expect(HOOK_EVENTS).toEqual([
        'PreToolUse',
        'PostToolUse',
        'PreCompact',
        'Notification',
        'Stop',
      ]);
    });

    it('ACTION_LEVELS should contain all 3 levels', () => {
      expect(ACTION_LEVELS).toEqual(['remind', 'warn', 'block']);
    });
  });

  describe('validation', () => {
    it('should reject invalid event', () => {
      const invalidEvent = 'InvalidEvent';
      expect(HOOK_EVENTS.includes(invalidEvent as any)).toBe(false);
    });

    it('should reject invalid action level', () => {
      const invalidAction = 'destroy';
      expect(ACTION_LEVELS.includes(invalidAction as any)).toBe(false);
    });

    it('should accept all valid events', () => {
      for (const event of HOOK_EVENTS) {
        expect(HOOK_EVENTS.includes(event)).toBe(true);
      }
    });

    it('should accept all valid action levels', () => {
      for (const action of ACTION_LEVELS) {
        expect(ACTION_LEVELS.includes(action)).toBe(true);
      }
    });
  });

  describe('directory structure', () => {
    it('should create correct built-in directory structure', () => {
      const config: HookConversionConfig = {
        name: 'test-pack',
        event: 'PreToolUse',
        toolMatcher: 'Write',
        action: 'remind',
        message: 'Test message',
      };

      const script = generateHookScript(config);
      const manifest = generateManifest(config);

      // Simulate built-in output
      const baseDir = join(tempDir, 'hook-packs', config.name);
      const scriptsDir = join(baseDir, 'scripts');
      mkdirSync(scriptsDir, { recursive: true });

      const { writeFileSync: wfs, chmodSync: cms } = require('node:fs');
      wfs(join(baseDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
      wfs(join(scriptsDir, `${config.name}.sh`), script);
      cms(join(scriptsDir, `${config.name}.sh`), 0o755);

      // Verify structure
      expect(existsSync(join(baseDir, 'manifest.json'))).toBe(true);
      expect(existsSync(join(scriptsDir, `${config.name}.sh`))).toBe(true);

      // Verify manifest is valid JSON
      const manifestContent = readFileSync(join(baseDir, 'manifest.json'), 'utf-8');
      const parsed = JSON.parse(manifestContent);
      expect(parsed.name).toBe('test-pack');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.scripts).toHaveLength(1);
      expect(parsed.lifecycleHooks).toHaveLength(1);

      // Verify script content
      const scriptContent = readFileSync(join(scriptsDir, `${config.name}.sh`), 'utf-8');
      expect(scriptContent).toContain('#!/bin/sh');
      expect(scriptContent).toContain('test-pack');

      // Verify script is executable (Unix only — Windows does not support POSIX permissions)
      if (process.platform !== 'win32') {
        const stat = statSync(join(scriptsDir, `${config.name}.sh`));
        expect(stat.mode & 0o755).toBe(0o755);
      }
    });

    it('should create correct project directory structure with --project flag', () => {
      const config: HookConversionConfig = {
        name: 'project-hook',
        event: 'PostToolUse',
        action: 'warn',
        message: 'Project-local hook',
      };

      const script = generateHookScript(config);
      const manifest = generateManifest(config);

      // Simulate --project output
      const baseDir = join(tempDir, '.soleri', 'hook-packs', config.name);
      const scriptsDir = join(baseDir, 'scripts');
      mkdirSync(scriptsDir, { recursive: true });

      const { writeFileSync: wfs, chmodSync: cms } = require('node:fs');
      wfs(join(baseDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
      wfs(join(scriptsDir, `${config.name}.sh`), script);
      cms(join(scriptsDir, `${config.name}.sh`), 0o755);

      // Verify --project path structure
      expect(
        existsSync(join(tempDir, '.soleri', 'hook-packs', 'project-hook', 'manifest.json')),
      ).toBe(true);
      expect(
        existsSync(
          join(tempDir, '.soleri', 'hook-packs', 'project-hook', 'scripts', 'project-hook.sh'),
        ),
      ).toBe(true);
    });
  });
});
