import { describe, it, expect } from 'vitest';
import { buildPreflightManifest, type PreflightInput } from '../runtime/preflight.js';
import { ENGINE_MODULE_MANIFEST } from '../engine/module-manifest.js';

function makeInput(overrides: Partial<PreflightInput> = {}): PreflightInput {
  return {
    modules: [
      {
        suffix: 'vault',
        description: 'Knowledge management — search, CRUD, capture.',
        keyOps: ['search_intelligent', 'capture_knowledge'],
        intentSignals: {
          'search knowledge': 'search_intelligent',
          'find pattern': 'search_intelligent',
          'save this': 'capture_knowledge',
          'remember this': 'capture_knowledge',
        },
      },
      {
        suffix: 'plan',
        description: 'Plan lifecycle — create, approve, execute.',
        keyOps: ['create_plan'],
        intentSignals: { 'plan this': 'create_plan' },
      },
    ],
    agentId: 'agent',
    skillCount: 2,
    executingPlans: [{ id: 'plan-1', objective: 'Add preflight manifest', status: 'executing' }],
    vaultStats: {
      totalEntries: 42,
      byDomain: { architecture: 10, testing: 15, patterns: 17 },
    },
    ...overrides,
  };
}

describe('buildPreflightManifest', () => {
  it('builds a routing index — one row per module, up to 3 intent signals each', () => {
    const manifest = buildPreflightManifest(makeInput());
    expect(manifest.routingIndex).toHaveLength(2);
    expect(manifest.routingIndex[0]).toEqual({
      suffix: 'vault',
      description: 'Knowledge management — search, CRUD, capture.',
      // 4 intent signals defined, capped to 3
      signals: ['search knowledge', 'find pattern', 'save this'],
    });
    expect(manifest.routingIndex[1]).toEqual({
      suffix: 'plan',
      description: 'Plan lifecycle — create, approve, execute.',
      signals: ['plan this'],
    });
  });

  it('handles modules with no intent signals', () => {
    const manifest = buildPreflightManifest(
      makeInput({
        modules: [{ suffix: 'x', description: 'X module.', keyOps: ['op_x'] }],
      }),
    );
    expect(manifest.routingIndex[0].signals).toEqual([]);
  });

  it('omits the full facade×op catalog by default (Layer 0/1 diet)', () => {
    const manifest = buildPreflightManifest(makeInput());
    expect(manifest.tools).toBeUndefined();
  });

  it('populates the full facade×op catalog only when verbose:true', () => {
    const manifest = buildPreflightManifest(makeInput({ verbose: true }));
    expect(manifest.tools).toEqual([
      {
        facade: 'agent_vault',
        op: 'search_intelligent',
        description: 'Knowledge management — search, CRUD, capture.',
      },
      {
        facade: 'agent_vault',
        op: 'capture_knowledge',
        description: 'Knowledge management — search, CRUD, capture.',
      },
      {
        facade: 'agent_plan',
        op: 'create_plan',
        description: 'Plan lifecycle — create, approve, execute.',
      },
    ]);
  });

  it('reports skill count, not the full skill list', () => {
    const manifest = buildPreflightManifest(makeInput({ skillCount: 51 }));
    expect(manifest.skillCount).toBe(51);
  });

  it('maps executing plans to activePlans', () => {
    const manifest = buildPreflightManifest(makeInput());
    expect(manifest.activePlans).toEqual([
      { planId: 'plan-1', title: 'Add preflight manifest', status: 'executing' },
    ]);
  });

  it('caps activePlans at 3', () => {
    const manifest = buildPreflightManifest(
      makeInput({
        executingPlans: Array.from({ length: 6 }, (_, i) => ({
          id: `plan-${i}`,
          objective: `Plan ${i}`,
          status: 'executing',
        })),
      }),
    );
    expect(manifest.activePlans).toHaveLength(3);
    expect(manifest.activePlans[0].planId).toBe('plan-0');
    expect(manifest.activePlans[2].planId).toBe('plan-2');
  });

  it('truncates over-long plan objectives to 40 chars + ellipsis', () => {
    const longObjective = 'X'.repeat(120);
    const manifest = buildPreflightManifest(
      makeInput({
        executingPlans: [{ id: 'plan-long', objective: longObjective, status: 'executing' }],
      }),
    );
    expect(manifest.activePlans[0].title).toBe('X'.repeat(40) + '…');
    expect(manifest.activePlans[0].title.length).toBe(41);
  });

  it('leaves short plan objectives untruncated (no ellipsis)', () => {
    const manifest = buildPreflightManifest(
      makeInput({
        executingPlans: [{ id: 'plan-short', objective: 'Short objective', status: 'executing' }],
      }),
    );
    expect(manifest.activePlans[0].title).toBe('Short objective');
  });

  it('builds vault summary with domain total + top domains by entry volume', () => {
    const manifest = buildPreflightManifest(makeInput());
    expect(manifest.vaultSummary).toEqual({
      entryCount: 42,
      connected: true,
      // top by volume: patterns(17) > testing(15) > architecture(10)
      domains: { total: 3, top: ['patterns', 'testing', 'architecture'] },
    });
  });

  it('caps top domains at 4', () => {
    const byDomain: Record<string, number> = {};
    for (let i = 0; i < 80; i++) byDomain[`domain-${i}`] = 80 - i;
    const manifest = buildPreflightManifest(
      makeInput({ vaultStats: { totalEntries: 999, byDomain } }),
    );
    expect(manifest.vaultSummary.domains.total).toBe(80);
    expect(manifest.vaultSummary.domains.top).toHaveLength(4);
    expect(manifest.vaultSummary.domains.top).toEqual([
      'domain-0',
      'domain-1',
      'domain-2',
      'domain-3',
    ]);
  });

  it('handles empty inputs gracefully', () => {
    const manifest = buildPreflightManifest(
      makeInput({
        modules: [],
        skillCount: 0,
        executingPlans: [],
        vaultStats: { totalEntries: 0, byDomain: {} },
      }),
    );
    expect(manifest.routingIndex).toEqual([]);
    expect(manifest.tools).toBeUndefined();
    expect(manifest.skillCount).toBe(0);
    expect(manifest.activePlans).toEqual([]);
    expect(manifest.vaultSummary).toEqual({
      entryCount: 0,
      connected: true,
      domains: { total: 0, top: [] },
    });
  });

  // ─── WS1 guardrail: 1,500-token session_start payload ceiling ──────────────
  // The briefing must stay within the Layer 0 + Layer 1 band (Fig 1: ~800 + ~300;
  // §3.2: Layers 0–2 combined ~1,300–1,600). We enforce a hard 1,500-token ceiling
  // on the ENTIRE session_start payload using the repo's chars/4 heuristic
  // (packages/core/src/transcript/jsonl-parser.ts), measured on the COMPACT wire
  // form we actually ship (facade responses are no longer pretty-printed).
  it('keeps the full session_start payload under the 1,500-token ceiling at a worst-case operating point', () => {
    // Worst case: full engine manifest (22 modules), 80 domains, max active plans
    // with over-long objectives (exercise truncation), large skill count. Mirrors
    // the WS0 operating point.
    const byDomain: Record<string, number> = {};
    for (let i = 0; i < 80; i++) byDomain[`domain-name-number-${i}`] = 80 - i;

    const manifest = buildPreflightManifest({
      modules: ENGINE_MODULE_MANIFEST,
      agentId: 'my-agent',
      skillCount: 51,
      executingPlans: [
        { id: 'plan-1775741365371-wmc9u3', objective: 'A'.repeat(120), status: 'executing' },
        { id: 'plan-1775741365372-abcd12', objective: 'B'.repeat(120), status: 'executing' },
        { id: 'plan-1775741365373-efgh34', objective: 'C'.repeat(120), status: 'executing' },
      ],
      vaultStats: { totalEntries: 1142, byDomain },
    });

    // Over-long objectives must be truncated so the diet stays bounded.
    for (const p of manifest.activePlans) {
      expect(p.title.length).toBeLessThanOrEqual(41); // 40 chars + ellipsis
    }
    // The full facade×op catalog must NOT be riding along by default.
    expect(manifest.tools).toBeUndefined();

    // Reconstruct the ENTIRE session_start return object (see orchestrate-facade.ts)
    // with populated, bounded wrapper fields — this is what actually goes on the wire.
    const payload = {
      project: {
        id: 'proj-1775741365371-xyz789',
        name: 'my-agent',
        path: '/Users/someone/projects/some-realistic-monorepo-path/soleri',
        sessionCount: 137,
        firstSeenAt: 1775741365371,
        lastSeenAt: 1775741400000,
      },
      is_new: false,
      message: 'Welcome back! Session #137 for my-agent.',
      vault: { entries: 1142, domains: manifest.vaultSummary.domains },
      governance: {
        pendingProposals: 12,
        quotaPercent: 87,
        isQuotaWarning: true,
        expiredThisSession: 4,
      },
      preflight: manifest,
      topStrengths: Array.from({ length: 5 }, (_, i) => ({
        pattern: `descriptive-pattern-name-example-number-${i}`,
        strength: 95 - i * 4,
        domain: `domain-name-number-${i}`,
      })),
      orphansClosed: 3,
      autoReconciledCount: 2,
      stalePlansClosed: 5,
      stalePlans: {
        count: 47,
        ids: [
          'plan-1775741300001-aaa111',
          'plan-1775741300002-bbb222',
          'plan-1775741300003-ccc333',
        ],
      },
    };

    // Compact form is the real wire form since facade responses dropped pretty-print.
    const compactTokens = Math.ceil(JSON.stringify(payload).length / 4);
    expect(compactTokens).toBeLessThanOrEqual(1500);
  });
});
