/**
 * Extended unit tests for operator-signals pure extraction functions.
 *
 * Covers: purity verification, edge cases (empty data, zero-length arrays),
 * extractFromSession with various intent lengths, extractFromRadar with
 * unknown signal types.
 */

import { describe, it, expect } from 'vitest';
import {
  extractFromSession,
  extractFromRadar,
  extractFromBrainStrengths,
  type SessionCaptureData,
} from './operator-signals.js';
import type { RadarCandidate } from '../brain/learning-radar.js';
import type { PatternStrength } from '../brain/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionCaptureData> = {}): SessionCaptureData {
  return {
    sessionId: 'sess-ext-001',
    intent: 'fix the auth flow',
    capturedAt: '2025-07-01T14:00:00Z',
    toolsUsed: ['vault_search'],
    filesModified: ['src/auth.ts'],
    decisions: ['Use refresh tokens'],
    summary: 'Auth session',
    ...overrides,
  };
}

function makeRadarCandidate(overrides: Partial<RadarCandidate> = {}): RadarCandidate {
  return {
    id: 42,
    signalType: 'correction',
    title: 'Wrong path',
    description: 'Used wrong import',
    suggestedType: 'anti-pattern',
    confidence: 0.7,
    status: 'pending',
    sourceQuery: null,
    context: 'Import correction',
    createdAt: '2025-07-01T10:00:00Z',
    ...overrides,
  };
}

function makeStrength(overrides: Partial<PatternStrength> = {}): PatternStrength {
  return {
    pattern: 'ts-strict',
    domain: 'typescript',
    strength: 0.85,
    usageScore: 0.7,
    spreadScore: 0.6,
    successScore: 0.9,
    recencyScore: 0.8,
    usageCount: 10,
    uniqueContexts: 3,
    successRate: 0.9,
    lastUsed: '2025-07-01T10:00:00Z',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('operator-signals (extended)', () => {
  // ─── Purity ─────────────────────────────────────────────────────────

  describe('purity — functions do not mutate input objects', () => {
    it('extractFromSession preserves input arrays', () => {
      const tools = ['vault_search', 'memory_capture'];
      const files = ['a.ts', 'b.ts'];
      const decisions = ['dec1'];
      const input = makeSession({ toolsUsed: tools, filesModified: files, decisions });

      const toolsBefore = [...tools];
      const filesBefore = [...files];
      const decsBefore = [...decisions];

      extractFromSession(input);

      expect(input.toolsUsed).toEqual(toolsBefore);
      expect(input.filesModified).toEqual(filesBefore);
      expect(input.decisions).toEqual(decsBefore);
    });

    it('extractFromRadar preserves all candidate fields', () => {
      const input = makeRadarCandidate({ confidence: 0.88 });
      const snapshot = { ...input };
      extractFromRadar(input);
      expect(input).toEqual(snapshot);
    });

    it('extractFromBrainStrengths preserves input array length', () => {
      const input = [makeStrength(), makeStrength({ strength: 0.3 })];
      const lenBefore = input.length;
      extractFromBrainStrengths(input);
      expect(input).toHaveLength(lenBefore);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('empty session data — null fields produce minimal signals', () => {
      const signals = extractFromSession(makeSession({
        intent: null as unknown as string,
        toolsUsed: null as unknown as string[],
        filesModified: null as unknown as string[],
        decisions: null as unknown as string[],
      }));
      // Should still get work_rhythm and session_depth
      expect(signals.some((s) => s.signalType === 'work_rhythm')).toBe(true);
      expect(signals.some((s) => s.signalType === 'session_depth')).toBe(true);
      // No command_style or tool_preference
      expect(signals.some((s) => s.signalType === 'command_style')).toBe(false);
      expect(signals.some((s) => s.signalType === 'tool_preference')).toBe(false);
    });

    it('empty toolsUsed array produces no tool_preference signals', () => {
      const signals = extractFromSession(makeSession({ toolsUsed: [] }));
      expect(signals.filter((s) => s.signalType === 'tool_preference')).toHaveLength(0);
    });

    it('zero-length strengths array returns empty', () => {
      expect(extractFromBrainStrengths([])).toEqual([]);
    });

    it('all strengths below threshold returns empty', () => {
      const strengths = [
        makeStrength({ strength: 0.1 }),
        makeStrength({ strength: 0.3 }),
        makeStrength({ strength: 0.6 }),
      ];
      expect(extractFromBrainStrengths(strengths)).toEqual([]);
    });

    it('empty filesModified and decisions produces shallow depth', () => {
      const signals = extractFromSession(makeSession({
        filesModified: [],
        decisions: [],
      }));
      const sd = signals.find((s) => s.signalType === 'session_depth');
      expect(sd).toBeDefined();
      expect((sd!.data as { depth: string }).depth).toBe('shallow');
    });
  });

  // ─── extractFromSession with Various Intent Lengths ────────────────

  describe('extractFromSession intent length classification', () => {
    it('1 word intent → terse', () => {
      const signals = extractFromSession(makeSession({ intent: 'deploy' }));
      const cs = signals.find((s) => s.signalType === 'command_style');
      expect(cs).toBeDefined();
      expect((cs!.data as { style: string }).style).toBe('terse');
    });

    it('exactly 5 words intent → conversational', () => {
      const signals = extractFromSession(makeSession({ intent: 'fix the login page timeout' }));
      const cs = signals.find((s) => s.signalType === 'command_style');
      expect(cs).toBeDefined();
      expect((cs!.data as { style: string }).style).toBe('conversational');
    });

    it('25 words intent → verbose', () => {
      const longIntent = Array.from({ length: 25 }, (_, i) => `word${i}`).join(' ');
      const signals = extractFromSession(makeSession({ intent: longIntent }));
      const cs = signals.find((s) => s.signalType === 'command_style');
      expect(cs).toBeDefined();
      expect((cs!.data as { style: string }).style).toBe('verbose');
    });

    it('exactly 4 words → terse (boundary)', () => {
      const signals = extractFromSession(makeSession({ intent: 'fix the login bug' }));
      const cs = signals.find((s) => s.signalType === 'command_style');
      expect((cs!.data as { style: string }).style).toBe('terse');
    });

    it('exactly 20 words → conversational (boundary)', () => {
      const intent = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
      const signals = extractFromSession(makeSession({ intent }));
      const cs = signals.find((s) => s.signalType === 'command_style');
      expect((cs!.data as { style: string }).style).toBe('conversational');
    });

    it('exactly 21 words → verbose (boundary)', () => {
      const intent = Array.from({ length: 21 }, (_, i) => `w${i}`).join(' ');
      const signals = extractFromSession(makeSession({ intent }));
      const cs = signals.find((s) => s.signalType === 'command_style');
      expect((cs!.data as { style: string }).style).toBe('verbose');
    });
  });

  // ─── extractFromRadar with Unknown Signal Types ─────────────────────

  describe('extractFromRadar with unknown signal types', () => {
    it('returns empty array for pattern_success', () => {
      expect(extractFromRadar(makeRadarCandidate({ signalType: 'pattern_success' }))).toEqual([]);
    });

    it('returns empty array for search_miss', () => {
      expect(extractFromRadar(makeRadarCandidate({ signalType: 'search_miss' }))).toEqual([]);
    });

    it('returns empty array for workaround', () => {
      expect(extractFromRadar(makeRadarCandidate({ signalType: 'workaround' }))).toEqual([]);
    });

    it('returns empty array for completely unknown type', () => {
      expect(extractFromRadar(makeRadarCandidate({ signalType: 'alien_signal' as never }))).toEqual([]);
    });
  });

  // ─── extractFromRadar frustration level mapping ─────────────────────

  describe('extractFromRadar frustration level mapping', () => {
    it('high confidence (>=0.7) → high frustration', () => {
      const signals = extractFromRadar(makeRadarCandidate({
        signalType: 'repeated_question',
        confidence: 0.75,
      }));
      expect((signals[0].data as { level: string }).level).toBe('high');
    });

    it('medium confidence (0.5-0.7) → moderate frustration', () => {
      const signals = extractFromRadar(makeRadarCandidate({
        signalType: 'repeated_question',
        confidence: 0.55,
      }));
      expect((signals[0].data as { level: string }).level).toBe('moderate');
    });

    it('low confidence (<0.5) → mild frustration', () => {
      const signals = extractFromRadar(makeRadarCandidate({
        signalType: 'repeated_question',
        confidence: 0.3,
      }));
      expect((signals[0].data as { level: string }).level).toBe('mild');
    });
  });
});
