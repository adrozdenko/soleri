/**
 * Colocated tests for module-manifest.ts
 *
 * Validates the ENGINE_MODULE_MANIFEST structure, CORE_KEY_OPS,
 * ENGINE_MAJOR_VERSION, and ModuleManifestEntry contract.
 */

import { describe, it, expect } from 'vitest';
import {
  ENGINE_MODULE_MANIFEST,
  CORE_KEY_OPS,
  ENGINE_MAJOR_VERSION,
  type ModuleManifestEntry,
} from './module-manifest.js';

describe('ENGINE_MODULE_MANIFEST', () => {
  it('contains all expected engine modules', () => {
    const suffixes = ENGINE_MODULE_MANIFEST.map((m) => m.suffix);
    expect(suffixes).toContain('vault');
    expect(suffixes).toContain('plan');
    expect(suffixes).toContain('brain');
    expect(suffixes).toContain('memory');
    expect(suffixes).toContain('admin');
    expect(suffixes).toContain('curator');
    expect(suffixes).toContain('loop');
    expect(suffixes).toContain('orchestrate');
    expect(suffixes).toContain('control');
    expect(suffixes).toContain('context');
    expect(suffixes).toContain('agency');
    expect(suffixes).toContain('chat');
    expect(suffixes).toContain('operator');
  });

  it('has exactly 13 modules', () => {
    expect(ENGINE_MODULE_MANIFEST).toHaveLength(13);
  });

  it('has no duplicate suffixes', () => {
    const suffixes = ENGINE_MODULE_MANIFEST.map((m) => m.suffix);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });

  it('every entry has required fields with correct types', () => {
    for (const entry of ENGINE_MODULE_MANIFEST) {
      expect(typeof entry.suffix).toBe('string');
      expect(entry.suffix.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.keyOps)).toBe(true);
      expect(entry.keyOps.length).toBeGreaterThan(0);
      expect(entry.keyOps.length).toBeLessThanOrEqual(4);
    }
  });

  it('keyOps are non-empty strings', () => {
    for (const entry of ENGINE_MODULE_MANIFEST) {
      for (const op of entry.keyOps) {
        expect(typeof op).toBe('string');
        expect(op.length).toBeGreaterThan(0);
      }
    }
  });

  it('vault module has expected keyOps', () => {
    const vault = ENGINE_MODULE_MANIFEST.find((m) => m.suffix === 'vault')!;
    expect(vault.keyOps).toEqual(['search_intelligent', 'capture_knowledge', 'capture_quick']);
  });

  it('plan module has expected keyOps', () => {
    const plan = ENGINE_MODULE_MANIFEST.find((m) => m.suffix === 'plan')!;
    expect(plan.keyOps).toEqual(['create_plan', 'approve_plan', 'plan_split', 'plan_reconcile']);
  });

  it('conditional field is optional and boolean when present', () => {
    for (const entry of ENGINE_MODULE_MANIFEST) {
      if (entry.conditional !== undefined) {
        expect(typeof entry.conditional).toBe('boolean');
      }
    }
  });

  it('satisfies ModuleManifestEntry interface shape', () => {
    const testEntry: ModuleManifestEntry = {
      suffix: 'test',
      description: 'Test module',
      keyOps: ['op1'],
    };
    expect(testEntry.suffix).toBe('test');
    expect(testEntry.conditional).toBeUndefined();
  });
});

describe('CORE_KEY_OPS', () => {
  it('contains the 4 core ops', () => {
    expect(CORE_KEY_OPS).toEqual(['health', 'identity', 'session_start', 'activate']);
  });

  it('is a string array', () => {
    for (const op of CORE_KEY_OPS) {
      expect(typeof op).toBe('string');
    }
  });
});

describe('ENGINE_MAJOR_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(ENGINE_MAJOR_VERSION)).toBe(true);
    expect(ENGINE_MAJOR_VERSION).toBeGreaterThan(0);
  });

  it('is currently version 9', () => {
    expect(ENGINE_MAJOR_VERSION).toBe(9);
  });
});

describe('manifest order stability', () => {
  it('vault is the first module (used in tool table generation)', () => {
    expect(ENGINE_MODULE_MANIFEST[0].suffix).toBe('vault');
  });

  it('operator is the last module', () => {
    expect(ENGINE_MODULE_MANIFEST[ENGINE_MODULE_MANIFEST.length - 1].suffix).toBe('operator');
  });
});
