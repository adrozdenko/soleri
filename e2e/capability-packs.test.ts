/**
 * E2E Test: Capability Packs
 *
 * Validates the full capability packs lifecycle:
 * 1. Registry creation and capability registration
 * 2. Capability resolution (single + multi-provider)
 * 3. Dependency checking
 * 4. Flow validation against installed capabilities
 * 5. Chain-to-capability v1→v2 bridge
 * 6. Plan builder integration with registry
 * 7. Pack manifest v2 schema validation
 * 8. Graceful degradation when capabilities missing
 * 9. Flow YAML migration (needs: alongside chains:)
 *
 * No subprocess, no npm install — tests the capability system directly.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  CapabilityRegistry,
  chainToCapability,
} from '@soleri/core';
import type {
  CapabilityDefinition,
  CapabilityHandler,
  CapabilityResult,
  FlowValidation,
} from '@soleri/core';
import { packManifestSchema } from '@soleri/core';

// ─── Test Helpers ────────────────────────────────────────

function makeHandler(name: string): CapabilityHandler {
  return async () => ({
    success: true,
    data: { handler: name },
    produced: [`${name}-output`],
  });
}

function makeCap(
  id: string,
  opts?: Partial<CapabilityDefinition>,
): CapabilityDefinition {
  return {
    id,
    description: `Test capability: ${id}`,
    provides: [`${id}-output`],
    requires: [],
    ...opts,
  };
}

// ─── Tests ───────────────────────────────────────────────

describe('E2E: Capability Packs', () => {
  // ─── 1. Registry basics ──────────────────────────────

  describe('Registry creation and registration', () => {
    it('should create an empty registry', () => {
      const registry = new CapabilityRegistry();
      expect(registry.size).toBe(0);
      expect(registry.packCount).toBe(0);
    });

    it('should register capabilities from a pack', () => {
      const registry = new CapabilityRegistry();
      const defs = [makeCap('color.validate'), makeCap('color.parse')];
      const handlers = new Map<string, CapabilityHandler>();
      handlers.set('color.validate', makeHandler('color.validate'));
      handlers.set('color.parse', makeHandler('color.parse'));

      registry.registerPack('design-system', defs, handlers);

      expect(registry.size).toBe(2);
      expect(registry.packCount).toBe(1);
      expect(registry.has('color.validate')).toBe(true);
      expect(registry.has('color.parse')).toBe(true);
      expect(registry.has('color.suggest')).toBe(false);
    });

    it('should warn and skip when handler missing for a definition', () => {
      const registry = new CapabilityRegistry();
      const defs = [makeCap('test.a'), makeCap('test.b')];
      const handlers = new Map<string, CapabilityHandler>();
      handlers.set('test.a', makeHandler('test.a'));
      // test.b has no handler

      registry.registerPack('partial', defs, handlers);

      expect(registry.has('test.a')).toBe(true);
      expect(registry.has('test.b')).toBe(false); // skipped
    });
  });

  // ─── 2. Resolution ──────────────────────────────────

  describe('Capability resolution', () => {
    it('should resolve a registered capability', () => {
      const registry = new CapabilityRegistry();
      const defs = [makeCap('vault.search')];
      const handlers = new Map<string, CapabilityHandler>();
      handlers.set('vault.search', makeHandler('vault.search'));
      registry.registerPack('core', defs, handlers);

      const resolved = registry.resolve('vault.search');
      expect(resolved.available).toBe(true);
      expect(resolved.handler).toBeDefined();
      expect(resolved.providers).toContain('core');
    });

    it('should return unavailable for missing capability', () => {
      const registry = new CapabilityRegistry();
      const resolved = registry.resolve('nonexistent.cap');
      expect(resolved.available).toBe(false);
      expect(resolved.handler).toBeUndefined();
    });

    it('should execute a resolved handler', async () => {
      const registry = new CapabilityRegistry();
      const handler: CapabilityHandler = async (params) => ({
        success: true,
        data: { echo: params.input },
        produced: ['echo'],
      });
      const defs = [makeCap('test.echo')];
      const handlers = new Map([['test.echo', handler]]);
      registry.registerPack('echo-pack', defs, handlers);

      const resolved = registry.resolve('test.echo');
      expect(resolved.available).toBe(true);

      const result = await resolved.handler!({ input: 'hello' }, {} as never);
      expect(result.success).toBe(true);
      expect(result.data.echo).toBe('hello');
    });
  });

  // ─── 3. Multi-provider ──────────────────────────────

  describe('Multi-provider support', () => {
    it('should support multiple providers for same capability', () => {
      const registry = new CapabilityRegistry();

      // Pack A provides color.validate at priority 50
      registry.registerPack(
        'design-system',
        [makeCap('color.validate')],
        new Map([['color.validate', makeHandler('design-system')]]),
        50,
      );

      // Pack B also provides color.validate at priority 75
      registry.registerPack(
        'brand-guardian',
        [makeCap('color.validate')],
        new Map([['color.validate', makeHandler('brand-guardian')]]),
        75,
      );

      const resolved = registry.resolve('color.validate');
      expect(resolved.available).toBe(true);
      expect(resolved.providers).toContain('design-system');
      expect(resolved.providers).toContain('brand-guardian');
      // Higher priority provider should be first
      expect(resolved.providers![0]).toBe('brand-guardian');
    });
  });

  // ─── 4. Dependency checking ─────────────────────────

  describe('Dependency resolution', () => {
    it('should resolve when all deps satisfied', () => {
      const registry = new CapabilityRegistry();
      const defs = [
        makeCap('color.parse'),
        makeCap('color.validate', { depends: ['color.parse'] }),
      ];
      const handlers = new Map<string, CapabilityHandler>();
      handlers.set('color.parse', makeHandler('color.parse'));
      handlers.set('color.validate', makeHandler('color.validate'));
      registry.registerPack('design', defs, handlers);

      const resolved = registry.resolve('color.validate');
      expect(resolved.available).toBe(true);
    });

    it('should report missing dependencies', () => {
      const registry = new CapabilityRegistry();
      // Register color.validate with dep on color.parse, but DON'T register color.parse
      const defs = [makeCap('color.validate', { depends: ['color.parse'] })];
      const handlers = new Map([['color.validate', makeHandler('color.validate')]]);
      registry.registerPack('incomplete', defs, handlers);

      const resolved = registry.resolve('color.validate');
      expect(resolved.available).toBe(false);
      expect(resolved.missingDependencies).toContain('color.parse');
    });
  });

  // ─── 5. Flow validation ─────────────────────────────

  describe('Flow validation', () => {
    it('should validate a flow with all capabilities available', () => {
      const registry = new CapabilityRegistry();
      const defs = [makeCap('vault.search'), makeCap('brain.recommend')];
      const handlers = new Map<string, CapabilityHandler>();
      defs.forEach((d) => handlers.set(d.id, makeHandler(d.id)));
      registry.registerPack('core', defs, handlers);

      const validation = registry.validateFlow({
        steps: [{ needs: ['vault.search', 'brain.recommend'] }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.missing).toHaveLength(0);
      expect(validation.available).toContain('vault.search');
      expect(validation.available).toContain('brain.recommend');
    });

    it('should detect missing capabilities in flow', () => {
      const registry = new CapabilityRegistry();
      registry.registerPack(
        'core',
        [makeCap('vault.search')],
        new Map([['vault.search', makeHandler('vault.search')]]),
      );

      const validation = registry.validateFlow({
        steps: [{ needs: ['vault.search', 'color.validate', 'a11y.audit'] }],
      });

      expect(validation.valid).toBe(false);
      expect(validation.missing).toContain('color.validate');
      expect(validation.missing).toContain('a11y.audit');
      expect(validation.available).toContain('vault.search');
    });

    it('should classify blocking vs degraded capabilities', () => {
      const registry = new CapabilityRegistry();
      registry.registerPack(
        'core',
        [makeCap('vault.search')],
        new Map([['vault.search', makeHandler('vault.search')]]),
      );

      const validation = registry.validateFlow({
        steps: [{ needs: ['vault.search', 'color.validate'] }],
        onMissingCapability: {
          default: 'skip-with-warning',
          blocking: ['color.validate'],
        },
      });

      expect(validation.valid).toBe(false);
      expect(validation.canRunPartially).toBe(false); // blocking cap is missing
      const blocked = validation.degraded.find((d) => d.capability === 'color.validate');
      expect(blocked?.impact).toBe('blocking');
    });

    it('should allow partial run when missing caps are not blocking', () => {
      const registry = new CapabilityRegistry();
      registry.registerPack(
        'core',
        [makeCap('vault.search')],
        new Map([['vault.search', makeHandler('vault.search')]]),
      );

      const validation = registry.validateFlow({
        steps: [{ needs: ['vault.search', 'color.validate'] }],
        onMissingCapability: {
          default: 'skip-with-warning',
          blocking: ['vault.search'], // vault.search IS available
        },
      });

      expect(validation.valid).toBe(false); // still missing color.validate
      expect(validation.canRunPartially).toBe(true); // but it's not blocking
    });
  });

  // ─── 6. Chain mapping bridge ────────────────────────

  describe('Chain-to-capability v1→v2 bridge', () => {
    it('should map known chain names to capability IDs', () => {
      expect(chainToCapability('vault-search')).toBe('vault.search');
      expect(chainToCapability('contrast-check')).toBe('color.validate');
      expect(chainToCapability('validate-tokens')).toBe('token.check');
      expect(chainToCapability('component-search')).toBe('component.search');
      expect(chainToCapability('brain-recommend')).toBe('brain.recommend');
    });

    it('should return undefined for unknown chains', () => {
      expect(chainToCapability('nonexistent-chain')).toBeUndefined();
      expect(chainToCapability('')).toBeUndefined();
    });

    it('should validate flow with chains via bridge', () => {
      const registry = new CapabilityRegistry();
      registry.registerPack(
        'core',
        [makeCap('vault.search'), makeCap('brain.recommend')],
        new Map([
          ['vault.search', makeHandler('vault.search')],
          ['brain.recommend', makeHandler('brain.recommend')],
        ]),
      );

      // Flow uses v1 chains (no needs)
      const validation = registry.validateFlow({
        steps: [{ chains: ['vault-search', 'brain-recommend'] }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.available).toContain('vault.search');
      expect(validation.available).toContain('brain.recommend');
    });
  });

  // ─── 7. Listing and grouping ────────────────────────

  describe('Capability listing', () => {
    it('should group capabilities by domain', () => {
      const registry = new CapabilityRegistry();
      const defs = [
        makeCap('color.validate'),
        makeCap('color.parse'),
        makeCap('token.check'),
        makeCap('vault.search'),
      ];
      const handlers = new Map<string, CapabilityHandler>();
      defs.forEach((d) => handlers.set(d.id, makeHandler(d.id)));
      registry.registerPack('mixed', defs, handlers);

      const grouped = registry.list();
      expect(grouped.get('color')).toHaveLength(2);
      expect(grouped.get('token')).toHaveLength(1);
      expect(grouped.get('vault')).toHaveLength(1);
    });
  });

  // ─── 8. Pack manifest v2 schema ─────────────────────

  describe('Pack manifest v2 schema', () => {
    it('should accept manifest with capabilities', () => {
      const manifest = {
        id: 'design-system',
        name: 'Design System Intelligence',
        version: '1.0.0',
        capabilities: [
          {
            id: 'color.validate',
            description: 'Check color contrast',
            provides: ['contrast-ratio', 'wcag-level'],
            requires: ['foreground', 'background'],
            depends: ['color.parse'],
            knowledge: ['a11y-contrast'],
          },
        ],
      };

      const result = packManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.capabilities).toHaveLength(1);
        expect(result.data.capabilities[0].id).toBe('color.validate');
      }
    });

    it('should accept manifest without capabilities (backwards compat)', () => {
      const manifest = {
        id: 'legacy-pack',
        name: 'Legacy Pack',
        version: '1.0.0',
      };

      const result = packManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.capabilities).toEqual([]);
      }
    });

    it('should reject invalid capability ID format', () => {
      const manifest = {
        id: 'bad-pack',
        name: 'Bad Pack',
        version: '1.0.0',
        capabilities: [
          {
            id: 'INVALID',
            description: 'Bad format',
            provides: [],
            requires: [],
          },
        ],
      };

      const result = packManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });

    it('should enforce domain.action format', () => {
      const goodIds = ['color.validate', 'vault.search', 'a11y.audit'];
      const badIds = ['noperiod', 'UPPER.case', 'color.', '.action', 'a.b.c'];

      for (const id of goodIds) {
        const result = packManifestSchema.safeParse({
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          capabilities: [{ id, description: 'ok', provides: [], requires: [] }],
        });
        expect(result.success).toBe(true);
      }

      for (const id of badIds) {
        const result = packManifestSchema.safeParse({
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          capabilities: [{ id, description: 'ok', provides: [], requires: [] }],
        });
        expect(result.success).toBe(false);
      }
    });
  });

  // ─── 9. Flow YAML migration verification ────────────

  describe('Flow YAML migration', () => {
    const flowsDir = join(__dirname, '..', 'packages', 'core', 'data', 'flows');
    let flowFiles: string[] = [];

    beforeAll(() => {
      flowFiles = readdirSync(flowsDir).filter((f) => f.endsWith('.flow.yaml'));
    });

    it('should have 8 flow files', () => {
      expect(flowFiles.length).toBe(8);
    });

    it('every flow should have on-missing-capability config', () => {
      for (const file of flowFiles) {
        const content = readFileSync(join(flowsDir, file), 'utf-8');
        const flow = parseYaml(content);
        expect(flow['on-missing-capability']).toBeDefined();
        expect(flow['on-missing-capability'].default).toBe('skip-with-warning');
        expect(flow['on-missing-capability'].blocking).toContain('vault.search');
      }
    });

    it('every step with chains: should also have needs:', () => {
      for (const file of flowFiles) {
        const content = readFileSync(join(flowsDir, file), 'utf-8');
        const flow = parseYaml(content);
        for (const step of flow.steps ?? []) {
          if (step.chains && step.chains.length > 0) {
            expect(step.needs).toBeDefined();
            expect(step.needs.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it('needs: values should be valid domain.action format', () => {
      const validFormat = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/;
      for (const file of flowFiles) {
        const content = readFileSync(join(flowsDir, file), 'utf-8');
        const flow = parseYaml(content);
        for (const step of flow.steps ?? []) {
          for (const need of step.needs ?? []) {
            expect(need).toMatch(validFormat);
          }
        }
      }
    });

    it('chain mapping should cover all chains used in flows', () => {
      const allChains = new Set<string>();
      for (const file of flowFiles) {
        const content = readFileSync(join(flowsDir, file), 'utf-8');
        const flow = parseYaml(content);
        for (const step of flow.steps ?? []) {
          for (const chain of step.chains ?? []) {
            allChains.add(chain);
          }
        }
      }

      // Every chain used in flows should have a capability mapping
      for (const chain of allChains) {
        const capId = chainToCapability(chain);
        expect(capId).toBeDefined();
      }
    });
  });

  // ─── 10. Integration: registry + flow validation ────

  describe('Full integration', () => {
    it('should validate a real flow against a realistic registry', () => {
      const registry = new CapabilityRegistry();

      // Core pack
      const coreCaps = [
        'vault.search', 'vault.playbook', 'memory.search',
        'brain.recommend', 'brain.strengths', 'plan.create',
        'orchestrate.plan', 'identity.activate', 'identity.route',
        'cognee.search', 'admin.health', 'debug.patterns',
      ].map((id) => makeCap(id));
      const coreHandlers = new Map<string, CapabilityHandler>();
      coreCaps.forEach((c) => coreHandlers.set(c.id, makeHandler(c.id)));
      registry.registerPack('core', coreCaps, coreHandlers, 100);

      // Design system pack
      const designCaps = [
        'color.validate', 'token.check', 'design.rules',
        'design.recommend', 'component.search', 'component.workflow',
        'component.validate',
      ].map((id) => makeCap(id));
      const designHandlers = new Map<string, CapabilityHandler>();
      designCaps.forEach((c) => designHandlers.set(c.id, makeHandler(c.id)));
      registry.registerPack('design-system', designCaps, designHandlers, 50);

      // Read actual BUILD flow
      const flowsDir = join(__dirname, '..', 'packages', 'core', 'data', 'flows');
      const buildContent = readFileSync(join(flowsDir, 'build.flow.yaml'), 'utf-8');
      const buildFlow = parseYaml(buildContent);

      const validation = registry.validateFlow({
        steps: buildFlow.steps,
        onMissingCapability: buildFlow['on-missing-capability'],
      });

      // Should have most capabilities available
      expect(validation.available.length).toBeGreaterThan(0);

      // Some might be missing (architecture.search, etc.) — that's expected
      // The key is: vault.search should be available (it's blocking)
      expect(validation.available).toContain('vault.search');
    });
  });
});
