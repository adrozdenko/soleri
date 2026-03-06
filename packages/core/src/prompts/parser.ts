/**
 * Template parser — extract variables and resolve includes.
 */

import type { TemplateVariable } from './types.js';

const VAR_PATTERN = /\{\{(\w+)(?::([^}]*))?\}\}/g;
const INCLUDE_PATTERN = /@include\(([^)]+)\)/g;
const MAX_INCLUDE_DEPTH = 10;

/**
 * Extract unique variables from template content.
 * Supports {{name}} (required) and {{name:default}} (optional with default).
 */
export function parseVariables(content: string): TemplateVariable[] {
  const seen = new Map<string, TemplateVariable>();

  for (const match of content.matchAll(VAR_PATTERN)) {
    const name = match[1];
    const defaultValue = match[2];
    if (!seen.has(name)) {
      seen.set(name, {
        name,
        required: defaultValue === undefined,
        defaultValue,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Resolve @include(partial-name) directives.
 *
 * The loader function receives the partial name and returns its content.
 * Cycle detection prevents infinite recursion.
 */
export function resolveIncludes(
  content: string,
  loader: (name: string) => string,
  _stack: Set<string> = new Set(),
  _depth: number = 0,
): string {
  if (_depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`Include depth exceeded ${MAX_INCLUDE_DEPTH}. Possible circular include.`);
  }

  return content.replace(INCLUDE_PATTERN, (_match, partialName: string) => {
    const trimmed = partialName.trim();
    if (_stack.has(trimmed)) {
      throw new Error(`Circular include detected: ${trimmed} (stack: ${[..._stack].join(' → ')})`);
    }
    const newStack = new Set(_stack);
    newStack.add(trimmed);
    const partialContent = loader(trimmed);
    return resolveIncludes(partialContent, loader, newStack, _depth + 1);
  });
}
