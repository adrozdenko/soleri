/**
 * Output Compressor — compress verbose tool outputs for chat contexts.
 *
 * Unlike Salvador's 30+ domain-specific compressors, this provides:
 * 1. A generic JSON compressor (extracts key fields, truncates arrays)
 * 2. A registry for domain-specific compressors (pluggable)
 *
 * Domain packs can register their own compressors for their tools.
 */

import type { OutputCompressor } from './agent-loop-types.js';

const DEFAULT_MAX_LENGTH = 4000;
const DEFAULT_MAX_ARRAY_ITEMS = 5;
const DEFAULT_MAX_STRING_LENGTH = 500;

// ─── Compressor Registry ────────────────────────────────────────────

type ToolCompressor = (output: string, maxLength: number) => string;

const compressorRegistry = new Map<string, ToolCompressor>();

/**
 * Register a compressor for a specific tool name (or prefix).
 */
export function registerCompressor(toolNameOrPrefix: string, compressor: ToolCompressor): void {
  compressorRegistry.set(toolNameOrPrefix, compressor);
}

/**
 * Clear all registered compressors.
 */
export function clearCompressors(): void {
  compressorRegistry.clear();
}

// ─── Generic Compressor ─────────────────────────────────────────────

/**
 * Create a generic output compressor. Uses registered compressors for known tools,
 * falls back to JSON-aware truncation.
 */
export function createOutputCompressor(options?: {
  maxLength?: number;
  maxArrayItems?: number;
  maxStringLength?: number;
}): OutputCompressor {
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;
  const maxArrayItems = options?.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS;
  const maxStringLength = options?.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;

  return (toolName: string, output: string, overrideMax?: number) => {
    const limit = overrideMax ?? maxLength;

    // Check registered compressors (exact match, then prefix match)
    const exact = compressorRegistry.get(toolName);
    if (exact) return exact(output, limit);

    for (const [prefix, compressor] of compressorRegistry) {
      if (toolName.startsWith(prefix)) {
        return compressor(output, limit);
      }
    }

    // Already short enough
    if (output.length <= limit) return output;

    // Try JSON-aware compression
    try {
      const parsed = JSON.parse(output);
      const compressed = compressValue(parsed, maxArrayItems, maxStringLength);
      const result = JSON.stringify(compressed, null, 2);
      if (result.length <= limit) return result;
      return result.slice(0, limit) + '\n... (compressed, truncated)';
    } catch {
      // Not JSON — plain text truncation
      return output.slice(0, limit) + '\n... (truncated)';
    }
  };
}

// ─── JSON Compression ───────────────────────────────────────────────

function compressValue(value: unknown, maxArrayItems: number, maxStringLength: number): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (value.length > maxStringLength) {
      return value.slice(0, maxStringLength) + `... (+${value.length - maxStringLength} chars)`;
    }
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    const truncated = value
      .slice(0, maxArrayItems)
      .map((item) => compressValue(item, maxArrayItems, maxStringLength));
    if (value.length > maxArrayItems) {
      truncated.push(`... +${value.length - maxArrayItems} more`);
    }
    return truncated;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = compressValue(val, maxArrayItems, maxStringLength);
    }
    return result;
  }

  return value;
}
