/**
 * Default Suggestion Rules — colocated contract tests.
 *
 * Validates each of the 6 built-in rules: condition triggers and generate output shape.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_SUGGESTION_RULES } from './default-rules.js';
import type { SuggestionContext, Warning, SurfacedPattern } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<SuggestionContext>): SuggestionContext {
  return {
    recentFiles: [],
    pendingWarnings: [],
    surfacedPatterns: [],
    fileChangesProcessed: 0,
    ...overrides,
  };
}

function makeWarning(overrides?: Partial<Warning>): Warning {
  return {
    id: 'w-1',
    file: '/test.ts',
    severity: 'warning',
    category: 'test',
    message: 'test warning',
    ...overrides,
  };
}

function makePattern(overrides?: Partial<SurfacedPattern>): SurfacedPattern {
  return {
    entryId: 'p-1',
    title: 'Test pattern',
    domain: 'general',
    relevance: 0.8,
    trigger: '/test.ts',
    ...overrides,
  };
}

function findRule(name: string) {
  return DEFAULT_SUGGESTION_RULES.find(r => r.name === name)!;
}

describe('DEFAULT_SUGGESTION_RULES', () => {
  it('exports exactly 6 rules', () => {
    expect(DEFAULT_SUGGESTION_RULES).toHaveLength(6);
  });

  it('each rule has name, description, condition, and generate', () => {
    for (const rule of DEFAULT_SUGGESTION_RULES) {
      expect(typeof rule.name).toBe('string');
      expect(typeof rule.description).toBe('string');
      expect(typeof rule.condition).toBe('function');
      expect(typeof rule.generate).toBe('function');
    }
  });

  // ─── many-warnings ────────────────────────────────────────────────

  describe('many-warnings', () => {
    const rule = findRule('many-warnings');

    it('fires when 5+ warnings pending', () => {
      const warnings = Array.from({ length: 5 }, (_, i) => makeWarning({ id: `w-${i}` }));
      expect(rule.condition(makeContext({ pendingWarnings: warnings }))).toBe(true);
    });

    it('does not fire with fewer than 5 warnings', () => {
      expect(rule.condition(makeContext({ pendingWarnings: [makeWarning()] }))).toBe(false);
    });

    it('generates high priority suggestion with count in title', () => {
      const warnings = Array.from({ length: 7 }, (_, i) => makeWarning({ id: `w-${i}` }));
      const s = rule.generate(makeContext({ pendingWarnings: warnings }));
      expect(s.rule).toBe('many-warnings');
      expect(s.priority).toBe('high');
      expect(s.title).toContain('7');
    });
  });

  // ─── stale-patterns ───────────────────────────────────────────────

  describe('stale-patterns', () => {
    const rule = findRule('stale-patterns');

    it('fires when no patterns surfaced after 20+ changes', () => {
      expect(rule.condition(makeContext({ fileChangesProcessed: 21 }))).toBe(true);
    });

    it('does not fire with patterns present', () => {
      expect(rule.condition(makeContext({
        fileChangesProcessed: 30,
        surfacedPatterns: [makePattern()],
      }))).toBe(false);
    });

    it('does not fire with few changes', () => {
      expect(rule.condition(makeContext({ fileChangesProcessed: 5 }))).toBe(false);
    });

    it('generates medium priority suggestion', () => {
      const s = rule.generate(makeContext({ fileChangesProcessed: 25 }));
      expect(s.rule).toBe('stale-patterns');
      expect(s.priority).toBe('medium');
    });
  });

  // ─── high-activity-no-capture ─────────────────────────────────────

  describe('high-activity-no-capture', () => {
    const rule = findRule('high-activity-no-capture');

    it('fires when 50+ changes and no patterns', () => {
      expect(rule.condition(makeContext({ fileChangesProcessed: 51 }))).toBe(true);
    });

    it('does not fire with patterns', () => {
      expect(rule.condition(makeContext({
        fileChangesProcessed: 60,
        surfacedPatterns: [makePattern()],
      }))).toBe(false);
    });

    it('does not fire with few changes', () => {
      expect(rule.condition(makeContext({ fileChangesProcessed: 10 }))).toBe(false);
    });

    it('generates suggestion with change count', () => {
      const s = rule.generate(makeContext({ fileChangesProcessed: 55 }));
      expect(s.rule).toBe('high-activity-no-capture');
      expect(s.priority).toBe('medium');
      expect(s.description).toContain('55');
    });
  });

  // ─── critical-warnings ────────────────────────────────────────────

  describe('critical-warnings', () => {
    const rule = findRule('critical-warnings');

    it('fires when critical severity warnings exist', () => {
      const ctx = makeContext({
        pendingWarnings: [makeWarning({ severity: 'critical' })],
      });
      expect(rule.condition(ctx)).toBe(true);
    });

    it('does not fire with only non-critical warnings', () => {
      const ctx = makeContext({
        pendingWarnings: [makeWarning({ severity: 'warning' }), makeWarning({ severity: 'info' })],
      });
      expect(rule.condition(ctx)).toBe(false);
    });

    it('generates high priority with count and messages', () => {
      const ctx = makeContext({
        pendingWarnings: [
          makeWarning({ severity: 'critical', message: 'sec issue' }),
          makeWarning({ severity: 'critical', message: 'another issue' }),
          makeWarning({ severity: 'warning', message: 'minor' }),
        ],
      });
      const s = rule.generate(ctx);
      expect(s.rule).toBe('critical-warnings');
      expect(s.priority).toBe('high');
      expect(s.title).toContain('2');
      expect(s.description).toContain('sec issue');
    });
  });

  // ─── pattern-surfaced ─────────────────────────────────────────────

  describe('pattern-surfaced', () => {
    const rule = findRule('pattern-surfaced');

    it('fires when patterns are surfaced', () => {
      expect(rule.condition(makeContext({ surfacedPatterns: [makePattern()] }))).toBe(true);
    });

    it('does not fire with empty patterns', () => {
      expect(rule.condition(makeContext())).toBe(false);
    });

    it('generates low priority with pattern titles', () => {
      const ctx = makeContext({
        surfacedPatterns: [
          makePattern({ title: 'React hooks', domain: 'react' }),
          makePattern({ title: 'CSS Grid', domain: 'styling' }),
        ],
      });
      const s = rule.generate(ctx);
      expect(s.rule).toBe('pattern-surfaced');
      expect(s.priority).toBe('low');
      expect(s.description).toContain('React hooks');
      expect(s.description).toContain('CSS Grid');
    });
  });

  // ─── first-session ────────────────────────────────────────────────

  describe('first-session', () => {
    const rule = findRule('first-session');

    it('fires on fresh state (0 changes, 0 warnings)', () => {
      expect(rule.condition(makeContext())).toBe(true);
    });

    it('does not fire after changes processed', () => {
      expect(rule.condition(makeContext({ fileChangesProcessed: 1 }))).toBe(false);
    });

    it('does not fire when warnings exist', () => {
      expect(rule.condition(makeContext({ pendingWarnings: [makeWarning()] }))).toBe(false);
    });

    it('generates low priority welcome message', () => {
      const s = rule.generate(makeContext());
      expect(s.rule).toBe('first-session');
      expect(s.priority).toBe('low');
      expect(s.title).toContain('ready');
    });
  });
});
