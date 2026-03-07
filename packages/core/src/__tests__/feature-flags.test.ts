import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FeatureFlags } from '../runtime/feature-flags.js';
import { join } from 'node:path';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('FeatureFlags', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'soleri-flags-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    // Clean up env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SOLERI_FLAG_')) {
        delete process.env[key];
      }
    }
  });

  it('initializes with built-in defaults', () => {
    const flags = new FeatureFlags();
    expect(flags.isEnabled('auth-enforcement')).toBe(false);
    expect(flags.isEnabled('hot-reload')).toBe(true);
    expect(flags.isEnabled('search-feedback')).toBe(true);
    expect(flags.isEnabled('telemetry')).toBe(true);
    expect(flags.isEnabled('agency-mode')).toBe(false);
    expect(flags.isEnabled('cognee-sync')).toBe(true);
  });

  it('returns false for unknown flags', () => {
    const flags = new FeatureFlags();
    expect(flags.isEnabled('nonexistent-flag')).toBe(false);
  });

  it('set() changes flag value and persists to file', () => {
    const filePath = join(tempDir, 'flags.json');
    const flags = new FeatureFlags(filePath);

    flags.set('auth-enforcement', true);
    expect(flags.isEnabled('auth-enforcement')).toBe(true);

    // Verify persisted
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(data['auth-enforcement']).toBe(true);
  });

  it('loads flags from file on construction', () => {
    const filePath = join(tempDir, 'flags.json');

    // First instance sets a flag
    const flags1 = new FeatureFlags(filePath);
    flags1.set('auth-enforcement', true);
    flags1.set('telemetry', false);

    // Second instance loads from file
    const flags2 = new FeatureFlags(filePath);
    expect(flags2.isEnabled('auth-enforcement')).toBe(true);
    expect(flags2.isEnabled('telemetry')).toBe(false);
    // Unchanged defaults still work
    expect(flags2.isEnabled('hot-reload')).toBe(true);
  });

  it('env vars override file and defaults', () => {
    const filePath = join(tempDir, 'flags.json');
    const flags1 = new FeatureFlags(filePath);
    flags1.set('telemetry', true); // file says true

    process.env.SOLERI_FLAG_TELEMETRY = 'false';
    const flags2 = new FeatureFlags(filePath);
    expect(flags2.isEnabled('telemetry')).toBe(false); // env wins
  });

  it('env var format: SOLERI_FLAG_AUTH_ENFORCEMENT=1', () => {
    process.env.SOLERI_FLAG_AUTH_ENFORCEMENT = '1';
    const flags = new FeatureFlags();
    expect(flags.isEnabled('auth-enforcement')).toBe(true);
  });

  it('env var custom flags work', () => {
    process.env.SOLERI_FLAG_MY_CUSTOM = 'true';
    const flags = new FeatureFlags();
    expect(flags.isEnabled('my-custom')).toBe(true);
  });

  it('getAll() returns all flags with metadata', () => {
    const flags = new FeatureFlags();
    const all = flags.getAll();

    expect(all['auth-enforcement']).toEqual({
      enabled: false,
      description: 'Enforce auth levels in facade dispatch',
      source: 'default',
    });
    expect(all['hot-reload']).toEqual({
      enabled: true,
      description: 'Enable hot reload of vault and config',
      source: 'default',
    });
  });

  it('getAll() reports env source when env var is set', () => {
    process.env.SOLERI_FLAG_TELEMETRY = 'true';
    const flags = new FeatureFlags();
    const all = flags.getAll();
    expect(all['telemetry'].source).toBe('env');
  });

  it('set() creates custom flags not in built-in list', () => {
    const flags = new FeatureFlags();
    flags.set('experimental-feature', true);
    expect(flags.isEnabled('experimental-feature')).toBe(true);

    const all = flags.getAll();
    expect(all['experimental-feature'].description).toBe('Custom flag');
    expect(all['experimental-feature'].source).toBe('runtime');
  });

  it('handles corrupt flags file gracefully', () => {
    const filePath = join(tempDir, 'flags.json');
    const { writeFileSync } = require('node:fs');
    writeFileSync(filePath, 'not json!!!');

    // Should not throw — falls back to defaults
    const flags = new FeatureFlags(filePath);
    expect(flags.isEnabled('hot-reload')).toBe(true);
  });

  it('no file path means in-memory only (no persistence)', () => {
    const flags = new FeatureFlags();
    flags.set('auth-enforcement', true);
    expect(flags.isEnabled('auth-enforcement')).toBe(true);
    // No crash, just works in-memory
  });
});
