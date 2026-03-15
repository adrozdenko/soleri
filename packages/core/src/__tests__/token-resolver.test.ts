import { describe, it, expect } from 'vitest';
import {
  resolveToken,
  listProjectTokens,
  buildReverseIndex,
} from '../domain-packs/token-resolver.js';
import type { PackProjectContext } from '../domain-packs/pack-runtime.js';

const mockProject: PackProjectContext = {
  id: 'test-project',
  name: 'Test Project',
  path: '/test',
  colors: {
    primary: {
      base: '#3B82F6',
      scale: { '50': '#EFF6FF', '100': '#DBEAFE', '500': '#3B82F6', '900': '#1E3A5F' },
    },
    neutral: {
      base: '#6B7280',
      scale: { '50': '#F9FAFB', '100': '#F3F4F6', '500': '#6B7280', '900': '#111827' },
    },
  },
  semanticTokens: {
    'text-inverse': '#FFFFFF',
    'bg-surface': '#F9FAFB',
  },
};

describe('resolveToken', () => {
  it('should pass through hex values', () => {
    expect(resolveToken('#FF0000', mockProject)).toBe('#FF0000');
  });

  it('should resolve named colors', () => {
    expect(resolveToken('white', mockProject)).toBe('#FFFFFF');
    expect(resolveToken('black', mockProject)).toBe('#000000');
  });

  it('should resolve semantic tokens', () => {
    expect(resolveToken('text-inverse', mockProject)).toBe('#FFFFFF');
    expect(resolveToken('bg-surface', mockProject)).toBe('#F9FAFB');
  });

  it('should resolve SCALE[SHADE] format', () => {
    expect(resolveToken('PRIMARY[500]', mockProject)).toBe('#3B82F6');
    expect(resolveToken('neutral[900]', mockProject)).toBe('#111827');
  });

  it('should resolve Tailwind-style tokens', () => {
    expect(resolveToken('bg-primary-500', mockProject)).toBe('#3B82F6');
    expect(resolveToken('text-neutral-900', mockProject)).toBe('#111827');
  });

  it('should throw for unknown tokens', () => {
    expect(() => resolveToken('unknown-token', mockProject)).toThrow('Cannot resolve');
  });

  it('should throw for unknown scales', () => {
    expect(() => resolveToken('ACCENT[500]', mockProject)).toThrow('Unknown color scale');
  });
});

describe('listProjectTokens', () => {
  it('should list all scale and semantic tokens', () => {
    const tokens = listProjectTokens(mockProject);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.some((t) => t.token === 'primary-500')).toBe(true);
    expect(tokens.some((t) => t.token === 'text-inverse')).toBe(true);
    expect(tokens.some((t) => t.scale === 'semantic')).toBe(true);
  });
});

describe('buildReverseIndex', () => {
  it('should map hex to token name', () => {
    const index = buildReverseIndex(mockProject);
    expect(index.get('#3B82F6')).toBe('primary-500');
    expect(index.get('#FFFFFF')).toBe('text-inverse');
  });
});
