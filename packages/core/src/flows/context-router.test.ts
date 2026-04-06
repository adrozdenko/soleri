/**
 * Context router — colocated contract tests.
 *
 * Lighter coverage since __tests__/flows.test.ts covers detectContext and
 * applyContextOverrides thoroughly. Focus: getFlowOverrides and edge cases.
 *
 * Regression tests for YAML-sourced overrides are in the second describe block.
 */

import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { describe, it, expect } from 'vitest';
import { getFlowOverrides, detectContext, applyContextOverrides } from './context-router.js';
import type { PlanStep } from './types.js';

// Resolve the real data/flows directory — works in both dev (src/) and built (dist/) layouts
const HERE = dirname(fileURLToPath(import.meta.url));
const FLOWS_DIR = join(HERE, '..', '..', 'data', 'flows');

describe('getFlowOverrides', () => {
  it('returns overrides for BUILD-flow', () => {
    const overrides = getFlowOverrides('BUILD-flow');
    expect(overrides).toHaveLength(4);
    const contexts = overrides.map((o) => o.context);
    expect(contexts).toContain('small-component');
    expect(contexts).toContain('large-component');
  });

  it('returns overrides for FIX-flow', () => {
    const overrides = getFlowOverrides('FIX-flow');
    expect(overrides).toHaveLength(2);
    const contexts = overrides.map((o) => o.context);
    expect(contexts).toContain('design-fix');
    expect(contexts).toContain('a11y-fix');
  });

  it('returns overrides for REVIEW-flow', () => {
    const overrides = getFlowOverrides('REVIEW-flow');
    expect(overrides).toHaveLength(2);
    const contexts = overrides.map((o) => o.context);
    expect(contexts).toContain('pr-review');
    expect(contexts).toContain('architecture-review');
  });

  it('returns empty array for unknown flow', () => {
    expect(getFlowOverrides('NONEXISTENT-flow')).toEqual([]);
  });
});

describe('detectContext (edge cases)', () => {
  it('matches case-insensitively', () => {
    const contexts = detectContext('Build a BUTTON component', { components: [], actions: [] });
    expect(contexts).toContain('small-component');
  });

  it('does not duplicate contexts', () => {
    const contexts = detectContext('button and icon and badge', { components: [], actions: [] });
    const smallCount = contexts.filter((c) => c === 'small-component').length;
    expect(smallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Regression tests — YAML-sourced overrides via explicit flowsDir
// ---------------------------------------------------------------------------

describe('detectContext — YAML-sourced overrides (regression)', () => {
  it('returns small-component for a prompt matching the button override in build.flow.yaml', () => {
    const contexts = detectContext(
      'build a button component',
      { components: [], actions: [] },
      FLOWS_DIR,
    );
    expect(contexts).toContain('small-component');
  });

  it('returns large-component for a prompt matching the page override', () => {
    const contexts = detectContext(
      'design a dashboard layout',
      { components: [], actions: [] },
      FLOWS_DIR,
    );
    expect(contexts).toContain('large-component');
  });

  it('returns empty array when no overrides match', () => {
    const contexts = detectContext(
      'refactor internal helper utility',
      { components: [], actions: [] },
      FLOWS_DIR,
    );
    // No YAML override should fire on this generic prompt
    expect(contexts).toEqual([]);
  });
});

describe('applyContextOverrides — skipSteps from YAML (regression)', () => {
  it('skips get-architecture step for small-component context (as declared in build.flow.yaml)', () => {
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

    const ids = result.map((s) => s.id);
    expect(ids).not.toContain('get-architecture');
    expect(ids).toContain('search-vault');
  });

  it('leaves steps unchanged when context has no skipSteps', () => {
    const steps: PlanStep[] = [
      {
        id: 'search-vault',
        name: 'Search Vault Patterns',
        tools: ['myagent_vault_search_intelligent'],
        parallel: false,
        requires: [],
        status: 'pending',
      },
    ];

    // large-component override has no skipSteps
    const result = applyContextOverrides(
      steps,
      ['large-component'],
      'BUILD-flow',
      'myagent',
      FLOWS_DIR,
    );

    expect(result.map((s) => s.id)).toContain('search-vault');
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

describe('getFlowOverrides — YAML-sourced (regression)', () => {
  it('returns a non-empty array for BUILD-flow when loaded from real data/flows', () => {
    const overrides = getFlowOverrides('BUILD-flow', FLOWS_DIR);
    expect(overrides.length).toBeGreaterThan(0);
  });

  it('includes the small-component override with skipSteps', () => {
    const overrides = getFlowOverrides('BUILD-flow', FLOWS_DIR);
    const smallComponent = overrides.find((o) => o.context === 'small-component');
    expect(smallComponent).toBeDefined();
    expect(smallComponent?.skipSteps).toContain('get-architecture');
  });

  it('includes the large-component override', () => {
    const overrides = getFlowOverrides('BUILD-flow', FLOWS_DIR);
    const largeComponent = overrides.find((o) => o.context === 'large-component');
    expect(largeComponent).toBeDefined();
  });

  it('compiles match string to a RegExp', () => {
    const overrides = getFlowOverrides('BUILD-flow', FLOWS_DIR);
    for (const override of overrides) {
      expect(override.match).toBeInstanceOf(RegExp);
    }
  });
});
