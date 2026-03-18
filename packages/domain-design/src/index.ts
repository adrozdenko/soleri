/**
 * @soleri/domain-design — Design system intelligence domain pack.
 *
 * Registers 3 facades:
 * - design: WCAG contrast, color pairs, token validation, code validation, UX laws, guidance
 * - design_rules: clean code, architecture, variants, API constraints, delivery, defensive design
 * - design_patterns: radius, depth, containers, storybook, testing, shadcn, workflows
 *
 * 45 ops total (8 algorithmic + 36 data-serving + 1 deferred).
 */

import { z } from 'zod';
import type { DomainPack, PackRuntime } from '@soleri/core';
import { resolveToken, listProjectTokens } from '@soleri/core';
import {
  calculateContrastRatio,
  getWCAGLevel,
  isLightColor,
  suggestAccessibleColors,
  COMMON_COLORS,
} from './lib/color-science.js';
import { validateComponentCode } from './lib/code-validator.js';
import { getData } from './lib/data-loader.js';

// ---------------------------------------------------------------------------
// Runtime holder — set via onActivate, used by ops for token resolution
// ---------------------------------------------------------------------------

let packRuntime: PackRuntime | null = null;

// ---------------------------------------------------------------------------
// Design facade ops (20 ops — 8 algorithmic, 11 data-serving, 1 deferred)
// ---------------------------------------------------------------------------

const designOps = [
  // --- Algorithmic ---
  {
    name: 'check_contrast',
    description: 'Check WCAG 2.1 contrast ratio between two colors.',
    auth: 'read' as const,
    schema: z.object({
      foreground: z.string(),
      background: z.string(),
      context: z.enum(['text', 'large-text', 'graphics']).optional().default('text'),
      projectId: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const fgInput = params.foreground as string;
      const bgInput = params.background as string;
      const context = (params.context as string) ?? 'text';
      const projectId = params.projectId as string | undefined;

      // Resolve tokens to hex if runtime + project available
      let fgHex = fgInput;
      let bgHex = bgInput;
      if (packRuntime && projectId) {
        const project = packRuntime.getProject(projectId);
        if (project) {
          try {
            fgHex = resolveToken(fgInput, project);
          } catch {
            /* use raw */
          }
          try {
            bgHex = resolveToken(bgInput, project);
          } catch {
            /* use raw */
          }
        }
      }

      const ratio = calculateContrastRatio(fgHex, bgHex);
      const level = getWCAGLevel(ratio);
      const minRatio = context === 'text' ? 4.5 : 3.0;
      const passes = ratio >= minRatio;

      // Create checkId for tool chaining if passes and runtime available
      let checkId: string | undefined;
      if (passes && packRuntime) {
        try {
          checkId = packRuntime.createCheck('contrast', {
            foreground: fgHex,
            background: bgHex,
            ratio: parseFloat(ratio.toFixed(2)),
            level,
            context,
          });
        } catch {
          /* session store unavailable */
        }
      }

      return {
        foreground: { input: fgInput, resolved: fgHex },
        background: { input: bgInput, resolved: bgHex },
        ratio: parseFloat(ratio.toFixed(2)),
        wcagLevel: level,
        passes: { normalText: ratio >= 4.5, largeText: ratio >= 3.0, graphics: ratio >= 3.0 },
        verdict: passes ? 'PASS' : 'FAIL',
        ...(checkId && { _checkId: checkId, _checkExpires: '30 minutes' }),
      };
    },
  },
  {
    name: 'get_color_pairs',
    description: 'Get accessible foreground color suggestions for a background.',
    auth: 'read' as const,
    schema: z.object({
      background: z.string(),
      minLevel: z.enum(['AA', 'AAA']).optional().default('AA'),
      projectId: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const bgInput = params.background as string;
      const minLevel = (params.minLevel as 'AA' | 'AAA') ?? 'AA';
      const projectId = params.projectId as string | undefined;

      // Resolve background token and get project tokens as candidates
      let bgHex = bgInput;
      let candidates = Object.entries(COMMON_COLORS).map(([name, hex]) => ({ name, hex }));

      if (packRuntime && projectId) {
        const project = packRuntime.getProject(projectId);
        if (project) {
          try {
            bgHex = resolveToken(bgInput, project);
          } catch {
            /* use raw */
          }
          const projectTokens = listProjectTokens(project);
          if (projectTokens.length > 0) {
            candidates = projectTokens.map((t) => ({ name: t.token, hex: t.hex }));
          }
        }
      }

      const accessible = suggestAccessibleColors(bgHex, candidates, minLevel);
      return {
        background: {
          input: bgInput,
          hex: bgHex,
          category: isLightColor(bgHex) ? 'light' : 'dark',
        },
        minLevel,
        validForegrounds: accessible.map((c) => ({
          token: c.name,
          hex: c.hex,
          ratio: c.ratio,
          level: c.level,
          recommended: c.ratio >= 7.0,
        })),
        count: accessible.length,
      };
    },
  },
  {
    name: 'validate_token',
    description: 'Validate a design token name against the token schema.',
    auth: 'read' as const,
    schema: z.object({ token: z.string(), context: z.string().optional() }),
    handler: async (params: Record<string, unknown>) => {
      const token = params.token as string;
      const rules = getData<{ forbidden: Array<string | { pattern: string }>; allowed: string[] }>(
        'tokenRules',
        { forbidden: [], allowed: [] },
      );
      const isForbidden = rules.forbidden.some((entry) => {
        const pattern = typeof entry === 'string' ? entry : entry.pattern;
        try {
          return new RegExp(pattern).test(token);
        } catch {
          return token.includes(pattern);
        }
      });
      if (isForbidden)
        return {
          valid: false,
          token,
          verdict: 'FORBIDDEN',
          reason: 'Violates design system rules',
        };
      const isAllowed = rules.allowed.some((p: string) =>
        new RegExp(p.replace('*', '\\d+')).test(token),
      );
      return { valid: isAllowed, token, verdict: isAllowed ? 'ALLOWED' : 'UNKNOWN' };
    },
  },
  {
    name: 'validate_component_code',
    description:
      'Validate component code for design system compliance. Returns score, grade, and violations.',
    auth: 'read' as const,
    schema: z.object({
      code: z.string(),
      checkType: z.enum(['all', 'tokens', 'spacing', 'typography', 'accessibility']).optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const foundations = getData<{
        validation?: { commonViolations?: unknown[]; accessibilityViolations?: unknown[] };
      }>('designFoundations', {});
      const tokenRules = getData<{ forbidden?: unknown[] }>('tokenRules', {});
      return validateComponentCode(params.code as string, {
        checkType: params.checkType as 'all' | undefined,
        commonViolations: (foundations.validation?.commonViolations ?? []) as never[],
        forbiddenTokens: (tokenRules.forbidden ?? []).map((f: unknown) =>
          typeof f === 'string'
            ? { pattern: f, issue: 'Forbidden token', fix: 'Use semantic tokens' }
            : f,
        ) as never[],
        accessibilityViolations: (foundations.validation?.accessibilityViolations ?? []) as never[],
      });
    },
  },
  {
    name: 'check_button_semantics',
    description: 'Check if a button variant matches its action intent.',
    auth: 'read' as const,
    schema: z.object({ action: z.string(), variant: z.string() }),
    handler: async (params: Record<string, unknown>) => {
      const action = params.action as string;
      const variant = params.variant as string;
      const isDestructive = /delete|remove|destroy|cancel subscription/i.test(action);
      const isSecondary = /cancel|back|close|dismiss/i.test(action);
      const isSave = /save|submit|confirm|update|create/i.test(action);
      const recommended = isDestructive ? 'destructive' : isSecondary ? 'outline' : 'default';
      const correct =
        variant === recommended || (recommended === 'default' && variant === 'primary');
      return {
        action,
        currentVariant: variant,
        recommendedVariant: recommended,
        correct,
        reasoning: isDestructive
          ? 'Destructive actions should use red'
          : isSecondary
            ? 'Secondary actions should be de-emphasized'
            : isSave
              ? 'Primary actions use brand color'
              : 'Default variant for primary actions',
      };
    },
  },
  {
    name: 'check_action_overflow',
    description: 'Check if action count should use buttons or dropdown menu.',
    auth: 'read' as const,
    schema: z.object({ actionCount: z.number(), currentDisplay: z.string() }),
    handler: async (params: Record<string, unknown>) => {
      const count = params.actionCount as number;
      const current = params.currentDisplay as string;
      const recommended = count <= 3 ? 'buttons' : 'menu';
      return {
        actionCount: count,
        currentDisplay: current,
        recommendedDisplay: recommended,
        correct: current === recommended,
        rule: "Hick's Law: Decision time increases with options",
      };
    },
  },
  // --- Data-serving (11 ops) ---
  ...[
    'get_typography_guidance',
    'get_spacing_guidance',
    'get_icon_guidance',
    'get_animation_patterns',
    'get_dark_mode_colors',
    'get_responsive_patterns',
    'get_ux_law',
    'get_guidance',
    'recommend_style',
    'recommend_palette',
    'recommend_typography',
    'recommend_design_system',
    'get_stack_guidelines',
  ].map((name) => ({
    name,
    description: `Get ${name.replace(/^(get_|recommend_)/, '').replace(/_/g, ' ')} from design intelligence.`,
    auth: 'read' as const,
    schema: z.object({
      query: z.string().optional(),
      topic: z.string().optional(),
      limit: z.number().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const key = name.replace(/^get_/, '').replace(/^recommend_/, '');
      const dataKey =
        key === 'typography_guidance'
          ? 'designFoundations'
          : key === 'spacing_guidance'
            ? 'designFoundations'
            : key === 'icon_guidance'
              ? 'designFoundations'
              : key === 'animation_patterns'
                ? 'designFoundations'
                : key === 'dark_mode_colors'
                  ? 'designFoundations'
                  : key === 'responsive_patterns'
                    ? 'designFoundations'
                    : key === 'ux_law'
                      ? 'uxLaws'
                      : key === 'guidance'
                        ? 'guidance'
                        : key === 'style'
                          ? 'designFoundations'
                          : key === 'palette'
                            ? 'colorIntelligence'
                            : key === 'design_system'
                              ? 'designFoundations'
                              : key === 'stack_guidelines'
                                ? 'stackGuidelines'
                                : 'designFoundations';
      const data = getData(dataKey, {});
      return { source: name, data, query: params.query, topic: params.topic };
    },
  })),
  // --- generate_image (LLM-dependent, uses runtime.llmClient if available) ---
  {
    name: 'generate_image',
    description:
      'Generate an image using an LLM image model. Requires a configured LLM API key (Google Gemini or OpenRouter).',
    auth: 'write' as const,
    schema: z.object({
      prompt: z.string(),
      model: z.enum(['flash', 'pro', 'imagen']).optional().default('flash'),
      aspectRatio: z.string().optional(),
      outputPath: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const prompt = params.prompt as string;
      const model = (params.model as string) ?? 'flash';
      const outputPath = params.outputPath as string | undefined;

      // Model name mapping
      const modelMap: Record<string, string> = {
        flash: 'gemini-2.5-flash-preview-image-generation',
        pro: 'gemini-2.5-pro-preview-image-generation',
        imagen: 'imagen-4.0-generate-preview',
      };
      const modelId = modelMap[model] ?? modelMap.flash;

      // Try Google Gemini API via env key
      const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          error:
            'No GOOGLE_API_KEY or GEMINI_API_KEY found in environment. Set one to enable image generation.',
          hint: 'export GOOGLE_API_KEY=your-key',
        };
      }

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
          signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
          const errBody = await response.text();
          return {
            success: false,
            error: `API error ${response.status}: ${errBody.slice(0, 200)}`,
          };
        }

        const data = (await response.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
            };
          }>;
        };

        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const imagePart = parts.find((p) => p.inlineData);
        const textPart = parts.find((p) => p.text);

        if (!imagePart?.inlineData) {
          return { success: false, error: 'No image in response', description: textPart?.text };
        }

        const ext = imagePart.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
        const filePath = outputPath ?? `/tmp/soleri_image_${Date.now()}.${ext}`;

        const { writeFileSync, mkdirSync } = await import('node:fs');
        const { dirname } = await import('node:path');
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, Buffer.from(imagePart.inlineData.data, 'base64'));

        return {
          success: true,
          imagePath: filePath,
          sizeBytes: Buffer.from(imagePart.inlineData.data, 'base64').length,
          model: modelId,
          provider: 'google',
          description: textPart?.text,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Design Rules facade ops (15 ops — all data-serving)
// ---------------------------------------------------------------------------

const designRulesOps = [
  'get_clean_code_rules',
  'get_architecture_patterns',
  'get_variant_philosophy',
  'get_api_constraints',
  'get_stabilization_patterns',
  'get_delivery_workflow',
  'get_ux_writing_rules',
  'get_performance_constraints',
  'get_component_dev_rules',
  'get_defensive_design_rules',
  'get_dialog_pattern_rules',
  'get_component_usage_patterns',
  'get_ui_patterns',
  'get_operational_expertise',
  'get_error_handling_patterns',
].map((name) => {
  const dataKeyMap: Record<string, string> = {
    get_clean_code_rules: 'cleanCodeRules',
    get_architecture_patterns: 'architecturePatterns',
    get_variant_philosophy: 'variantPhilosophy',
    get_api_constraints: 'apiConstraints',
    get_stabilization_patterns: 'stabilizationPatterns',
    get_delivery_workflow: 'deliveryWorkflow',
    get_ux_writing_rules: 'uxWriting',
    get_performance_constraints: 'performanceConstraints',
    get_component_dev_rules: 'componentDevIntelligence',
    get_defensive_design_rules: 'defensiveDesign',
    get_dialog_pattern_rules: 'dialogPatterns',
    get_component_usage_patterns: 'componentUsagePatterns',
    get_ui_patterns: 'uiPatterns',
    get_operational_expertise: 'operationalExpertise',
    get_error_handling_patterns: 'operationalExpertise',
  };
  return {
    name,
    description: `Get ${name.replace(/^get_/, '').replace(/_/g, ' ')}.`,
    auth: 'read' as const,
    schema: z.object({ topic: z.string().optional() }),
    handler: async (params: Record<string, unknown>) => {
      const data = getData(dataKeyMap[name] ?? 'operationalExpertise', {});
      return { source: name, data, topic: params.topic };
    },
  };
});

// ---------------------------------------------------------------------------
// Design Patterns facade ops (10 ops — 1 algorithmic, 9 data-serving)
// ---------------------------------------------------------------------------

const designPatternsOps = [
  {
    name: 'check_container_pattern',
    description: 'Recommend container pattern (Dialog/Sheet/Page/Wizard) based on field count.',
    auth: 'read' as const,
    schema: z.object({
      fieldCount: z.number(),
      currentPattern: z.string(),
      isConfirmation: z.boolean().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const count = params.fieldCount as number;
      const current = params.currentPattern as string;
      const isConfirmation = params.isConfirmation as boolean | undefined;
      let recommended: string;
      let reasoning: string;
      if (isConfirmation) {
        recommended = 'dialog';
        reasoning = 'Confirmations always use Dialog';
      } else if (count <= 3) {
        recommended = 'dialog';
        reasoning = `${count} fields is low complexity`;
      } else if (count <= 7) {
        recommended = 'dialog';
        reasoning = `${count} fields is medium complexity`;
      } else if (count <= 12) {
        recommended = 'page';
        reasoning = `${count} fields exceeds modal cognitive capacity`;
      } else {
        recommended = 'wizard';
        reasoning = `${count} fields needs step-by-step approach`;
      }
      const correct = current === recommended || (count <= 7 && current === 'sheet');
      return {
        fieldCount: count,
        currentPattern: current,
        recommendedPattern: recommended,
        correct,
        reasoning,
      };
    },
  },
  ...[
    'get_radius_guidance',
    'get_depth_layering',
    'get_component_workflow',
    'get_storybook_patterns',
    'get_testing_patterns',
    'get_font_requirements',
    'get_shadcn_components',
  ].map((name) => {
    const dataKeyMap: Record<string, string> = {
      get_radius_guidance: 'designAdvanced',
      get_depth_layering: 'designAdvanced',
      get_component_workflow: 'workflowPatterns',
      get_storybook_patterns: 'workflowPatterns',
      get_testing_patterns: 'workflowPatterns',
      get_font_requirements: 'designFoundations',
      get_shadcn_components: 'shadcnIntelligence',
    };
    return {
      name,
      description: `Get ${name.replace(/^get_/, '').replace(/_/g, ' ')}.`,
      auth: 'read' as const,
      schema: z.object({ topic: z.string().optional(), category: z.string().optional() }),
      handler: async (params: Record<string, unknown>) => {
        const data = getData(dataKeyMap[name] ?? 'designAdvanced', {});
        return { source: name, data, topic: params.topic, category: params.category };
      },
    };
  }),
  // --- Orchestration packs (pure JSON checklists) ---
  {
    name: 'fix',
    description:
      'Generate a structured fix checklist — returns sequential tool steps for diagnosing and fixing a design issue.',
    auth: 'read' as const,
    schema: z.object({
      prompt: z.string(),
      projectPath: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const prompt = params.prompt as string;
      return {
        success: true,
        pack: 'fix',
        message: `Fix pack for: ${prompt}`,
        steps: [
          {
            order: 1,
            tool: 'route_intent',
            description: 'Detect fix intent and select recovery flow',
            suggestedParams: { prompt, intent: 'FIX' },
          },
          {
            order: 2,
            tool: 'get_error_handling_patterns',
            description: 'Get error handling patterns for the fix',
            suggestedParams: { topic: 'recovery' },
          },
          {
            order: 3,
            tool: 'get_defensive_design_rules',
            description: 'Get defensive design rules to prevent regressions',
            suggestedParams: {},
          },
          {
            order: 4,
            tool: 'validate_component_code',
            description: 'Validate the fix against design system rules',
            suggestedParams: {},
          },
        ],
        context: { prompt, intent: 'FIX' },
      };
    },
  },
  {
    name: 'theme',
    description:
      'Generate a structured theming checklist — returns sequential tool steps for creating or auditing a theme.',
    auth: 'read' as const,
    schema: z.object({
      projectPath: z.string().optional(),
      background: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const background = params.background as string | undefined;
      return {
        success: true,
        pack: 'theme',
        message: 'Theme pack — follow these steps to build or audit a theme.',
        steps: [
          {
            order: 1,
            tool: 'get_color_pairs',
            description: 'Get valid color pair recommendations',
            suggestedParams: background ? { background } : {},
          },
          {
            order: 2,
            tool: 'get_dark_mode_colors',
            description: 'Get dark mode color mappings',
            suggestedParams: {},
          },
          {
            order: 3,
            tool: 'check_contrast',
            description: 'Validate contrast ratios meet WCAG',
            suggestedParams: {},
          },
          {
            order: 4,
            tool: 'get_depth_layering',
            description: 'Get depth/elevation guidance for theme',
            suggestedParams: {},
          },
        ],
        context: { background },
      };
    },
  },
];

// ---------------------------------------------------------------------------
// DomainPack manifest
// ---------------------------------------------------------------------------

const pack: DomainPack = {
  name: 'design',
  version: '1.0.0',
  domains: ['design'],
  ops: designOps,
  facades: [
    {
      name: 'design_rules',
      description:
        'Design system rules — clean code, architecture, variants, API constraints, delivery, defensive design.',
      ops: designRulesOps,
    },
    {
      name: 'design_patterns',
      description:
        'Design patterns — radius, depth, containers, storybook, testing, shadcn, workflows.',
      ops: designPatternsOps,
    },
  ],
  knowledge: {
    canonical: './knowledge/canonical',
    curated: './knowledge/curated',
  },
  rules: `## Design System Token Priority

1. Semantic first: \`text-warning\`, \`bg-error\`
2. Contextual second: \`text-primary\`, \`bg-surface\`
3. Primitive last: only when no semantic fit

Forbidden: \`#hex\`, \`rgb()\`, \`bg-blue-500\`
`,
  onActivate: async (narrowedRuntime: PackRuntime) => {
    packRuntime = narrowedRuntime;
  },
};

export default pack;

// Re-export libs for direct use
export {
  calculateContrastRatio,
  getWCAGLevel,
  isLightColor,
  suggestAccessibleColors,
  generateColorScale,
} from './lib/color-science.js';
export { validateComponentCode } from './lib/code-validator.js';
export type { ValidationResult, Violation } from './lib/code-validator.js';
