/**
 * Colocated unit tests for feature-flags.ts — filesystem + env var behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FeatureFlags } from './feature-flags.js';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('FeatureFlags', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'soleri-ff-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SOLERI_FLAG_')) delete process.env[key];
    }
  });

  describe('defaults', () => {
    it('has auth-enforcement off by default', () => {
      expect(new FeatureFlags().isEnabled('auth-enforcement')).toBe(false);
    });

    it('has hot-reload on by default', () => {
      expect(new FeatureFlags().isEnabled('hot-reload')).toBe(true);
    });

    it('has cognee-sync on by default', () => {
      expect(new FeatureFlags().isEnabled('cognee-sync')).toBe(true);
    });

    it('has agency-mode off by default', () => {
      expect(new FeatureFlags().isEnabled('agency-mode')).toBe(false);
    });

    it('returns false for unknown flags', () => {
      expect(new FeatureFlags().isEnabled('does-not-exist')).toBe(false);
    });
  });

  describe('file persistence', () => {
    it('persists and loads flags from file', () => {
      const path = join(tempDir, 'flags.json');
      const f1 = new FeatureFlags(path);
      f1.set('auth-enforcement', true);

      const f2 = new FeatureFlags(path);
      expect(f2.isEnabled('auth-enforcement')).toBe(true);
    });

    it('creates parent directories if needed', () => {
      const path = join(tempDir, 'nested', 'deep', 'flags.json');
      const flags = new FeatureFlags(path);
      flags.set('hot-reload', false);
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      expect(data['hot-reload']).toBe(false);
    });

    it('handles corrupt JSON gracefully', () => {
      const path = join(tempDir, 'bad.json');
      writeFileSync(path, '{{{invalid');
      const flags = new FeatureFlags(path);
      // Falls back to defaults
      expect(flags.isEnabled('hot-reload')).toBe(true);
    });

    it('ignores non-boolean values in file', () => {
      const path = join(tempDir, 'mixed.json');
      writeFileSync(path, JSON.stringify({ 'hot-reload': 'yes', telemetry: false }));
      const flags = new FeatureFlags(path);
      // 'yes' is not boolean, so default (true) stays
      expect(flags.isEnabled('hot-reload')).toBe(true);
      expect(flags.isEnabled('telemetry')).toBe(false);
    });

    it('works in-memory when no file path given', () => {
      const flags = new FeatureFlags();
      flags.set('custom-flag', true);
      expect(flags.isEnabled('custom-flag')).toBe(true);
    });
  });

  describe('env var overrides', () => {
    it('SOLERI_FLAG_TELEMETRY=false overrides default', () => {
      process.env.SOLERI_FLAG_TELEMETRY = 'false';
      expect(new FeatureFlags().isEnabled('telemetry')).toBe(false);
    });

    it('supports =1 as truthy', () => {
      process.env.SOLERI_FLAG_AGENCY_MODE = '1';
      expect(new FeatureFlags().isEnabled('agency-mode')).toBe(true);
    });

    it('env overrides file values', () => {
      const path = join(tempDir, 'flags.json');
      writeFileSync(path, JSON.stringify({ telemetry: true }));
      process.env.SOLERI_FLAG_TELEMETRY = 'false';
      expect(new FeatureFlags(path).isEnabled('telemetry')).toBe(false);
    });

    it('supports custom flag names via env', () => {
      process.env.SOLERI_FLAG_MY_EXPERIMENT = 'true';
      expect(new FeatureFlags().isEnabled('my-experiment')).toBe(true);
    });
  });

  describe('getAll', () => {
    it('includes all built-in flags', () => {
      const all = new FeatureFlags().getAll();
      expect(Object.keys(all)).toContain('auth-enforcement');
      expect(Object.keys(all)).toContain('hot-reload');
      expect(Object.keys(all)).toContain('telemetry');
      expect(Object.keys(all)).toContain('cognee-sync');
    });

    it('reports source as env when env var set', () => {
      process.env.SOLERI_FLAG_TELEMETRY = 'true';
      const all = new FeatureFlags().getAll();
      expect(all['telemetry'].source).toBe('env');
    });

    it('reports source as default for built-in without env', () => {
      const all = new FeatureFlags().getAll();
      expect(all['hot-reload'].source).toBe('default');
    });

    it('reports source as runtime for custom flags', () => {
      const flags = new FeatureFlags();
      flags.set('my-flag', true);
      expect(flags.getAll()['my-flag'].source).toBe('runtime');
      expect(flags.getAll()['my-flag'].description).toBe('Custom flag');
    });
  });
});
