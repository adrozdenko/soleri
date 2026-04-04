import { describe, it, expect } from 'vitest';
import pack from '../index.js';
import {
  normalizeTokenName,
  fuzzyMatchToken,
  getContrastRatio,
  getWCAGLevel,
  parseHex,
  getLuminance,
} from '../lib/design-qa-utils.js';

// ---------------------------------------------------------------------------
// Token Name Normalization
// ---------------------------------------------------------------------------

describe('normalizeTokenName', () => {
  it('should convert slash-separated names', () => {
    expect(normalizeTokenName('Primary/500')).toBe('primary-500');
  });

  it('should convert dot-separated names', () => {
    expect(normalizeTokenName('Brand.Primary.Main')).toBe('brand-primary-main');
  });

  it('should handle whitespace around separators', () => {
    expect(normalizeTokenName('Neutral / Light / 100')).toBe('neutral-light-100');
  });

  it('should collapse multiple dashes', () => {
    expect(normalizeTokenName('Foo//Bar')).toBe('foo-bar');
  });

  it('should lowercase the result', () => {
    expect(normalizeTokenName('BRAND')).toBe('brand');
  });
});

// ---------------------------------------------------------------------------
// Fuzzy Token Matching
// ---------------------------------------------------------------------------

describe('fuzzyMatchToken', () => {
  const tokenMap = {
    'primary-500': '#3B82F6',
    'neutral-100': '#F5F5F5',
    'error-600': '#DC2626',
  };

  it('should find exact match after normalization', () => {
    const result = fuzzyMatchToken('Primary/500', tokenMap);
    expect(result).not.toBeNull();
    expect(result!.token).toBe('primary-500');
    expect(result!.confidence).toBe('exact');
  });

  it('should find contains match', () => {
    const result = fuzzyMatchToken('primary', { 'primary-500': '#3B82F6' });
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('contains');
  });

  it('should return null for no match', () => {
    const result = fuzzyMatchToken('completely-unrelated', tokenMap);
    expect(result).toBeNull();
  });

  it('should find fuzzy match within distance 3', () => {
    // "eror-600" has Levenshtein distance 1 from "error-600"
    const result = fuzzyMatchToken('Eror/600', tokenMap);
    expect(result).not.toBeNull();
    expect(result!.token).toBe('error-600');
    expect(result!.confidence).toBe('fuzzy');
  });
});

// ---------------------------------------------------------------------------
// WCAG Contrast Calculation
// ---------------------------------------------------------------------------

describe('WCAG Contrast', () => {
  it('should parse hex colors correctly', () => {
    expect(parseHex('#FF0000')).toEqual([255, 0, 0]);
    expect(parseHex('#000')).toEqual([0, 0, 0]);
    expect(parseHex('FFFFFF')).toEqual([255, 255, 255]);
  });

  it('should calculate luminance for white and black', () => {
    expect(getLuminance('#FFFFFF')).toBeCloseTo(1, 1);
    expect(getLuminance('#000000')).toBeCloseTo(0, 1);
  });

  it('should calculate 21:1 contrast for black on white', () => {
    const ratio = getContrastRatio('#000000', '#FFFFFF');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('should calculate 1:1 contrast for same colors', () => {
    const ratio = getContrastRatio('#FF0000', '#FF0000');
    expect(ratio).toBeCloseTo(1, 0);
  });

  it('should return AAA for 21:1', () => {
    expect(getWCAGLevel(21)).toBe('AAA');
  });

  it('should return AA for 4.5', () => {
    expect(getWCAGLevel(4.5)).toBe('AA');
  });

  it('should return Fail for low contrast', () => {
    expect(getWCAGLevel(2)).toBe('Fail');
  });

  it('should return AA-large for 3:1', () => {
    expect(getWCAGLevel(3)).toBe('AA-large');
  });
});

// ---------------------------------------------------------------------------
// detect_token_drift
// ---------------------------------------------------------------------------

describe('detect_token_drift op', () => {
  const op = pack.ops.find((o) => o.name === 'detect_token_drift')!;

  it('should find matched tokens', async () => {
    const result = (await op.handler({
      tokens: [{ name: 'Primary/500', value: '#3B82F6' }],
      tokenMap: { 'primary-500': '#3B82F6' },
    })) as { matched: { count: number }; drifted: { count: number }; unmatched: { count: number } };

    expect(result.matched.count).toBe(1);
    expect(result.drifted.count).toBe(0);
    expect(result.unmatched.count).toBe(0);
  });

  it('should detect drifted tokens', async () => {
    const result = (await op.handler({
      tokens: [{ name: 'Primary/500', value: '#FF0000' }],
      tokenMap: { 'primary-500': '#3B82F6' },
    })) as { matched: { count: number }; drifted: { count: number }; unmatched: { count: number } };

    expect(result.matched.count).toBe(0);
    expect(result.drifted.count).toBe(1);
  });

  it('should detect unmatched tokens', async () => {
    const result = (await op.handler({
      tokens: [{ name: 'Custom/Unknown', value: '#123456' }],
      tokenMap: { 'primary-500': '#3B82F6' },
    })) as { unmatched: { count: number }; healthScore: number };

    expect(result.unmatched.count).toBe(1);
    expect(result.healthScore).toBe(0);
  });

  it('should return 100 health score for empty input', async () => {
    const result = (await op.handler({
      tokens: [],
      tokenMap: {},
    })) as { healthScore: number };

    expect(result.healthScore).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// detect_hardcoded_colors
// ---------------------------------------------------------------------------

describe('detect_hardcoded_colors op', () => {
  const op = pack.ops.find((o) => o.name === 'detect_hardcoded_colors')!;

  it('should identify tokenized colors', async () => {
    const result = (await op.handler({
      colors: ['#3B82F6', '#FF0000'],
      tokenMap: { 'primary-500': '#3B82F6' },
    })) as { tokenized: { count: number }; hardcoded: { count: number } };

    expect(result.tokenized.count).toBe(1);
    expect(result.hardcoded.count).toBe(1);
  });

  it('should be case-insensitive', async () => {
    const result = (await op.handler({
      colors: ['#3b82f6'],
      tokenMap: { 'primary-500': '#3B82F6' },
    })) as { tokenized: { count: number } };

    expect(result.tokenized.count).toBe(1);
  });

  it('should calculate compliance score', async () => {
    const result = (await op.handler({
      colors: ['#3B82F6', '#3B82F6'],
      tokenMap: { 'primary-500': '#3B82F6' },
    })) as { complianceScore: number };

    expect(result.complianceScore).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// sync_components
// ---------------------------------------------------------------------------

describe('sync_components op', () => {
  const op = pack.ops.find((o) => o.name === 'sync_components')!;

  it('should match components by name (case-insensitive)', async () => {
    const result = (await op.handler({
      designComponents: ['Button', 'Card'],
      codeComponents: ['button', 'Card', 'Modal'],
    })) as {
      matched: { count: number };
      missingInCode: { count: number; items: string[] };
      missingInDesign: { count: number; items: string[] };
    };

    expect(result.matched.count).toBe(2);
    expect(result.missingInCode.count).toBe(0);
    expect(result.missingInDesign.count).toBe(1);
    expect(result.missingInDesign.items).toContain('Modal');
  });
});

// ---------------------------------------------------------------------------
// accessibility_precheck
// ---------------------------------------------------------------------------

describe('accessibility_precheck op', () => {
  const op = pack.ops.find((o) => o.name === 'accessibility_precheck')!;

  it('should pass high-contrast pairs', async () => {
    const result = (await op.handler({
      colorPairs: [{ foreground: '#000000', background: '#FFFFFF' }],
    })) as { allPass: boolean; results: Array<{ ratio: number; passes: boolean }> };

    expect(result.allPass).toBe(true);
    expect(result.results[0].ratio).toBeCloseTo(21, 0);
    expect(result.results[0].passes).toBe(true);
  });

  it('should fail low-contrast pairs', async () => {
    const result = (await op.handler({
      colorPairs: [{ foreground: '#CCCCCC', background: '#FFFFFF' }],
    })) as { allPass: boolean; failed: number };

    expect(result.allPass).toBe(false);
    expect(result.failed).toBe(1);
  });

  it('should use relaxed threshold for large-text context', async () => {
    const result = (await op.handler({
      colorPairs: [{ foreground: '#767676', background: '#FFFFFF', context: 'large-text' }],
    })) as { results: Array<{ ratio: number; passes: boolean }> };

    // #767676 on white is ~4.54:1 — passes both text and large-text
    expect(result.results[0].passes).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handoff_audit
// ---------------------------------------------------------------------------

describe('handoff_audit op', () => {
  const op = pack.ops.find((o) => o.name === 'handoff_audit')!;

  it('should give A grade for complete components', async () => {
    const result = (await op.handler({
      components: [
        {
          name: 'Button',
          description: 'A clickable button component',
          props: ['variant', 'size', 'disabled'],
          variants: ['primary', 'secondary', 'outline'],
        },
      ],
    })) as { audits: Array<{ score: number; grade: string; missing: string[] }> };

    expect(result.audits[0].score).toBe(100);
    expect(result.audits[0].grade).toBe('A');
    expect(result.audits[0].missing).toHaveLength(0);
  });

  it('should identify missing fields', async () => {
    const result = (await op.handler({
      components: [
        {
          name: 'Card',
        },
      ],
    })) as { audits: Array<{ score: number; missing: string[] }> };

    expect(result.audits[0].score).toBe(0);
    expect(result.audits[0].missing).toContain('description');
    expect(result.audits[0].missing).toContain('props');
    expect(result.audits[0].missing).toContain('variants');
  });

  it('should calculate average score across components', async () => {
    const result = (await op.handler({
      components: [
        { name: 'Button', description: 'desc', props: ['a'], variants: ['b'] },
        { name: 'Card' },
      ],
    })) as { averageScore: number };

    expect(result.averageScore).toBe(50);
  });
});
