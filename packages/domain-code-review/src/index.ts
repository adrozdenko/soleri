/**
 * @soleri/domain-code-review — Code review intelligence domain pack.
 *
 * Combines GitHub PR review + Playwright validation capabilities into
 * 8 algorithmic ops that process pre-extracted data (no external API calls).
 *
 * GitHub-sourced ops (4): review_pr_design, check_architecture,
 *   search_review_context, generate_review_summary
 *
 * Playwright-sourced ops (4): validate_page_styles, accessibility_audit,
 *   classify_visual_changes, validate_component_states
 */

import { z } from 'zod';
import type { DomainPack } from '@soleri/core';
import type { PackRuntime } from '@soleri/core';
import {
  isDesignFile,
  findHexColors,
  findArbitraryValues,
  checkArchitectureBoundary,
} from './lib/review-utils.js';

// ---------------------------------------------------------------------------
// PackRuntime holder — populated via onActivate
// ---------------------------------------------------------------------------

let packRuntime: PackRuntime | null = null;

// ---------------------------------------------------------------------------
// Inline knowledge base for search_review_context
// ---------------------------------------------------------------------------

const REVIEW_KNOWLEDGE = [
  {
    id: 'hex-colors',
    category: 'tokens',
    pattern: 'Hardcoded hex colors in component code',
    issue: 'Raw hex values bypass the design token system, making themes and dark mode impossible.',
    fix: 'Replace with semantic tokens: bg-surface, text-primary, border-default.',
    severity: 'error' as const,
  },
  {
    id: 'arbitrary-values',
    category: 'tokens',
    pattern: 'Tailwind arbitrary values like p-[13px] or text-[#ff0000]',
    issue: 'Arbitrary values bypass the design scale and create inconsistency.',
    fix: 'Use scale values (p-3, p-4) or extend the Tailwind config.',
    severity: 'warning' as const,
  },
  {
    id: 'cross-feature-imports',
    category: 'architecture',
    pattern: 'Feature module importing from another feature module',
    issue: 'Creates tight coupling between features, making refactoring dangerous.',
    fix: 'Extract shared logic to a shared/ or lib/ directory.',
    severity: 'error' as const,
  },
  {
    id: 'ui-data-coupling',
    category: 'architecture',
    pattern: 'UI component importing directly from data/services layer',
    issue: 'Violates separation of concerns. UI should receive data via props or hooks.',
    fix: 'Use a hook or container component to bridge UI and data layers.',
    severity: 'warning' as const,
  },
  {
    id: 'missing-alt-text',
    category: 'accessibility',
    pattern: 'Images without alt attributes',
    issue: 'Screen readers cannot describe the image to visually impaired users.',
    fix: 'Add descriptive alt text, or alt="" for decorative images.',
    severity: 'error' as const,
  },
  {
    id: 'missing-aria-label',
    category: 'accessibility',
    pattern: 'Interactive elements without accessible names',
    issue: 'Screen readers announce elements without context.',
    fix: 'Add aria-label, aria-labelledby, or visible text content (buttons and links with text do not need aria-label).',
    severity: 'error' as const,
  },
  {
    id: 'low-contrast',
    category: 'accessibility',
    pattern: 'Text with contrast ratio below WCAG AA (4.5:1)',
    issue: 'Users with low vision cannot read the text.',
    fix: 'Increase contrast to at least 4.5:1 for normal text, 3:1 for large text.',
    severity: 'error' as const,
  },
  {
    id: 'missing-focus-styles',
    category: 'accessibility',
    pattern: 'Interactive elements without visible focus indicators',
    issue: 'Keyboard users cannot see which element is focused.',
    fix: 'Add focus-visible styles with a visible ring or outline.',
    severity: 'error' as const,
  },
  {
    id: 'missing-component-states',
    category: 'component-quality',
    pattern: 'Component missing required interaction states',
    issue: 'Incomplete state coverage leads to broken UX in edge cases.',
    fix: 'Implement all required states: default, hover, focus, disabled, error.',
    severity: 'warning' as const,
  },
  {
    id: 'layout-shift',
    category: 'visual-stability',
    pattern: 'Structural layout changes without transition handling',
    issue: 'Abrupt layout shifts feel jarring and can cause misclicks.',
    fix: 'Add transitions for structural changes or use layout animations.',
    severity: 'warning' as const,
  },
];

// ---------------------------------------------------------------------------
// Design system scales for validation
// ---------------------------------------------------------------------------

const FONT_SIZE_SCALE = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96];
const SPACING_SCALE = new Set([
  0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96,
]);
const LINE_HEIGHT_SCALE = [1, 1.25, 1.375, 1.5, 1.625, 1.75, 2];

const REQUIRED_COMPONENT_STATES = ['default', 'hover', 'focus', 'disabled', 'error'];

// ---------------------------------------------------------------------------
// GitHub-sourced ops (4)
// ---------------------------------------------------------------------------

const githubOps = [
  {
    name: 'review_pr_design',
    description:
      'Review a PR diff for design-relevant issues. Takes pre-extracted diff data, filters for design files, checks for token violations.',
    auth: 'read' as const,
    schema: z.object({
      files: z.array(
        z.object({
          file: z.string(),
          additions: z.array(z.string()),
          deletions: z.array(z.string()),
        }),
      ),
    }),
    handler: async (params: Record<string, unknown>) => {
      const files = params.files as Array<{
        file: string;
        additions: string[];
        deletions: string[];
      }>;

      const issues: Array<{
        file: string;
        line: string;
        issue: string;
        severity: 'error' | 'warning';
      }> = [];

      for (const f of files) {
        if (!isDesignFile(f.file)) continue;

        for (const line of f.additions) {
          const hexColors = findHexColors(line);
          for (const hex of hexColors) {
            issues.push({
              file: f.file,
              line,
              issue: `Hardcoded hex color: ${hex}. Use semantic tokens instead.`,
              severity: 'error',
            });
          }

          const arbitrary = findArbitraryValues(line);
          for (const val of arbitrary) {
            issues.push({
              file: f.file,
              line,
              issue: `Arbitrary value: ${val}. Use design scale tokens.`,
              severity: 'warning',
            });
          }

          // Check for !important in CSS
          if (/!important/.test(line)) {
            issues.push({
              file: f.file,
              line,
              issue: `!important detected. Avoid !important — fix specificity instead.`,
              severity: 'warning',
            });
          }

          // Check for inline styles
          if (/style\s*=/.test(line)) {
            issues.push({
              file: f.file,
              line,
              issue: `Inline style attribute detected. Use CSS classes or Tailwind utilities.`,
              severity: 'warning',
            });
          }

          // Check for missing alt on <img
          if (/<img\b(?![^>]*\balt\b)[^>]*>/i.test(line)) {
            issues.push({
              file: f.file,
              line,
              issue: `<img> missing alt attribute. Add alt text for accessibility.`,
              severity: 'error',
            });
          }
        }
      }

      const designFiles = files.filter((f) => isDesignFile(f.file));

      return {
        totalFiles: files.length,
        designFiles: designFiles.length,
        issuesFound: issues.length,
        issues,
        verdict: issues.some((i) => i.severity === 'error')
          ? 'FAIL'
          : issues.length > 0
            ? 'WARN'
            : 'PASS',
      };
    },
  },
  {
    name: 'check_architecture',
    description:
      'Check import statements for architecture boundary violations (cross-feature, UI-data coupling).',
    auth: 'read' as const,
    schema: z.object({
      imports: z.array(
        z.object({
          fromFile: z.string(),
          importPath: z.string(),
        }),
      ),
    }),
    handler: async (params: Record<string, unknown>) => {
      const imports = params.imports as Array<{
        fromFile: string;
        importPath: string;
      }>;

      const violations: Array<{
        fromFile: string;
        importPath: string;
        rule: string;
        severity: 'error' | 'warning';
      }> = [];

      for (const imp of imports) {
        const violation = checkArchitectureBoundary(imp.fromFile, imp.importPath);
        if (violation) {
          violations.push({
            fromFile: imp.fromFile,
            importPath: imp.importPath,
            rule: violation.rule,
            severity: violation.severity,
          });
        }
      }

      return {
        totalImports: imports.length,
        violationsFound: violations.length,
        violations,
        verdict: violations.some((v) => v.severity === 'error')
          ? 'FAIL'
          : violations.length > 0
            ? 'WARN'
            : 'PASS',
      };
    },
  },
  {
    name: 'search_review_context',
    description: 'Search the inline knowledge base for review patterns matching a query.',
    auth: 'read' as const,
    schema: z.object({
      query: z.string(),
      category: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const query = (params.query as string).toLowerCase();
      const category = params.category as string | undefined;

      // Try vault search first when runtime is available
      if (packRuntime) {
        try {
          const vaultResults = packRuntime.vault.search(query, {
            domain: 'code-review',
            limit: 20,
          });
          if (vaultResults.length > 0) {
            const mapped = vaultResults
              .filter((r) => !category || r.entry.domain === category || r.entry.type === category)
              .map((r) => ({
                id: r.entry.id,
                category: r.entry.domain ?? r.entry.type ?? 'unknown',
                pattern: r.entry.title ?? r.entry.id,
                issue: r.entry.description ?? '',
                fix: r.entry.description ?? '',
                severity: (r.entry.severity as 'error' | 'warning') ?? 'warning',
                source: 'vault' as const,
                score: r.score,
              }));
            if (mapped.length > 0) {
              return {
                query,
                category: category ?? 'all',
                resultsFound: mapped.length,
                results: mapped,
                source: 'vault',
              };
            }
          }
        } catch {
          // Vault search failed — fall through to static knowledge base
        }
      }

      // Fallback: static knowledge base
      let results = REVIEW_KNOWLEDGE.filter((entry) => {
        const matchesQuery =
          entry.pattern.toLowerCase().includes(query) ||
          entry.issue.toLowerCase().includes(query) ||
          entry.id.includes(query) ||
          entry.category.includes(query);
        const matchesCategory = !category || entry.category === category;
        return matchesQuery && matchesCategory;
      });

      // If no exact match, do a word-based fuzzy match
      if (results.length === 0) {
        const words = query.split(/\s+/);
        results = REVIEW_KNOWLEDGE.filter((entry) => {
          const text =
            `${entry.pattern} ${entry.issue} ${entry.id} ${entry.category}`.toLowerCase();
          return words.some((w) => text.includes(w));
        });
      }

      return {
        query,
        category: category ?? 'all',
        resultsFound: results.length,
        results,
        source: 'static',
      };
    },
  },
  {
    name: 'generate_review_summary',
    description: 'Generate a structured review summary from an array of issues/violations.',
    auth: 'read' as const,
    schema: z.object({
      issues: z.array(
        z.object({
          issue: z.string(),
          severity: z.enum(['error', 'warning', 'info']),
          category: z.string().optional(),
        }),
      ),
    }),
    handler: async (params: Record<string, unknown>) => {
      const issues = params.issues as Array<{
        issue: string;
        severity: 'error' | 'warning' | 'info';
        category?: string;
      }>;

      const bySeverity = {
        error: issues.filter((i) => i.severity === 'error').length,
        warning: issues.filter((i) => i.severity === 'warning').length,
        info: issues.filter((i) => i.severity === 'info').length,
      };

      const byCategory: Record<string, number> = {};
      for (const issue of issues) {
        const cat = issue.category ?? 'uncategorized';
        byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      }

      const verdict =
        bySeverity.error > 0
          ? 'CHANGES_REQUESTED'
          : bySeverity.warning > 0
            ? 'REVIEW_WARNINGS'
            : 'APPROVED';

      return {
        totalIssues: issues.length,
        bySeverity,
        byCategory,
        verdict,
        summary:
          issues.length === 0
            ? 'No issues found. Code looks good.'
            : `Found ${bySeverity.error} error(s), ${bySeverity.warning} warning(s), ${bySeverity.info} info(s).`,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Playwright-sourced ops (4)
// ---------------------------------------------------------------------------

const playwrightOps = [
  {
    name: 'validate_page_styles',
    description:
      'Validate pre-extracted computed styles against design system scales (font sizes, spacing, colors).',
    auth: 'read' as const,
    schema: z.object({
      elements: z.array(
        z.object({
          element: z.string(),
          styles: z.object({
            fontSize: z.string().optional(),
            lineHeight: z.string().optional(),
            color: z.string().optional(),
            background: z.string().optional(),
            padding: z.string().optional(),
            margin: z.string().optional(),
          }),
        }),
      ),
    }),
    handler: async (params: Record<string, unknown>) => {
      const elements = params.elements as Array<{
        element: string;
        styles: {
          fontSize?: string;
          lineHeight?: string;
          color?: string;
          background?: string;
          padding?: string;
          margin?: string;
        };
      }>;

      const violations: Array<{
        element: string;
        property: string;
        value: string;
        issue: string;
        severity: 'error' | 'warning';
      }> = [];

      for (const el of elements) {
        const { styles } = el;

        // Check font size against scale
        if (styles.fontSize) {
          const size = parseFloat(styles.fontSize);
          if (!isNaN(size) && !FONT_SIZE_SCALE.includes(size)) {
            violations.push({
              element: el.element,
              property: 'fontSize',
              value: styles.fontSize,
              issue: `Font size ${size}px not in design scale: [${FONT_SIZE_SCALE.join(', ')}]`,
              severity: 'warning',
            });
          }
        }

        // Check line height
        if (styles.lineHeight) {
          const lh = parseFloat(styles.lineHeight);
          if (!isNaN(lh) && !LINE_HEIGHT_SCALE.includes(lh)) {
            // Only flag if it looks like a unitless value (not px)
            if (!styles.lineHeight.includes('px')) {
              violations.push({
                element: el.element,
                property: 'lineHeight',
                value: styles.lineHeight,
                issue: `Line height ${lh} not in design scale: [${LINE_HEIGHT_SCALE.join(', ')}]`,
                severity: 'warning',
              });
            }
          }
        }

        // Check for hardcoded colors
        if (styles.color) {
          const hexColors = findHexColors(styles.color);
          if (hexColors.length > 0) {
            violations.push({
              element: el.element,
              property: 'color',
              value: styles.color,
              issue: `Hardcoded color value. Use design tokens.`,
              severity: 'error',
            });
          }
        }

        if (styles.background) {
          const hexColors = findHexColors(styles.background);
          if (hexColors.length > 0) {
            violations.push({
              element: el.element,
              property: 'background',
              value: styles.background,
              issue: `Hardcoded background color. Use design tokens.`,
              severity: 'error',
            });
          }
        }

        // Check spacing values against scale
        for (const prop of ['padding', 'margin'] as const) {
          if (styles[prop]) {
            const values = styles[prop]!.split(/\s+/)
              .map((v) => parseFloat(v))
              .filter((v) => !isNaN(v));
            for (const val of values) {
              if (!SPACING_SCALE.has(val)) {
                violations.push({
                  element: el.element,
                  property: prop,
                  value: styles[prop]!,
                  issue: `Spacing value ${val}px not in design scale`,
                  severity: 'warning',
                });
              }
            }
          }
        }
      }

      return {
        totalElements: elements.length,
        violationsFound: violations.length,
        violations,
        verdict: violations.some((v) => v.severity === 'error')
          ? 'FAIL'
          : violations.length > 0
            ? 'WARN'
            : 'PASS',
      };
    },
  },
  {
    name: 'accessibility_audit',
    description:
      'Audit pre-extracted accessibility data for issues (missing labels, bad contrast, missing roles).',
    auth: 'read' as const,
    schema: z.object({
      elements: z.array(
        z.object({
          tag: z.string(),
          role: z.string().optional(),
          ariaLabel: z.string().optional(),
          textContent: z.string().optional(),
          tabIndex: z.number().optional(),
          contrastRatio: z.number().optional(),
        }),
      ),
    }),
    handler: async (params: Record<string, unknown>) => {
      const elements = params.elements as Array<{
        tag: string;
        role?: string;
        ariaLabel?: string;
        textContent?: string;
        tabIndex?: number;
        contrastRatio?: number;
      }>;

      const issues: Array<{
        tag: string;
        issue: string;
        severity: 'error' | 'warning';
        wcag: string;
      }> = [];

      const interactiveTags = new Set(['button', 'a', 'input', 'select', 'textarea']);
      const needsRoleTags = new Set(['div', 'span']);

      for (const el of elements) {
        // Missing aria-label on interactive elements
        if (interactiveTags.has(el.tag) && !el.ariaLabel && !el.textContent) {
          issues.push({
            tag: el.tag,
            issue: `Interactive <${el.tag}> missing aria-label`,
            severity: 'error',
            wcag: '4.1.2 Name, Role, Value',
          });
        }

        // Bad contrast ratio
        if (el.contrastRatio !== undefined && el.contrastRatio < 4.5) {
          issues.push({
            tag: el.tag,
            issue: `Contrast ratio ${el.contrastRatio.toFixed(2)} below WCAG AA minimum (4.5:1)`,
            severity: 'error',
            wcag: '1.4.3 Contrast (Minimum)',
          });
        }

        // Interactive div/span without role
        if (
          needsRoleTags.has(el.tag) &&
          el.tabIndex !== undefined &&
          el.tabIndex >= 0 &&
          !el.role
        ) {
          issues.push({
            tag: el.tag,
            issue: `Focusable <${el.tag}> without explicit role`,
            severity: 'warning',
            wcag: '4.1.2 Name, Role, Value',
          });
        }

        // Negative tabIndex on interactive elements (removes from tab order)
        if (interactiveTags.has(el.tag) && el.tabIndex !== undefined && el.tabIndex < 0) {
          issues.push({
            tag: el.tag,
            issue: `Interactive <${el.tag}> removed from tab order (tabIndex=${el.tabIndex})`,
            severity: 'warning',
            wcag: '2.1.1 Keyboard',
          });
        }
      }

      return {
        totalElements: elements.length,
        issuesFound: issues.length,
        issues,
        verdict: issues.some((i) => i.severity === 'error')
          ? 'FAIL'
          : issues.length > 0
            ? 'WARN'
            : 'PASS',
      };
    },
  },
  {
    name: 'classify_visual_changes',
    description:
      'Classify before/after style snapshots into cosmetic, structural, or behavioral changes.',
    auth: 'read' as const,
    schema: z.object({
      changes: z.array(
        z.object({
          element: z.string(),
          property: z.string(),
          before: z.string(),
          after: z.string(),
        }),
      ),
    }),
    handler: async (params: Record<string, unknown>) => {
      const changes = params.changes as Array<{
        element: string;
        property: string;
        before: string;
        after: string;
      }>;

      const cosmeticProps = new Set([
        'color',
        'background',
        'background-color',
        'backgroundColor',
        'border-color',
        'borderColor',
        'opacity',
        'font-size',
        'fontSize',
        'font-weight',
        'fontWeight',
        'line-height',
        'lineHeight',
        'letter-spacing',
        'letterSpacing',
        'text-decoration',
        'textDecoration',
        'box-shadow',
        'boxShadow',
        'border-radius',
        'borderRadius',
      ]);

      const structuralProps = new Set([
        'display',
        'position',
        'width',
        'height',
        'min-width',
        'minWidth',
        'max-width',
        'maxWidth',
        'min-height',
        'minHeight',
        'max-height',
        'maxHeight',
        'flex',
        'flex-direction',
        'flexDirection',
        'grid',
        'gap',
        'padding',
        'margin',
        'top',
        'right',
        'bottom',
        'left',
        'overflow',
        'z-index',
        'zIndex',
      ]);

      const behavioralProps = new Set([
        'cursor',
        'pointer-events',
        'pointerEvents',
        'transition',
        'animation',
        'transform',
        'visibility',
        'user-select',
        'userSelect',
      ]);

      const classified = changes.map((change) => {
        let classification: 'cosmetic' | 'structural' | 'behavioral';
        if (behavioralProps.has(change.property)) {
          classification = 'behavioral';
        } else if (structuralProps.has(change.property)) {
          classification = 'structural';
        } else if (cosmeticProps.has(change.property)) {
          classification = 'cosmetic';
        } else {
          // Default: if it affects sizing/position, structural; otherwise cosmetic
          classification = 'cosmetic';
        }
        return { ...change, classification };
      });

      const counts = {
        cosmetic: classified.filter((c) => c.classification === 'cosmetic').length,
        structural: classified.filter((c) => c.classification === 'structural').length,
        behavioral: classified.filter((c) => c.classification === 'behavioral').length,
      };

      return {
        totalChanges: changes.length,
        counts,
        changes: classified,
        riskLevel: counts.structural > 0 ? 'high' : counts.behavioral > 0 ? 'medium' : 'low',
      };
    },
  },
  {
    name: 'validate_component_states',
    description:
      'Validate that a component implements all required interaction states (default, hover, focus, disabled, error).',
    auth: 'read' as const,
    schema: z.object({
      component: z.string().optional(),
      states: z.array(
        z.object({
          name: z.string(),
          styles: z.record(z.string()).optional(),
          interactive: z.boolean().optional(),
        }),
      ),
    }),
    handler: async (params: Record<string, unknown>) => {
      const component = (params.component as string) ?? 'unknown';
      const states = params.states as Array<{
        name: string;
        styles?: Record<string, string>;
        interactive?: boolean;
      }>;

      const presentStates = new Set(states.map((s) => s.name.toLowerCase()));
      const missingStates = REQUIRED_COMPONENT_STATES.filter((s) => !presentStates.has(s));

      const extraStates = states
        .map((s) => s.name.toLowerCase())
        .filter((s) => !REQUIRED_COMPONENT_STATES.includes(s));

      const coverage =
        ((REQUIRED_COMPONENT_STATES.length - missingStates.length) /
          REQUIRED_COMPONENT_STATES.length) *
        100;

      // Style-aware validation: check that non-default states differ from default
      const defaultState = states.find((s) => s.name.toLowerCase() === 'default');
      const defaultStyles = defaultState?.styles ?? {};
      const undifferentiatedStates: string[] = [];

      for (const state of states) {
        const name = state.name.toLowerCase();
        if (name === 'default') continue;
        if (!REQUIRED_COMPONENT_STATES.includes(name)) continue;

        // If both have styles defined, check for at least one difference
        if (
          state.styles &&
          Object.keys(state.styles).length > 0 &&
          Object.keys(defaultStyles).length > 0
        ) {
          const hasDifference = Object.keys(state.styles).some(
            (key) => state.styles![key] !== defaultStyles[key],
          );
          if (!hasDifference) {
            undifferentiatedStates.push(name);
          }
        }
      }

      const hasStyleIssues = undifferentiatedStates.length > 0;

      return {
        component,
        requiredStates: REQUIRED_COMPONENT_STATES,
        presentStates: [...presentStates],
        missingStates,
        extraStates,
        undifferentiatedStates,
        coverage: Math.round(coverage),
        verdict: missingStates.length === 0 && !hasStyleIssues ? 'PASS' : 'FAIL',
      };
    },
  },
];

// ---------------------------------------------------------------------------
// DomainPack manifest
// ---------------------------------------------------------------------------

const pack: DomainPack = {
  name: 'code-review',
  version: '1.0.0',
  tier: 'default',
  domains: ['code-review'],
  ops: [...githubOps, ...playwrightOps],
  onActivate: async (narrowedRuntime: PackRuntime) => {
    packRuntime = narrowedRuntime;
  },
  rules: `## Code Review Workflow

1. **Design Token Compliance** — No hardcoded hex colors or arbitrary Tailwind values in design files.
2. **Architecture Boundaries** — Features must not import from other features. UI layer must not import from data layer directly.
3. **Accessibility** — All interactive elements need aria-labels. Contrast ratio must meet WCAG AA (4.5:1).
4. **Component States** — Every interactive component must implement: default, hover, focus, disabled, error.
5. **Visual Changes** — Structural layout changes require extra review. Cosmetic-only changes are low risk.
`,
};

export default pack;

// Re-export utils for direct use
export {
  isDesignFile,
  findHexColors,
  findArbitraryValues,
  checkArchitectureBoundary,
} from './lib/review-utils.js';
