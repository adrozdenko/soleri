/**
 * Session Compaction — colocated contract tests.
 *
 * Tests for:
 * - CompactionEvaluator (shouldCompact)
 * - PolicyResolver (resolvePolicy)
 * - HandoffRenderer (renderHandoff)
 * - Duration parser (parseDuration)
 */

import { describe, it, expect } from 'vitest';
import { shouldCompact, parseDuration } from './compaction-evaluator.js';
import { resolvePolicy } from './policy-resolver.js';
import { renderHandoff } from './handoff-renderer.js';
import { ENGINE_DEFAULTS } from './compaction-policy.js';
import type { SessionState, HandoffNote } from './compaction-policy.js';

// =============================================================================
// parseDuration
// =============================================================================

describe('parseDuration', () => {
  it('parses hours', () => {
    expect(parseDuration('72h')).toBe(72 * 3_600_000);
  });

  it('parses minutes', () => {
    expect(parseDuration('30m')).toBe(30 * 60_000);
  });

  it('parses days', () => {
    expect(parseDuration('7d')).toBe(7 * 86_400_000);
  });

  it('parses seconds', () => {
    expect(parseDuration('120s')).toBe(120_000);
  });

  it('parses milliseconds', () => {
    expect(parseDuration('500ms')).toBe(500);
  });

  it('returns undefined for invalid input', () => {
    expect(parseDuration('invalid')).toBeUndefined();
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('72x')).toBeUndefined();
  });
});

// =============================================================================
// shouldCompact — evaluator
// =============================================================================

describe('shouldCompact', () => {
  const baseSession: SessionState = {
    runCount: 10,
    inputTokens: 50_000,
    startedAt: new Date().toISOString(),
  };

  it('returns false when no thresholds are breached', () => {
    const result = shouldCompact(baseSession, {
      maxRuns: 200,
      maxInputTokens: 2_000_000,
      maxAge: '72h',
    });
    expect(result.compact).toBe(false);
    expect(result.reason).toBe('');
  });

  it('triggers on maxRuns', () => {
    const session = { ...baseSession, runCount: 200 };
    const result = shouldCompact(session, { maxRuns: 200 });
    expect(result.compact).toBe(true);
    expect(result.reason).toContain('Run count');
    expect(result.reason).toContain('200');
  });

  it('triggers on maxRuns when exceeded', () => {
    const session = { ...baseSession, runCount: 250 };
    const result = shouldCompact(session, { maxRuns: 200 });
    expect(result.compact).toBe(true);
  });

  it('triggers on maxInputTokens', () => {
    const session = { ...baseSession, inputTokens: 2_500_000 };
    const result = shouldCompact(session, { maxInputTokens: 2_000_000 });
    expect(result.compact).toBe(true);
    expect(result.reason).toContain('Input tokens');
  });

  it('triggers on maxAge', () => {
    const startedAt = new Date(Date.now() - 80 * 3_600_000).toISOString(); // 80 hours ago
    const session = { ...baseSession, startedAt };
    const result = shouldCompact(session, { maxAge: '72h' });
    expect(result.compact).toBe(true);
    expect(result.reason).toContain('Session age');
  });

  it('returns first triggered threshold (maxRuns before maxInputTokens)', () => {
    const session: SessionState = {
      runCount: 300,
      inputTokens: 3_000_000,
      startedAt: new Date(Date.now() - 100 * 3_600_000).toISOString(),
    };
    const result = shouldCompact(session, {
      maxRuns: 200,
      maxInputTokens: 2_000_000,
      maxAge: '72h',
    });
    expect(result.compact).toBe(true);
    expect(result.reason).toContain('Run count');
  });

  it('skips undefined thresholds', () => {
    const result = shouldCompact(baseSession, {});
    expect(result.compact).toBe(false);
  });

  it('handles invalid maxAge gracefully', () => {
    const result = shouldCompact(baseSession, { maxAge: 'bogus' });
    expect(result.compact).toBe(false);
  });

  it('accepts custom now parameter for age calculation', () => {
    const startedAt = '2026-01-01T00:00:00.000Z';
    const now = new Date('2026-01-04T00:00:00.000Z'); // 3 days later
    const session = { ...baseSession, startedAt };
    const result = shouldCompact(session, { maxAge: '2d' }, now);
    expect(result.compact).toBe(true);
  });
});

// =============================================================================
// resolvePolicy — three-level merge
// =============================================================================

describe('resolvePolicy', () => {
  it('returns engine defaults when no overrides', () => {
    const policy = resolvePolicy();
    expect(policy).toEqual(ENGINE_DEFAULTS);
  });

  it('agent config overrides engine defaults', () => {
    const policy = resolvePolicy({ maxRuns: 100 });
    expect(policy.maxRuns).toBe(100);
    expect(policy.maxInputTokens).toBe(ENGINE_DEFAULTS.maxInputTokens);
    expect(policy.maxAge).toBe(ENGINE_DEFAULTS.maxAge);
  });

  it('adapter defaults override engine defaults', () => {
    const policy = resolvePolicy(undefined, { maxInputTokens: 1_000_000 });
    expect(policy.maxInputTokens).toBe(1_000_000);
    expect(policy.maxRuns).toBe(ENGINE_DEFAULTS.maxRuns);
  });

  it('agent config overrides adapter defaults', () => {
    const policy = resolvePolicy({ maxAge: '24h' }, { maxAge: '48h' });
    expect(policy.maxAge).toBe('24h');
  });

  it('merges individual fields from different levels', () => {
    const policy = resolvePolicy({ maxRuns: 50 }, { maxInputTokens: 500_000, maxAge: '12h' });
    expect(policy.maxRuns).toBe(50); // from agent
    expect(policy.maxInputTokens).toBe(500_000); // from adapter
    expect(policy.maxAge).toBe('12h'); // from adapter
  });
});

// =============================================================================
// renderHandoff
// =============================================================================

describe('renderHandoff', () => {
  it('renders complete handoff note', () => {
    const note: HandoffNote = {
      rotatedAt: '2026-03-27T12:00:00.000Z',
      reason: 'Run count (200) reached threshold (200)',
      inProgress: 'Implementing session compaction policies',
      keyDecisions: ['Used three-level merge for policy resolution', 'ISO 8601 for timestamps'],
      filesModified: [
        'packages/core/src/session/compaction-policy.ts',
        'packages/core/src/index.ts',
      ],
    };

    const md = renderHandoff(note);
    expect(md).toContain('# Session Handoff');
    expect(md).toContain('**Rotated:** 2026-03-27T12:00:00.000Z');
    expect(md).toContain('**Reason:** Run count');
    expect(md).toContain('## In Progress');
    expect(md).toContain('Implementing session compaction policies');
    expect(md).toContain('## Key Decisions');
    expect(md).toContain('- Used three-level merge');
    expect(md).toContain('## Files Modified');
    expect(md).toContain('- `packages/core/src/session/compaction-policy.ts`');
  });

  it('omits In Progress section when empty', () => {
    const note: HandoffNote = {
      rotatedAt: '2026-03-27T12:00:00.000Z',
      reason: 'Token threshold',
      inProgress: '',
      keyDecisions: ['Something'],
      filesModified: [],
    };

    const md = renderHandoff(note);
    expect(md).not.toContain('## In Progress');
    expect(md).toContain('## Key Decisions');
  });

  it('omits Key Decisions section when empty', () => {
    const note: HandoffNote = {
      rotatedAt: '2026-03-27T12:00:00.000Z',
      reason: 'Age threshold',
      inProgress: 'Working on X',
      keyDecisions: [],
      filesModified: [],
    };

    const md = renderHandoff(note);
    expect(md).toContain('## In Progress');
    expect(md).not.toContain('## Key Decisions');
    expect(md).not.toContain('## Files Modified');
  });

  it('omits Files Modified section when empty', () => {
    const note: HandoffNote = {
      rotatedAt: '2026-03-27T12:00:00.000Z',
      reason: 'Threshold',
      inProgress: '',
      keyDecisions: [],
      filesModified: [],
    };

    const md = renderHandoff(note);
    expect(md).not.toContain('## In Progress');
    expect(md).not.toContain('## Key Decisions');
    expect(md).not.toContain('## Files Modified');
    // Should still have header and metadata
    expect(md).toContain('# Session Handoff');
    expect(md).toContain('**Rotated:**');
    expect(md).toContain('**Reason:**');
  });

  it('ends with a trailing newline', () => {
    const note: HandoffNote = {
      rotatedAt: '2026-03-27T12:00:00.000Z',
      reason: 'Test',
      inProgress: '',
      keyDecisions: [],
      filesModified: [],
    };

    const md = renderHandoff(note);
    expect(md.endsWith('\n')).toBe(true);
  });
});
