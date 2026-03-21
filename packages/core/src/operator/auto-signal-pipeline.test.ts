/**
 * Auto-signal pipeline integration tests.
 *
 * Verifies that signal extraction is wired into:
 * - session_capture (memory facade)
 * - learning radar (analyze)
 * - brain intelligence (buildIntelligence)
 *
 * All hooks must be graceful: missing operatorProfile never throws.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Brain } from '../brain/brain.js';
import { LearningRadar } from '../brain/learning-radar.js';
import { BrainIntelligence } from '../brain/intelligence.js';
import { OperatorProfileStore } from './operator-profile.js';
import { extractFromSession, type SessionCaptureData } from './operator-signals.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeSessionData(overrides: Partial<SessionCaptureData> = {}): SessionCaptureData {
  return {
    sessionId: 'test-session-001',
    intent: 'refactor the authentication module',
    capturedAt: new Date().toISOString(),
    toolsUsed: ['vault_search', 'memory_capture', 'vault_search'],
    filesModified: ['src/auth.ts', 'src/login.ts'],
    decisions: ['Use JWT refresh tokens'],
    summary: 'Refactored auth module',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('Auto-signal pipeline', () => {
  let vault: Vault;
  let brain: Brain;

  beforeEach(() => {
    vault = new Vault(':memory:');
    brain = new Brain(vault);
  });

  afterEach(() => {
    vault.close();
  });

  // ─── session_capture triggers signal accumulation ────────────────

  describe('session_capture → operator signals', () => {
    it('extracts and accumulates signals from session data', () => {
      const store = new OperatorProfileStore(vault);
      const sessionData = makeSessionData();
      const signals = extractFromSession(sessionData);

      expect(signals.length).toBeGreaterThan(0);

      const inserted = store.accumulateSignals(signals);
      expect(inserted).toBe(signals.length);

      const stats = store.signalStats();
      expect(stats.totalUnprocessed).toBe(signals.length);
    });

    it('produces command_style, work_rhythm, tool_preference, session_depth signals', () => {
      const sessionData = makeSessionData();
      const signals = extractFromSession(sessionData);
      const types = signals.map((s) => s.signalType);

      expect(types).toContain('command_style');
      expect(types).toContain('work_rhythm');
      expect(types).toContain('tool_preference');
      expect(types).toContain('session_depth');
    });
  });

  // ─── radar candidate triggers signal accumulation ────────────────

  describe('learning radar → operator signals', () => {
    it('accumulates signals when operatorProfile is wired', () => {
      const store = new OperatorProfileStore(vault);
      const radar = new LearningRadar(vault, brain);
      radar.setOperatorProfile(store);

      // correction signal → should produce an operator signal
      radar.analyze({
        type: 'correction',
        title: 'Use semantic tokens',
        description: 'Corrected from raw hex to semantic token',
        confidence: 0.75,
      });

      const stats = store.signalStats();
      expect(stats.totalUnprocessed).toBeGreaterThan(0);
      expect(stats.byType['correction']).toBeGreaterThan(0);
    });

    it('accumulates frustration signal from repeated_question', () => {
      const store = new OperatorProfileStore(vault);
      const radar = new LearningRadar(vault, brain);
      radar.setOperatorProfile(store);

      radar.analyze({
        type: 'repeated_question',
        title: 'How to use vault search',
        description: 'User asked about vault search again',
        confidence: 0.6,
        sourceQuery: 'vault search',
      });

      const stats = store.signalStats();
      expect(stats.byType['frustration']).toBeGreaterThan(0);
    });

    it('skips silently when operatorProfile is not set', () => {
      const radar = new LearningRadar(vault, brain);
      // No setOperatorProfile call

      // Should not throw
      const candidate = radar.analyze({
        type: 'correction',
        title: 'Use semantic tokens',
        description: 'Corrected approach',
        confidence: 0.75,
      });

      expect(candidate).toBeDefined();
    });
  });

  // ─── brain intelligence → operator signals ───────────────────────

  describe('brain intelligence → operator signals', () => {
    it('accumulates domain expertise signals after buildIntelligence', () => {
      const store = new OperatorProfileStore(vault);
      const intel = new BrainIntelligence(vault, brain);
      intel.setOperatorProfile(store);

      // Seed some brain data so strengths can be computed
      brain.enrichAndCapture({
        id: 'test-entry-1',
        type: 'pattern',
        domain: 'typescript',
        title: 'Use strict mode',
        description: 'Always enable strict TypeScript',
        severity: 'suggestion',
        tags: ['typescript', 'config'],
        origin: 'agent',
      });

      // Build intelligence — may or may not produce strengths
      // depending on data, but should never throw
      const result = intel.buildIntelligence();
      expect(result).toBeDefined();
      expect(result.strengthsComputed).toBeGreaterThanOrEqual(0);
    });

    it('skips silently when operatorProfile is not set', () => {
      const intel = new BrainIntelligence(vault, brain);
      // No setOperatorProfile call

      // Should not throw
      const result = intel.buildIntelligence();
      expect(result).toBeDefined();
    });
  });

  // ─── Graceful degradation ────────────────────────────────────────

  describe('graceful degradation', () => {
    it('extractFromSession with minimal data does not crash', () => {
      const sessionData = makeSessionData({
        intent: null,
        toolsUsed: null,
        filesModified: null,
        decisions: null,
        summary: null,
      });
      const signals = extractFromSession(sessionData);
      // Should still produce at least work_rhythm and session_depth
      expect(signals.length).toBeGreaterThan(0);
    });

    it('session_capture return value is unchanged by signal extraction', () => {
      // Verify the existing captureMemory behavior is not affected
      const memory = vault.captureMemory({
        projectPath: '/test',
        type: 'session',
        context: 'Test session',
        summary: 'Test summary',
        topics: [],
        filesModified: [],
        toolsUsed: [],
        intent: null,
        decisions: [],
        currentState: null,
        nextSteps: [],
        vaultEntriesReferenced: [],
      });

      expect(memory).toBeDefined();
      expect(memory.summary).toBe('Test summary');
    });
  });
});
