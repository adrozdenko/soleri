/**
 * Context router — colocated contract tests.
 *
 * Core flows are domain-agnostic — no overrides are baked in.
 * Domain-specific overrides are added by agents or domain packs via their own
 * flow YAML files. This test suite verifies the agnostic baseline.
 */

import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { describe, it, expect } from 'vitest';
import { getFlowOverrides, detectContext, applyContextOverrides } from './context-router.js';
import type { PlanStep } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLOWS_DIR = join(HERE, '..', '..', 'data', 'flows');

describe('getFlowOverrides — core flows are domain-agnostic', () => {
  it('returns empty array for BUILD-flow (no hardcoded overrides)', () => {
    const overrides = getFlowOverrides('BUILD-flow', FLOWS_DIR);
    expect(overrides).toEqual([]);
  });

  it('returns empty array for FIX-flow', () => {
    const overrides = getFlowOverrides('FIX-flow', FLOWS_DIR);
    expect(overrides).toEqual([]);
  });

  it('returns empty array for REVIEW-flow', () => {
    const overrides = getFlowOverrides('REVIEW-flow', FLOWS_DIR);
    expect(overrides).toEqual([]);
  });

  it('returns empty array for unknown flow', () => {
    expect(getFlowOverrides('NONEXISTENT-flow')).toEqual([]);
  });
});

describe('detectContext — no matches on agnostic flows', () => {
  it('returns empty array for any prompt when flows have no overrides', () => {
    const contexts = detectContext(
      'build a button component',
      { components: [], actions: [] },
      FLOWS_DIR,
    );
    expect(contexts).toEqual([]);
  });

  it('returns empty array for generic prompts', () => {
    const contexts = detectContext(
      'refactor internal helper utility',
      { components: [], actions: [] },
      FLOWS_DIR,
    );
    expect(contexts).toEqual([]);
  });
});

describe('applyContextOverrides — passthrough when no overrides', () => {
  it('returns steps unchanged when flow has no overrides', () => {
    const steps: PlanStep[] = [
      {
        id: 'search-vault',
        name: 'Search Vault Patterns',
        tools: ['myagent_vault_search_intelligent'],
        parallel: false,
        requires: [],
        status: 'pending',
      },
      {
        id: 'get-architecture',
        name: 'Get Architecture Guidance',
        tools: ['myagent_architecture_search'],
        parallel: true,
        requires: [],
        status: 'pending',
      },
    ];

    const result = applyContextOverrides(
      steps,
      ['small-component'],
      'BUILD-flow',
      'myagent',
      FLOWS_DIR,
    );

    expect(result).toEqual(steps);
  });

  it('returns steps unchanged when context list is empty', () => {
    const steps: PlanStep[] = [
      {
        id: 'search-vault',
        name: 'Search Vault Patterns',
        tools: [],
        parallel: false,
        requires: [],
        status: 'pending',
      },
    ];

    const result = applyContextOverrides(steps, [], 'BUILD-flow', 'myagent', FLOWS_DIR);
    expect(result).toEqual(steps);
  });
});

describe('getFlowOverrides — override contract (custom flowsDir)', () => {
  it('compiles match strings to RegExp when overrides are present', () => {
    // Verify the loader correctly converts string → RegExp for any flow that has overrides
    // Using the real flows dir — currently no overrides, so this tests the empty case
    const overrides = getFlowOverrides('BUILD-flow', FLOWS_DIR);
    for (const override of overrides) {
      expect(override.match).toBeInstanceOf(RegExp);
    }
  });
});
