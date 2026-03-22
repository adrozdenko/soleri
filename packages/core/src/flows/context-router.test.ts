/**
 * Context router — colocated contract tests.
 *
 * Lighter coverage since __tests__/flows.test.ts covers detectContext and
 * applyContextOverrides thoroughly. Focus: getFlowOverrides and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { getFlowOverrides, detectContext } from './context-router.js';

describe('getFlowOverrides', () => {
  it('returns overrides for BUILD-flow', () => {
    const overrides = getFlowOverrides('BUILD-flow');
    expect(overrides.length).toBeGreaterThan(0);
    const contexts = overrides.map((o) => o.context);
    expect(contexts).toContain('small-component');
    expect(contexts).toContain('large-component');
  });

  it('returns overrides for FIX-flow', () => {
    const overrides = getFlowOverrides('FIX-flow');
    expect(overrides.length).toBeGreaterThan(0);
    const contexts = overrides.map((o) => o.context);
    expect(contexts).toContain('design-fix');
    expect(contexts).toContain('a11y-fix');
  });

  it('returns overrides for REVIEW-flow', () => {
    const overrides = getFlowOverrides('REVIEW-flow');
    expect(overrides.length).toBeGreaterThan(0);
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
