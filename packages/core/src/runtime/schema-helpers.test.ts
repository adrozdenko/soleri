/**
 * Colocated unit tests for schema-helpers.ts — coerceArray Zod helper.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { coerceArray } from './schema-helpers.js';

describe('coerceArray', () => {
  const schema = coerceArray(z.string());

  it('passes through a native array unchanged', () => {
    const result = schema.parse(['a', 'b', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('coerces a JSON-stringified array', () => {
    const result = schema.parse(JSON.stringify(['x', 'y']));
    expect(result).toEqual(['x', 'y']);
  });

  it('rejects invalid JSON strings', () => {
    expect(() => schema.parse('not-json')).toThrow();
  });

  it('rejects non-array JSON (object)', () => {
    expect(() => schema.parse(JSON.stringify({ a: 1 }))).toThrow();
  });

  it('rejects non-array JSON (number)', () => {
    expect(() => schema.parse(JSON.stringify(42))).toThrow();
  });

  it('works with complex item schemas', () => {
    const complex = coerceArray(z.object({ id: z.string(), value: z.number() }));
    const items = [{ id: 'a', value: 1 }];
    expect(complex.parse(JSON.stringify(items))).toEqual(items);
    expect(complex.parse(items)).toEqual(items);
  });

  it('still validates item types after coercion', () => {
    // Array of strings schema should reject array of numbers
    expect(() => schema.parse(JSON.stringify([1, 2, 3]))).toThrow();
  });
});
