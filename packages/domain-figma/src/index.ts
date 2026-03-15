/**
 * @soleri/domain-figma — Figma design intelligence domain pack.
 *
 * 5 ops for processing pre-extracted Figma data:
 * - detect_token_drift: Compare Figma tokens against a token map
 * - detect_hardcoded_colors: Find hex colors without token mappings
 * - sync_components: Match Figma components with code components
 * - accessibility_precheck: WCAG contrast check on color pairs
 * - handoff_audit: Audit component metadata completeness
 *
 * All ops are algorithmic — they process pre-extracted data, no external API calls.
 */

import { z } from 'zod';
import type { DomainPack } from '@soleri/core';
import type { PackRuntime } from '@soleri/core';
import { listProjectTokens, buildReverseIndex } from '@soleri/core';
import {
  normalizeFigmaTokenName,
  fuzzyMatchToken,
  getContrastRatio,
  getWCAGLevel,
} from './lib/figma-utils.js';

// ---------------------------------------------------------------------------
// Runtime holder — populated via onActivate
// ---------------------------------------------------------------------------

let packRuntime: PackRuntime | null = null;

// ---------------------------------------------------------------------------
// Multi-strategy component matching helpers
// ---------------------------------------------------------------------------

/** Extract words from a component name (split on non-alphanumeric). */
function extractWords(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/** Word overlap coefficient: |intersection| / min(|A|, |B|). */
function wordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  return intersection / Math.min(a.size, b.size);
}

// ---------------------------------------------------------------------------
// Figma facade ops (5 algorithmic ops)
// ---------------------------------------------------------------------------

const figmaOps = [
  {
    name: 'detect_token_drift',
    description:
      'Compare Figma token objects against a token map. Normalizes Figma naming and fuzzy matches. Returns matched/unmatched/drifted lists.',
    auth: 'read' as const,
    schema: z.object({
      figmaTokens: z.array(
        z.object({
          figmaName: z.string(),
          figmaValue: z.string(),
        }),
      ),
      tokenMap: z.record(z.string()).optional(),
      projectId: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const figmaTokens = params.figmaTokens as Array<{ figmaName: string; figmaValue: string }>;

      // Resolve token map: prefer runtime project registry, fall back to param
      let tokenMap: Record<string, string> = (params.tokenMap as Record<string, string>) ?? {};
      if (packRuntime && params.projectId) {
        const project = packRuntime.getProject(params.projectId as string);
        if (project) {
          const projectTokens = listProjectTokens(project);
          const resolved: Record<string, string> = {};
          for (const t of projectTokens) {
            resolved[t.token] = t.hex;
          }
          tokenMap = resolved;
        }
      }

      const matched: Array<{
        figmaName: string;
        figmaValue: string;
        token: string;
        tokenValue: string;
        confidence: string;
      }> = [];
      const drifted: Array<{
        figmaName: string;
        figmaValue: string;
        token: string;
        tokenValue: string;
        confidence: string;
      }> = [];
      const unmatched: Array<{ figmaName: string; figmaValue: string; normalizedName: string }> =
        [];

      for (const ft of figmaTokens) {
        const match = fuzzyMatchToken(ft.figmaName, tokenMap);
        if (!match) {
          unmatched.push({
            figmaName: ft.figmaName,
            figmaValue: ft.figmaValue,
            normalizedName: normalizeFigmaTokenName(ft.figmaName),
          });
        } else if (match.value.toLowerCase() === ft.figmaValue.toLowerCase()) {
          matched.push({
            figmaName: ft.figmaName,
            figmaValue: ft.figmaValue,
            token: match.token,
            tokenValue: match.value,
            confidence: match.confidence,
          });
        } else {
          drifted.push({
            figmaName: ft.figmaName,
            figmaValue: ft.figmaValue,
            token: match.token,
            tokenValue: match.value,
            confidence: match.confidence,
          });
        }
      }

      return {
        total: figmaTokens.length,
        matched: { count: matched.length, items: matched },
        drifted: { count: drifted.length, items: drifted },
        unmatched: { count: unmatched.length, items: unmatched },
        healthScore:
          figmaTokens.length > 0 ? Math.round((matched.length / figmaTokens.length) * 100) : 100,
      };
    },
  },

  {
    name: 'detect_hardcoded_colors',
    description:
      'Take an array of hex colors found in a Figma file and reverse-index against a token map. Returns which colors have tokens and which are hardcoded.',
    auth: 'read' as const,
    schema: z.object({
      colors: z.array(z.string()),
      tokenMap: z.record(z.string()).optional(),
      projectId: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const colors = params.colors as string[];

      // Build reverse index: prefer runtime project registry, fall back to param
      const reverseIndex = new Map<string, string[]>();

      if (packRuntime && params.projectId) {
        const project = packRuntime.getProject(params.projectId as string);
        if (project) {
          const projectReverseIndex = buildReverseIndex(project);
          for (const [hex, token] of projectReverseIndex) {
            const normalized = hex.toLowerCase();
            if (!reverseIndex.has(normalized)) {
              reverseIndex.set(normalized, []);
            }
            reverseIndex.get(normalized)!.push(token);
          }
        }
      }

      // Fall back to flat tokenMap param if no runtime results
      if (reverseIndex.size === 0) {
        const tokenMap = (params.tokenMap as Record<string, string>) ?? {};
        for (const [token, value] of Object.entries(tokenMap)) {
          const normalized = value.toLowerCase();
          if (!reverseIndex.has(normalized)) {
            reverseIndex.set(normalized, []);
          }
          reverseIndex.get(normalized)!.push(token);
        }
      }

      const tokenized: Array<{ color: string; tokens: string[] }> = [];
      const hardcoded: Array<{ color: string }> = [];

      for (const color of colors) {
        const normalized = color.toLowerCase();
        const tokens = reverseIndex.get(normalized);
        if (tokens && tokens.length > 0) {
          tokenized.push({ color, tokens });
        } else {
          hardcoded.push({ color });
        }
      }

      return {
        total: colors.length,
        tokenized: { count: tokenized.length, items: tokenized },
        hardcoded: { count: hardcoded.length, items: hardcoded },
        complianceScore:
          colors.length > 0 ? Math.round((tokenized.length / colors.length) * 100) : 100,
      };
    },
  },

  {
    name: 'sync_components',
    description:
      'Match Figma components against code components by name. Returns sync status: matched, missing-in-code, missing-in-figma.',
    auth: 'read' as const,
    schema: z.object({
      figmaComponents: z.array(z.string()),
      codeComponents: z.array(z.string()),
    }),
    handler: async (params: Record<string, unknown>) => {
      const figmaComponents = params.figmaComponents as string[];
      const codeComponents = params.codeComponents as string[];

      const figmaNormalized = new Map(figmaComponents.map((c) => [c.toLowerCase(), c]));
      const codeNormalized = new Map(codeComponents.map((c) => [c.toLowerCase(), c]));

      const matched: Array<{ figmaName: string; codeName: string; strategy?: string }> = [];
      const missingInCode: string[] = [];
      const missingInFigma: string[] = [];

      // Track which code components have been matched (to avoid double-matching)
      const matchedCodeNorms = new Set<string>();

      for (const [norm, figmaName] of figmaNormalized) {
        // Strategy 1: exact case-insensitive match
        const codeName = codeNormalized.get(norm);
        if (codeName) {
          matched.push(
            packRuntime ? { figmaName, codeName, strategy: 'exact' } : { figmaName, codeName },
          );
          matchedCodeNorms.add(norm);
          continue;
        }

        // Strategies 2 & 3 only when runtime available (multi-strategy mode)
        if (packRuntime) {
          let found = false;

          // Strategy 2: contains substring
          for (const [codeNorm, cName] of codeNormalized) {
            if (matchedCodeNorms.has(codeNorm)) continue;
            if (codeNorm.includes(norm) || norm.includes(codeNorm)) {
              matched.push({ figmaName, codeName: cName, strategy: 'contains' });
              matchedCodeNorms.add(codeNorm);
              found = true;
              break;
            }
          }
          if (found) continue;

          // Strategy 3: word overlap coefficient >= 0.5
          const figmaWords = extractWords(figmaName);
          let bestOverlap = 0;
          let bestCodeName: string | null = null;
          let bestCodeNorm: string | null = null;
          for (const [codeNorm, cName] of codeNormalized) {
            if (matchedCodeNorms.has(codeNorm)) continue;
            const codeWords = extractWords(cName);
            const overlap = wordOverlap(figmaWords, codeWords);
            if (overlap > bestOverlap) {
              bestOverlap = overlap;
              bestCodeName = cName;
              bestCodeNorm = codeNorm;
            }
          }
          if (bestOverlap >= 0.5 && bestCodeName && bestCodeNorm) {
            matched.push({ figmaName, codeName: bestCodeName, strategy: 'word-overlap' });
            matchedCodeNorms.add(bestCodeNorm);
            continue;
          }
        }

        missingInCode.push(figmaName);
      }

      for (const [norm, codeName] of codeNormalized) {
        if (!figmaNormalized.has(norm) && !matchedCodeNorms.has(norm)) {
          missingInFigma.push(codeName);
        }
      }

      return {
        matched: { count: matched.length, items: matched },
        missingInCode: { count: missingInCode.length, items: missingInCode },
        missingInFigma: { count: missingInFigma.length, items: missingInFigma },
        syncScore:
          figmaComponents.length + codeComponents.length > 0
            ? Math.round(
                ((matched.length * 2) / (figmaComponents.length + codeComponents.length)) * 100,
              )
            : 100,
      };
    },
  },

  {
    name: 'accessibility_precheck',
    description:
      'Run WCAG contrast check on an array of foreground/background color pairs. Returns pass/fail per pair.',
    auth: 'read' as const,
    schema: z.object({
      colorPairs: z.array(
        z.object({
          foreground: z.string(),
          background: z.string(),
          context: z.enum(['text', 'large-text', 'graphics']).optional(),
        }),
      ),
    }),
    handler: async (params: Record<string, unknown>) => {
      const colorPairs = params.colorPairs as Array<{
        foreground: string;
        background: string;
        context?: string;
      }>;

      const results = colorPairs.map((pair) => {
        const ratio = getContrastRatio(pair.foreground, pair.background);
        const level = getWCAGLevel(ratio);
        const context = pair.context ?? 'text';
        const minRatio = context === 'text' ? 4.5 : 3.0;
        return {
          foreground: pair.foreground,
          background: pair.background,
          context,
          ratio: parseFloat(ratio.toFixed(2)),
          wcagLevel: level,
          passes: ratio >= minRatio,
        };
      });

      const passCount = results.filter((r) => r.passes).length;

      return {
        total: results.length,
        passed: passCount,
        failed: results.length - passCount,
        results,
        allPass: passCount === results.length,
      };
    },
  },

  {
    name: 'handoff_audit',
    description:
      'Audit component metadata for handoff completeness. When runtime available with figmaTokens, colorPairs, figmaComponents, and codeComponents, returns a composite score (40% token drift, 30% component sync, 30% accessibility). Falls back to doc completeness check.',
    auth: 'read' as const,
    schema: z.object({
      components: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          props: z.array(z.string()).optional(),
          variants: z.array(z.string()).optional(),
        }),
      ),
      projectId: z.string().optional(),
      figmaTokens: z.array(z.object({ figmaName: z.string(), figmaValue: z.string() })).optional(),
      figmaComponents: z.array(z.string()).optional(),
      codeComponents: z.array(z.string()).optional(),
      colorPairs: z
        .array(
          z.object({
            foreground: z.string(),
            background: z.string(),
            context: z.enum(['text', 'large-text', 'graphics']).optional(),
          }),
        )
        .optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const components = params.components as Array<{
        name: string;
        description?: string;
        props?: string[];
        variants?: string[];
      }>;

      // --- Doc completeness (always computed) ---
      const audits = components.map((comp) => {
        const checks = {
          hasDescription: Boolean(comp.description && comp.description.trim().length > 0),
          hasProps: Boolean(comp.props && comp.props.length > 0),
          hasVariants: Boolean(comp.variants && comp.variants.length > 0),
        };
        const checkCount = Object.values(checks).filter(Boolean).length;
        const totalChecks = 3;
        const score = Math.round((checkCount / totalChecks) * 100);

        return {
          name: comp.name,
          checks,
          score,
          grade: score >= 100 ? 'A' : score >= 67 ? 'B' : score >= 34 ? 'C' : 'D',
          missing: [
            ...(!checks.hasDescription ? ['description'] : []),
            ...(!checks.hasProps ? ['props'] : []),
            ...(!checks.hasVariants ? ['variants'] : []),
          ],
        };
      });

      const avgScore =
        components.length > 0
          ? Math.round(audits.reduce((sum, a) => sum + a.score, 0) / audits.length)
          : 100;

      // --- Composite scoring when runtime available ---
      if (packRuntime && params.projectId && params.figmaTokens && params.colorPairs) {
        const project = packRuntime.getProject(params.projectId as string);
        if (project) {
          // Token drift score (weight: 40%)
          const figmaTokens = params.figmaTokens as Array<{
            figmaName: string;
            figmaValue: string;
          }>;
          const projectTokens = listProjectTokens(project);
          const tokenMap: Record<string, string> = {};
          for (const t of projectTokens) {
            tokenMap[t.token] = t.hex;
          }
          let tokenHealthScore = 100;
          if (figmaTokens.length > 0) {
            let matchedCount = 0;
            for (const ft of figmaTokens) {
              const match = fuzzyMatchToken(ft.figmaName, tokenMap);
              if (match && match.value.toLowerCase() === ft.figmaValue.toLowerCase()) {
                matchedCount++;
              }
            }
            tokenHealthScore = Math.round((matchedCount / figmaTokens.length) * 100);
          }

          // Component sync score (weight: 30%)
          const figmaComps = (params.figmaComponents as string[]) ?? [];
          const codeComps = (params.codeComponents as string[]) ?? [];
          let syncScore = 100;
          if (figmaComps.length + codeComps.length > 0) {
            const figmaNorm = new Map(figmaComps.map((c) => [c.toLowerCase(), c]));
            const codeNorm = new Map(codeComps.map((c) => [c.toLowerCase(), c]));
            let syncMatched = 0;
            for (const [norm] of figmaNorm) {
              if (codeNorm.has(norm)) syncMatched++;
            }
            syncScore = Math.round(
              ((syncMatched * 2) / (figmaComps.length + codeComps.length)) * 100,
            );
          }

          // Accessibility score (weight: 30%)
          const colorPairs = params.colorPairs as Array<{
            foreground: string;
            background: string;
            context?: string;
          }>;
          let a11yScore = 100;
          if (colorPairs.length > 0) {
            let passCount = 0;
            for (const pair of colorPairs) {
              const ratio = getContrastRatio(pair.foreground, pair.background);
              const context = pair.context ?? 'text';
              const minRatio = context === 'text' ? 4.5 : 3.0;
              if (ratio >= minRatio) passCount++;
            }
            a11yScore = Math.round((passCount / colorPairs.length) * 100);
          }

          const compositeScore = Math.round(
            tokenHealthScore * 0.4 + syncScore * 0.3 + a11yScore * 0.3,
          );

          return {
            total: audits.length,
            averageScore: avgScore,
            compositeScore,
            grade:
              compositeScore >= 90
                ? 'A'
                : compositeScore >= 70
                  ? 'B'
                  : compositeScore >= 50
                    ? 'C'
                    : 'D',
            breakdown: {
              tokenDrift: { score: tokenHealthScore, weight: 0.4 },
              componentSync: { score: syncScore, weight: 0.3 },
              accessibility: { score: a11yScore, weight: 0.3 },
            },
            audits,
          };
        }
      }

      // --- Fallback: doc completeness only ---
      return {
        total: audits.length,
        averageScore: avgScore,
        grade: avgScore >= 90 ? 'A' : avgScore >= 70 ? 'B' : avgScore >= 50 ? 'C' : 'D',
        audits,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// DomainPack manifest
// ---------------------------------------------------------------------------

const pack: DomainPack = {
  name: 'figma',
  version: '1.0.0',
  domains: ['figma'],
  ops: figmaOps,
  onActivate: async (runtime: unknown) => {
    packRuntime = runtime as PackRuntime;
  },
  rules: `## Figma-to-Code Workflow

1. **Extract** — Pull token data and component lists from Figma (via plugin or API).
2. **Detect drift** — Run \`detect_token_drift\` to find mismatches between Figma tokens and code tokens.
3. **Find hardcoded colors** — Run \`detect_hardcoded_colors\` to identify colors not backed by tokens.
4. **Sync components** — Run \`sync_components\` to find components missing in either Figma or code.
5. **Accessibility precheck** — Run \`accessibility_precheck\` on all color pairs before handoff.
6. **Handoff audit** — Run \`handoff_audit\` to verify component documentation completeness.

All ops process pre-extracted data — no Figma API calls required.
`,
};

export default pack;

// Re-export utilities for direct use
export {
  normalizeFigmaTokenName,
  fuzzyMatchToken,
  parseHex,
  getLuminance,
  getContrastRatio,
  getWCAGLevel,
} from './lib/figma-utils.js';
