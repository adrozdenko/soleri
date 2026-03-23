import { describe, it, expect } from 'vitest';
import {
  assessTaskComplexity,
  type AssessmentInput,
  type AssessmentResult,
} from './task-complexity-assessor.js';

// ─── Helpers ────────────────────────────────────────────────────────

function assess(partial: Partial<AssessmentInput> & { prompt: string }): AssessmentResult {
  return assessTaskComplexity(partial);
}

function signalByName(result: AssessmentResult, name: string) {
  return result.signals.find((s) => s.name === name);
}

// ─── Simple Tasks ───────────────────────────────────────────────────

describe('assessTaskComplexity — simple tasks', () => {
  it('classifies "rename variable X" as simple', () => {
    const result = assess({ prompt: 'rename variable X to Y' });
    expect(result.classification).toBe('simple');
    expect(result.score).toBeLessThan(40);
  });

  it('classifies "fix typo in README" as simple', () => {
    const result = assess({ prompt: 'fix typo in README' });
    expect(result.classification).toBe('simple');
    expect(result.score).toBeLessThan(40);
  });

  it('classifies "add CSS class" as simple', () => {
    const result = assess({ prompt: 'add CSS class to the header' });
    expect(result.classification).toBe('simple');
    expect(result.score).toBeLessThan(40);
  });

  it('classifies single-file estimate as simple', () => {
    const result = assess({ prompt: 'update button color', filesEstimated: 1 });
    expect(result.classification).toBe('simple');
    expect(signalByName(result, 'file-count')!.triggered).toBe(false);
  });

  it('classifies task with 2 files as simple', () => {
    const result = assess({ prompt: 'update two files', filesEstimated: 2 });
    expect(result.classification).toBe('simple');
    expect(signalByName(result, 'file-count')!.triggered).toBe(false);
  });
});

// ─── Complex Tasks ──────────────────────────────────────────────────

describe('assessTaskComplexity — complex tasks', () => {
  it('classifies "add authentication" touching multiple files as complex', () => {
    const result = assess({ prompt: 'add authentication to the API', filesEstimated: 4 });
    expect(result.classification).toBe('complex');
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it('classifies "refactor the vault module" as complex via cross-cutting when combined with files', () => {
    const result = assess({ prompt: 'refactor across the vault module', filesEstimated: 5 });
    expect(result.classification).toBe('complex');
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it('classifies "migrate database schema" touching multiple files as complex', () => {
    const result = assess({ prompt: 'migrate database schema to v2', filesEstimated: 3 });
    expect(result.classification).toBe('complex');
    expect(signalByName(result, 'cross-cutting-keywords')!.triggered).toBe(true);
    expect(signalByName(result, 'file-count')!.triggered).toBe(true);
  });

  it('classifies many-file task with design decision as complex', () => {
    const result = assess({
      prompt: 'how should we update styles across the app',
      filesEstimated: 5,
    });
    expect(result.classification).toBe('complex');
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(signalByName(result, 'file-count')!.triggered).toBe(true);
  });

  it('classifies task with design decision as complex', () => {
    const result = assess({
      prompt: 'how should we structure the new cache layer',
      filesEstimated: 3,
    });
    expect(result.classification).toBe('complex');
    expect(signalByName(result, 'design-decisions-needed')!.triggered).toBe(true);
  });

  it('classifies task with new dependency as complex', () => {
    const result = assess({
      prompt: 'add a new package for rate limiting and install it',
      filesEstimated: 3,
    });
    expect(result.classification).toBe('complex');
    expect(signalByName(result, 'new-dependencies')!.triggered).toBe(true);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe('assessTaskComplexity — edge cases', () => {
  it('handles empty prompt as simple', () => {
    const result = assess({ prompt: '' });
    expect(result.classification).toBe('simple');
    expect(result.score).toBe(0);
  });

  it('clamps score to 0 minimum (negative weights only)', () => {
    const result = assess({
      prompt: 'do the thing',
      hasParentPlan: true,
    });
    expect(result.score).toBe(0);
    expect(result.classification).toBe('simple');
  });

  it('clamps score to 100 maximum', () => {
    const result = assess({
      prompt:
        'add authentication, migrate the DB, install new package, how should we design this, refactor across all modules',
      filesEstimated: 10,
      domains: ['vault', 'brain', 'planning'],
    });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('parent context reduces complexity', () => {
    const withoutParent = assess({
      prompt: 'add authorization to the API',
      filesEstimated: 4,
    });
    const withParent = assess({
      prompt: 'add authorization to the API',
      filesEstimated: 4,
      hasParentPlan: true,
    });
    expect(withParent.score).toBeLessThan(withoutParent.score);
    expect(signalByName(withParent, 'approach-already-described')!.triggered).toBe(true);
  });

  it('parentIssueContext also reduces complexity', () => {
    const result = assess({
      prompt: 'add authorization to the API',
      filesEstimated: 4,
      parentIssueContext: 'Use middleware pattern as described in RFC-42',
    });
    expect(signalByName(result, 'approach-already-described')!.triggered).toBe(true);
  });

  it('borderline score at exactly 40 is complex', () => {
    // file-count (25) + new-dependencies (15) = 40
    const result = assess({
      prompt: 'install the redis package',
      filesEstimated: 3,
    });
    expect(result.score).toBe(40);
    expect(result.classification).toBe('complex');
  });

  it('borderline score at 39 is simple', () => {
    // file-count (25) + new-dependencies (15) + approach-described (-15) = 25
    const result = assess({
      prompt: 'install the redis package',
      filesEstimated: 3,
      hasParentPlan: true,
    });
    expect(result.score).toBeLessThan(40);
    expect(result.classification).toBe('simple');
  });
});

// ─── Individual Signals ─────────────────────────────────────────────

describe('assessTaskComplexity — individual signals', () => {
  describe('file-count signal', () => {
    it('triggers at 3 files', () => {
      const result = assess({ prompt: 'task', filesEstimated: 3 });
      expect(signalByName(result, 'file-count')!.triggered).toBe(true);
      expect(signalByName(result, 'file-count')!.weight).toBe(25);
    });

    it('does not trigger at 2 files', () => {
      const result = assess({ prompt: 'task', filesEstimated: 2 });
      expect(signalByName(result, 'file-count')!.triggered).toBe(false);
    });

    it('does not trigger when no estimate provided', () => {
      const result = assess({ prompt: 'task' });
      expect(signalByName(result, 'file-count')!.triggered).toBe(false);
    });
  });

  describe('cross-cutting-keywords signal', () => {
    it.each([
      'add authentication',
      'implement authorization',
      'migrate the database',
      'refactor across modules',
      'handle cross-cutting concerns',
    ])('triggers for: "%s"', (prompt) => {
      const result = assess({ prompt });
      expect(signalByName(result, 'cross-cutting-keywords')!.triggered).toBe(true);
    });

    it('does not trigger for benign text', () => {
      const result = assess({ prompt: 'fix button alignment' });
      expect(signalByName(result, 'cross-cutting-keywords')!.triggered).toBe(false);
    });
  });

  describe('new-dependencies signal', () => {
    it.each([
      'add dependency for caching',
      'install redis',
      'new package for validation',
      'npm install lodash',
    ])('triggers for: "%s"', (prompt) => {
      const result = assess({ prompt });
      expect(signalByName(result, 'new-dependencies')!.triggered).toBe(true);
    });

    it('does not trigger for normal text', () => {
      const result = assess({ prompt: 'update existing code' });
      expect(signalByName(result, 'new-dependencies')!.triggered).toBe(false);
    });
  });

  describe('design-decisions-needed signal', () => {
    it.each([
      'how should we handle caching',
      'which approach for the API',
      'design decision on storage',
      'architectural decision for events',
      'evaluate the trade-off between speed and accuracy',
    ])('triggers for: "%s"', (prompt) => {
      const result = assess({ prompt });
      expect(signalByName(result, 'design-decisions-needed')!.triggered).toBe(true);
    });
  });

  describe('approach-already-described signal', () => {
    it('triggers with hasParentPlan', () => {
      const result = assess({ prompt: 'task', hasParentPlan: true });
      const signal = signalByName(result, 'approach-already-described')!;
      expect(signal.triggered).toBe(true);
      expect(signal.weight).toBe(-15);
    });

    it('triggers with parentIssueContext', () => {
      const result = assess({ prompt: 'task', parentIssueContext: 'Steps described here' });
      expect(signalByName(result, 'approach-already-described')!.triggered).toBe(true);
    });

    it('does not trigger with empty parentIssueContext', () => {
      const result = assess({ prompt: 'task', parentIssueContext: '   ' });
      expect(signalByName(result, 'approach-already-described')!.triggered).toBe(false);
    });
  });

  describe('multi-domain signal', () => {
    it('triggers with 2+ domains', () => {
      const result = assess({ prompt: 'task', domains: ['vault', 'brain'] });
      expect(signalByName(result, 'multi-domain')!.triggered).toBe(true);
      expect(signalByName(result, 'multi-domain')!.weight).toBe(5);
    });

    it('does not trigger with single domain', () => {
      const result = assess({ prompt: 'task', domains: ['vault'] });
      expect(signalByName(result, 'multi-domain')!.triggered).toBe(false);
    });

    it('does not trigger with no domains', () => {
      const result = assess({ prompt: 'task' });
      expect(signalByName(result, 'multi-domain')!.triggered).toBe(false);
    });
  });
});

// ─── Reasoning Output ───────────────────────────────────────────────

describe('assessTaskComplexity — reasoning', () => {
  it('includes signal names in reasoning when triggered', () => {
    const result = assess({ prompt: 'migrate the database', filesEstimated: 5 });
    expect(result.reasoning).toContain('cross-cutting-keywords');
    expect(result.reasoning).toContain('file-count');
  });

  it('provides fallback reasoning when nothing triggers', () => {
    const result = assess({ prompt: 'fix typo' });
    expect(result.reasoning).toContain('No complexity signals detected');
  });

  it('always returns 6 signals', () => {
    const result = assess({ prompt: 'anything' });
    expect(result.signals).toHaveLength(6);
  });
});
