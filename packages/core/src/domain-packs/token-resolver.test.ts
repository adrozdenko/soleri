/**
 * Colocated tests for domain-packs/token-resolver.ts
 *
 * Tests: hex passthrough, named colors, semantic tokens, SCALE[SHADE],
 * Tailwind-style tokens, listProjectTokens, buildReverseIndex.
 */

import { describe, it, expect } from 'vitest';
import { resolveToken, listProjectTokens, buildReverseIndex } from './token-resolver.js';
import type { PackProjectContext } from './pack-runtime.js';

function projectWithColors(): PackProjectContext {
  return {
    id: 'proj-1',
    name: 'TestProject',
    path: '/test',
    colors: {
      primary: { scale: { '500': '#3b82f6', '700': '#1d4ed8' }, base: '#3b82f6' },
      neutral: { scale: { '100': '#f5f5f5', '900': '#171717' }, base: '#737373' },
    },
    semanticTokens: {
      'text-primary': '#171717',
      'bg-surface': '#ffffff',
      'text-inverse': '#ffffff',
    },
  };
}

function emptyProject(): PackProjectContext {
  return { id: 'empty', path: '/empty' };
}

describe('resolveToken', () => {
  it('passes through hex values unchanged (uppercased)', () => {
    expect(resolveToken('#dc0000', emptyProject())).toBe('#DC0000');
    expect(resolveToken('#FFF', emptyProject())).toBe('#FFF');
  });

  it('resolves named colors', () => {
    expect(resolveToken('white', emptyProject())).toBe('#FFFFFF');
    expect(resolveToken('black', emptyProject())).toBe('#000000');
    expect(resolveToken('transparent', emptyProject())).toBe('#00000000');
  });

  it('is case-insensitive for named colors', () => {
    expect(resolveToken('WHITE', emptyProject())).toBe('#FFFFFF');
    expect(resolveToken('Black', emptyProject())).toBe('#000000');
  });

  it('resolves semantic tokens', () => {
    const project = projectWithColors();
    expect(resolveToken('text-primary', project)).toBe('#171717');
    expect(resolveToken('bg-surface', project)).toBe('#FFFFFF');
    expect(resolveToken('text-inverse', project)).toBe('#FFFFFF');
  });

  it('resolves SCALE[SHADE] format', () => {
    const project = projectWithColors();
    expect(resolveToken('PRIMARY[500]', project)).toBe('#3B82F6');
    expect(resolveToken('neutral[900]', project)).toBe('#171717');
  });

  it('resolves Tailwind-style tokens', () => {
    const project = projectWithColors();
    expect(resolveToken('bg-primary-500', project)).toBe('#3B82F6');
    expect(resolveToken('text-neutral-900', project)).toBe('#171717');
    expect(resolveToken('border-primary-700', project)).toBe('#1D4ED8');
  });

  it('supports all Tailwind prefixes', () => {
    const project = projectWithColors();
    for (const prefix of ['bg', 'text', 'border', 'ring', 'fill', 'stroke']) {
      expect(resolveToken(`${prefix}-primary-500`, project)).toBe('#3B82F6');
    }
  });

  it('throws for unknown token', () => {
    expect(() => resolveToken('unknown-token', emptyProject())).toThrow(
      /Cannot resolve token/,
    );
  });

  it('throws for unknown color scale', () => {
    const project = projectWithColors();
    expect(() => resolveToken('DANGER[500]', project)).toThrow(/Unknown color scale/);
  });

  it('throws for unknown shade in valid scale', () => {
    const project = projectWithColors();
    expect(() => resolveToken('PRIMARY[999]', project)).toThrow(/Unknown shade/);
  });

  it('throws when project has no color scales for SCALE[SHADE]', () => {
    expect(() => resolveToken('PRIMARY[500]', emptyProject())).toThrow(/no color scales/);
  });
});

describe('listProjectTokens', () => {
  it('returns empty array for project with no colors or tokens', () => {
    expect(listProjectTokens(emptyProject())).toEqual([]);
  });

  it('lists all scale tokens', () => {
    const tokens = listProjectTokens(projectWithColors());
    const scaleTokens = tokens.filter((t) => t.scale !== 'semantic');
    expect(scaleTokens.length).toBe(4); // 2 primary shades + 2 neutral shades
  });

  it('lists all semantic tokens', () => {
    const tokens = listProjectTokens(projectWithColors());
    const semanticTokens = tokens.filter((t) => t.scale === 'semantic');
    expect(semanticTokens.length).toBe(3);
  });

  it('uppercases all hex values', () => {
    const tokens = listProjectTokens(projectWithColors());
    for (const t of tokens) {
      expect(t.hex).toBe(t.hex.toUpperCase());
    }
  });
});

describe('buildReverseIndex', () => {
  it('returns empty map for empty project', () => {
    expect(buildReverseIndex(emptyProject()).size).toBe(0);
  });

  it('maps hex to token name', () => {
    const index = buildReverseIndex(projectWithColors());
    expect(index.get('#3B82F6')).toBe('primary-500');
    expect(index.get('#171717')).toBeDefined();
  });

  it('keys are uppercased hex', () => {
    const index = buildReverseIndex(projectWithColors());
    for (const key of index.keys()) {
      expect(key).toBe(key.toUpperCase());
      expect(key.startsWith('#')).toBe(true);
    }
  });

  it('last-write-wins when hex values collide', () => {
    // Both text-primary and neutral-900 map to #171717
    const index = buildReverseIndex(projectWithColors());
    const val = index.get('#171717');
    expect(val).toBeDefined();
    // It should be one of the tokens that map to that hex
    expect(['neutral-900', 'text-primary']).toContain(val);
  });
});
