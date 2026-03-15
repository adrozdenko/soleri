/**
 * TokenResolver — resolves design token names to hex values.
 *
 * Ported from Salvador MCP src/registry/token-resolver.ts.
 * Supports: #HEX passthrough, SCALE[SHADE] (e.g., PRIMARY[500]),
 * Tailwind classes (bg-primary-500), semantic tokens (text-inverse),
 * and named colors (white, black).
 *
 * Stateless — create per-invocation with a ProjectContext.
 */

import type { PackProjectContext } from './pack-runtime.js';

const NAMED_COLORS: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  transparent: '#00000000',
};

/**
 * Resolve a token or color reference to a hex value.
 *
 * @param tokenOrHex - Token name, hex value, or color reference
 * @param project - Project context with color scales and semantic tokens
 * @returns Uppercase hex string (e.g., "#DC0000")
 * @throws If the token cannot be resolved
 */
export function resolveToken(tokenOrHex: string, project: PackProjectContext): string {
  // Passthrough hex values
  if (tokenOrHex.startsWith('#')) {
    return tokenOrHex.toUpperCase();
  }

  // Named colors
  const named = NAMED_COLORS[tokenOrHex.toLowerCase()];
  if (named) return named;

  // Semantic tokens (e.g., "text-inverse", "bg-surface")
  if (project.semanticTokens) {
    const semantic = project.semanticTokens[tokenOrHex];
    if (semantic) return semantic.toUpperCase();
  }

  // SCALE[SHADE] format (e.g., "PRIMARY[500]", "neutral[900]")
  const scaleMatch = tokenOrHex.match(/^(\w+)\[(\d+)\]$/);
  if (scaleMatch) {
    const [, scaleName, shade] = scaleMatch;
    return resolveScale(scaleName.toLowerCase(), shade, project);
  }

  // Tailwind-style: bg-primary-500, text-neutral-700
  const tailwindMatch = tokenOrHex.match(/^(?:bg|text|border|ring|fill|stroke)-(\w+)-(\d+)$/);
  if (tailwindMatch) {
    const [, scaleName, shade] = tailwindMatch;
    return resolveScale(scaleName, shade, project);
  }

  throw new Error(`Cannot resolve token: "${tokenOrHex}"`);
}

function resolveScale(scaleName: string, shade: string, project: PackProjectContext): string {
  if (!project.colors) {
    throw new Error(`Project "${project.name}" has no color scales`);
  }

  const scale = project.colors[scaleName];
  if (!scale) {
    const available = Object.keys(project.colors).join(', ');
    throw new Error(`Unknown color scale "${scaleName}". Available: ${available}`);
  }

  const hex = scale.scale[shade];
  if (!hex) {
    const available = Object.keys(scale.scale).join(', ');
    throw new Error(`Unknown shade "${shade}" in scale "${scaleName}". Available: ${available}`);
  }

  return hex.toUpperCase();
}

/**
 * List all tokens available in a project.
 *
 * @param project - Project context
 * @returns Array of { token, hex, scale } for all scale + semantic tokens
 */
export function listProjectTokens(
  project: PackProjectContext,
): Array<{ token: string; hex: string; scale: string }> {
  const tokens: Array<{ token: string; hex: string; scale: string }> = [];

  // Scale tokens
  if (project.colors) {
    for (const [scaleName, scaleData] of Object.entries(project.colors)) {
      for (const [shade, hex] of Object.entries(scaleData.scale)) {
        tokens.push({
          token: `${scaleName}-${shade}`,
          hex: hex.toUpperCase(),
          scale: scaleName,
        });
      }
    }
  }

  // Semantic tokens
  if (project.semanticTokens) {
    for (const [name, hex] of Object.entries(project.semanticTokens)) {
      tokens.push({ token: name, hex: hex.toUpperCase(), scale: 'semantic' });
    }
  }

  return tokens;
}

/**
 * Build a reverse index: hex → token name.
 * Useful for detecting hardcoded colors.
 */
export function buildReverseIndex(project: PackProjectContext): Map<string, string> {
  const index = new Map<string, string>();
  const tokens = listProjectTokens(project);
  for (const t of tokens) {
    index.set(t.hex.toUpperCase(), t.token);
  }
  return index;
}
