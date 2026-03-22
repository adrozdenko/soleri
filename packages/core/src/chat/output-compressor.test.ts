/**
 * Output Compressor — colocated tests.
 *
 * Covers: generic compressor, registry (exact + prefix match),
 * JSON-aware compression, array/string truncation, plain text fallback.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  createOutputCompressor,
  registerCompressor,
  clearCompressors,
} from './output-compressor.js';

describe('OutputCompressor', () => {
  beforeEach(() => {
    clearCompressors();
  });

  describe('createOutputCompressor', () => {
    test('returns short output unchanged', () => {
      const compress = createOutputCompressor({ maxLength: 1000 });
      const output = 'short text';
      expect(compress('any_tool', output)).toBe(output);
    });

    test('truncates long plain text', () => {
      const compress = createOutputCompressor({ maxLength: 50 });
      const output = 'x'.repeat(200);
      const result = compress('tool', output);
      expect(result.length).toBeLessThan(200);
      expect(result).toContain('truncated');
    });

    test('compresses long JSON arrays', () => {
      const compress = createOutputCompressor({
        maxLength: 500,
        maxArrayItems: 2,
      });
      const data = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item-${i}` }));
      const output = JSON.stringify(data);
      const result = compress('tool', output);
      const parsed = JSON.parse(result.split('\n... (compressed')[0]);
      expect(parsed.length).toBeLessThanOrEqual(3); // 2 items + "... +18 more"
    });

    test('compresses long strings in JSON when output exceeds limit', () => {
      const compress = createOutputCompressor({
        maxLength: 100, // force compression by setting limit below output size
        maxStringLength: 20,
      });
      const data = { description: 'a'.repeat(500) };
      const output = JSON.stringify(data);
      // output is ~516 chars, exceeds 100
      const result = compress('tool', output);
      const cleanResult = result.split('\n... (compressed')[0];
      const parsed = JSON.parse(cleanResult);
      expect(parsed.description.length).toBeLessThan(500);
      expect(parsed.description).toContain('chars');
    });

    test('preserves numbers and booleans in JSON', () => {
      const compress = createOutputCompressor({ maxLength: 5000 });
      const data = { count: 42, active: true, label: null };
      const output = JSON.stringify(data);
      // Output is small — returned unchanged, still valid JSON
      const result = compress('tool', output);
      const parsed = JSON.parse(result);
      expect(parsed.count).toBe(42);
      expect(parsed.active).toBe(true);
      expect(parsed.label).toBeNull();
    });

    test('respects overrideMax parameter', () => {
      const compress = createOutputCompressor({ maxLength: 10000 });
      const output = 'x'.repeat(200);
      const result = compress('tool', output, 50);
      expect(result.length).toBeLessThan(200);
      expect(result).toContain('truncated');
    });
  });

  describe('registry', () => {
    test('exact match uses registered compressor', () => {
      registerCompressor('vault_search', (output) => `[compressed] ${output.slice(0, 10)}`);
      const compress = createOutputCompressor({ maxLength: 10 });
      const result = compress('vault_search', 'x'.repeat(100));
      expect(result.startsWith('[compressed]')).toBe(true);
    });

    test('prefix match uses registered compressor', () => {
      registerCompressor('salvador.', (output, max) => output.slice(0, max));
      const compress = createOutputCompressor({ maxLength: 20 });
      const result = compress('salvador.vault', 'x'.repeat(100), 15);
      expect(result).toBe('x'.repeat(15));
    });

    test('exact match takes priority over prefix', () => {
      registerCompressor('tool_', () => 'prefix');
      registerCompressor('tool_exact', () => 'exact');
      const compress = createOutputCompressor({ maxLength: 10 });
      expect(compress('tool_exact', 'x'.repeat(100))).toBe('exact');
    });

    test('clearCompressors removes all', () => {
      registerCompressor('a', () => 'a');
      registerCompressor('b', () => 'b');
      clearCompressors();
      const compress = createOutputCompressor({ maxLength: 10 });
      const result = compress('a', 'x'.repeat(100));
      expect(result).not.toBe('a');
    });
  });

  describe('edge cases', () => {
    test('handles empty string', () => {
      const compress = createOutputCompressor();
      expect(compress('tool', '')).toBe('');
    });

    test('handles invalid JSON gracefully', () => {
      const compress = createOutputCompressor({ maxLength: 20 });
      const result = compress('tool', '{not valid json' + 'x'.repeat(100));
      expect(result).toContain('truncated');
    });

    test('handles nested objects with compression triggered', () => {
      const compress = createOutputCompressor({
        maxLength: 500, // large enough for compressed result to fit
        maxStringLength: 10,
      });
      const data = {
        level1: {
          level2: {
            deep: 'a'.repeat(600),
          },
        },
      };
      const output = JSON.stringify(data);
      // output is ~640 chars, exceeds 500, triggers compression
      const result = compress('tool', output);
      // Compressed string should be shorter than original
      expect(result.length).toBeLessThan(output.length);
      // The deep value should have been truncated
      expect(result).toContain('chars');
    });

    test('compresses arrays within objects when limit exceeded', () => {
      const compress = createOutputCompressor({
        maxLength: 200, // large enough for compressed output
        maxArrayItems: 2,
      });
      // Use objects in the array so total JSON is over 200 chars
      const data = {
        items: Array.from({ length: 50 }, (_, i) => ({ id: i, label: `item-${i}` })),
      };
      const output = JSON.stringify(data);
      // output is well over 200 chars
      const result = compress('tool', output);
      expect(result.length).toBeLessThan(output.length);
      expect(result).toContain('+48 more');
    });
  });
});
