import { describe, it, expect } from 'vitest';
import { buildPreflightManifest, type PreflightInput } from '../runtime/preflight.js';

function makeInput(overrides: Partial<PreflightInput> = {}): PreflightInput {
  return {
    facades: [
      {
        name: 'agent_vault',
        ops: [
          { name: 'search_intelligent', description: 'Search knowledge' },
          { name: 'capture_knowledge', description: 'Capture knowledge' },
        ],
      },
      {
        name: 'agent_plan',
        ops: [{ name: 'create_plan', description: 'Create a plan' }],
      },
    ],
    skills: ['vault-capture', 'debugging'],
    executingPlans: [{ id: 'plan-1', objective: 'Add preflight manifest', status: 'executing' }],
    vaultStats: {
      totalEntries: 42,
      byDomain: { architecture: 10, testing: 15, patterns: 17 },
    },
    ...overrides,
  };
}

describe('buildPreflightManifest', () => {
  it('flattens facade ops into tools array', () => {
    const manifest = buildPreflightManifest(makeInput());
    expect(manifest.tools).toHaveLength(3);
    expect(manifest.tools[0]).toEqual({
      facade: 'agent_vault',
      op: 'search_intelligent',
      description: 'Search knowledge',
    });
    expect(manifest.tools[2]).toEqual({
      facade: 'agent_plan',
      op: 'create_plan',
      description: 'Create a plan',
    });
  });

  it('passes through skills array', () => {
    const manifest = buildPreflightManifest(makeInput());
    expect(manifest.skills).toEqual(['vault-capture', 'debugging']);
  });

  it('maps executing plans to activePlans', () => {
    const manifest = buildPreflightManifest(makeInput());
    expect(manifest.activePlans).toEqual([
      { planId: 'plan-1', title: 'Add preflight manifest', status: 'executing' },
    ]);
  });

  it('builds vault summary from stats', () => {
    const manifest = buildPreflightManifest(makeInput());
    expect(manifest.vaultSummary).toEqual({
      entryCount: 42,
      connected: true,
      domains: ['architecture', 'testing', 'patterns'],
    });
  });

  it('handles empty inputs gracefully', () => {
    const manifest = buildPreflightManifest(
      makeInput({
        facades: [],
        skills: [],
        executingPlans: [],
        vaultStats: { totalEntries: 0, byDomain: {} },
      }),
    );
    expect(manifest.tools).toEqual([]);
    expect(manifest.skills).toEqual([]);
    expect(manifest.activePlans).toEqual([]);
    expect(manifest.vaultSummary).toEqual({
      entryCount: 0,
      connected: true,
      domains: [],
    });
  });

  it('handles multiple executing plans', () => {
    const manifest = buildPreflightManifest(
      makeInput({
        executingPlans: [
          { id: 'plan-1', objective: 'First plan', status: 'executing' },
          { id: 'plan-2', objective: 'Second plan', status: 'executing' },
        ],
      }),
    );
    expect(manifest.activePlans).toHaveLength(2);
    expect(manifest.activePlans[1].planId).toBe('plan-2');
  });
});
