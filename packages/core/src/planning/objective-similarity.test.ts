import { describe, it, expect } from 'vitest';
import { diceCoefficient, findSimilarPlan } from './objective-similarity.js';

describe('diceCoefficient', () => {
  it('should return 1.0 for identical strings', () => {
    expect(diceCoefficient('hello world', 'hello world')).toBe(1.0);
  });

  it('should return 1.0 for strings differing only in case', () => {
    expect(diceCoefficient('Hello World', 'hello world')).toBe(1.0);
  });

  it('should return 1.0 for strings differing only in punctuation', () => {
    expect(diceCoefficient('Fix bug — login fails', 'Fix bug login fails')).toBe(1.0);
  });

  it('should return 0.0 for completely different strings', () => {
    expect(diceCoefficient('apple banana', 'xyz quantum')).toBeLessThan(0.2);
  });

  it('should return 0.0 for single-character strings', () => {
    expect(diceCoefficient('a', 'b')).toBe(0.0);
  });

  it('should return high score for near-identical objectives', () => {
    const a = 'Implement interleaved round-robin exercise selection for ADHD kids';
    const b =
      'Implement interleaved round-robin exercise selection so ADHD kids practice all exercise types';
    expect(diceCoefficient(a, b)).toBeGreaterThan(0.7);
  });

  it('should return low score for unrelated objectives', () => {
    const a = 'Fix plan lifecycle accumulation bugs';
    const b = 'Add i18n support for multi-language rendering';
    expect(diceCoefficient(a, b)).toBeLessThan(0.4);
  });

  it('should handle empty strings', () => {
    expect(diceCoefficient('', '')).toBe(1.0);
    expect(diceCoefficient('hello', '')).toBe(0.0);
    expect(diceCoefficient('', 'hello')).toBe(0.0);
  });
});

describe('findSimilarPlan', () => {
  const plans = [
    { objective: 'Fix login timeout issue', status: 'executing' },
    { objective: 'Add user authentication', status: 'draft' },
    { objective: 'Refactor database layer', status: 'completed' },
    { objective: 'Fix signup validation errors', status: 'approved' },
  ];

  it('should find a similar active plan above threshold', () => {
    const result = findSimilarPlan(plans, 'Fix login timeout bug', 0.7);
    expect(result).not.toBeNull();
    expect(result!.plan.objective).toBe('Fix login timeout issue');
    expect(result!.score).toBeGreaterThan(0.7);
  });

  it('should skip completed plans', () => {
    const result = findSimilarPlan(plans, 'Refactor database layer', 0.8);
    expect(result).toBeNull();
  });

  it('should skip archived plans', () => {
    const archivedPlans = [{ objective: 'Fix login timeout issue', status: 'archived' }];
    const result = findSimilarPlan(archivedPlans, 'Fix login timeout issue', 0.8);
    expect(result).toBeNull();
  });

  it('should return null when no plan meets threshold', () => {
    const result = findSimilarPlan(plans, 'Deploy to production', 0.8);
    expect(result).toBeNull();
  });

  it('should return the best match when multiple plans are similar', () => {
    const similarPlans = [
      { objective: 'Fix login timeout issue in auth module', status: 'executing' },
      { objective: 'Fix login timeout issue', status: 'draft' },
    ];
    const result = findSimilarPlan(similarPlans, 'Fix login timeout issue', 0.8);
    expect(result).not.toBeNull();
    expect(result!.plan.objective).toBe('Fix login timeout issue');
  });

  it('should use default threshold of 0.8 (strictly greater than)', () => {
    // Exact match has score 1.0, which is > 0.8 threshold
    const result = findSimilarPlan(plans, 'Fix login timeout issue');
    expect(result).not.toBeNull();
  });
});
