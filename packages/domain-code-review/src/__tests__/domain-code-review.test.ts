import { describe, it, expect } from 'vitest';
import pack from '../index.js';
import {
  isDesignFile,
  findHexColors,
  findArbitraryValues,
  checkArchitectureBoundary,
} from '../lib/review-utils.js';

// ---------------------------------------------------------------------------
// Review Utils
// ---------------------------------------------------------------------------

describe('Review Utils', () => {
  it('isDesignFile should detect design files', () => {
    expect(isDesignFile('Button.tsx')).toBe(true);
    expect(isDesignFile('styles.css')).toBe(true);
    expect(isDesignFile('theme.scss')).toBe(true);
    expect(isDesignFile('App.vue')).toBe(true);
    expect(isDesignFile('Card.svelte')).toBe(true);
    expect(isDesignFile('utils.ts')).toBe(false);
    expect(isDesignFile('server.js')).toBe(false);
  });

  it('findHexColors should find hex color literals', () => {
    expect(findHexColors('color: #FF0000;')).toEqual(['#FF0000']);
    expect(findHexColors('bg-[#3B82F6]')).toEqual(['#3B82F6']);
    expect(findHexColors('#fff and #000')).toEqual(['#fff', '#000']);
    expect(findHexColors('no colors here')).toEqual([]);
  });

  it('findArbitraryValues should find Tailwind arbitrary values', () => {
    expect(findArbitraryValues('p-[13px]')).toEqual(['p-[13px]']);
    expect(findArbitraryValues('text-[#ff0000] mt-[7px]')).toEqual(['text-[#ff0000]', 'mt-[7px]']);
    expect(findArbitraryValues('p-4 mt-2')).toEqual([]);
  });

  it('checkArchitectureBoundary should detect cross-feature imports', () => {
    const violation = checkArchitectureBoundary(
      'src/features/auth/Login.tsx',
      '../features/billing/api',
    );
    expect(violation).not.toBeNull();
    expect(violation!.severity).toBe('error');
    expect(violation!.rule).toContain('Cross-feature');
  });

  it('checkArchitectureBoundary should detect UI-data coupling', () => {
    const violation = checkArchitectureBoundary(
      'src/components/UserCard.tsx',
      '../../services/userService',
    );
    expect(violation).not.toBeNull();
    expect(violation!.rule).toContain('data layer');
  });

  it('checkArchitectureBoundary should return null for valid imports', () => {
    expect(checkArchitectureBoundary('src/features/auth/Login.tsx', './useAuth')).toBeNull();
    expect(checkArchitectureBoundary('src/utils/format.ts', '../lib/date')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GitHub-sourced ops
// ---------------------------------------------------------------------------

describe('review_pr_design', () => {
  const op = pack.ops.find((o) => o.name === 'review_pr_design')!;

  it('should detect hex colors in design file diffs', async () => {
    const result = (await op.handler({
      files: [
        {
          file: 'src/Button.tsx',
          additions: ['const color = "#FF0000";', 'return <div style={{ color }}>'],
          deletions: [],
        },
      ],
    })) as { issuesFound: number; verdict: string };

    expect(result.issuesFound).toBe(2); // 1 hex color + 1 inline style attribute
    expect(result.verdict).toBe('FAIL');
  });

  it('should skip non-design files', async () => {
    const result = (await op.handler({
      files: [
        {
          file: 'src/utils.ts',
          additions: ['const color = "#FF0000";'],
          deletions: [],
        },
      ],
    })) as { issuesFound: number; designFiles: number };

    expect(result.designFiles).toBe(0);
    expect(result.issuesFound).toBe(0);
  });

  it('should pass clean diffs', async () => {
    const result = (await op.handler({
      files: [
        {
          file: 'src/Card.tsx',
          additions: ['className="bg-surface text-primary p-4"'],
          deletions: [],
        },
      ],
    })) as { verdict: string };

    expect(result.verdict).toBe('PASS');
  });
});

describe('check_architecture', () => {
  const op = pack.ops.find((o) => o.name === 'check_architecture')!;

  it('should detect cross-feature imports', async () => {
    const result = (await op.handler({
      imports: [
        {
          fromFile: 'src/features/auth/Login.tsx',
          importPath: 'src/features/billing/api',
        },
      ],
    })) as { violationsFound: number; verdict: string };

    expect(result.violationsFound).toBe(1);
    expect(result.verdict).toBe('FAIL');
  });

  it('should pass valid imports', async () => {
    const result = (await op.handler({
      imports: [
        {
          fromFile: 'src/features/auth/Login.tsx',
          importPath: 'src/features/auth/useAuth',
        },
      ],
    })) as { verdict: string };

    expect(result.verdict).toBe('PASS');
  });
});

describe('search_review_context', () => {
  const op = pack.ops.find((o) => o.name === 'search_review_context')!;

  it('should find results for hex color query', async () => {
    const result = (await op.handler({
      query: 'hex colors',
    })) as { resultsFound: number };

    expect(result.resultsFound).toBe(1); // matches 'hex-colors' entry in static knowledge base
  });

  it('should filter by category', async () => {
    const result = (await op.handler({
      query: 'contrast',
      category: 'accessibility',
    })) as { resultsFound: number; results: Array<{ category: string }> };

    expect(result.resultsFound).toBe(1); // 'low-contrast' entry matches 'contrast' in accessibility category
    result.results.forEach((r) => expect(r.category).toBe('accessibility'));
  });
});

describe('generate_review_summary', () => {
  const op = pack.ops.find((o) => o.name === 'generate_review_summary')!;

  it('should generate summary with correct counts', async () => {
    const result = (await op.handler({
      issues: [
        { issue: 'Hex color', severity: 'error', category: 'tokens' },
        { issue: 'Arbitrary value', severity: 'warning', category: 'tokens' },
        { issue: 'Missing label', severity: 'error', category: 'a11y' },
      ],
    })) as { totalIssues: number; bySeverity: Record<string, number>; verdict: string };

    expect(result.totalIssues).toBe(3);
    expect(result.bySeverity.error).toBe(2);
    expect(result.bySeverity.warning).toBe(1);
    expect(result.verdict).toBe('CHANGES_REQUESTED');
  });

  it('should approve clean reviews', async () => {
    const result = (await op.handler({
      issues: [],
    })) as { verdict: string };

    expect(result.verdict).toBe('APPROVED');
  });
});

// ---------------------------------------------------------------------------
// Playwright-sourced ops
// ---------------------------------------------------------------------------

describe('accessibility_audit', () => {
  const op = pack.ops.find((o) => o.name === 'accessibility_audit')!;

  it('should find missing aria-labels on interactive elements', async () => {
    const result = (await op.handler({
      elements: [
        { tag: 'button', role: 'button' },
        { tag: 'a' },
        { tag: 'div', ariaLabel: 'container' },
      ],
    })) as { issuesFound: number; issues: Array<{ tag: string }> };

    expect(result.issuesFound).toBe(2); // button + a without labels
  });

  it('should detect low contrast', async () => {
    const result = (await op.handler({
      elements: [{ tag: 'p', contrastRatio: 2.5, ariaLabel: 'text' }],
    })) as { issuesFound: number; verdict: string };

    expect(result.issuesFound).toBe(1);
    expect(result.verdict).toBe('FAIL');
  });

  it('should pass accessible elements', async () => {
    const result = (await op.handler({
      elements: [
        { tag: 'button', ariaLabel: 'Submit', contrastRatio: 7.0 },
        { tag: 'p', contrastRatio: 5.0 },
      ],
    })) as { verdict: string };

    expect(result.verdict).toBe('PASS');
  });

  it('should not flag button or link with visible textContent', async () => {
    const result = (await op.handler({
      elements: [{ tag: 'button', textContent: 'Submit' }],
    })) as { issuesFound: number; verdict: string };

    expect(result.issuesFound).toBe(0);
    expect(result.verdict).toBe('PASS');
  });

  it('should flag button with no ariaLabel and no textContent', async () => {
    const result = (await op.handler({
      elements: [{ tag: 'button' }],
    })) as { issuesFound: number; verdict: string };

    expect(result.issuesFound).toBe(1);
    expect(result.verdict).toBe('FAIL');
  });

  it('should flag input with no ariaLabel regardless of textContent absence', async () => {
    const result = (await op.handler({
      elements: [{ tag: 'input' }],
    })) as { issuesFound: number; verdict: string };

    expect(result.issuesFound).toBe(1);
    expect(result.verdict).toBe('FAIL');
  });
});

describe('validate_component_states', () => {
  const op = pack.ops.find((o) => o.name === 'validate_component_states')!;

  it('should detect missing required states', async () => {
    const result = (await op.handler({
      component: 'Button',
      states: [
        { name: 'default', styles: {} },
        { name: 'hover', styles: {} },
      ],
    })) as { missingStates: string[]; verdict: string; coverage: number };

    expect(result.missingStates).toContain('focus');
    expect(result.missingStates).toContain('disabled');
    expect(result.missingStates).toContain('error');
    expect(result.verdict).toBe('FAIL');
    expect(result.coverage).toBe(40);
  });

  it('should pass when all states present', async () => {
    const result = (await op.handler({
      component: 'Input',
      states: [
        { name: 'default' },
        { name: 'hover' },
        { name: 'focus' },
        { name: 'disabled' },
        { name: 'error' },
      ],
    })) as { verdict: string; coverage: number };

    expect(result.verdict).toBe('PASS');
    expect(result.coverage).toBe(100);
  });
});

describe('classify_visual_changes', () => {
  const op = pack.ops.find((o) => o.name === 'classify_visual_changes')!;

  it('should classify changes correctly', async () => {
    const result = (await op.handler({
      changes: [
        { element: '.btn', property: 'color', before: '#000', after: '#333' },
        { element: '.card', property: 'display', before: 'block', after: 'flex' },
        { element: '.link', property: 'cursor', before: 'default', after: 'pointer' },
      ],
    })) as {
      counts: { cosmetic: number; structural: number; behavioral: number };
      riskLevel: string;
    };

    expect(result.counts.cosmetic).toBe(1);
    expect(result.counts.structural).toBe(1);
    expect(result.counts.behavioral).toBe(1);
    expect(result.riskLevel).toBe('high'); // structural present
  });

  it('should rate cosmetic-only as low risk', async () => {
    const result = (await op.handler({
      changes: [
        { element: '.btn', property: 'color', before: '#000', after: '#333' },
        { element: '.btn', property: 'font-size', before: '14px', after: '16px' },
      ],
    })) as { riskLevel: string };

    expect(result.riskLevel).toBe('low');
  });
});

describe('validate_page_styles', () => {
  const op = pack.ops.find((o) => o.name === 'validate_page_styles')!;

  it('should detect off-scale font sizes', async () => {
    const result = (await op.handler({
      elements: [
        { element: 'h1', styles: { fontSize: '15px' } },
        { element: 'p', styles: { fontSize: '16px' } },
      ],
    })) as { violationsFound: number };

    expect(result.violationsFound).toBe(1); // 15px not in scale, 16px is valid
  });

  it('should detect hardcoded colors', async () => {
    const result = (await op.handler({
      elements: [{ element: '.card', styles: { color: '#FF0000', background: '#FFFFFF' } }],
    })) as { violationsFound: number; verdict: string };

    expect(result.violationsFound).toBe(2);
    expect(result.verdict).toBe('FAIL');
  });
});
