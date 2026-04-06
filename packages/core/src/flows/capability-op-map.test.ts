/**
 * Regression tests for capabilityToToolName — base map resolution and
 * overrides-map precedence.
 */

import { describe, it, expect } from 'vitest';
import { capabilityToToolName, CAPABILITY_OP_MAP } from './capability-op-map.js';

describe('capabilityToToolName', () => {
  it('resolves a known capability from base map', () => {
    expect(capabilityToToolName('vault.search', 'myagent')).toBe(
      'myagent_vault_search_intelligent',
    );
  });

  it('returns undefined for unknown capability with no overrides', () => {
    expect(capabilityToToolName('unknown.cap', 'myagent')).toBeUndefined();
  });

  it('resolves a custom capability from overrides map', () => {
    const overrides = { 'custom.op': { facade: 'myfacade', op: 'myop' } };
    expect(capabilityToToolName('custom.op', 'myagent', overrides)).toBe('myagent_myfacade_myop');
  });

  it('overrides map takes precedence over base CAPABILITY_OP_MAP', () => {
    const overrides = { 'vault.search': { facade: 'custom', op: 'search_v2' } };
    expect(capabilityToToolName('vault.search', 'myagent', overrides)).toBe(
      'myagent_custom_search_v2',
    );
  });

  it('falls back to base map for capabilities not in overrides', () => {
    const overrides = { 'custom.op': { facade: 'myfacade', op: 'myop' } };
    expect(capabilityToToolName('memory.search', 'myagent', overrides)).toBe(
      'myagent_memory_memory_search',
    );
  });

  it('CAPABILITY_OP_MAP contains expected built-in entries', () => {
    expect(CAPABILITY_OP_MAP['vault.search']).toEqual({
      facade: 'vault',
      op: 'search_intelligent',
    });
    expect(CAPABILITY_OP_MAP['memory.search']).toEqual({ facade: 'memory', op: 'memory_search' });
    expect(CAPABILITY_OP_MAP['plan.create']).toEqual({ facade: 'plan', op: 'create_plan' });
  });

  it('returns undefined when overrides is empty and capability is unknown', () => {
    expect(capabilityToToolName('design.token', 'myagent', {})).toBeUndefined();
  });
});
