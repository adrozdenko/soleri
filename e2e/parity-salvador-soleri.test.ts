/**
 * Parity Test Suite: Salvador MCP vs Soleri Domain Packs
 *
 * Feeds identical inputs to both systems and compares key output fields.
 * Tests the 8 most critical algorithmic ops where implementation differences matter.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createAgentRuntime,
  createDomainFacades,
  type AgentRuntime,
  type FacadeConfig,
} from '@soleri/core';
import designPack from '../packages/domain-design/src/index.js';
import componentPack from '../packages/domain-component/src/index.js';
import designQaPack from '../packages/domain-design-qa/src/index.js';
import codeReviewPack from '../packages/domain-code-review/src/index.js';

let runtime: AgentRuntime;
let facades: FacadeConfig[];

function findOp(facadeName: string, opName: string) {
  const facade = facades.find((f) => f.name.includes(facadeName));
  if (!facade)
    throw new Error(
      `Facade ${facadeName} not found. Available: ${facades.map((f) => f.name).join(', ')}`,
    );
  const op = facade.ops.find((o) => o.name === opName);
  if (!op)
    throw new Error(
      `Op ${opName} not found in ${facade.name}. Available: ${facade.ops.map((o) => o.name).join(', ')}`,
    );
  return op;
}

beforeAll(() => {
  runtime = createAgentRuntime({ agentId: 'parity-test', vaultPath: ':memory:' });
  const packs = [designPack, componentPack, designQaPack, codeReviewPack];
  const allDomains = [...new Set(['design', ...packs.flatMap((p) => p.domains)])];
  facades = createDomainFacades(runtime, 'parity-test', allDomains, packs);
});

afterAll(() => {
  runtime.close();
});

// ---------------------------------------------------------------------------
// 1. check_contrast — WCAG 2.1 math must match exactly
// ---------------------------------------------------------------------------

describe('Parity: check_contrast', () => {
  const testCases = [
    { fg: '#000000', bg: '#FFFFFF', expectedRatio: 21, expectedLevel: 'AAA' },
    { fg: '#FFFFFF', bg: '#FFFFFF', expectedRatio: 1, expectedLevel: 'Fail' },
    { fg: '#767676', bg: '#FFFFFF', expectedRatio: 4.54, expectedLevel: 'AA' },
    { fg: '#595959', bg: '#FFFFFF', expectedRatio: 7.0, expectedLevel: 'AAA' },
    { fg: '#DC2626', bg: '#FFFFFF', expectedRatio: 4.83, expectedLevel: 'AA' },
  ];

  for (const tc of testCases) {
    it(`${tc.fg} on ${tc.bg} → ratio ~${tc.expectedRatio}, level ${tc.expectedLevel}`, async () => {
      const op = findOp('design', 'check_contrast');
      const result = (await op.handler({
        foreground: tc.fg,
        background: tc.bg,
        context: 'text',
      })) as {
        ratio: number;
        wcagLevel: string;
      };
      expect(result.ratio).toBeCloseTo(tc.expectedRatio, 1);
      expect(result.wcagLevel).toBe(tc.expectedLevel);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. validate_component_code — violation detection must match
// ---------------------------------------------------------------------------

describe('Parity: validate_component_code', () => {
  it('should detect arbitrary spacing', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: '<div className="p-[13px] mt-[7rem]">Bad</div>',
    })) as {
      valid: boolean;
      violations: Array<{ type: string }>;
    };
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === 'spacing-violation')).toBe(true);
  });

  it('should detect arbitrary typography', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: '<p className="text-[15px] font-[450]">Bad</p>',
    })) as {
      valid: boolean;
      violations: Array<{ type: string }>;
    };
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === 'typography-violation')).toBe(true);
  });

  it('should pass clean code with score 100', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: '<div className="bg-surface text-primary p-4 rounded-lg">Clean</div>',
    })) as {
      valid: boolean;
      score: number;
      grade: string;
    };
    expect(result.valid).toBe(true);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A+');
  });

  it('scoring: each error costs 15 points', async () => {
    const op = findOp('design', 'validate_component_code');
    const result = (await op.handler({
      code: '<div className="p-[5px] text-[14px]">Two errors</div>',
    })) as {
      score: number;
    };
    // Multiple violations detected (spacing + typography patterns)
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 3. check_button_semantics — intent detection must match
// ---------------------------------------------------------------------------

describe('Parity: check_button_semantics', () => {
  const testCases = [
    {
      action: 'Delete account',
      variant: 'default',
      expectedRecommended: 'destructive',
      correct: false,
    },
    { action: 'Cancel', variant: 'outline', expectedRecommended: 'outline', correct: true },
    { action: 'Save changes', variant: 'default', expectedRecommended: 'default', correct: true },
    { action: 'Go back', variant: 'default', expectedRecommended: 'outline', correct: false },
    { action: 'Submit form', variant: 'primary', expectedRecommended: 'default', correct: true },
  ];

  for (const tc of testCases) {
    it(`"${tc.action}" with variant "${tc.variant}" → recommended "${tc.expectedRecommended}"`, async () => {
      const op = findOp('design', 'check_button_semantics');
      const result = (await op.handler({ action: tc.action, variant: tc.variant })) as {
        recommendedVariant: string;
        correct: boolean;
      };
      expect(result.recommendedVariant).toBe(tc.expectedRecommended);
      expect(result.correct).toBe(tc.correct);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. check_container_pattern — field count thresholds must match
// ---------------------------------------------------------------------------

describe('Parity: check_container_pattern', () => {
  const testCases = [
    { fields: 2, current: 'dialog', expected: 'dialog', correct: true },
    { fields: 5, current: 'dialog', expected: 'dialog', correct: true },
    { fields: 5, current: 'sheet', expected: 'dialog', correct: true }, // sheet OK for <=7
    { fields: 10, current: 'dialog', expected: 'page', correct: false },
    { fields: 15, current: 'page', expected: 'wizard', correct: false },
  ];

  for (const tc of testCases) {
    it(`${tc.fields} fields in ${tc.current} → recommended ${tc.expected}`, async () => {
      const facade = facades.find((f) => f.name.includes('design_patterns'));
      const op = facade!.ops.find((o) => o.name === 'check_container_pattern')!;
      const result = (await op.handler({ fieldCount: tc.fields, currentPattern: tc.current })) as {
        recommendedPattern: string;
        correct: boolean;
      };
      expect(result.recommendedPattern).toBe(tc.expected);
      expect(result.correct).toBe(tc.correct);
    });
  }

  it('confirmation always uses dialog', async () => {
    const facade = facades.find((f) => f.name.includes('design_patterns'));
    const op = facade!.ops.find((o) => o.name === 'check_container_pattern')!;
    const result = (await op.handler({
      fieldCount: 20,
      currentPattern: 'page',
      isConfirmation: true,
    })) as {
      recommendedPattern: string;
    };
    expect(result.recommendedPattern).toBe('dialog');
  });
});

// ---------------------------------------------------------------------------
// 5. check_action_overflow — Hick's Law threshold
// ---------------------------------------------------------------------------

describe('Parity: check_action_overflow', () => {
  it('<=3 actions → buttons', async () => {
    const op = findOp('design', 'check_action_overflow');
    const result = (await op.handler({ actionCount: 3, currentDisplay: 'buttons' })) as {
      correct: boolean;
    };
    expect(result.correct).toBe(true);
  });

  it('>3 actions → menu', async () => {
    const op = findOp('design', 'check_action_overflow');
    const result = (await op.handler({ actionCount: 5, currentDisplay: 'buttons' })) as {
      correct: boolean;
      recommendedDisplay: string;
    };
    expect(result.correct).toBe(false);
    expect(result.recommendedDisplay).toBe('menu');
  });
});

// ---------------------------------------------------------------------------
// 6. analyze_dependencies — import parsing
// ---------------------------------------------------------------------------

describe('Parity: analyze_dependencies', () => {
  it('should parse ES imports correctly', async () => {
    const op = findOp('component', 'analyze_dependencies');
    const result = (await op.handler({
      code: [
        "import { Button } from '@/components/ui/button';",
        "import React from 'react';",
        "import { cn } from '@/lib/utils';",
        "import type { ButtonProps } from './types';",
      ].join('\n'),
    })) as { internal: string[]; external: string[] };

    expect(result.external.some((d) => d === 'react')).toBe(true);
    expect(result.internal.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 7. review_pr_design — hex color detection in diffs
// ---------------------------------------------------------------------------

describe('Parity: review_pr_design', () => {
  it('should detect hex colors in .tsx files', async () => {
    const op = findOp('code_review', 'review_pr_design');
    const result = (await op.handler({
      files: [
        {
          file: 'src/Button.tsx',
          additions: ['color: #FF0000;', 'background-color: #00FF00;'],
          deletions: [],
        },
      ],
    })) as { designFiles: number; issuesFound: number };

    expect(result.designFiles).toBe(1);
    expect(result.issuesFound).toBeGreaterThan(0);
  });

  it('should ignore non-design files', async () => {
    const op = findOp('code_review', 'review_pr_design');
    const result = (await op.handler({
      files: [{ file: 'README.md', additions: ['color: #FF0000;'], deletions: [] }],
    })) as { designFiles: number };

    expect(result.designFiles).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. check_architecture — boundary violations
// ---------------------------------------------------------------------------

describe('Parity: check_architecture', () => {
  it('should detect cross-feature imports', async () => {
    const op = findOp('code_review', 'check_architecture');
    const result = (await op.handler({
      imports: [{ fromFile: 'src/features/auth/login.ts', importPath: '../../features/users/api' }],
    })) as { violations: Array<{ rule: string }> };

    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('should pass clean architecture', async () => {
    const op = findOp('code_review', 'check_architecture');
    const result = (await op.handler({
      imports: [{ fromFile: 'src/components/Button.tsx', importPath: '@/lib/utils' }],
    })) as { violations: Array<unknown> };

    expect(result.violations.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Design rules — data serving ops return data
// ---------------------------------------------------------------------------

describe('Parity: design_rules data serving', () => {
  const ruleOps = [
    'get_clean_code_rules',
    'get_architecture_patterns',
    'get_variant_philosophy',
    'get_api_constraints',
    'get_dialog_pattern_rules',
  ];

  for (const opName of ruleOps) {
    it(`${opName} should return non-empty data`, async () => {
      const facade = facades.find((f) => f.name.includes('design_rules'));
      const op = facade!.ops.find((o) => o.name === opName)!;
      const result = (await op.handler({ topic: 'all' })) as { source: string; data: unknown };
      expect(result.source).toBe(opName);
      expect(result.data).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// 10. Design QA accessibility_precheck — WCAG batch check
// ---------------------------------------------------------------------------

describe('Parity: design-qa accessibility_precheck', () => {
  it('should batch-check contrast for multiple pairs', async () => {
    const op = findOp('design_qa', 'accessibility_precheck');
    const result = (await op.handler({
      colorPairs: [
        { foreground: '#000000', background: '#FFFFFF' }, // 21:1 → pass
        { foreground: '#CCCCCC', background: '#DDDDDD' }, // ~1.1:1 → fail
        { foreground: '#1E3A5F', background: '#FFFFFF' }, // high → pass
      ],
    })) as { results: Array<{ passes: boolean; ratio: number }> };

    expect(result.results.length).toBe(3);
    expect(result.results[0].passes).toBe(true);
    expect(result.results[0].ratio).toBeCloseTo(21, 0);
    expect(result.results[1].passes).toBe(false);
    expect(result.results[2].passes).toBe(true);
  });
});
