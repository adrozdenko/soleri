import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from './registry.js';
import type { CapabilityDefinition, CapabilityHandler } from './types.js';

function makeDef(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {
  return {
    id: 'test.action',
    description: 'Test capability',
    provides: ['output'],
    requires: ['input'],
    ...overrides,
  };
}

const noopHandler: CapabilityHandler = async () => ({
  success: true,
  data: {},
  produced: [],
});

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  // ─── registerPack ────────────────────────────────────────────────

  describe('registerPack', () => {
    it('registers capabilities with handlers', () => {
      const defs = [makeDef({ id: 'color.validate' })];
      const handlers = new Map<string, CapabilityHandler>([['color.validate', noopHandler]]);

      registry.registerPack('design-pack', defs, handlers, 50);

      expect(registry.has('color.validate')).toBe(true);
      expect(registry.size).toBe(1);
      expect(registry.packCount).toBe(1);
    });

    it('skips definitions without matching handlers', () => {
      const defs = [makeDef({ id: 'color.validate' }), makeDef({ id: 'color.missing' })];
      const handlers = new Map<string, CapabilityHandler>([['color.validate', noopHandler]]);

      registry.registerPack('pack-a', defs, handlers);

      expect(registry.has('color.validate')).toBe(true);
      expect(registry.has('color.missing')).toBe(false);
      expect(registry.size).toBe(1);
    });

    it('supports multiple providers sorted by priority', () => {
      const def = makeDef({ id: 'vault.search' });
      const lowHandler: CapabilityHandler = async () => ({
        success: true,
        data: { source: 'low' },
        produced: [],
      });
      const highHandler: CapabilityHandler = async () => ({
        success: true,
        data: { source: 'high' },
        produced: [],
      });

      registry.registerPack('fallback', [def], new Map([['vault.search', lowHandler]]), 0);
      registry.registerPack('core', [def], new Map([['vault.search', highHandler]]), 100);

      const resolved = registry.resolve('vault.search');
      expect(resolved.available).toBe(true);
      expect(resolved.providers).toEqual(['core', 'fallback']);
    });

    it('uses default priority 0 when not specified', () => {
      const def = makeDef({ id: 'brain.recommend' });
      registry.registerPack('pack', [def], new Map([['brain.recommend', noopHandler]]));

      const registered = registry.get('brain.recommend');
      expect(registered?.providers[0].priority).toBe(0);
    });
  });

  // ─── resolve ─────────────────────────────────────────────────────

  describe('resolve', () => {
    it('returns available=true with handler for registered capability', () => {
      registry.registerPack(
        'pack',
        [makeDef({ id: 'test.op' })],
        new Map([['test.op', noopHandler]]),
        50,
      );

      const result = registry.resolve('test.op');
      expect(result.available).toBe(true);
      expect(result.handler).toBeDefined();
      expect(result.capabilityId).toBe('test.op');
    });

    it('returns available=false with suggestion for missing capability', () => {
      const result = registry.resolve('nonexistent.cap');

      expect(result.available).toBe(false);
      expect(result.capabilityId).toBe('nonexistent.cap');
      expect(result.handler).toBeUndefined();
    });

    it('returns available=false when dependencies are missing', () => {
      const def = makeDef({ id: 'token.check', depends: ['color.validate'] });
      registry.registerPack('pack', [def], new Map([['token.check', noopHandler]]));

      const result = registry.resolve('token.check');
      expect(result.available).toBe(false);
      expect(result.missingDependencies).toEqual(['color.validate']);
    });

    it('returns available=true when dependencies are satisfied', () => {
      const colorDef = makeDef({ id: 'color.validate' });
      const tokenDef = makeDef({ id: 'token.check', depends: ['color.validate'] });

      registry.registerPack(
        'pack',
        [colorDef, tokenDef],
        new Map([
          ['color.validate', noopHandler],
          ['token.check', noopHandler],
        ]),
      );

      const result = registry.resolve('token.check');
      expect(result.available).toBe(true);
      expect(result.missingDependencies).toBeUndefined();
    });

    it('returns knowledge refs from definition', () => {
      const def = makeDef({ id: 'design.rules', knowledge: ['k1', 'k2'] });
      registry.registerPack('pack', [def], new Map([['design.rules', noopHandler]]));

      const result = registry.resolve('design.rules');
      expect(result.available).toBe(true);
      expect(result.knowledge).toEqual(['k1', 'k2']);
    });
  });

  // ─── list ────────────────────────────────────────────────────────

  describe('list', () => {
    it('groups capabilities by domain', () => {
      registry.registerPack(
        'pack',
        [
          makeDef({ id: 'color.validate' }),
          makeDef({ id: 'color.contrast' }),
          makeDef({ id: 'token.check' }),
        ],
        new Map([
          ['color.validate', noopHandler],
          ['color.contrast', noopHandler],
          ['token.check', noopHandler],
        ]),
      );

      const grouped = registry.list();
      expect(grouped.get('color')).toHaveLength(2);
      expect(grouped.get('token')).toHaveLength(1);
    });

    it('returns empty map when no capabilities registered', () => {
      const grouped = registry.list();
      expect(grouped.size).toBe(0);
    });
  });

  // ─── suggestPacksFor ─────────────────────────────────────────────

  describe('suggestPacksFor', () => {
    it('suggests packs that provide requested capabilities', () => {
      registry.registerPack(
        'design-pack',
        [makeDef({ id: 'color.validate' }), makeDef({ id: 'token.check' })],
        new Map([
          ['color.validate', noopHandler],
          ['token.check', noopHandler],
        ]),
      );

      const suggestions = registry.suggestPacksFor(['color.validate']);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].packId).toBe('design-pack');
      expect(suggestions[0].provides).toEqual(['color.validate']);
    });

    it('returns empty array for no capabilities', () => {
      expect(registry.suggestPacksFor([])).toEqual([]);
    });

    it('returns empty array when no packs match', () => {
      expect(registry.suggestPacksFor(['unknown.cap'])).toEqual([]);
    });
  });

  // ─── validateFlow ────────────────────────────────────────────────

  describe('validateFlow', () => {
    it('validates a flow with all capabilities available', () => {
      registry.registerPack(
        'pack',
        [makeDef({ id: 'vault.search' }), makeDef({ id: 'brain.recommend' })],
        new Map([
          ['vault.search', noopHandler],
          ['brain.recommend', noopHandler],
        ]),
      );

      const result = registry.validateFlow({
        steps: [{ needs: ['vault.search', 'brain.recommend'] }],
      });

      expect(result.valid).toBe(true);
      expect(result.available).toEqual(['vault.search', 'brain.recommend']);
      expect(result.missing).toEqual([]);
      expect(result.canRunPartially).toBe(true);
    });

    it('reports missing capabilities as degraded', () => {
      const result = registry.validateFlow({
        steps: [{ needs: ['vault.search'] }],
      });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['vault.search']);
      expect(result.degraded).toHaveLength(1);
      expect(result.degraded[0].impact).toBe('degraded');
      expect(result.canRunPartially).toBe(true);
    });

    it('classifies blocking capabilities correctly', () => {
      const result = registry.validateFlow({
        steps: [{ needs: ['vault.search', 'auth.validate'] }],
        onMissingCapability: { blocking: ['auth.validate'] },
      });

      expect(result.valid).toBe(false);
      expect(result.canRunPartially).toBe(false);
      const authDegraded = result.degraded.find((d) => d.capability === 'auth.validate');
      expect(authDegraded?.impact).toBe('blocking');
    });

    it('handles v1 chains field via chainToCapability mapping', () => {
      registry.registerPack(
        'pack',
        [makeDef({ id: 'vault.search' })],
        new Map([['vault.search', noopHandler]]),
      );

      const result = registry.validateFlow({
        steps: [{ chains: ['vault-search'] }],
      });

      expect(result.valid).toBe(true);
      expect(result.available).toContain('vault.search');
    });

    it('ignores unmapped v1 chains', () => {
      const result = registry.validateFlow({
        steps: [{ chains: ['nonexistent-chain'] }],
      });

      // Unmapped chain returns undefined from chainToCapability, so nothing is added
      expect(result.valid).toBe(true);
      expect(result.available).toEqual([]);
      expect(result.missing).toEqual([]);
    });

    it('handles mixed needs and chains in a single step', () => {
      registry.registerPack(
        'pack',
        [makeDef({ id: 'vault.search' }), makeDef({ id: 'brain.recommend' })],
        new Map([
          ['vault.search', noopHandler],
          ['brain.recommend', noopHandler],
        ]),
      );

      const result = registry.validateFlow({
        steps: [{ needs: ['brain.recommend'], chains: ['vault-search'] }],
      });

      expect(result.valid).toBe(true);
      expect(result.available).toContain('vault.search');
      expect(result.available).toContain('brain.recommend');
    });

    it('validates flow with empty steps', () => {
      const result = registry.validateFlow({ steps: [] });
      expect(result.valid).toBe(true);
      expect(result.canRunPartially).toBe(true);
    });
  });

  // ─── inspection ──────────────────────────────────────────────────

  describe('inspection helpers', () => {
    it('size returns count of registered capabilities', () => {
      expect(registry.size).toBe(0);

      registry.registerPack(
        'pack',
        [makeDef({ id: 'a.b' }), makeDef({ id: 'c.d' })],
        new Map([
          ['a.b', noopHandler],
          ['c.d', noopHandler],
        ]),
      );

      expect(registry.size).toBe(2);
    });

    it('packCount returns number of packs', () => {
      expect(registry.packCount).toBe(0);

      registry.registerPack('p1', [makeDef({ id: 'x.y' })], new Map([['x.y', noopHandler]]));
      registry.registerPack('p2', [makeDef({ id: 'a.b' })], new Map([['a.b', noopHandler]]));

      expect(registry.packCount).toBe(2);
    });

    it('ids returns all capability IDs', () => {
      registry.registerPack(
        'pack',
        [makeDef({ id: 'vault.search' }), makeDef({ id: 'brain.recommend' })],
        new Map([
          ['vault.search', noopHandler],
          ['brain.recommend', noopHandler],
        ]),
      );

      const ids = registry.ids();
      expect(ids).toContain('vault.search');
      expect(ids).toContain('brain.recommend');
    });

    it('get returns RegisteredCapability or undefined', () => {
      registry.registerPack(
        'pack',
        [makeDef({ id: 'test.op' })],
        new Map([['test.op', noopHandler]]),
        75,
      );

      const cap = registry.get('test.op');
      expect(cap).toBeDefined();
      expect(cap!.providers).toHaveLength(1);
      expect(cap!.providers[0].priority).toBe(75);

      expect(registry.get('missing')).toBeUndefined();
    });
  });
});
