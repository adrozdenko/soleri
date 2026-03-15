/**
 * Domain Packs — failing tests for the DomainPack primitive.
 *
 * These tests define the contract for domain packs:
 * - DomainPack types and validation
 * - Pack loading and dependency resolution
 * - Extended createDomainFacades() with pack support
 * - OCP: standard domains unchanged when packs are absent
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createDomainFacade, createDomainFacades } from '../runtime/domain-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import { z } from 'zod';

import type { DomainPack } from '../domain-packs/types.js';
import { validateDomainPack, SEMANTIC_FACADE_NAMES } from '../domain-packs/types.js';
import { resolveDependencies } from '../domain-packs/loader.js';

// ---------------------------------------------------------------------------
// Helpers: mock domain packs for testing
// ---------------------------------------------------------------------------

function createMockPack(overrides: Partial<DomainPack> = {}): DomainPack {
  return {
    name: 'test-design',
    version: '1.0.0',
    domains: ['design'],
    ops: [
      {
        name: 'check_contrast',
        description: 'Check WCAG contrast ratio between two colors.',
        auth: 'read' as const,
        schema: z.object({
          foreground: z.string(),
          background: z.string(),
        }),
        handler: async (_params) => {
          return { ratio: 4.5, passes: true, level: 'AA' };
        },
      },
      {
        name: 'validate_token',
        description: 'Validate a design token name against the token schema.',
        auth: 'read' as const,
        schema: z.object({ token: z.string() }),
        handler: async (params) => {
          return { valid: true, token: params.token };
        },
      },
      {
        name: 'get_color_pairs',
        description: 'Get accessible color pair suggestions.',
        auth: 'read' as const,
        schema: z.object({ background: z.string() }),
        handler: async (params) => {
          return { pairs: [{ fg: '#000', bg: params.background, ratio: 21 }] };
        },
      },
    ],
    ...overrides,
  };
}

function createMockPackWithFacades(): DomainPack {
  return {
    name: 'test-design-full',
    version: '1.0.0',
    domains: ['design'],
    ops: [
      {
        name: 'check_contrast',
        description: 'Check contrast.',
        auth: 'read' as const,
        handler: async () => ({ ratio: 4.5 }),
      },
    ],
    facades: [
      {
        name: 'design_rules',
        description: 'Design rules and guidelines.',
        ops: [
          {
            name: 'get_clean_code_rules',
            description: 'Get clean code rules for design.',
            auth: 'read' as const,
            handler: async () => ({ rules: ['no-hex-colors', 'semantic-tokens-only'] }),
          },
          {
            name: 'get_architecture_patterns',
            description: 'Get architecture patterns.',
            auth: 'read' as const,
            handler: async () => ({ patterns: ['component-composition'] }),
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. DomainPack Types & Validation
// ---------------------------------------------------------------------------

describe('DomainPack types and validation', () => {
  it('should validate a well-formed domain pack', () => {
    const pack = createMockPack();
    const result = validateDomainPack(pack);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('test-design');
      expect(result.data.ops.length).toBe(3);
    }
  });

  it('should reject pack with missing required fields', () => {
    const result = validateDomainPack({ name: 'incomplete' });
    expect(result.success).toBe(false);
  });

  it('should reject pack with duplicate op names', () => {
    const pack = createMockPack({
      ops: [
        {
          name: 'duplicate_op',
          description: 'First.',
          auth: 'read',
          handler: async () => ({}),
        },
        {
          name: 'duplicate_op',
          description: 'Second.',
          auth: 'read',
          handler: async () => ({}),
        },
      ],
    });
    const result = validateDomainPack(pack);
    expect(result.success).toBe(false);
  });

  it('should reject pack with facade name colliding with semantic facades', () => {
    const pack = createMockPack({
      facades: [
        {
          name: 'vault', // collides with semantic facade
          description: 'Bad facade.',
          ops: [],
        },
      ],
    });
    const result = validateDomainPack(pack);
    expect(result.success).toBe(false);
  });

  it('should export SEMANTIC_FACADE_NAMES containing core facade names', () => {
    expect(SEMANTIC_FACADE_NAMES).toContain('vault');
    expect(SEMANTIC_FACADE_NAMES).toContain('plan');
    expect(SEMANTIC_FACADE_NAMES).toContain('brain');
    expect(SEMANTIC_FACADE_NAMES).toContain('memory');
    expect(SEMANTIC_FACADE_NAMES).toContain('admin');
    expect(SEMANTIC_FACADE_NAMES).toContain('curator');
  });

  it('should accept pack with valid KnowledgeManifest tiers', () => {
    const pack = createMockPack({
      knowledge: {
        canonical: './knowledge/canonical',
        curated: './knowledge/curated',
      },
    });
    const result = validateDomainPack(pack);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Pack Dependency Resolution
// ---------------------------------------------------------------------------

describe('Pack dependency resolution', () => {
  it('should resolve packs with no dependencies', () => {
    const packA = createMockPack({ name: 'pack-a' });
    const packB = createMockPack({ name: 'pack-b', domains: ['testing'] });
    const sorted = resolveDependencies([packA, packB]);
    expect(sorted.length).toBe(2);
  });

  it('should sort packs by dependency order', () => {
    const packA = createMockPack({ name: 'pack-a', requires: ['pack-b'] });
    const packB = createMockPack({ name: 'pack-b', domains: ['testing'] });
    const sorted = resolveDependencies([packA, packB]);
    const names = sorted.map((p) => p.name);
    expect(names.indexOf('pack-b')).toBeLessThan(names.indexOf('pack-a'));
  });

  it('should detect circular dependencies', () => {
    const packA = createMockPack({ name: 'pack-a', requires: ['pack-b'] });
    const packB = createMockPack({ name: 'pack-b', domains: ['testing'], requires: ['pack-a'] });
    expect(() => resolveDependencies([packA, packB])).toThrow(/circular/i);
  });

  it('should throw on missing dependency', () => {
    const packA = createMockPack({ name: 'pack-a', requires: ['pack-nonexistent'] });
    expect(() => resolveDependencies([packA])).toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Extended createDomainFacades() with pack support
// ---------------------------------------------------------------------------

describe('createDomainFacades with packs', () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = createAgentRuntime({
      agentId: 'test-packs',
      vaultPath: ':memory:',
    });
  });

  afterEach(() => {
    runtime.close();
  });

  // --- OCP: no packs = identical behavior ---

  it('should work identically without packs parameter', () => {
    const withoutPacks = createDomainFacades(runtime, 'test-packs', ['security']);
    expect(withoutPacks.length).toBe(1);
    expect(withoutPacks[0].ops.length).toBe(5);
    expect(withoutPacks[0].name).toBe('test-packs_security');
  });

  it('should work identically with empty packs array', () => {
    const withEmpty = createDomainFacades(runtime, 'test-packs', ['security'], []);
    expect(withEmpty.length).toBe(1);
    expect(withEmpty[0].ops.length).toBe(5);
  });

  // --- Pack ops override standard ops ---

  it('should use pack ops for claimed domain', () => {
    const pack = createMockPack(); // claims 'design'
    const facades = createDomainFacades(runtime, 'test-packs', ['design'], [pack]);
    const designFacade = facades.find((f) => f.name.includes('design'));
    expect(designFacade).toBeDefined();

    // Should have pack's 3 custom ops + standard fallbacks for unclaimed names
    const opNames = designFacade!.ops.map((o) => o.name);
    expect(opNames).toContain('check_contrast');
    expect(opNames).toContain('validate_token');
    expect(opNames).toContain('get_color_pairs');
  });

  it('should keep standard ops as fallbacks for names not in pack', () => {
    const pack = createMockPack(); // has check_contrast, validate_token, get_color_pairs
    const facades = createDomainFacades(runtime, 'test-packs', ['design'], [pack]);
    const designFacade = facades.find((f) => f.name.includes('design'));
    const opNames = designFacade!.ops.map((o) => o.name);

    // Standard ops not overridden by pack should still exist as fallbacks
    expect(opNames).toContain('get_patterns');
    expect(opNames).toContain('search');
    expect(opNames).toContain('get_entry');
    expect(opNames).toContain('capture');
    expect(opNames).toContain('remove');
  });

  it('should use pack handler when pack overrides a standard op name', () => {
    const customSearchHandler = async () => ({ custom: true, source: 'pack' });
    const pack = createMockPack({
      ops: [
        {
          name: 'search', // overrides standard search
          description: 'Custom domain search with specialized ranking.',
          auth: 'read' as const,
          handler: customSearchHandler,
        },
      ],
    });
    const facades = createDomainFacades(runtime, 'test-packs', ['design'], [pack]);
    const designFacade = facades.find((f) => f.name.includes('design'));
    const searchOp = designFacade!.ops.find((o) => o.name === 'search');
    expect(searchOp!.handler).toBe(customSearchHandler);
  });

  // --- Unclaimed domains get standard 5 ops ---

  it('should give unclaimed domains standard 5 ops', () => {
    const pack = createMockPack(); // claims 'design' only
    const facades = createDomainFacades(runtime, 'test-packs', ['design', 'security'], [pack]);
    const securityFacade = facades.find((f) => f.name.includes('security'));
    expect(securityFacade).toBeDefined();
    expect(securityFacade!.ops.length).toBe(5);
    expect(securityFacade!.ops.map((o) => o.name)).not.toContain('check_contrast');
  });

  // --- Pack standalone facades ---

  it('should register pack standalone facades as additional facades', () => {
    const pack = createMockPackWithFacades();
    const facades = createDomainFacades(runtime, 'test-packs', ['design'], [pack]);

    // Should have domain facade + standalone design_rules facade
    const facadeNames = facades.map((f) => f.name);
    expect(facadeNames.some((n) => n.includes('design_rules'))).toBe(true);
  });

  it('should prefix standalone facade names with agentId', () => {
    const pack = createMockPackWithFacades();
    const facades = createDomainFacades(runtime, 'test-packs', ['design'], [pack]);
    const rulesFacade = facades.find((f) => f.name.includes('design_rules'));
    expect(rulesFacade!.name).toBe('test-packs_design_rules');
  });

  it('standalone facade ops should be callable', async () => {
    const pack = createMockPackWithFacades();
    const facades = createDomainFacades(runtime, 'test-packs', ['design'], [pack]);
    const rulesFacade = facades.find((f) => f.name.includes('design_rules'));
    const cleanCodeOp = rulesFacade!.ops.find((o) => o.name === 'get_clean_code_rules');
    const result = (await cleanCodeOp!.handler({})) as { rules: string[] };
    expect(result.rules).toContain('no-hex-colors');
  });

  // --- Custom ops are callable ---

  it('custom pack ops should execute and return results', async () => {
    const pack = createMockPack();
    const facades = createDomainFacades(runtime, 'test-packs', ['design'], [pack]);
    const designFacade = facades.find((f) => f.name.includes('design'));
    const contrastOp = designFacade!.ops.find((o) => o.name === 'check_contrast');
    const result = (await contrastOp!.handler({
      foreground: '#000000',
      background: '#ffffff',
    })) as { ratio: number; passes: boolean };
    expect(result.ratio).toBe(4.5);
    expect(result.passes).toBe(true);
  });

  // --- Multiple packs ---

  it('should support multiple packs claiming different domains', () => {
    const designPack = createMockPack({ name: 'design-pack', domains: ['design'] });
    const securityPack = createMockPack({
      name: 'security-pack',
      domains: ['security'],
      ops: [
        {
          name: 'scan_vulnerabilities',
          description: 'Scan for security vulnerabilities.',
          auth: 'read' as const,
          handler: async () => ({ vulnerabilities: [] }),
        },
      ],
    });
    const facades = createDomainFacades(
      runtime,
      'test-packs',
      ['design', 'security'],
      [designPack, securityPack],
    );
    expect(facades.length).toBeGreaterThanOrEqual(2);

    const designOps = facades.find((f) => f.name.includes('design'))!.ops.map((o) => o.name);
    const securityOps = facades.find((f) => f.name.includes('security'))!.ops.map((o) => o.name);

    expect(designOps).toContain('check_contrast');
    expect(securityOps).toContain('scan_vulnerabilities');
  });
});

// ---------------------------------------------------------------------------
// 4. OCP Regression — existing behavior preserved
// ---------------------------------------------------------------------------

describe('OCP regression: existing domain-ops behavior', () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = createAgentRuntime({
      agentId: 'test-ocp',
      vaultPath: ':memory:',
    });
  });

  afterEach(() => {
    runtime.close();
  });

  it('createDomainFacade (singular) still works unchanged', () => {
    const facade = createDomainFacade(runtime, 'test-ocp', 'security');
    expect(facade.ops.length).toBe(5);
    expect(facade.name).toBe('test-ocp_security');
  });

  it('createDomainFacades without 4th arg still returns standard facades', () => {
    const facades = createDomainFacades(runtime, 'test-ocp', ['security', 'api-design']);
    expect(facades.length).toBe(2);
    facades.forEach((f) => {
      expect(f.ops.length).toBe(5);
    });
  });

  it('standard domain capture still integrates with governance', async () => {
    const facade = createDomainFacade(runtime, 'test-ocp', 'security');
    const captureOp = facade.ops.find((o) => o.name === 'capture')!;
    const result = (await captureOp.handler({
      id: 'ocp-test-1',
      type: 'pattern',
      title: 'OCP Test',
      severity: 'warning',
      description: 'Should still work.',
      tags: ['ocp'],
    })) as { captured: boolean; governance: { action: string } };
    expect(result.captured).toBe(true);
    expect(result.governance.action).toBe('capture');
  });
});
