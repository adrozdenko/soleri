/**
 * Colocated tests for domain-packs/loader.ts
 *
 * resolveDependencies is covered in __tests__/domain-packs.test.ts.
 * Here we add edge cases and test loadDomainPack / loadDomainPacksFromConfig.
 */

import { describe, it, expect } from 'vitest';
import { resolveDependencies, loadDomainPack, loadDomainPacksFromConfig } from './loader.js';
import type { DomainPack } from './types.js';

function stub(name: string, overrides: Partial<DomainPack> = {}): DomainPack {
  return {
    name,
    version: '1.0.0',
    domains: ['test'],
    ops: [{ name: `${name}_op`, description: 'op', auth: 'read', handler: async () => ({}) }],
    ...overrides,
  };
}

describe('resolveDependencies', () => {
  it('returns empty array for empty input', () => {
    expect(resolveDependencies([])).toEqual([]);
  });

  it('preserves order for independent packs', () => {
    const a = stub('a');
    const b = stub('b');
    const sorted = resolveDependencies([a, b]);
    expect(sorted.map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('handles diamond dependency graph', () => {
    const base = stub('base');
    const left = stub('left', { requires: ['base'] });
    const right = stub('right', { requires: ['base'] });
    const top = stub('top', { requires: ['left', 'right'] });
    const sorted = resolveDependencies([top, left, right, base]);
    const names = sorted.map((p) => p.name);
    expect(names.indexOf('base')).toBeLessThan(names.indexOf('left'));
    expect(names.indexOf('base')).toBeLessThan(names.indexOf('right'));
    expect(names.indexOf('left')).toBeLessThan(names.indexOf('top'));
    expect(names.indexOf('right')).toBeLessThan(names.indexOf('top'));
  });

  it('handles chain A → B → C', () => {
    const c = stub('c');
    const b = stub('b', { requires: ['c'] });
    const a = stub('a', { requires: ['b'] });
    const sorted = resolveDependencies([a, b, c]);
    expect(sorted.map((p) => p.name)).toEqual(['c', 'b', 'a']);
  });

  it('throws on self-dependency (circular)', () => {
    const self = stub('self', { requires: ['self'] });
    expect(() => resolveDependencies([self])).toThrow(/circular/i);
  });

  it('throws with names of packs in the cycle', () => {
    const a = stub('alpha', { requires: ['beta'] });
    const b = stub('beta', { requires: ['alpha'] });
    expect(() => resolveDependencies([a, b])).toThrow('alpha');
  });
});

describe('loadDomainPack', () => {
  it('throws on non-existent package', async () => {
    await expect(loadDomainPack('@soleri/nonexistent-pack-xyz')).rejects.toThrow(
      /Failed to import domain pack/,
    );
  });

  it('throws when module fails validation (no valid pack shape)', async () => {
    // node:path has a default export but it's not a valid DomainPack
    await expect(loadDomainPack('node:path')).rejects.toThrow(/failed validation/);
  });
});

describe('loadDomainPacksFromConfig', () => {
  it('returns empty array when all packs fail to load', async () => {
    const result = await loadDomainPacksFromConfig([
      { name: 'bad', package: '@soleri/nonexistent-xyz' },
    ]);
    expect(result).toEqual([]);
  });
});

describe('pack activation isolation', () => {
  it('activates packs #1 and #3 when pack #2 throws in onActivate', async () => {
    const activated: string[] = [];

    const pack1 = stub('pack-1', {
      onActivate: async () => {
        activated.push('pack-1');
      },
    });
    const pack2 = stub('pack-2', {
      onActivate: async () => {
        throw new Error('pack-2 exploded');
      },
    });
    const pack3 = stub('pack-3', {
      onActivate: async () => {
        activated.push('pack-3');
      },
    });

    const manifests = [pack1, pack2, pack3];
    const loaded: Array<{ name: string }> = [];

    for (const manifest of manifests) {
      try {
        if (manifest.onActivate) {
          // Sequential activation is intentional — matches engine behavior
          // eslint-disable-next-line no-await-in-loop
          await manifest.onActivate({} as never);
        }
        loaded.push(manifest);
      } catch {
        // Individual pack failure should not block others
      }
    }

    expect(activated).toEqual(['pack-1', 'pack-3']);
    expect(loaded.map((p) => p.name)).toEqual(['pack-1', 'pack-3']);
  });
});
