import { describe, it, expect } from 'vitest';
import { detectRationalizations } from './rationalization-detector.js';

const CRITERIA = [
  'All API endpoints return proper error codes',
  'Unit test coverage above 80%',
  'Database migrations are reversible',
];

describe('detectRationalizations', () => {
  // ─── Positive cases: each pattern detected ──────────────────

  it('detects "out of scope" pattern', () => {
    const report = detectRationalizations(
      CRITERIA,
      'Database migrations are out of scope for this task.',
    );
    expect(report.detected).toBe(true);
    expect(report.items).toHaveLength(1);
    expect(report.items[0].pattern).toBe('out-of-scope');
  });

  it('detects "follow-up ticket" pattern', () => {
    const report = detectRationalizations(
      CRITERIA,
      'Error codes will be addressed in a follow-up issue.',
    );
    expect(report.detected).toBe(true);
    expect(report.items).toHaveLength(1);
    expect(report.items[0].pattern).toBe('follow-up-ticket');
  });

  it('detects "follow-up PR" pattern', () => {
    const report = detectRationalizations(
      CRITERIA,
      'Test coverage bump deferred to follow-up PR.',
    );
    expect(report.detected).toBe(true);
    expect(report.items[0].pattern).toBe('follow-up-ticket');
  });

  it('detects "pre-existing issue" pattern', () => {
    const report = detectRationalizations(
      CRITERIA,
      'The missing error codes are a pre-existing bug in the codebase.',
    );
    expect(report.detected).toBe(true);
    expect(report.items[0].pattern).toBe('pre-existing-issue');
  });

  it('detects "over-engineering" pattern', () => {
    const report = detectRationalizations(
      CRITERIA,
      'Making migrations reversible would be over-engineering at this stage.',
    );
    expect(report.detected).toBe(true);
    expect(report.items[0].pattern).toBe('over-engineering');
  });

  it('detects "separate PR" pattern', () => {
    const report = detectRationalizations(
      CRITERIA,
      'Test coverage improvements will go in a separate PR.',
    );
    expect(report.detected).toBe(true);
    expect(report.items[0].pattern).toBe('separate-pr');
  });

  it('detects "too complex for this task" pattern', () => {
    const report = detectRationalizations(
      CRITERIA,
      'Reversible migrations are too complex for this task, deferring.',
    );
    expect(report.detected).toBe(true);
    expect(report.items[0].pattern).toBe('too-complex');
  });

  // ─── Negative cases: clean completion ───────────────────────

  it('returns no detection for clean completion claim', () => {
    const report = detectRationalizations(
      CRITERIA,
      'All endpoints return proper error codes. Test coverage is at 85%. Migrations are reversible.',
    );
    expect(report.detected).toBe(false);
    expect(report.items).toHaveLength(0);
  });

  it('returns no detection for unrelated text', () => {
    const report = detectRationalizations(
      CRITERIA,
      'Implemented the feature, ran all tests, everything passes.',
    );
    expect(report.detected).toBe(false);
    expect(report.items).toHaveLength(0);
  });

  // ─── Case-insensitive matching ──────────────────────────────

  it('matches case-insensitively (uppercase)', () => {
    const report = detectRationalizations(
      CRITERIA,
      'This is OUT OF SCOPE for the current work.',
    );
    expect(report.detected).toBe(true);
    expect(report.items[0].pattern).toBe('out-of-scope');
  });

  it('matches case-insensitively (mixed case)', () => {
    const report = detectRationalizations(
      CRITERIA,
      'That is a Pre-Existing Issue we inherited.',
    );
    expect(report.detected).toBe(true);
    expect(report.items[0].pattern).toBe('pre-existing-issue');
  });

  // ─── Empty/skip cases ──────────────────────────────────────

  it('skips detection when acceptance criteria are empty', () => {
    const report = detectRationalizations(
      [],
      'This is out of scope and a pre-existing issue.',
    );
    expect(report.detected).toBe(false);
    expect(report.items).toHaveLength(0);
  });

  it('skips detection when completion claim is empty', () => {
    const report = detectRationalizations(CRITERIA, '');
    expect(report.detected).toBe(false);
    expect(report.items).toHaveLength(0);
  });

  it('skips detection when completion claim is whitespace only', () => {
    const report = detectRationalizations(CRITERIA, '   ');
    expect(report.detected).toBe(false);
    expect(report.items).toHaveLength(0);
  });

  // ─── Multiple rationalizations ─────────────────────────────

  it('detects multiple rationalizations in one claim', () => {
    const report = detectRationalizations(
      CRITERIA,
      'Error codes are out of scope. Test coverage will go in a separate PR. ' +
        'Reversible migrations are too complex for this task.',
    );
    expect(report.detected).toBe(true);
    expect(report.items.length).toBeGreaterThanOrEqual(3);

    const patterns = report.items.map((i) => i.pattern);
    expect(patterns).toContain('out-of-scope');
    expect(patterns).toContain('separate-pr');
    expect(patterns).toContain('too-complex');
  });

  // ─── Suggestion is always present ──────────────────────────

  it('provides actionable suggestions for each item', () => {
    const report = detectRationalizations(
      CRITERIA,
      'This is out of scope and over-engineering.',
    );
    expect(report.detected).toBe(true);
    for (const item of report.items) {
      expect(item.suggestion).toBeTruthy();
      expect(item.suggestion.length).toBeGreaterThan(10);
    }
  });
});
