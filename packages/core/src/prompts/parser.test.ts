import { describe, it, expect } from 'vitest';
import { parseVariables, resolveIncludes } from './parser.js';

describe('parseVariables', () => {
  it('returns empty array for empty string', () => {
    expect(parseVariables('')).toEqual([]);
  });

  it('extracts a single required variable', () => {
    const vars = parseVariables('Hello {{name}}');
    expect(vars).toEqual([{ name: 'name', required: true, defaultValue: undefined }]);
  });

  it('extracts a variable with default value', () => {
    const vars = parseVariables('{{greeting:Hi}}');
    expect(vars).toEqual([{ name: 'greeting', required: false, defaultValue: 'Hi' }]);
  });

  it('handles empty default as optional', () => {
    const vars = parseVariables('{{opt:}}');
    expect(vars).toEqual([{ name: 'opt', required: false, defaultValue: '' }]);
  });

  it('deduplicates repeated variable names', () => {
    const vars = parseVariables('{{x}} then {{x}} again {{x:default}}');
    expect(vars).toHaveLength(1);
    expect(vars[0].name).toBe('x');
  });

  it('extracts multiple distinct variables preserving order', () => {
    const vars = parseVariables('{{a}} {{b:2}} {{c}}');
    expect(vars.map((v) => v.name)).toEqual(['a', 'b', 'c']);
    expect(vars[0].required).toBe(true);
    expect(vars[1].required).toBe(false);
    expect(vars[2].required).toBe(true);
  });

  it('ignores malformed variable syntax', () => {
    expect(parseVariables('{name}')).toEqual([]);
    expect(parseVariables('{{ name }}')).toEqual([]); // spaces not matched by \\w+
    expect(parseVariables('{{}}')).toEqual([]);
  });

  it('handles variables adjacent to each other', () => {
    const vars = parseVariables('{{a}}{{b}}');
    expect(vars).toHaveLength(2);
  });
});

describe('resolveIncludes', () => {
  it('returns unchanged text when no includes present', () => {
    expect(resolveIncludes('just text', () => '')).toBe('just text');
  });

  it('resolves a single include', () => {
    const result = resolveIncludes('A @include(part) B', (name) => (name === 'part' ? 'MID' : ''));
    expect(result).toBe('A MID B');
  });

  it('resolves multiple includes in one pass', () => {
    const result = resolveIncludes('@include(x) @include(y)', (n) => n.toUpperCase());
    expect(result).toBe('X Y');
  });

  it('resolves nested includes up to depth limit', () => {
    const result = resolveIncludes('@include(a)', (name) => {
      if (name === 'a') return 'A(@include(b))';
      if (name === 'b') return 'B';
      return '';
    });
    expect(result).toBe('A(B)');
  });

  it('throws on circular include between two partials', () => {
    expect(() =>
      resolveIncludes('@include(a)', (name) => {
        if (name === 'a') return '@include(b)';
        if (name === 'b') return '@include(a)';
        return '';
      }),
    ).toThrow(/Circular include detected/);
  });

  it('throws when depth exceeds 10', () => {
    let counter = 0;
    expect(() =>
      resolveIncludes('@include(l0)', () => {
        counter++;
        return `@include(l${counter})`;
      }),
    ).toThrow(/Include depth exceeded/);
  });

  it('trims whitespace in partial names', () => {
    const result = resolveIncludes('@include( spaced )', (name) =>
      name === 'spaced' ? 'OK' : 'FAIL',
    );
    expect(result).toBe('OK');
  });
});
