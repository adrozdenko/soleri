import { describe, it, expect } from 'vitest';
import pack from '../index.js';
import {
  calculateContrastRatio,
  getWCAGLevel,
  isLightColor,
  suggestAccessibleColors,
  generateColorScale,
} from '../lib/color-science.js';
import { validateComponentCode } from '../lib/code-validator.js';

// ---------------------------------------------------------------------------
// Color Science
// ---------------------------------------------------------------------------

describe('Color Science', () => {
  it('should calculate correct contrast ratio for black on white', () => {
    const ratio = calculateContrastRatio('#000000', '#FFFFFF');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('should calculate correct contrast ratio for same colors', () => {
    const ratio = calculateContrastRatio('#FF0000', '#FF0000');
    expect(ratio).toBeCloseTo(1, 0);
  });

  it('should return AAA for 21:1 contrast', () => {
    expect(getWCAGLevel(21)).toBe('AAA');
  });

  it('should return AA for 4.5:1 contrast', () => {
    expect(getWCAGLevel(4.5)).toBe('AA');
  });

  it('should return Fail for low contrast', () => {
    expect(getWCAGLevel(2)).toBe('Fail');
  });

  it('should detect light colors', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);
  });

  it('should suggest accessible colors', () => {
    const candidates = [
      { name: 'white', hex: '#FFFFFF' },
      { name: 'black', hex: '#000000' },
      { name: 'light-gray', hex: '#EEEEEE' },
    ];
    const results = suggestAccessibleColors('#FFFFFF', candidates, 'AA');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('black');
  });

  it('should generate 10-shade color scale', () => {
    const scale = generateColorScale('#3B82F6');
    expect(Object.keys(scale)).toHaveLength(10);
    expect(scale['50']).toMatch(/^#/);
    expect(scale['900']).toMatch(/^#/);
  });
});

// ---------------------------------------------------------------------------
// Code Validator
// ---------------------------------------------------------------------------

describe('Code Validator', () => {
  it('should pass clean code', () => {
    const result = validateComponentCode(
      '<div className="bg-surface text-primary p-4">Hello</div>',
    );
    expect(result.valid).toBe(true);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A+');
  });

  it('should detect arbitrary spacing violations', () => {
    const result = validateComponentCode('<div className="p-[13px] mt-[7px]">Bad spacing</div>');
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].type).toBe('spacing-violation');
  });

  it('should detect arbitrary text size violations', () => {
    const result = validateComponentCode('<p className="text-[15px]">Bad size</p>');
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.type === 'typography-violation')).toBe(true);
  });

  it('should detect arbitrary font weight violations', () => {
    const result = validateComponentCode('<span className="font-[450]">Bad weight</span>');
    expect(result.valid).toBe(false);
  });

  it('should score correctly with multiple violations', () => {
    const code = '<div className="p-[5px] text-[14px] font-[350]">Violations</div>';
    const result = validateComponentCode(code);
    expect(result.score).toBeLessThan(100);
    expect(result.counts.errors).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// DomainPack Manifest
// ---------------------------------------------------------------------------

describe('DomainPack Manifest', () => {
  it('should export a valid DomainPack', () => {
    expect(pack.name).toBe('design');
    expect(pack.version).toBe('1.0.0');
    expect(pack.domains).toContain('design');
  });

  it('should have design ops (19 total)', () => {
    // 6 algorithmic + 13 data-serving = 19 (generate_image deferred)
    expect(pack.ops.length).toBe(19);
    const opNames = pack.ops.map((o) => o.name);
    expect(opNames).toContain('recommend_design_system');
    expect(opNames).toContain('get_stack_guidelines');
  });

  it('should have design_rules facade', () => {
    expect(pack.facades).toBeDefined();
    const rules = pack.facades!.find((f) => f.name === 'design_rules');
    expect(rules).toBeDefined();
    expect(rules!.ops.length).toBe(15);
  });

  it('should have design_patterns facade', () => {
    const patterns = pack.facades!.find((f) => f.name === 'design_patterns');
    expect(patterns).toBeDefined();
    expect(patterns!.ops.length).toBe(8); // 1 algorithmic + 7 data-serving
  });

  it('should have knowledge manifest with tiers', () => {
    expect(pack.knowledge).toBeDefined();
    expect(pack.knowledge!.canonical).toBeDefined();
    expect(pack.knowledge!.curated).toBeDefined();
  });

  it('should have CLAUDE.md rules', () => {
    expect(pack.rules).toBeDefined();
    expect(pack.rules).toContain('Semantic first');
    expect(pack.rules).toContain('Forbidden');
  });

  it('check_contrast op should work', async () => {
    const op = pack.ops.find((o) => o.name === 'check_contrast')!;
    const result = (await op.handler({
      foreground: '#000000',
      background: '#FFFFFF',
      context: 'text',
    })) as {
      ratio: number;
      verdict: string;
    };
    expect(result.ratio).toBeCloseTo(21, 0);
    expect(result.verdict).toBe('PASS');
  });

  it('get_color_pairs op should work', async () => {
    const op = pack.ops.find((o) => o.name === 'get_color_pairs')!;
    const result = (await op.handler({ background: '#FFFFFF', minLevel: 'AA' })) as {
      count: number;
      validForegrounds: unknown[];
    };
    expect(result.count).toBeGreaterThan(0);
  });

  it('validate_token op should detect forbidden hex', async () => {
    const op = pack.ops.find((o) => o.name === 'validate_token')!;
    const result = (await op.handler({ token: '#FF0000' })) as { valid: boolean; verdict: string };
    // Hex colors should be detected as forbidden or unknown
    expect(result.verdict).not.toBe('ALLOWED');
  });

  it('check_button_semantics op should recommend destructive for delete', async () => {
    const op = pack.ops.find((o) => o.name === 'check_button_semantics')!;
    const result = (await op.handler({ action: 'Delete account', variant: 'default' })) as {
      correct: boolean;
      recommendedVariant: string;
    };
    expect(result.recommendedVariant).toBe('destructive');
    expect(result.correct).toBe(false);
  });

  it('check_container_pattern op should recommend wizard for 15 fields', async () => {
    const patternsF = pack.facades!.find((f) => f.name === 'design_patterns')!;
    const op = patternsF.ops.find((o) => o.name === 'check_container_pattern')!;
    const result = (await op.handler({ fieldCount: 15, currentPattern: 'dialog' })) as {
      correct: boolean;
      recommendedPattern: string;
    };
    expect(result.recommendedPattern).toBe('wizard');
    expect(result.correct).toBe(false);
  });

  it('design_rules ops should return data', async () => {
    const rulesF = pack.facades!.find((f) => f.name === 'design_rules')!;
    const op = rulesF.ops.find((o) => o.name === 'get_clean_code_rules')!;
    const result = (await op.handler({ topic: 'naming' })) as { source: string; data: unknown };
    expect(result.source).toBe('get_clean_code_rules');
    expect(result.data).toBeDefined();
  });
});
