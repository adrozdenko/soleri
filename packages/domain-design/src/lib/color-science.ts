/**
 * Color science — WCAG 2.1 contrast calculation and accessible color suggestions.
 *
 * Ported from Salvador MCP src/color/contrast.ts with improvements:
 * - Simplified API (no session store dependency)
 * - Pure functions (no side effects)
 * - Type-safe with strict null checks
 */

import { parse, rgb, oklch, formatHex, clampChroma } from 'culori';

// ---------------------------------------------------------------------------
// WCAG 2.1 Contrast
// ---------------------------------------------------------------------------

/**
 * Calculate relative luminance of a color per WCAG 2.1.
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function getRelativeLuminance(hex: string): number {
  const color = parse(hex);
  if (!color) throw new Error(`Cannot parse color: "${hex}"`);
  const rgbColor = rgb(color);

  const r = rgbColor.r ?? 0;
  const g = rgbColor.g ?? 0;
  const b = rgbColor.b ?? 0;

  // Gamma correction
  const [rL, gL, bL] = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );

  // ITU-R BT.709 coefficients
  return 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
}

/**
 * Calculate WCAG contrast ratio between two colors.
 * @returns Contrast ratio from 1:1 to 21:1
 */
export function calculateContrastRatio(foreground: string, background: string): number {
  const l1 = getRelativeLuminance(foreground);
  const l2 = getRelativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG conformance levels */
export type WCAGLevel = 'AAA' | 'AA' | 'AA-large' | 'Fail';

/**
 * Get WCAG conformance level from contrast ratio.
 */
export function getWCAGLevel(ratio: number): WCAGLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'Fail';
}

/**
 * Check if a color is "light" (luminance > 0.5).
 */
export function isLightColor(hex: string): boolean {
  return getRelativeLuminance(hex) > 0.5;
}

// ---------------------------------------------------------------------------
// Accessible Color Suggestions
// ---------------------------------------------------------------------------

export interface ColorCandidate {
  name: string;
  hex: string;
}

export interface AccessibleColor {
  name: string;
  hex: string;
  ratio: number;
  level: WCAGLevel;
}

/** Common neutral colors for fallback suggestions. */
export const COMMON_COLORS: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  'neutral-50': '#F9FAFB',
  'neutral-100': '#F3F4F6',
  'neutral-200': '#E5E7EB',
  'neutral-300': '#D1D5DB',
  'neutral-500': '#6B7280',
  'neutral-700': '#374151',
  'neutral-900': '#111827',
};

/**
 * Suggest accessible foreground colors for a given background.
 */
export function suggestAccessibleColors(
  background: string,
  candidates: ColorCandidate[],
  minLevel: 'AA' | 'AAA' = 'AA',
): AccessibleColor[] {
  const minRatio = minLevel === 'AAA' ? 7 : 4.5;
  const results: AccessibleColor[] = [];

  for (const candidate of candidates) {
    try {
      const ratio = calculateContrastRatio(candidate.hex, background);
      if (ratio >= minRatio) {
        results.push({
          name: candidate.name,
          hex: candidate.hex,
          ratio: parseFloat(ratio.toFixed(2)),
          level: getWCAGLevel(ratio),
        });
      }
    } catch {
      // Skip unparseable colors
    }
  }

  return results.sort((a, b) => b.ratio - a.ratio);
}

// ---------------------------------------------------------------------------
// Color Scale Generation (OKLCH)
// ---------------------------------------------------------------------------

const SHADE_LIGHTNESS: Record<string, number> = {
  '50': 0.97,
  '100': 0.94,
  '200': 0.88,
  '300': 0.8,
  '400': 0.65,
  '500': 0.55,
  '600': 0.45,
  '700': 0.35,
  '800': 0.25,
  '900': 0.15,
};

/**
 * Generate a 10-shade color scale from a base hex color using OKLCH.
 */
export function generateColorScale(baseHex: string): Record<string, string> {
  const color = parse(baseHex);
  if (!color) throw new Error(`Cannot parse color: "${baseHex}"`);
  const oklchColor = oklch(color);

  const scale: Record<string, string> = {};
  for (const [shade, lightness] of Object.entries(SHADE_LIGHTNESS)) {
    const adjusted = { ...oklchColor, l: lightness };
    const clamped = clampChroma(adjusted, 'oklch');
    scale[shade] = formatHex(clamped);
  }
  return scale;
}

/**
 * Generate a harmonious color by rotating hue in OKLCH space.
 */
export function generateHarmoniousColor(baseHex: string, rotation: number): string {
  const color = parse(baseHex);
  if (!color) throw new Error(`Cannot parse color: "${baseHex}"`);
  const oklchColor = oklch(color);
  const newHue = ((oklchColor.h ?? 0) + rotation) % 360;
  const rotated = { ...oklchColor, h: newHue };
  const clamped = clampChroma(rotated, 'oklch');
  return formatHex(clamped);
}
