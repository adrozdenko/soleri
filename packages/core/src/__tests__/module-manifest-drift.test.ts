/**
 * Contract Drift Detection — Issue #227
 *
 * Ensures ENGINE_MODULE_MANIFEST (used by forge for template generation)
 * stays in sync with ENGINE_MODULES (used by register-engine at runtime).
 *
 * If this test fails, someone added/removed/renamed a module in one place
 * but not the other. Fix by updating both files to match.
 */

import { describe, it, expect } from 'vitest';
import { ENGINE_MODULE_MANIFEST } from '../engine/module-manifest.js';
import { ENGINE_MODULES } from '../engine/register-engine.js';

describe('Module manifest drift detection', () => {
  const manifestSuffixes = ENGINE_MODULE_MANIFEST.map((m) => m.suffix);
  const runtimeSuffixes = ENGINE_MODULES.map((m) => m.suffix);

  it('manifest and runtime have the same number of modules', () => {
    expect(manifestSuffixes).toHaveLength(runtimeSuffixes.length);
  });

  it('manifest and runtime have identical suffixes in the same order', () => {
    expect(manifestSuffixes).toEqual(runtimeSuffixes);
  });

  it('conditional flags match between manifest and runtime', () => {
    for (const manifest of ENGINE_MODULE_MANIFEST) {
      const runtime = ENGINE_MODULES.find((m) => m.suffix === manifest.suffix);
      expect(runtime, `module "${manifest.suffix}" missing from ENGINE_MODULES`).toBeDefined();

      const runtimeConditional = runtime!.condition !== undefined;
      const manifestConditional = manifest.conditional === true;

      expect(runtimeConditional, `conditional flag mismatch for "${manifest.suffix}"`).toBe(
        manifestConditional,
      );
    }
  });

  it('no runtime module is missing from manifest', () => {
    for (const runtime of ENGINE_MODULES) {
      const manifest = ENGINE_MODULE_MANIFEST.find((m) => m.suffix === runtime.suffix);
      expect(
        manifest,
        `module "${runtime.suffix}" exists in ENGINE_MODULES but missing from ENGINE_MODULE_MANIFEST`,
      ).toBeDefined();
    }
  });

  it('every manifest entry has at least one keyOp', () => {
    for (const entry of ENGINE_MODULE_MANIFEST) {
      expect(
        entry.keyOps.length,
        `module "${entry.suffix}" has empty keyOps — placeholder tables need at least one op`,
      ).toBeGreaterThan(0);
    }
  });
});
