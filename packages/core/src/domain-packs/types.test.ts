/**
 * Colocated tests for domain-packs/types.ts
 *
 * Lighter coverage than __tests__/domain-packs.test.ts — focuses on
 * edge cases and boundary conditions not covered there.
 */

import { describe, it, expect } from 'vitest';
import { validateDomainPack, SEMANTIC_FACADE_NAMES } from './types.js';

function minimalPack(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test-pack',
    version: '1.0.0',
    domains: ['testing'],
    ops: [
      {
        name: 'op_one',
        description: 'A test op.',
        auth: 'read' as const,
        handler: async () => ({}),
      },
    ],
    ...overrides,
  };
}

describe('validateDomainPack', () => {
  it('accepts pack with optional fields omitted', () => {
    const result = validateDomainPack(minimalPack());
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = validateDomainPack(minimalPack({ name: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects empty version', () => {
    const result = validateDomainPack(minimalPack({ version: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects empty domains array', () => {
    const result = validateDomainPack(minimalPack({ domains: [] }));
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateDomainPack(null).success).toBe(false);
    expect(validateDomainPack('string').success).toBe(false);
    expect(validateDomainPack(42).success).toBe(false);
  });

  it('accepts pack with rules string', () => {
    const result = validateDomainPack(minimalPack({ rules: '## Token Rules\nUse semantic tokens.' }));
    expect(result.success).toBe(true);
  });

  it('accepts pack with skills array', () => {
    const result = validateDomainPack(
      minimalPack({ skills: [{ name: 'my-skill', path: './skills/my-skill.md' }] }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts pack with requires array', () => {
    const result = validateDomainPack(minimalPack({ requires: ['other-pack'] }));
    expect(result.success).toBe(true);
  });

  it('accepts pack with onInstall and onActivate callbacks', () => {
    const result = validateDomainPack(
      minimalPack({
        onInstall: async () => {},
        onActivate: async () => {},
      }),
    );
    expect(result.success).toBe(true);
  });

  it('allows non-semantic facade names', () => {
    const result = validateDomainPack(
      minimalPack({
        facades: [{ name: 'design_rules', description: 'Rules.', ops: [] }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects each semantic facade name as a pack facade', () => {
    for (const reserved of ['vault', 'brain', 'memory']) {
      const result = validateDomainPack(
        minimalPack({
          facades: [{ name: reserved, description: 'Collision.', ops: [] }],
        }),
      );
      expect(result.success).toBe(false);
    }
  });

  it('rejects duplicate op names with correct error message', () => {
    const result = validateDomainPack(
      minimalPack({
        ops: [
          { name: 'dup', description: 'A.', auth: 'read', handler: async () => ({}) },
          { name: 'dup', description: 'B.', auth: 'write', handler: async () => ({}) },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.issues[0].message).toContain('Duplicate op name');
    }
  });
});

describe('SEMANTIC_FACADE_NAMES', () => {
  it('is a readonly array (TypeScript enforced)', () => {
    expect(Array.isArray(SEMANTIC_FACADE_NAMES)).toBe(true);
    expect(SEMANTIC_FACADE_NAMES.length).toBeGreaterThan(0);
  });

  it('contains all core engine facades', () => {
    const expected = ['vault', 'plan', 'brain', 'memory', 'admin', 'curator', 'loop', 'orchestrate', 'control', 'cognee', 'governance'];
    for (const name of expected) {
      expect(SEMANTIC_FACADE_NAMES).toContain(name);
    }
  });
});
