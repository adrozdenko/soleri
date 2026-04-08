/**
 * Tests for engine module registry — profile resolution, containment,
 * explicit overrides, and drift detection against ENGINE_MODULES.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ENGINE_PROFILES,
  PROFILE_MODULES,
  ALL_MODULE_SUFFIXES,
  resolveModules,
  type EngineProfile,
} from '../module-registry.js';
import { ENGINE_MODULES } from '../register-engine.js';

// ─── Profile Resolution ──────────────────────────────────────────────

describe('resolveModules — profile resolution', () => {
  it('defaults to full profile when called with no args', () => {
    const result = resolveModules();
    expect(result.size).toBe(22);
    expect(result).toEqual(new Set(PROFILE_MODULES.full));
  });

  it('resolves minimal profile to exactly 4 modules', () => {
    const result = resolveModules('minimal');
    expect(result).toEqual(new Set(['vault', 'admin', 'control', 'orchestrate']));
    expect(result.size).toBe(4);
  });

  it('resolves standard profile to 11 modules including brain/plan/memory/curator', () => {
    const result = resolveModules('standard');
    expect(result.size).toBe(11);
    expect(result.has('brain')).toBe(true);
    expect(result.has('plan')).toBe(true);
    expect(result.has('memory')).toBe(true);
    expect(result.has('curator')).toBe(true);
  });

  it('resolves full profile to all 22 modules', () => {
    const result = resolveModules('full');
    expect(result.size).toBe(22);
    expect(result).toEqual(new Set(PROFILE_MODULES.full));
  });
});

// ─── Profile Containment ─────────────────────────────────────────────

describe('profile containment invariant', () => {
  it('minimal is a subset of standard', () => {
    const minimal = new Set(PROFILE_MODULES.minimal);
    const standard = new Set(PROFILE_MODULES.standard);
    for (const mod of minimal) {
      expect(standard.has(mod)).toBe(true);
    }
  });

  it('standard is a subset of full', () => {
    const standard = new Set(PROFILE_MODULES.standard);
    const full = new Set(PROFILE_MODULES.full);
    for (const mod of standard) {
      expect(full.has(mod)).toBe(true);
    }
  });
});

// ─── Explicit Module Override ────────────────────────────────────────

describe('resolveModules — explicit module override', () => {
  it('uses explicit modules when provided', () => {
    const result = resolveModules(undefined, ['vault', 'brain']);
    expect(result).toEqual(new Set(['vault', 'brain']));
  });

  it('explicit modules override profile when both are provided', () => {
    const result = resolveModules('minimal', ['vault', 'brain', 'plan']);
    expect(result).toEqual(new Set(['vault', 'brain', 'plan']));
  });
});

// ─── Unknown Module Handling ─────────────────────────────────────────

describe('resolveModules — unknown module handling', () => {
  it('filters out unknown modules and warns via console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = resolveModules(undefined, ['vault', 'nonexistent']);
    expect(result).toEqual(new Set(['vault']));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknown module "nonexistent"'));
    spy.mockRestore();
  });
});

// ─── Unknown Profile Handling ────────────────────────────────────────

describe('resolveModules — unknown profile handling', () => {
  it('falls back to full profile and warns for unknown profile', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = resolveModules('nonexistent' as EngineProfile);
    expect(result).toEqual(new Set(PROFILE_MODULES.full));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknown profile "nonexistent"'));
    spy.mockRestore();
  });
});

// ─── Empty Modules Array ─────────────────────────────────────────────

describe('resolveModules — empty modules array', () => {
  it('treats empty array as no override, returns full profile', () => {
    const result = resolveModules(undefined, []);
    expect(result).toEqual(new Set(PROFILE_MODULES.full));
  });
});

// ─── Drift Detection ────────────────────────────────────────────────

describe('drift detection — PROFILE_MODULES.full vs ENGINE_MODULES', () => {
  it('PROFILE_MODULES.full contains exactly the same suffixes as ENGINE_MODULES', () => {
    const engineSuffixes = new Set(ENGINE_MODULES.map((m) => m.suffix));
    const profileFull = new Set(PROFILE_MODULES.full);
    expect(profileFull).toEqual(engineSuffixes);
  });
});

// ─── Static Exports ──────────────────────────────────────────────────

describe('static exports', () => {
  it('ENGINE_PROFILES contains the three valid profile names', () => {
    expect(ENGINE_PROFILES).toEqual(['minimal', 'standard', 'full']);
  });

  it('ALL_MODULE_SUFFIXES matches PROFILE_MODULES.full', () => {
    expect(ALL_MODULE_SUFFIXES).toEqual(new Set(PROFILE_MODULES.full));
  });
});
