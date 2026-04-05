/**
 * Comprehensive Feature Test Suite
 *
 * Tests EVERY op across all 4 domain packs (design, component, figma, code-review)
 * plus the flow engine. Uses realistic inputs and verifies meaningful output shapes.
 *
 * 70+ tests organized by domain pack and op type.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAgentRuntime,
  createDomainFacades,
  type AgentRuntime,
  type FacadeConfig,
} from '@soleri/core';
import designPack from '../packages/domain-design/src/index.js';
import componentPack, { _clearRegistry } from '../packages/domain-component/src/index.js';
import designQaPack from '../packages/domain-design-qa/src/index.js';
import codeReviewPack from '../packages/domain-code-review/src/index.js';
import { loadAllFlows, buildPlan, detectContext } from '../packages/core/src/flows/index.js';

// Core data/flows kept as a test fixture (excluded from npm publish via package.json files field)
const CORE_FLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'core', 'data', 'flows');

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let runtime: AgentRuntime;
let facades: FacadeConfig[];

function findOp(facadeName: string, opName: string) {
  const facade = facades.find((f) => f.name.includes(facadeName));
  if (!facade)
    throw new Error(
      `Facade "${facadeName}" not found. Available: ${facades.map((f) => f.name).join(', ')}`,
    );
  const op = facade.ops.find((o) => o.name === opName);
  if (!op)
    throw new Error(
      `Op "${opName}" not found in ${facade.name}. Available: ${facade.ops.map((o) => o.name).join(', ')}`,
    );
  return op;
}

beforeAll(() => {
  runtime = createAgentRuntime({ agentId: 'comprehensive-test', vaultPath: ':memory:', flowsDir: CORE_FLOWS_DIR });
  const packs = [designPack, componentPack, designQaPack, codeReviewPack];
  const allDomains = [...new Set(['design', ...packs.flatMap((p) => p.domains)])];
  facades = createDomainFacades(runtime, 'comprehensive-test', allDomains, packs);
});

afterAll(() => {
  runtime.close();
});

// =========================================================================
// DESIGN PACK — Algorithmic Ops
// =========================================================================

describe('Design: check_contrast', () => {
  const cases: Array<{
    label: string;
    fg: string;
    bg: string;
    ctx?: string;
    expectPass: boolean;
    expectLevel: string;
    ratioApprox: number;
  }> = [
    {
      label: 'black on white (max)',
      fg: '#000000',
      bg: '#FFFFFF',
      expectPass: true,
      expectLevel: 'AAA',
      ratioApprox: 21,
    },
    {
      label: 'white on white (min)',
      fg: '#FFFFFF',
      bg: '#FFFFFF',
      expectPass: false,
      expectLevel: 'Fail',
      ratioApprox: 1,
    },
    {
      label: 'AA boundary (#767676)',
      fg: '#767676',
      bg: '#FFFFFF',
      expectPass: true,
      expectLevel: 'AA',
      ratioApprox: 4.54,
    },
    {
      label: 'AAA boundary (#595959)',
      fg: '#595959',
      bg: '#FFFFFF',
      expectPass: true,
      expectLevel: 'AAA',
      ratioApprox: 7.0,
    },
    {
      label: 'red on white',
      fg: '#DC2626',
      bg: '#FFFFFF',
      expectPass: true,
      expectLevel: 'AA',
      ratioApprox: 4.83,
    },
    {
      label: 'white on black',
      fg: '#FFFFFF',
      bg: '#000000',
      expectPass: true,
      expectLevel: 'AAA',
      ratioApprox: 21,
    },
    {
      label: 'blue on white',
      fg: '#1E40AF',
      bg: '#FFFFFF',
      expectPass: true,
      expectLevel: 'AAA',
      ratioApprox: 9.0,
    },
    {
      label: 'light grey on white (fail)',
      fg: '#CCCCCC',
      bg: '#FFFFFF',
      expectPass: false,
      expectLevel: 'Fail',
      ratioApprox: 1.61,
    },
    {
      label: 'dark grey on black (fail)',
      fg: '#333333',
      bg: '#000000',
      expectPass: false,
      expectLevel: 'Fail',
      ratioApprox: 1.79,
    },
    {
      label: 'same color (red)',
      fg: '#FF0000',
      bg: '#FF0000',
      expectPass: false,
      expectLevel: 'Fail',
      ratioApprox: 1,
    },
    {
      label: 'near-threshold fails for normal text',
      fg: '#888888',
      bg: '#FFFFFF',
      expectPass: false,
      ctx: 'text',
      expectLevel: 'AA-large',
      ratioApprox: 3.54,
    },
    {
      label: 'near-threshold passes for large-text context',
      fg: '#888888',
      bg: '#FFFFFF',
      ctx: 'large-text',
      expectPass: true,
      expectLevel: 'AA-large',
      ratioApprox: 3.54,
    },
  ];

  for (const tc of cases) {
    it(tc.label, async () => {
      const op = findOp('design', 'check_contrast');
      const result = (await op.handler({
        foreground: tc.fg,
        background: tc.bg,
        context: tc.ctx ?? 'text',
      })) as {
        ratio: number;
        wcagLevel: string;
        verdict: string;
        passes: { normalText: boolean; largeText: boolean };
        foreground: { input: string; resolved: string };
        background: { input: string; resolved: string };
      };

      expect(result.ratio).toBeCloseTo(tc.ratioApprox, 0);
      expect(result.wcagLevel).toBe(tc.expectLevel);
      expect(result.verdict).toBe(tc.expectPass ? 'PASS' : 'FAIL');
      expect(result.foreground.input).toBe(tc.fg);
      expect(result.background.input).toBe(tc.bg);
    });
  }
});

describe('Design: get_color_pairs', () => {
  it('returns accessible pairs for white background', async () => {
    const op = findOp('design', 'get_color_pairs');
    const result = (await op.handler({ background: '#FFFFFF', minLevel: 'AA' })) as {
      background: { hex: string; category: string };
      validForegrounds: Array<{ ratio: number; level: string; recommended: boolean }>;
      count: number;
    };

    expect(result.background.category).toBe('light');
    expect(result.count).toBeGreaterThan(0);
    // All returned pairs must pass AA (ratio >= 4.5)
    for (const fg of result.validForegrounds) {
      expect(fg.ratio).toBeGreaterThanOrEqual(4.5);
      expect(['AA', 'AAA']).toContain(fg.level);
    }
  });

  it('returns accessible pairs for dark background', async () => {
    const op = findOp('design', 'get_color_pairs');
    const result = (await op.handler({ background: '#1A1A2E', minLevel: 'AA' })) as {
      background: { hex: string; category: string };
      validForegrounds: Array<{ ratio: number; level: string }>;
      count: number;
    };

    expect(result.background.category).toBe('dark');
    expect(result.count).toBeGreaterThan(0);
    for (const fg of result.validForegrounds) {
      expect(fg.ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('AAA filter returns fewer results than AA', async () => {
    const op = findOp('design', 'get_color_pairs');
    const aaResult = (await op.handler({ background: '#FFFFFF', minLevel: 'AA' })) as {
      count: number;
    };
    const aaaResult = (await op.handler({ background: '#FFFFFF', minLevel: 'AAA' })) as {
      count: number;
    };
    expect(aaaResult.count).toBeLessThanOrEqual(aaResult.count);
  });
});

describe('Design: validate_token', () => {
  it('accepts valid semantic token bg-surface', async () => {
    const op = findOp('design', 'validate_token');
    const result = (await op.handler({ token: 'bg-surface' })) as {
      valid: boolean;
      verdict: string;
    };
    // May be ALLOWED or UNKNOWN depending on token rules data; should not be FORBIDDEN
    expect(result.verdict).not.toBe('FORBIDDEN');
  });

  it('rejects forbidden hex color #FF0000', async () => {
    const op = findOp('design', 'validate_token');
    const result = (await op.handler({ token: '#FF0000' })) as { valid: boolean; verdict: string };
    expect(result.valid).toBe(false);
    expect(result.verdict).toBe('FORBIDDEN');
  });

  it('rejects forbidden Tailwind utility bg-blue-500', async () => {
    const op = findOp('design', 'validate_token');
    const result = (await op.handler({ token: 'bg-blue-500' })) as {
      valid: boolean;
      verdict: string;
    };
    expect(result.valid).toBe(false);
    expect(result.verdict).toBe('FORBIDDEN');
  });

  it('rejects rgb() value', async () => {
    const op = findOp('design', 'validate_token');
    const result = (await op.handler({ token: 'rgb(255,0,0)' })) as {
      valid: boolean;
      verdict: string;
    };
    expect(result.valid).toBe(false);
    expect(result.verdict).toBe('FORBIDDEN');
  });

  it('rejects hsl() value', async () => {
    const op = findOp('design', 'validate_token');
    const result = (await op.handler({ token: 'hsl(0,100%,50%)' })) as {
      valid: boolean;
      verdict: string;
    };
    expect(result.valid).toBe(false);
    expect(result.verdict).toBe('FORBIDDEN');
  });

  it('handles unknown tokens gracefully', async () => {
    const op = findOp('design', 'validate_token');
    const result = (await op.handler({ token: 'my-custom-thing' })) as {
      verdict: string;
      token: string;
    };
    expect(result.token).toBe('my-custom-thing');
    expect(['ALLOWED', 'UNKNOWN']).toContain(result.verdict);
  });
});

describe('Design: validate_component_code', () => {
  it('clean code scores 100', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: '<div className="bg-surface text-primary p-4 rounded-lg">Clean</div>',
    })) as { valid: boolean; score: number; grade: string; violations: unknown[] };
    expect(result.valid).toBe(true);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A+');
    expect(result.violations).toHaveLength(0);
  });

  it('detects hex colors', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: '<div style={{color: "#FF0000"}}>Bad</div>',
    })) as { valid: boolean; violations: Array<{ type: string }> };
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('detects arbitrary spacing', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: '<div className="p-[13px] mt-[7rem]">Spacing</div>',
    })) as { valid: boolean; violations: Array<{ type: string }> };
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === 'spacing-violation')).toBe(true);
  });

  it('detects arbitrary font-size', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: '<p className="text-[15px]">Typography</p>',
    })) as { valid: boolean; violations: Array<{ type: string }> };
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === 'typography-violation')).toBe(true);
  });

  it('detects arbitrary font-weight', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: '<p className="font-[450]">Weight</p>',
    })) as { valid: boolean; violations: Array<{ type: string }> };
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === 'typography-violation')).toBe(true);
  });

  it('multiple violations reduce score proportionally', async () => {
    const op = findOp('design', 'validate_component_code');
    const singleResult = (await op.handler({
      code: '<div className="p-[13px]">One</div>',
    })) as { score: number };
    const multiResult = (await op.handler({
      code: '<div className="p-[13px] text-[15px] font-[450] m-[7px]">Many</div>',
    })) as { score: number };
    expect(multiResult.score).toBeLessThan(singleResult.score);
    expect(multiResult.score).toBeGreaterThanOrEqual(0);
  });

  it('JSX with mixed clean and dirty code', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: `
        export function Card() {
          return (
            <div className="bg-surface p-4 rounded-lg">
              <h2 className="text-primary text-lg font-semibold">Title</h2>
              <p className="text-[13px] text-muted">Subtitle with violation</p>
              <button className="bg-primary text-white px-4 py-2">OK</button>
            </div>
          );
        }
      `,
    })) as { valid: boolean; score: number; violations: unknown[] };
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    // Still has some clean code, so score shouldn't be zero
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });
});

describe('Design: check_button_semantics', () => {
  const cases = [
    { action: 'Delete account', variant: 'destructive', expected: 'destructive', correct: true },
    { action: 'Remove item', variant: 'default', expected: 'destructive', correct: false },
    { action: 'Cancel', variant: 'outline', expected: 'outline', correct: true },
    { action: 'Go back', variant: 'default', expected: 'outline', correct: false },
    { action: 'Close', variant: 'outline', expected: 'outline', correct: true },
    { action: 'Save changes', variant: 'default', expected: 'default', correct: true },
    { action: 'Submit form', variant: 'primary', expected: 'default', correct: true },
    { action: 'Confirm order', variant: 'default', expected: 'default', correct: true },
    { action: 'Create project', variant: 'default', expected: 'default', correct: true },
    { action: 'Update profile', variant: 'default', expected: 'default', correct: true },
    { action: 'do something unknown', variant: 'default', expected: 'default', correct: true },
  ];

  for (const tc of cases) {
    it(`"${tc.action}" (${tc.variant}) → ${tc.expected}, correct=${tc.correct}`, async () => {
      const op = findOp('design', 'check_button_semantics');
      const result = (await op.handler({ action: tc.action, variant: tc.variant })) as {
        recommendedVariant: string;
        correct: boolean;
        reasoning: string;
      };
      expect(result.recommendedVariant).toBe(tc.expected);
      expect(result.correct).toBe(tc.correct);
      expect(result.reasoning).toBeTruthy();
    });
  }
});

describe('Design: check_action_overflow', () => {
  it('1 action → buttons', async () => {
    const op = findOp('design', 'check_action_overflow');
    const result = (await op.handler({ actionCount: 1, currentDisplay: 'buttons' })) as {
      recommendedDisplay: string;
      correct: boolean;
      rule: string;
    };
    expect(result.recommendedDisplay).toBe('buttons');
    expect(result.correct).toBe(true);
    expect(result.rule).toContain("Hick's Law");
  });

  it('3 actions → buttons (boundary)', async () => {
    const op = findOp('design', 'check_action_overflow');
    const result = (await op.handler({ actionCount: 3, currentDisplay: 'buttons' })) as {
      recommendedDisplay: string;
      correct: boolean;
    };
    expect(result.recommendedDisplay).toBe('buttons');
    expect(result.correct).toBe(true);
  });

  it('4 actions → menu (overflow)', async () => {
    const op = findOp('design', 'check_action_overflow');
    const result = (await op.handler({ actionCount: 4, currentDisplay: 'buttons' })) as {
      recommendedDisplay: string;
      correct: boolean;
    };
    expect(result.recommendedDisplay).toBe('menu');
    expect(result.correct).toBe(false);
  });

  it('10 actions → menu', async () => {
    const op = findOp('design', 'check_action_overflow');
    const result = (await op.handler({ actionCount: 10, currentDisplay: 'menu' })) as {
      recommendedDisplay: string;
      correct: boolean;
    };
    expect(result.recommendedDisplay).toBe('menu');
    expect(result.correct).toBe(true);
  });
});

describe('Design: generate_image', () => {
  it('gracefully fails without API key', async () => {
    // Save and clear any existing keys
    const savedGoogle = process.env.GOOGLE_API_KEY;
    const savedGemini = process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const op = findOp('design', 'generate_image');
      const result = (await op.handler({ prompt: 'A blue circle' })) as {
        success: boolean;
        error: string;
        hint: string;
      };
      expect(result.success).toBe(false);
      expect(result.error).toContain('GOOGLE_API_KEY');
      expect(result.hint).toBeTruthy();
    } finally {
      // Restore keys
      if (savedGoogle) process.env.GOOGLE_API_KEY = savedGoogle;
      if (savedGemini) process.env.GEMINI_API_KEY = savedGemini;
    }
  });
});

// =========================================================================
// DESIGN PACK — Data-Serving Ops (11 design + 2 recommend_* + 2 stack/system)
// =========================================================================

describe('Design: data-serving ops', () => {
  const dataOps = [
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
  ];

  for (const opName of dataOps) {
    it(`${opName} returns data with correct source`, async () => {
      const op = findOp('design', opName);
      const result = (await op.handler({ query: 'test', topic: 'general' })) as {
        source: string;
        data: unknown;
      };
      expect(result.source).toBe(opName);
      expect(result.data).toBeDefined();
    });
  }
});

// =========================================================================
// DESIGN RULES — 15 data-serving ops
// =========================================================================

describe('Design Rules: all 15 ops return data', () => {
  const ruleOps = [
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
  ];

  for (const opName of ruleOps) {
    it(`${opName} returns non-empty response`, async () => {
      const facade = facades.find((f) => f.name.includes('design_rules'));
      expect(facade).toBeDefined();
      const op = facade!.ops.find((o) => o.name === opName);
      expect(op).toBeDefined();
      const result = (await op!.handler({ topic: 'all' })) as { source: string; data: unknown };
      expect(result.source).toBe(opName);
      expect(result.data).toBeDefined();
    });
  }
});

// =========================================================================
// DESIGN PATTERNS — 10 ops (1 algorithmic + 7 data + 2 orchestration packs)
// =========================================================================

describe('Design Patterns: check_container_pattern', () => {
  it('1 field → dialog', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'check_container_pattern')!;
    const result = (await op.handler({ fieldCount: 1, currentPattern: 'dialog' })) as {
      recommendedPattern: string;
      correct: boolean;
    };
    expect(result.recommendedPattern).toBe('dialog');
    expect(result.correct).toBe(true);
  });

  it('3 fields → dialog', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'check_container_pattern')!;
    const result = (await op.handler({ fieldCount: 3, currentPattern: 'dialog' })) as {
      recommendedPattern: string;
    };
    expect(result.recommendedPattern).toBe('dialog');
  });

  it('5 fields → dialog (sheet also accepted)', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'check_container_pattern')!;
    const dialogResult = (await op.handler({ fieldCount: 5, currentPattern: 'dialog' })) as {
      correct: boolean;
    };
    const sheetResult = (await op.handler({ fieldCount: 5, currentPattern: 'sheet' })) as {
      correct: boolean;
    };
    expect(dialogResult.correct).toBe(true);
    expect(sheetResult.correct).toBe(true);
  });

  it('8 fields → page', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'check_container_pattern')!;
    const result = (await op.handler({ fieldCount: 8, currentPattern: 'dialog' })) as {
      recommendedPattern: string;
      correct: boolean;
      reasoning: string;
    };
    expect(result.recommendedPattern).toBe('page');
    expect(result.correct).toBe(false);
    expect(result.reasoning).toContain('cognitive');
  });

  it('12 fields → page', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'check_container_pattern')!;
    const result = (await op.handler({ fieldCount: 12, currentPattern: 'page' })) as {
      recommendedPattern: string;
      correct: boolean;
    };
    expect(result.recommendedPattern).toBe('page');
    expect(result.correct).toBe(true);
  });

  it('15 fields → wizard', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'check_container_pattern')!;
    const result = (await op.handler({ fieldCount: 15, currentPattern: 'page' })) as {
      recommendedPattern: string;
      correct: boolean;
      reasoning: string;
    };
    expect(result.recommendedPattern).toBe('wizard');
    expect(result.correct).toBe(false);
    expect(result.reasoning).toContain('step-by-step');
  });

  it('confirmation override uses dialog regardless of field count', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'check_container_pattern')!;
    const result = (await op.handler({
      fieldCount: 20,
      currentPattern: 'wizard',
      isConfirmation: true,
    })) as { recommendedPattern: string; reasoning: string };
    expect(result.recommendedPattern).toBe('dialog');
    expect(result.reasoning).toContain('Confirmation');
  });
});

describe('Design Patterns: data-serving ops', () => {
  const patternOps = [
    'get_radius_guidance',
    'get_depth_layering',
    'get_component_workflow',
    'get_storybook_patterns',
    'get_testing_patterns',
    'get_font_requirements',
    'get_shadcn_components',
  ];

  for (const opName of patternOps) {
    it(`${opName} returns data`, async () => {
      const facade = facades.find((f) => f.name.includes('design_patterns'));
      const op = facade!.ops.find((o) => o.name === opName)!;
      const result = (await op.handler({ topic: 'general' })) as { source: string; data: unknown };
      expect(result.source).toBe(opName);
      expect(result.data).toBeDefined();
    });
  }
});

describe('Design Patterns: fix pack', () => {
  it('returns 4-step checklist structure', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'fix')!;
    const result = (await op.handler({ prompt: 'Fix broken button colors' })) as {
      success: boolean;
      pack: string;
      steps: Array<{ order: number; tool: string; description: string }>;
      context: { intent: string };
    };
    expect(result.success).toBe(true);
    expect(result.pack).toBe('fix');
    expect(result.steps).toHaveLength(4);
    expect(result.steps[0].order).toBe(1);
    expect(result.steps[3].order).toBe(4);
    expect(result.context.intent).toBe('FIX');
  });
});

describe('Design Patterns: theme pack', () => {
  it('returns 4-step checklist with background passthrough', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'theme')!;
    const result = (await op.handler({ background: '#1A1A2E' })) as {
      success: boolean;
      pack: string;
      steps: Array<{ order: number; tool: string }>;
      context: { background: string };
    };
    expect(result.success).toBe(true);
    expect(result.pack).toBe('theme');
    expect(result.steps).toHaveLength(4);
    expect(result.context.background).toBe('#1A1A2E');
  });
});

// =========================================================================
// COMPONENT PACK — 7 ops
// =========================================================================

describe('Component: create, search, get, list lifecycle', () => {
  beforeEach(() => {
    _clearRegistry();
  });

  it('create registers a component', async () => {
    const op = findOp('component', 'create');
    const result = (await op.handler({
      name: 'AlertBanner',
      description: 'A dismissible alert banner component',
      props: ['variant', 'message', 'onClose'],
      tags: ['feedback', 'alert'],
      filePath: 'src/components/ui/AlertBanner.tsx',
    })) as { created: boolean; id: string; component: { name: string } };
    expect(result.created).toBe(true);
    expect(result.id).toBe('alertbanner');
    expect(result.component.name).toBe('AlertBanner');
  });

  it('create rejects duplicate', async () => {
    const op = findOp('component', 'create');
    await op.handler({
      name: 'AlertBanner',
      description: 'First',
      props: [],
      tags: [],
    });
    const result = (await op.handler({
      name: 'AlertBanner',
      description: 'Duplicate',
      props: [],
      tags: [],
    })) as { created: boolean; reason: string };
    expect(result.created).toBe(false);
    expect(result.reason).toContain('already exists');
  });

  it('search finds created component', async () => {
    const createOp = findOp('component', 'create');
    await createOp.handler({
      name: 'SearchableCard',
      description: 'A card for search testing',
      props: ['title'],
      tags: ['card', 'test'],
    });

    const searchOp = findOp('component', 'search');
    const result = (await searchOp.handler({ query: 'card' })) as {
      count: number;
      components: Array<{ name: string }>;
    };
    expect(result.count).toBe(1);
    expect(result.components[0].name).toBe('SearchableCard');
  });

  it('get retrieves by ID', async () => {
    const createOp = findOp('component', 'create');
    await createOp.handler({
      name: 'GetTestBtn',
      description: 'A test button',
      props: ['onClick'],
      tags: ['button'],
    });

    const getOp = findOp('component', 'get');
    const result = (await getOp.handler({ id: 'gettestbtn' })) as {
      found: boolean;
      component: { name: string; description: string };
    };
    expect(result.found).toBe(true);
    expect(result.component.name).toBe('GetTestBtn');
  });

  it('get returns not-found for missing ID', async () => {
    const getOp = findOp('component', 'get');
    const result = (await getOp.handler({ id: 'nonexistent' })) as { found: boolean };
    expect(result.found).toBe(false);
  });

  it('list returns all components', async () => {
    const createOp = findOp('component', 'create');
    await createOp.handler({ name: 'CompA', description: 'A', props: [], tags: ['alpha'] });
    await createOp.handler({ name: 'CompB', description: 'B', props: [], tags: ['beta'] });
    await createOp.handler({ name: 'CompC', description: 'C', props: [], tags: ['alpha'] });

    const listOp = findOp('component', 'list');
    const result = (await listOp.handler({})) as {
      count: number;
      total: number;
      components: unknown[];
    };
    expect(result.count).toBe(3);
    expect(result.total).toBe(3);
  });
});

describe('Component: detect_drift', () => {
  beforeEach(() => {
    _clearRegistry();
  });

  it('detects added props', async () => {
    const createOp = findOp('component', 'create');
    await createOp.handler({
      name: 'DriftTest',
      description: 'Original component',
      props: ['title', 'onClick'],
      tags: [],
    });

    const driftOp = findOp('component', 'detect_drift');
    const result = (await driftOp.handler({
      id: 'drifttest',
      code: `
        interface Props {
          title: string;
          onClick: () => void;
          newProp: boolean;
          anotherProp: number;
        }
      `,
    })) as {
      found: boolean;
      drifted: boolean;
      changes: Array<{ field: string; type: string; detail: string }>;
    };
    expect(result.found).toBe(true);
    expect(result.drifted).toBe(true);
    expect(result.changes.some((c) => c.type === 'added' && c.detail.includes('newProp'))).toBe(
      true,
    );
  });

  it('detects removed props', async () => {
    const createOp = findOp('component', 'create');
    await createOp.handler({
      name: 'DriftRemove',
      description: 'Has three props',
      props: ['title', 'onClick', 'variant'],
      tags: [],
    });

    const driftOp = findOp('component', 'detect_drift');
    const result = (await driftOp.handler({
      id: 'driftremove',
      code: `
        interface Props {
          title: string;
        }
      `,
    })) as { drifted: boolean; changes: Array<{ type: string }> };
    expect(result.drifted).toBe(true);
    expect(result.changes.some((c) => c.type === 'removed')).toBe(true);
  });

  it('returns not found for unknown component', async () => {
    const driftOp = findOp('component', 'detect_drift');
    const result = (await driftOp.handler({
      id: 'nonexistent',
      code: 'interface Props { x: number; }',
    })) as { found: boolean; error: string };
    expect(result.found).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('Component: analyze_dependencies', () => {
  it('parses realistic React component imports', async () => {
    const op = findOp('component', 'analyze_dependencies');
    const result = (await op.handler({
      code: `
        import React from 'react';
        import { useRouter } from 'next/router';
        import { Button } from '@/components/ui/button';
        import { cn } from '@/lib/utils';
        import type { CardProps } from './types';
        import { debounce } from 'lodash';
      `,
      componentName: 'DashboardCard',
    })) as {
      componentName: string;
      totalDependencies: number;
      internal: string[];
      external: string[];
      dependencies: string[];
    };

    expect(result.componentName).toBe('DashboardCard');
    expect(result.totalDependencies).toBe(6);
    expect(result.external).toContain('react');
    expect(result.external).toContain('next/router');
    expect(result.external).toContain('lodash');
    expect(result.internal).toContain('@/components/ui/button');
    expect(result.internal).toContain('@/lib/utils');
    expect(result.internal).toContain('./types');
  });
});

describe('Component: sync_status', () => {
  beforeEach(() => {
    _clearRegistry();
  });

  it('reports synced, missing-file, and unregistered correctly', async () => {
    const createOp = findOp('component', 'create');
    await createOp.handler({
      name: 'SyncedComp',
      description: 'Has file',
      props: [],
      tags: [],
      filePath: 'src/components/SyncedComp.tsx',
    });
    await createOp.handler({
      name: 'MissingFileComp',
      description: 'File does not exist in list',
      props: [],
      tags: [],
      filePath: 'src/components/MissingFileComp.tsx',
    });
    await createOp.handler({
      name: 'NoFilePathComp',
      description: 'No file path set',
      props: [],
      tags: [],
    });

    const syncOp = findOp('component', 'sync_status');
    const result = (await syncOp.handler({
      filePaths: ['src/components/SyncedComp.tsx', 'src/components/UnregisteredComp.tsx'],
    })) as {
      total: number;
      synced: number;
      drifted: number;
      missingFile: number;
      missingMetadata: number;
      unregistered: number;
      unregisteredFiles: string[];
    };

    expect(result.total).toBe(3);
    expect(result.synced).toBe(1);
    expect(result.drifted).toBe(0);
    expect(result.missingMetadata).toBe(1); // NoFilePathComp has no filePath → missing-metadata
    expect(result.missingFile).toBe(1); // MissingFileComp not in file list
    expect(result.unregistered).toBe(1);
    expect(result.unregisteredFiles).toContain('src/components/UnregisteredComp.tsx');
  });
});

// =========================================================================
// DESIGN QA PACK — 5 ops
// =========================================================================

describe('Design QA: detect_token_drift', () => {
  it('detects matching, drifted, and unknown tokens', async () => {
    const op = findOp('design_qa', 'detect_token_drift');
    const result = (await op.handler({
      tokens: [
        { name: 'primary', value: '#3B82F6' },
        { name: 'secondary', value: '#FF0000' },
        { name: 'unknown-token', value: '#ABCDEF' },
      ],
      tokenMap: {
        primary: '#3B82F6',
        secondary: '#6366F1',
      },
    })) as {
      total: number;
      matched: { count: number };
      drifted: { count: number; items: Array<{ value: string; tokenValue: string }> };
      unmatched: { count: number };
      healthScore: number;
    };

    expect(result.total).toBe(3);
    expect(result.matched.count).toBe(1);
    expect(result.drifted.count).toBe(1);
    expect(result.drifted.items[0].value).toBe('#FF0000');
    expect(result.drifted.items[0].tokenValue).toBe('#6366F1');
    expect(result.unmatched.count).toBe(1);
    expect(result.healthScore).toBeLessThan(100);
  });

  it('all tokens match → healthScore 100', async () => {
    const op = findOp('design_qa', 'detect_token_drift');
    const result = (await op.handler({
      tokens: [{ name: 'bg-primary', value: '#000' }],
      tokenMap: { 'bg-primary': '#000' },
    })) as { healthScore: number };
    expect(result.healthScore).toBe(100);
  });
});

describe('Design QA: detect_hardcoded_colors', () => {
  it('separates tokenized from hardcoded colors', async () => {
    const op = findOp('design_qa', 'detect_hardcoded_colors');
    const result = (await op.handler({
      colors: ['#3B82F6', '#FF0000', '#6366F1', '#ABCDEF'],
      tokenMap: {
        primary: '#3b82f6',
        accent: '#6366f1',
      },
    })) as {
      total: number;
      tokenized: { count: number; items: Array<{ color: string; tokens: string[] }> };
      hardcoded: { count: number; items: Array<{ color: string }> };
      complianceScore: number;
    };

    expect(result.total).toBe(4);
    expect(result.tokenized.count).toBe(2);
    expect(result.hardcoded.count).toBe(2);
    expect(result.complianceScore).toBe(50);
  });
});

describe('Design QA: sync_components', () => {
  it('identifies matched, missing-in-code, and missing-in-design', async () => {
    const op = findOp('design_qa', 'sync_components');
    const result = (await op.handler({
      designComponents: ['Button', 'Card', 'Modal', 'DesignOnly'],
      codeComponents: ['Button', 'Card', 'Sidebar', 'CodeOnly'],
    })) as {
      matched: { count: number; items: Array<{ designName: string; codeName: string }> };
      missingInCode: { count: number; items: string[] };
      missingInDesign: { count: number; items: string[] };
      syncScore: number;
    };

    expect(result.matched.count).toBe(2); // Button, Card
    expect(result.missingInCode.count).toBe(2); // Modal, DesignOnly
    expect(result.missingInDesign.count).toBe(2); // Sidebar, CodeOnly
    expect(result.syncScore).toBe(50); // 2*2 / (4+4) * 100 = 50
  });
});

describe('Design QA: accessibility_precheck', () => {
  it('batch-checks 5+ color pairs', async () => {
    const op = findOp('design_qa', 'accessibility_precheck');
    const result = (await op.handler({
      colorPairs: [
        { foreground: '#000000', background: '#FFFFFF' }, // 21:1 pass
        { foreground: '#FFFFFF', background: '#000000' }, // 21:1 pass
        { foreground: '#CCCCCC', background: '#DDDDDD' }, // ~1.1:1 fail
        { foreground: '#1E3A5F', background: '#FFFFFF' }, // high pass
        { foreground: '#FF0000', background: '#00FF00' }, // questionable
        { foreground: '#333333', background: '#FFFFFF', context: 'large-text' }, // 3:1 threshold
      ],
    })) as {
      total: number;
      passed: number;
      failed: number;
      results: Array<{ passes: boolean; ratio: number; wcagLevel: string }>;
      allPass: boolean;
    };

    expect(result.total).toBe(6);
    expect(result.results[0].passes).toBe(true);
    expect(result.results[0].ratio).toBeCloseTo(21, 0);
    expect(result.results[2].passes).toBe(false); // CCCCCC on DDDDDD
    expect(result.allPass).toBe(false);
    expect(result.passed).toBeGreaterThan(0);
    expect(result.failed).toBeGreaterThan(0);
  });
});

describe('Design QA: handoff_audit', () => {
  it('audits complete component metadata', async () => {
    const op = findOp('design_qa', 'handoff_audit');
    const result = (await op.handler({
      components: [
        {
          name: 'Button',
          description: 'Primary action button',
          props: ['variant', 'size', 'onClick'],
          variants: ['primary', 'secondary', 'ghost'],
        },
      ],
    })) as {
      total: number;
      averageScore: number;
      grade: string;
      audits: Array<{ name: string; score: number; grade: string; missing: string[] }>;
    };

    expect(result.total).toBe(1);
    expect(result.averageScore).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.audits[0].missing).toHaveLength(0);
  });

  it('detects incomplete metadata', async () => {
    const op = findOp('design_qa', 'handoff_audit');
    const result = (await op.handler({
      components: [
        { name: 'Card' }, // missing everything
        { name: 'Badge', description: 'Status badge' }, // missing props, variants
        { name: 'Modal', description: 'Dialog modal', props: ['open'], variants: ['default'] }, // complete
      ],
    })) as {
      total: number;
      averageScore: number;
      audits: Array<{ name: string; score: number; missing: string[] }>;
    };

    expect(result.total).toBe(3);
    expect(result.audits[0].score).toBe(0); // Card: nothing
    expect(result.audits[0].missing).toContain('description');
    expect(result.audits[0].missing).toContain('props');
    expect(result.audits[0].missing).toContain('variants');
    expect(result.audits[1].score).toBe(33); // Badge: 1/3
    expect(result.audits[2].score).toBe(100); // Modal: 3/3
    expect(result.averageScore).toBeLessThan(100);
  });
});

// =========================================================================
// CODE REVIEW PACK — 8 ops
// =========================================================================

describe('Code Review: review_pr_design', () => {
  it('detects hex colors, !important, inline styles, and missing alt', async () => {
    const op = findOp('code_review', 'review_pr_design');
    const result = (await op.handler({
      files: [
        {
          file: 'src/components/Header.tsx',
          additions: [
            'color: #FF0000;',
            'background: #00FF00 !important;',
            '<div style={{padding: "10px"}}>Inline</div>',
            '<img src="logo.png" />',
          ],
          deletions: [],
        },
        {
          file: 'package.json',
          additions: ['version: "1.0.0"'],
          deletions: [],
        },
      ],
    })) as {
      totalFiles: number;
      designFiles: number;
      issuesFound: number;
      issues: Array<{ issue: string; severity: string }>;
      verdict: string;
    };

    expect(result.totalFiles).toBe(2);
    expect(result.designFiles).toBe(1);
    expect(result.issuesFound).toBeGreaterThanOrEqual(4); // hex x2 + !important + inline + missing alt
    expect(result.issues.some((i) => i.issue.includes('hex'))).toBe(true);
    expect(result.issues.some((i) => i.issue.includes('!important'))).toBe(true);
    expect(result.issues.some((i) => i.issue.includes('Inline style'))).toBe(true);
    expect(result.issues.some((i) => i.issue.includes('alt'))).toBe(true);
    expect(result.verdict).toBe('FAIL');
  });

  it('passes clean design file', async () => {
    const op = findOp('code_review', 'review_pr_design');
    const result = (await op.handler({
      files: [
        {
          file: 'src/components/Button.tsx',
          additions: ['<button className="bg-primary text-white px-4 py-2 rounded">OK</button>'],
          deletions: [],
        },
      ],
    })) as { verdict: string; issuesFound: number };
    expect(result.issuesFound).toBe(0);
    expect(result.verdict).toBe('PASS');
  });
});

describe('Code Review: check_architecture', () => {
  it('detects cross-feature import', async () => {
    const op = findOp('code_review', 'check_architecture');
    const result = (await op.handler({
      imports: [{ fromFile: 'src/features/auth/login.ts', importPath: '../../features/users/api' }],
    })) as { violationsFound: number; violations: Array<{ rule: string }>; verdict: string };
    expect(result.violationsFound).toBe(1);
    expect(result.violations[0].rule).toContain('Cross-feature');
    expect(result.verdict).toBe('FAIL');
  });

  it('detects UI importing data layer', async () => {
    const op = findOp('code_review', 'check_architecture');
    const result = (await op.handler({
      imports: [{ fromFile: 'src/components/UserCard.tsx', importPath: '../../services/user-api' }],
    })) as { violationsFound: number; violations: Array<{ rule: string; severity: string }> };
    expect(result.violationsFound).toBe(1);
    expect(result.violations[0].rule).toContain('data layer');
    expect(result.violations[0].severity).toBe('warning');
  });

  it('detects services importing UI', async () => {
    const op = findOp('code_review', 'check_architecture');
    const result = (await op.handler({
      imports: [{ fromFile: 'src/services/auth.ts', importPath: '../../components/LoginForm' }],
    })) as { violationsFound: number; violations: Array<{ rule: string }> };
    expect(result.violationsFound).toBe(1);
    expect(result.violations[0].rule).toContain('Service layer importing from UI');
  });

  it('passes clean import', async () => {
    const op = findOp('code_review', 'check_architecture');
    const result = (await op.handler({
      imports: [
        { fromFile: 'src/components/Button.tsx', importPath: '@/lib/utils' },
        { fromFile: 'src/features/auth/login.ts', importPath: '../auth/utils' },
      ],
    })) as { violationsFound: number; verdict: string };
    expect(result.violationsFound).toBe(0);
    expect(result.verdict).toBe('PASS');
  });
});

describe('Code Review: search_review_context', () => {
  it('finds results for "hex" query', async () => {
    const op = findOp('code_review', 'search_review_context');
    const result = (await op.handler({ query: 'hex colors' })) as {
      resultsFound: number;
      results: Array<{ id: string; category: string }>;
    };
    expect(result.resultsFound).toBeGreaterThan(0);
    expect(result.results.some((r) => r.id === 'hex-colors')).toBe(true);
  });

  it('finds results for "accessibility" query', async () => {
    const op = findOp('code_review', 'search_review_context');
    const result = (await op.handler({ query: 'accessibility', category: 'accessibility' })) as {
      resultsFound: number;
      results: Array<{ category: string }>;
    };
    expect(result.resultsFound).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.category).toBe('accessibility');
    }
  });

  it('finds results for "architecture" query', async () => {
    const op = findOp('code_review', 'search_review_context');
    const result = (await op.handler({ query: 'cross feature import' })) as {
      resultsFound: number;
    };
    expect(result.resultsFound).toBeGreaterThan(0);
  });
});

describe('Code Review: generate_review_summary', () => {
  it('summarizes mix of errors and warnings', async () => {
    const op = findOp('code_review', 'generate_review_summary');
    const result = (await op.handler({
      issues: [
        { issue: 'Hardcoded hex color #FF0000', severity: 'error', category: 'tokens' },
        { issue: 'Arbitrary spacing p-[13px]', severity: 'warning', category: 'tokens' },
        { issue: 'Missing alt tag on image', severity: 'error', category: 'accessibility' },
        { issue: 'Large bundle size detected', severity: 'info', category: 'performance' },
      ],
    })) as {
      totalIssues: number;
      bySeverity: { error: number; warning: number; info: number };
      byCategory: Record<string, number>;
      verdict: string;
      summary: string;
    };

    expect(result.totalIssues).toBe(4);
    expect(result.bySeverity.error).toBe(2);
    expect(result.bySeverity.warning).toBe(1);
    expect(result.bySeverity.info).toBe(1);
    expect(result.byCategory.tokens).toBe(2);
    expect(result.byCategory.accessibility).toBe(1);
    expect(result.verdict).toBe('CHANGES_REQUESTED');
    expect(result.summary).toContain('2 error');
  });

  it('returns APPROVED for zero issues', async () => {
    const op = findOp('code_review', 'generate_review_summary');
    const result = (await op.handler({ issues: [] })) as { verdict: string; summary: string };
    expect(result.verdict).toBe('APPROVED');
    expect(result.summary).toContain('No issues');
  });

  it('returns REVIEW_WARNINGS for warnings only', async () => {
    const op = findOp('code_review', 'generate_review_summary');
    const result = (await op.handler({
      issues: [{ issue: 'Minor spacing issue', severity: 'warning' }],
    })) as { verdict: string };
    expect(result.verdict).toBe('REVIEW_WARNINGS');
  });
});

describe('Code Review: validate_page_styles', () => {
  it('catches invalid font sizes and spacing', async () => {
    const op = findOp('code_review', 'validate_page_styles');
    const result = (await op.handler({
      elements: [
        {
          element: 'h1',
          styles: { fontSize: '48', lineHeight: '1.5', padding: '16 24' },
        },
        {
          element: 'p',
          styles: { fontSize: '13', padding: '7' },
        },
        {
          element: 'div',
          styles: { color: '#FF0000', background: '#00FF00' },
        },
      ],
    })) as {
      totalElements: number;
      violationsFound: number;
      violations: Array<{ element: string; property: string; severity: string }>;
      verdict: string;
    };

    expect(result.totalElements).toBe(3);
    expect(result.violationsFound).toBeGreaterThan(0);
    // Font size 13 not in scale
    expect(result.violations.some((v) => v.element === 'p' && v.property === 'fontSize')).toBe(
      true,
    );
    // Spacing 7 not in scale
    expect(result.violations.some((v) => v.element === 'p' && v.property === 'padding')).toBe(true);
    // Hardcoded colors
    expect(result.violations.some((v) => v.property === 'color')).toBe(true);
    expect(result.verdict).toBe('FAIL');
  });

  it('passes valid styles', async () => {
    const op = findOp('code_review', 'validate_page_styles');
    const result = (await op.handler({
      elements: [
        { element: 'h1', styles: { fontSize: '36', lineHeight: '1.25', padding: '16 24' } },
        { element: 'p', styles: { fontSize: '16', padding: '8' } },
      ],
    })) as { verdict: string; violationsFound: number };
    expect(result.violationsFound).toBe(0);
    expect(result.verdict).toBe('PASS');
  });
});

describe('Code Review: accessibility_audit', () => {
  it('catches missing labels, bad contrast, and missing roles', async () => {
    const op = findOp('code_review', 'accessibility_audit');
    const result = (await op.handler({
      elements: [
        { tag: 'button' }, // missing aria-label
        { tag: 'input' }, // missing aria-label
        { tag: 'a', ariaLabel: 'Home link' }, // OK
        { tag: 'div', tabIndex: 0 }, // focusable without role
        { tag: 'span', tabIndex: 0, role: 'button', ariaLabel: 'OK' }, // OK
        { tag: 'button', tabIndex: -1, ariaLabel: 'Hidden' }, // removed from tab order
        { tag: 'p', contrastRatio: 2.5 }, // bad contrast
      ],
    })) as {
      totalElements: number;
      issuesFound: number;
      issues: Array<{ tag: string; issue: string; severity: string; wcag: string }>;
      verdict: string;
    };

    expect(result.totalElements).toBe(7);
    expect(result.issuesFound).toBeGreaterThanOrEqual(4);
    expect(result.issues.some((i) => i.tag === 'button' && i.issue.includes('aria-label'))).toBe(
      true,
    );
    expect(result.issues.some((i) => i.tag === 'div' && i.issue.includes('role'))).toBe(true);
    expect(result.issues.some((i) => i.issue.includes('Contrast ratio'))).toBe(true);
    expect(result.issues.some((i) => i.issue.includes('tab order'))).toBe(true);
    expect(result.verdict).toBe('FAIL');
  });
});

describe('Code Review: classify_visual_changes', () => {
  it('classifies cosmetic, structural, and behavioral changes', async () => {
    const op = findOp('code_review', 'classify_visual_changes');
    const result = (await op.handler({
      changes: [
        { element: '.card', property: 'color', before: '#000', after: '#333' },
        { element: '.card', property: 'backgroundColor', before: '#fff', after: '#f5f5f5' },
        { element: '.layout', property: 'display', before: 'block', after: 'flex' },
        { element: '.layout', property: 'gap', before: '0', after: '16px' },
        { element: '.btn', property: 'cursor', before: 'default', after: 'pointer' },
        { element: '.modal', property: 'animation', before: 'none', after: 'fadeIn 0.3s' },
      ],
    })) as {
      totalChanges: number;
      counts: { cosmetic: number; structural: number; behavioral: number };
      changes: Array<{ classification: string }>;
      riskLevel: string;
    };

    expect(result.totalChanges).toBe(6);
    expect(result.counts.cosmetic).toBe(2);
    expect(result.counts.structural).toBe(2);
    expect(result.counts.behavioral).toBe(2);
    expect(result.riskLevel).toBe('high'); // has structural changes
  });

  it('cosmetic-only → low risk', async () => {
    const op = findOp('code_review', 'classify_visual_changes');
    const result = (await op.handler({
      changes: [{ element: '.text', property: 'color', before: '#000', after: '#111' }],
    })) as { riskLevel: string };
    expect(result.riskLevel).toBe('low');
  });

  it('behavioral-only → medium risk', async () => {
    const op = findOp('code_review', 'classify_visual_changes');
    const result = (await op.handler({
      changes: [{ element: '.btn', property: 'cursor', before: 'default', after: 'pointer' }],
    })) as { riskLevel: string };
    expect(result.riskLevel).toBe('medium');
  });
});

describe('Code Review: validate_component_states', () => {
  it('passes with all required states and different styles', async () => {
    const op = findOp('code_review', 'validate_component_states');
    const result = (await op.handler({
      component: 'Button',
      states: [
        { name: 'default', styles: { backgroundColor: '#3B82F6', opacity: '1' } },
        { name: 'hover', styles: { backgroundColor: '#2563EB', opacity: '1' } },
        { name: 'focus', styles: { backgroundColor: '#3B82F6', outline: '2px solid blue' } },
        { name: 'disabled', styles: { backgroundColor: '#9CA3AF', opacity: '0.5' } },
        { name: 'error', styles: { backgroundColor: '#DC2626', opacity: '1' } },
      ],
    })) as {
      component: string;
      missingStates: string[];
      coverage: number;
      verdict: string;
      undifferentiatedStates: string[];
    };
    expect(result.component).toBe('Button');
    expect(result.missingStates).toHaveLength(0);
    expect(result.coverage).toBe(100);
    expect(result.verdict).toBe('PASS');
    expect(result.undifferentiatedStates).toHaveLength(0);
  });

  it('detects missing states', async () => {
    const op = findOp('code_review', 'validate_component_states');
    const result = (await op.handler({
      component: 'Input',
      states: [{ name: 'default' }, { name: 'focus' }],
    })) as { missingStates: string[]; coverage: number; verdict: string };
    expect(result.missingStates).toContain('hover');
    expect(result.missingStates).toContain('disabled');
    expect(result.missingStates).toContain('error');
    expect(result.coverage).toBe(40);
    expect(result.verdict).toBe('FAIL');
  });

  it('detects undifferentiated states (same styles as default)', async () => {
    const op = findOp('code_review', 'validate_component_states');
    const result = (await op.handler({
      component: 'Badge',
      states: [
        { name: 'default', styles: { color: 'black', padding: '4px' } },
        { name: 'hover', styles: { color: 'black', padding: '4px' } },
        { name: 'focus', styles: { color: 'blue', padding: '4px' } },
        { name: 'disabled', styles: { color: 'black', padding: '4px' } },
        { name: 'error', styles: { color: 'red', padding: '4px' } },
      ],
    })) as { undifferentiatedStates: string[]; verdict: string };
    expect(result.undifferentiatedStates).toContain('hover');
    expect(result.undifferentiatedStates).toContain('disabled');
    expect(result.verdict).toBe('FAIL');
  });
});

// =========================================================================
// FLOW ENGINE
// =========================================================================

describe('Flow Engine: loadAllFlows', () => {
  it('loads all 8 flow definitions', () => {
    const flows = loadAllFlows(CORE_FLOWS_DIR);
    expect(flows.length).toBe(8);

    const ids = flows.map((f) => f.id).sort();
    expect(ids).toContain('BUILD-flow');
    expect(ids).toContain('FIX-flow');
    expect(ids).toContain('REVIEW-flow');
    expect(ids).toContain('PLAN-flow');
    expect(ids).toContain('DESIGN-flow');
    expect(ids).toContain('ENHANCE-flow');
    expect(ids).toContain('EXPLORE-flow');
    expect(ids).toContain('DELIVER-flow');
  });

  it('every flow has valid structure', () => {
    const flows = loadAllFlows(CORE_FLOWS_DIR);
    for (const flow of flows) {
      expect(flow.id).toBeTruthy();
      expect(flow.triggers).toBeDefined();
      expect(flow.triggers.modes.length).toBeGreaterThan(0);
      expect(flow.steps.length).toBeGreaterThan(0);
      for (const step of flow.steps) {
        expect(step.id).toBeTruthy();
      }
    }
  });
});

describe('Flow Engine: buildPlan', () => {
  it('BUILD intent produces plan with steps', async () => {
    const plan = await buildPlan(
      'BUILD',
      'test-agent',
      '/tmp/test',
      runtime,
      'Build a card component',
    );
    expect(plan.intent).toBe('BUILD');
    expect(plan.flowId).toBe('BUILD-flow');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.planId).toBeTruthy();
    expect(plan.estimatedTools).toBeGreaterThan(0);
  });

  it('FIX intent includes anti-pattern step', async () => {
    const plan = await buildPlan(
      'FIX',
      'test-agent',
      '/tmp/test',
      runtime,
      'Fix broken button colors',
    );
    expect(plan.intent).toBe('FIX');
    expect(plan.flowId).toBe('FIX-flow');
    expect(
      plan.steps.some(
        (s) => s.id.includes('anti-pattern') || s.name.toLowerCase().includes('anti-pattern'),
      ),
    ).toBe(true);
  });
});

describe('Flow Engine: context detection', () => {
  it('"Build a submit button" → small-component context', () => {
    const contexts = detectContext('Build a submit button', { components: [], actions: [] });
    expect(contexts).toContain('small-component');
  });

  it('"Create a dashboard page" → large-component context', () => {
    const contexts = detectContext('Create a dashboard page', { components: [], actions: [] });
    expect(contexts).toContain('large-component');
  });

  it('"Build a login form with validation" → form-component context', () => {
    const contexts = detectContext('Build a login form with validation', {
      components: [],
      actions: [],
    });
    expect(contexts).toContain('form-component');
  });

  it('"Create a modal dialog" → container-component context', () => {
    const contexts = detectContext('Create a modal dialog', { components: [], actions: [] });
    expect(contexts).toContain('container-component');
  });

  it('"Fix the color tokens" → design-fix context', () => {
    const contexts = detectContext('Fix the color tokens', { components: [], actions: [] });
    expect(contexts).toContain('design-fix');
  });
});
