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
import {
  normalizeFigmaTokenName,
  fuzzyMatchToken,
  getContrastRatio,
  getWCAGLevel,
} from './lib/figma-utils.js';

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
      tokenMap: z.record(z.string()),
    }),
    handler: async (params: Record<string, unknown>) => {
      const figmaTokens = params.figmaTokens as Array<{ figmaName: string; figmaValue: string }>;
      const tokenMap = params.tokenMap as Record<string, string>;

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
      tokenMap: z.record(z.string()),
    }),
    handler: async (params: Record<string, unknown>) => {
      const colors = params.colors as string[];
      const tokenMap = params.tokenMap as Record<string, string>;

      // Build reverse index: value → token name(s)
      const reverseIndex = new Map<string, string[]>();
      for (const [token, value] of Object.entries(tokenMap)) {
        const normalized = value.toLowerCase();
        if (!reverseIndex.has(normalized)) {
          reverseIndex.set(normalized, []);
        }
        reverseIndex.get(normalized)!.push(token);
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

      const matched: Array<{ figmaName: string; codeName: string }> = [];
      const missingInCode: string[] = [];
      const missingInFigma: string[] = [];

      for (const [norm, figmaName] of figmaNormalized) {
        const codeName = codeNormalized.get(norm);
        if (codeName) {
          matched.push({ figmaName, codeName });
        } else {
          missingInCode.push(figmaName);
        }
      }

      for (const [norm, codeName] of codeNormalized) {
        if (!figmaNormalized.has(norm)) {
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
      'Audit component metadata for handoff completeness. Checks for description, documented props, and listed variants.',
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
    }),
    handler: async (params: Record<string, unknown>) => {
      const components = params.components as Array<{
        name: string;
        description?: string;
        props?: string[];
        variants?: string[];
      }>;

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
