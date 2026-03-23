/**
 * Extended unit tests for OperatorProfileStore.
 *
 * Covers: parallel section updates, snapshot versioning, graceful degradation,
 * signal stats after mixed accumulation, per-section synthesis check,
 * and delete-archives-to-history.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { OperatorProfileStore } from './operator-profile.js';
import { SignalType } from './operator-types.js';
import type {
  OperatorSignal,
  CommunicationSection,
  TechnicalContextSection,
  IdentitySection,
  TrustModelSection,
} from './operator-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeSignal(
  type: SignalType,
  data: Record<string, unknown>,
  overrides: Partial<OperatorSignal> = {},
): OperatorSignal {
  return {
    id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    signalType: type,
    data,
    timestamp: new Date().toISOString(),
    sessionId: 'test-session',
    confidence: 0.8,
    ...overrides,
  } as OperatorSignal;
}

function makeSignals(count: number, type: SignalType): OperatorSignal[] {
  return Array.from({ length: count }, (_, i) =>
    makeSignal(type, { style: 'terse', snippet: `cmd-${i}` }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('OperatorProfileStore (extended)', () => {
  let vault: Vault;
  let store: OperatorProfileStore;

  beforeEach(() => {
    vault = new Vault(':memory:');
    store = new OperatorProfileStore(vault);
  });

  afterEach(() => {
    vault.close();
  });

  // ─── Parallel Section Updates ───────────────────────────────────────

  describe('parallel section updates', () => {
    it('two concurrent updateSection for different sections both succeed', () => {
      store.accumulateSignals([
        makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' }),
      ]);

      const commData: CommunicationSection = {
        style: 'formal',
        signalWords: ['accordingly'],
        formality: 0.9,
        patience: 0.4,
        adaptationRules: [],
      };
      const techData: TechnicalContextSection = {
        domains: ['rust', 'wasm'],
        tools: [{ name: 'cargo', proficiency: 'expert', frequency: 'daily' }],
        blindSpots: [],
      };

      const r1 = store.updateSection('communication', commData);
      const r2 = store.updateSection('technicalContext', techData);
      expect(r1).toBe(true);
      expect(r2).toBe(true);

      const profile = store.getProfile();
      expect(profile).not.toBeNull();
      expect(profile!.communication.style).toBe('formal');
      expect(profile!.technicalContext.domains).toContain('rust');
    });

    it('updating one section does not overwrite another', () => {
      store.accumulateSignals([
        makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' }),
      ]);

      const identity: IdentitySection = {
        background: 'Senior engineer',
        role: 'Tech lead',
        philosophy: 'Ship fast, fix later',
        evidence: [],
      };
      store.updateSection('identity', identity);

      const trust: TrustModelSection = {
        level: 'established',
        builders: [],
        breakers: [],
        currentLevel: 0.85,
      };
      store.updateSection('trustModel', trust);

      const profile = store.getProfile();
      expect(profile!.identity.background).toBe('Senior engineer');
      expect(profile!.trustModel.level).toBe('established');
    });
  });

  // ─── Profile Snapshot Versioning ────────────────────────────────────

  describe('profile snapshot', () => {
    it('creates history entry with correct version increment', () => {
      store.accumulateSignals([
        makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' }),
      ]);
      const profileBefore = store.getProfile();
      expect(profileBefore!.version).toBe(0);

      store.snapshot('synthesis');
      const profileAfter = store.getProfile();
      expect(profileAfter!.version).toBe(1);

      store.snapshot('manual');
      const profileAfter2 = store.getProfile();
      expect(profileAfter2!.version).toBe(2);

      const provider = vault.getProvider();
      const history = provider.all<{ version: number; trigger: string }>(
        'SELECT version, trigger FROM operator_profile_history WHERE profile_id = ? ORDER BY version ASC',
        [profileBefore!.id],
      );
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(1);
      expect(history[0].trigger).toBe('synthesis');
      expect(history[1].version).toBe(2);
      expect(history[1].trigger).toBe('manual');
    });

    it('returns false when no profile exists', () => {
      expect(store.snapshot('test')).toBe(false);
    });
  });

  // ─── Graceful Degradation ──────────────────────────────────────────

  describe('graceful degradation', () => {
    it('getProfile on non-existent returns null, not throw', () => {
      expect(() => store.getProfile('non-existent-id')).not.toThrow();
      expect(store.getProfile('non-existent-id')).toBeNull();
    });

    it('getProfile without args on empty store returns null', () => {
      expect(store.getProfile()).toBeNull();
    });

    it('signalStats on empty store returns zeroed stats', () => {
      const stats = store.signalStats();
      expect(stats.byType).toEqual({});
      expect(stats.totalUnprocessed).toBe(0);
      expect(stats.lastSynthesis).toBeNull();
    });

    it('listSignals on empty store returns empty array', () => {
      expect(store.listSignals()).toEqual([]);
    });

    it('deleteProfile on empty store returns false', () => {
      expect(store.deleteProfile()).toBe(false);
    });
  });

  // ─── Signal Stats After Mixed Accumulation ─────────────────────────

  describe('signal stats', () => {
    it('correct counts by type after mixed signal accumulation', () => {
      store.accumulateSignals([
        makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'a' }),
        makeSignal(SignalType.CommandStyle, { style: 'verbose', snippet: 'b' }),
        makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'c' }),
        makeSignal(SignalType.Frustration, { level: 'mild', trigger: 'slow', context: 'wait' }),
        makeSignal(SignalType.WorkRhythm, { pattern: 'burst', durationMinutes: 10, taskCount: 2 }),
        makeSignal(SignalType.WorkRhythm, { pattern: 'steady', durationMinutes: 60, taskCount: 8 }),
        makeSignal(SignalType.ToolPreference, { toolName: 'vim', action: 'used', frequency: 5 }),
      ]);

      const stats = store.signalStats();
      expect(stats.byType[SignalType.CommandStyle]).toBe(3);
      expect(stats.byType[SignalType.Frustration]).toBe(1);
      expect(stats.byType[SignalType.WorkRhythm]).toBe(2);
      expect(stats.byType[SignalType.ToolPreference]).toBe(1);
      expect(stats.totalUnprocessed).toBe(7);
      expect(stats.lastSynthesis).toBeNull();
    });

    it('lastSynthesis updates after snapshot', () => {
      store.accumulateSignals([
        makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' }),
      ]);
      store.snapshot('synthesis');
      const stats = store.signalStats();
      expect(stats.lastSynthesis).not.toBeNull();
    });
  });

  // ─── Per-Section Synthesis Check ───────────────────────────────────

  describe('synthesis check with per-section granularity', () => {
    it('8+ signals of communication_pref triggers communication section', () => {
      store.accumulateSignals(makeSignals(9, SignalType.CommunicationPref));
      const check = store.synthesisCheck();
      expect(check.sectionsToUpdate.communication).toBe(true);
      expect(check.sectionsToUpdate.identity).toBe(false);
      expect(check.sectionsToUpdate.cognition).toBe(false);
    });

    it('8+ correction signals triggers workingRules and trustModel', () => {
      store.accumulateSignals(
        Array.from({ length: 9 }, (_, i) =>
          makeSignal(SignalType.Correction, {
            original: `orig-${i}`,
            corrected: `fixed-${i}`,
            category: 'approach',
          }),
        ),
      );
      const check = store.synthesisCheck();
      expect(check.sectionsToUpdate.workingRules).toBe(true);
      expect(check.sectionsToUpdate.trustModel).toBe(true);
    });

    it('8+ personal_share signals triggers identity and tasteProfile', () => {
      store.accumulateSignals(
        Array.from({ length: 9 }, (_, i) =>
          makeSignal(SignalType.PersonalShare, {
            category: 'preference',
            content: `pref-${i}`,
            explicit: true,
          }),
        ),
      );
      const check = store.synthesisCheck();
      expect(check.sectionsToUpdate.identity).toBe(true);
      expect(check.sectionsToUpdate.tasteProfile).toBe(true);
    });

    it('below threshold — no sections flagged', () => {
      store.accumulateSignals(makeSignals(5, SignalType.CommunicationPref));
      const check = store.synthesisCheck();
      expect(check.sectionsToUpdate.communication).toBe(false);
    });

    it('mixed signal types can independently trigger different sections', () => {
      store.accumulateSignals([
        ...makeSignals(9, SignalType.CommunicationPref),
        ...Array.from({ length: 9 }, (_, i) =>
          makeSignal(SignalType.Correction, {
            original: `o-${i}`,
            corrected: `c-${i}`,
            category: 'style',
          }),
        ),
      ]);
      const check = store.synthesisCheck();
      expect(check.sectionsToUpdate.communication).toBe(true);
      expect(check.sectionsToUpdate.workingRules).toBe(true);
      expect(check.sectionsToUpdate.trustModel).toBe(true);
    });
  });

  // ─── Delete Profile Archives to History ─────────────────────────────

  describe('delete profile archives to history', () => {
    it('archives profile snapshot before deletion', () => {
      store.accumulateSignals([
        makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' }),
      ]);
      const identity: IdentitySection = {
        background: 'Architect',
        role: 'Principal',
        philosophy: 'Less is more',
        evidence: [],
      };
      store.updateSection('identity', identity);
      const profile = store.getProfile();
      const profileId = profile!.id;

      const deleted = store.deleteProfile();
      expect(deleted).toBe(true);
      expect(store.getProfile(profileId)).toBeNull();

      const provider = vault.getProvider();
      const history = provider.all<{ trigger: string; snapshot: string }>(
        'SELECT trigger, snapshot FROM operator_profile_history WHERE profile_id = ?',
        [profileId],
      );
      expect(history.some((h) => h.trigger === 'deletion')).toBe(true);

      const deletionSnapshot = history.find((h) => h.trigger === 'deletion')!;
      const parsed = JSON.parse(deletionSnapshot.snapshot);
      expect(parsed.identity.background).toBe('Architect');
    });

    it('also removes signals for deleted profile', () => {
      store.accumulateSignals([
        makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'a' }),
        makeSignal(SignalType.Frustration, { level: 'mild', trigger: 't', context: 'c' }),
      ]);
      const profileId = store.getProfile()!.id;

      store.deleteProfile();

      const provider = vault.getProvider();
      const signals = provider.all<{ id: number }>(
        'SELECT id FROM operator_signals WHERE profile_id = ?',
        [profileId],
      );
      expect(signals).toHaveLength(0);
    });
  });
});
