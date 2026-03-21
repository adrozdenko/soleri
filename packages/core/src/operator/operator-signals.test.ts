/**
 * operator-signals — TDD tests for pure signal extraction functions.
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
    sessionId: 'sess-001',
    intent: 'fix login bug',
    capturedAt: '2025-06-15T23:30:00Z',
    toolsUsed: ['vault_search', 'memory_capture'],
    filesModified: ['src/auth.ts', 'src/login.ts'],
    decisions: ['Use JWT refresh tokens', 'Add rate limiting'],
    summary: 'Fixed login timeout issue',
    ...overrides,
  };
}

function makeRadarCandidate(overrides: Partial<RadarCandidate> = {}): RadarCandidate {
  return {
    id: 1,
    signalType: 'correction',
    title: 'Wrong import path',
    description: 'Used relative instead of alias',
    suggestedType: 'anti-pattern',
    confidence: 0.75,
    status: 'pending',
    sourceQuery: null,
    context: 'User corrected import statement',
    createdAt: '2025-06-15T10:00:00Z',
    ...overrides,
  };
}

function makeStrength(overrides: Partial<PatternStrength> = {}): PatternStrength {
  return {
    pattern: 'typescript-strict-mode',
    domain: 'typescript',
    strength: 0.8,
    usageScore: 0.7,
    spreadScore: 0.6,
    successScore: 0.9,
    recencyScore: 0.8,
    usageCount: 15,
    uniqueContexts: 4,
    successRate: 0.85,
    lastUsed: '2025-06-15T10:00:00Z',
    ...overrides,
  };
}

// ─── extractFromSession ───────────────────────────────────────────────

describe('operator-signals', () => {
  describe('extractFromSession', () => {
    it('extracts command_style terse for short intent (<5 words)', () => {
      const signals = extractFromSession(makeSession({ intent: 'fix login bug' }));
      const cs = signals.find((s) => s.signalType === 'command_style');
      expect(cs).toBeDefined();
      expect(cs!.data).toMatchObject({ style: 'terse', snippet: 'fix login bug' });
      expect(cs!.confidence).toBeGreaterThanOrEqual(0.4);
      expect(cs!.confidence).toBeLessThanOrEqual(0.6);
    });

    it('extracts command_style verbose for long intent (>20 words)', () => {
      const longIntent =
        'I want to refactor the entire authentication module so that it supports OAuth2 and SAML and also handles token refresh gracefully across all microservices in our cluster';
      const signals = extractFromSession(makeSession({ intent: longIntent }));
      const cs = signals.find((s) => s.signalType === 'command_style');
      expect(cs).toBeDefined();
      expect(cs!.data).toMatchObject({ style: 'verbose' });
    });

    it('extracts command_style conversational for medium intent (5-20 words)', () => {
      const mediumIntent = 'Can you help me fix the login page timeout issue please';
      const signals = extractFromSession(makeSession({ intent: mediumIntent }));
      const cs = signals.find((s) => s.signalType === 'command_style');
      expect(cs).toBeDefined();
      expect(cs!.data).toMatchObject({ style: 'conversational' });
    });

    it('extracts work_rhythm with hour from capturedAt', () => {
      const signals = extractFromSession(makeSession({ capturedAt: '2025-06-15T23:30:00Z' }));
      const wr = signals.find((s) => s.signalType === 'work_rhythm');
      expect(wr).toBeDefined();
      expect((wr!.data as { taskCount: number }).taskCount).toBeGreaterThanOrEqual(0);
    });

    it('maps toolsUsed to tool_preference signals with frequency', () => {
      const signals = extractFromSession(
        makeSession({ toolsUsed: ['vault_search', 'vault_search', 'memory_capture'] }),
      );
      const toolSignals = signals.filter((s) => s.signalType === 'tool_preference');
      expect(toolSignals.length).toBe(2); // two unique tools
      const vaultSignal = toolSignals.find(
        (s) => (s.data as { toolName: string }).toolName === 'vault_search',
      );
      expect(vaultSignal).toBeDefined();
      expect((vaultSignal!.data as { frequency: number }).frequency).toBe(2);
    });

    it('extracts session_depth from filesModified + decisions count', () => {
      const signals = extractFromSession(
        makeSession({
          filesModified: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
          decisions: ['dec1', 'dec2', 'dec3'],
        }),
      );
      const sd = signals.find((s) => s.signalType === 'session_depth');
      expect(sd).toBeDefined();
      expect((sd!.data as { depth: string }).depth).toBe('deep');
    });

    it('returns shallow depth for minimal session', () => {
      const signals = extractFromSession(
        makeSession({ filesModified: [], decisions: [] }),
      );
      const sd = signals.find((s) => s.signalType === 'session_depth');
      expect(sd).toBeDefined();
      expect((sd!.data as { depth: string }).depth).toBe('shallow');
    });

    it('handles null toolsUsed gracefully — returns signals for other fields', () => {
      const signals = extractFromSession(
        makeSession({ toolsUsed: null as unknown as string[] }),
      );
      // Should still have command_style, work_rhythm, session_depth
      expect(signals.some((s) => s.signalType === 'command_style')).toBe(true);
      expect(signals.some((s) => s.signalType === 'work_rhythm')).toBe(true);
      expect(signals.some((s) => s.signalType === 'session_depth')).toBe(true);
      // No tool_preference signals
      expect(signals.filter((s) => s.signalType === 'tool_preference').length).toBe(0);
    });

    it('handles null intent gracefully — skips command_style', () => {
      const signals = extractFromSession(
        makeSession({ intent: null as unknown as string }),
      );
      expect(signals.some((s) => s.signalType === 'command_style')).toBe(false);
      expect(signals.some((s) => s.signalType === 'work_rhythm')).toBe(true);
    });

    it('has sessionId on all signals', () => {
      const signals = extractFromSession(makeSession({ sessionId: 'sess-xyz' }));
      for (const s of signals) {
        expect(s.sessionId).toBe('sess-xyz');
      }
    });

    it('all signals have confidence between 0.4 and 0.6', () => {
      const signals = extractFromSession(makeSession());
      for (const s of signals) {
        expect(s.confidence).toBeGreaterThanOrEqual(0.4);
        expect(s.confidence).toBeLessThanOrEqual(0.6);
      }
    });
  });

  // ─── extractFromRadar ─────────────────────────────────────────────

  describe('extractFromRadar', () => {
    it('maps correction signal_type to correction operator signal', () => {
      const candidate = makeRadarCandidate({ signalType: 'correction', confidence: 0.75 });
      const signals = extractFromRadar(candidate);
      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe('correction');
      expect(signals[0].confidence).toBe(0.75);
    });

    it('maps repeated_question to frustration signal', () => {
      const candidate = makeRadarCandidate({
        signalType: 'repeated_question',
        confidence: 0.6,
        title: 'How to configure ESLint',
        sourceQuery: 'eslint config',
      });
      const signals = extractFromRadar(candidate);
      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe('frustration');
      expect(signals[0].confidence).toBe(0.6);
    });

    it('returns empty array for irrelevant signal types', () => {
      const candidate = makeRadarCandidate({ signalType: 'pattern_success' });
      const signals = extractFromRadar(candidate);
      expect(signals).toEqual([]);
    });

    it('passes through radar confidence score', () => {
      const candidate = makeRadarCandidate({ signalType: 'correction', confidence: 0.92 });
      const signals = extractFromRadar(candidate);
      expect(signals[0].confidence).toBe(0.92);
    });
  });

  // ─── extractFromBrainStrengths ────────────────────────────────────

  describe('extractFromBrainStrengths', () => {
    it('creates domain_expertise for strengths with score > 0.6', () => {
      const strengths = [makeStrength({ pattern: 'typescript-strict', domain: 'typescript', strength: 0.8 })];
      const signals = extractFromBrainStrengths(strengths);
      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe('domain_expertise');
      const data = signals[0].data as { domain: string; level: string; evidence: string };
      expect(data.domain).toBe('typescript');
      expect(data.evidence).toContain('typescript-strict');
      expect(data.evidence).toContain('0.8');
    });

    it('filters out strengths with score <= 0.6', () => {
      const strengths = [makeStrength({ strength: 0.5 }), makeStrength({ strength: 0.3 })];
      const signals = extractFromBrainStrengths(strengths);
      expect(signals).toEqual([]);
    });

    it('maps high strength (>= 0.8) to expert level', () => {
      const signals = extractFromBrainStrengths([makeStrength({ strength: 0.85 })]);
      expect((signals[0].data as { level: string }).level).toBe('expert');
    });

    it('maps medium-high strength (0.6-0.8) to advanced level', () => {
      const signals = extractFromBrainStrengths([makeStrength({ strength: 0.7 })]);
      expect((signals[0].data as { level: string }).level).toBe('advanced');
    });

    it('handles empty array', () => {
      expect(extractFromBrainStrengths([])).toEqual([]);
    });

    it('includes pattern name and score in signal data', () => {
      const signals = extractFromBrainStrengths([
        makeStrength({ pattern: 'react-hooks', domain: 'react', strength: 0.9 }),
      ]);
      const data = signals[0].data as { domain: string; evidence: string };
      expect(data.domain).toBe('react');
      expect(data.evidence).toContain('react-hooks');
      expect(data.evidence).toContain('0.9');
    });

    it('uses strength score as confidence', () => {
      const signals = extractFromBrainStrengths([makeStrength({ strength: 0.75 })]);
      expect(signals[0].confidence).toBe(0.75);
    });
  });

  // ─── Purity ───────────────────────────────────────────────────────

  describe('purity', () => {
    it('extractFromSession does not mutate input', () => {
      const input = makeSession();
      const frozen = JSON.parse(JSON.stringify(input));
      extractFromSession(input);
      expect(input).toEqual(frozen);
    });

    it('extractFromRadar does not mutate input', () => {
      const input = makeRadarCandidate();
      const frozen = JSON.parse(JSON.stringify(input));
      extractFromRadar(input);
      expect(input).toEqual(frozen);
    });

    it('extractFromBrainStrengths does not mutate input', () => {
      const input = [makeStrength()];
      const frozen = JSON.parse(JSON.stringify(input));
      extractFromBrainStrengths(input);
      expect(input).toEqual(frozen);
    });
  });
});
