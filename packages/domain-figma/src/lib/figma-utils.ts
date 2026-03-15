/**
 * Figma intelligence utilities — token normalization, fuzzy matching, WCAG contrast.
 *
 * All functions are pure and algorithmic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Token Name Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a Figma token name to a CSS-friendly format.
 * "Primary/500" → "primary-500"
 * "Neutral / Light / 100" → "neutral-light-100"
 * "Brand.Primary.Main" → "brand-primary-main"
 */
export function normalizeFigmaTokenName(name: string): string {
  return name
    .replace(/\s*[/.]\s*/g, '-') // Replace / and . (with optional whitespace) with -
    .replace(/\s+/g, '-') // Replace remaining whitespace with -
    .replace(/-+/g, '-') // Collapse multiple dashes
    .replace(/^-|-$/g, '') // Trim leading/trailing dashes
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Fuzzy Token Matching
// ---------------------------------------------------------------------------

/**
 * Find the best matching token from a token map for a given Figma name.
 * Returns the matching token key, or null if no match is close enough.
 *
 * Matching strategy:
 * 1. Exact match (normalized)
 * 2. Contains match (normalized figma name is substring of token or vice versa)
 * 3. Levenshtein distance <= 3
 */
export function fuzzyMatchToken(
  figmaName: string,
  tokenMap: Record<string, string>,
): { token: string; value: string; confidence: 'exact' | 'contains' | 'fuzzy' } | null {
  const normalized = normalizeFigmaTokenName(figmaName);
  const entries = Object.entries(tokenMap);

  // 1. Exact match
  for (const [token, value] of entries) {
    if (token.toLowerCase() === normalized) {
      return { token, value, confidence: 'exact' };
    }
  }

  // 2. Contains match
  for (const [token, value] of entries) {
    const tokenLower = token.toLowerCase();
    if (tokenLower.includes(normalized) || normalized.includes(tokenLower)) {
      return { token, value, confidence: 'contains' };
    }
  }

  // 3. Levenshtein fuzzy match
  let bestMatch: { token: string; value: string; distance: number } | null = null;
  for (const [token, value] of entries) {
    const dist = levenshtein(normalized, token.toLowerCase());
    if (dist <= 3 && (bestMatch === null || dist < bestMatch.distance)) {
      bestMatch = { token, value, distance: dist };
    }
  }

  if (bestMatch) {
    return { token: bestMatch.token, value: bestMatch.value, confidence: 'fuzzy' };
  }

  return null;
}

/** Simple Levenshtein distance. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ---------------------------------------------------------------------------
// WCAG Contrast Calculation (inline — no external deps)
// ---------------------------------------------------------------------------

/** Parse a hex color string to [r, g, b] in 0–255. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Get relative luminance per WCAG 2.1 spec. */
export function getLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Calculate WCAG contrast ratio between two hex colors. */
export function getContrastRatio(fg: string, bg: string): number {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Get WCAG level from a contrast ratio. */
export function getWCAGLevel(ratio: number): 'AAA' | 'AA' | 'AA-large' | 'Fail' {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'Fail';
}
