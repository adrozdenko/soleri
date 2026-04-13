/**
 * Unit tests for computeStrengthsFromFeedback — the pure function that
 * turns feedback aggregate rows into pattern-strength records.
 *
 * Regression coverage: feedback rows with null entry_title must be skipped,
 * not fall back to entry_id. Historical bug caused entry IDs like
 * "plan-1775943067837-xin7gn" to appear as pattern names in brain_strengths.
 */

import { describe, it, expect } from 'vitest';
import {
  computeStrengthsFromFeedback,
  type FeedbackAggregateRow,
} from './intelligence-strengths.js';

const baseRow = (overrides: Partial<FeedbackAggregateRow> = {}): FeedbackAggregateRow => ({
  entry_id: 'entry-123',
  total: 5,
  accepted: 3,
  dismissed: 1,
  modified: 1,
  failed: 0,
  last_used: String(Date.now() / 1000),
  entry_title: 'Real Pattern Title',
  entry_domain: 'architecture',
  ...overrides,
});

describe('computeStrengthsFromFeedback', () => {
  it('produces a strength record for a row with a real title', () => {
    const strengths = computeStrengthsFromFeedback([baseRow()], 3);

    expect(strengths).toHaveLength(1);
    expect(strengths[0]!.pattern).toBe('Real Pattern Title');
    expect(strengths[0]!.domain).toBe('architecture');
  });

  it('skips rows where entry_title is null (regression: entry-ID leak)', () => {
    // Before fix: fallback `row.entry_title ?? row.entry_id` stored the
    // plan-ID as the pattern name — brain_strengths got polluted with rows
    // like { pattern: "plan-1234567890123-abc", domain: "unknown" }.
    const nullTitleRow = baseRow({
      entry_id: 'plan-1234567890123-regr',
      entry_title: null,
    });

    const strengths = computeStrengthsFromFeedback([nullTitleRow], 3);

    // Stricter: pattern must not be the entry_id
    const patterns = strengths.map((s) => s.pattern);
    expect(patterns).not.toContain('plan-1234567890123-regr');
    // Cleanest: the row is dropped entirely
    expect(strengths).toHaveLength(0);
  });

  it('skips rows where entry_title is an empty string', () => {
    // Defensive: empty string is semantically equivalent to missing title
    const emptyTitleRow = baseRow({
      entry_id: 'architecture-1234567890-empty',
      entry_title: '',
    });

    const strengths = computeStrengthsFromFeedback([emptyTitleRow], 3);

    expect(strengths).toHaveLength(0);
  });

  it('keeps other valid rows when one has null title', () => {
    const mix = [
      baseRow({ entry_id: 'a', entry_title: 'Good One' }),
      baseRow({ entry_id: 'plan-999-bad', entry_title: null }),
      baseRow({ entry_id: 'b', entry_title: 'Another Good' }),
    ];

    const strengths = computeStrengthsFromFeedback(mix, 3);

    expect(strengths.map((s) => s.pattern)).toEqual(['Good One', 'Another Good']);
  });
});
