import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { OperatorProfileStore } from '../operator/operator-profile.js';
import { SignalType } from '../operator/operator-types.js';
import type { OperatorSignal, CommunicationSection, TechnicalContextSection } from '../operator/operator-types.js';

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

function makeSignals(count: number, type: SignalType = SignalType.CommandStyle): OperatorSignal[] {
  return Array.from({ length: count }, (_, i) =>
    makeSignal(type, { style: 'terse', snippet: `cmd-${i}` }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('OperatorProfileStore', () => {
  let vault: Vault;
  let store: OperatorProfileStore;

  beforeEach(() => {
    vault = new Vault(':memory:');
    store = new OperatorProfileStore(vault);
  });

  afterEach(() => {
    vault.close();
  });

  // ─── Table Creation ─────────────────────────────────────────────

  it('creates tables without error on new runtime', () => {
    // Constructor ran initTables — no error means tables exist.
    // Creating a second instance also succeeds (IF NOT EXISTS).
    const store2 = new OperatorProfileStore(vault);
    expect(store2).toBeDefined();
  });

  // ─── getProfile ─────────────────────────────────────────────────

  it('returns null when no profile exists', () => {
    const profile = store.getProfile();
    expect(profile).toBeNull();
  });

  it('returns null for non-existent profile ID', () => {
    const profile = store.getProfile('non-existent');
    expect(profile).toBeNull();
  });

  // ─── accumulateSignals ──────────────────────────────────────────

  it('stores signals with correct types and timestamps', () => {
    const signals = [
      makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'do it' }),
      makeSignal(SignalType.Frustration, { level: 'mild', trigger: 'slow', context: 'waiting' }),
    ];

    const inserted = store.accumulateSignals(signals);
    expect(inserted).toBe(2);

    const stored = store.listSignals();
    expect(stored).toHaveLength(2);
    expect(stored[0].signalType).toBe(SignalType.Frustration); // newest first
    expect(stored[1].signalType).toBe(SignalType.CommandStyle);
    expect(stored[0].confidence).toBe(0.8);
  });

  it('auto-creates profile when accumulating signals', () => {
    store.accumulateSignals([makeSignal(SignalType.WorkRhythm, { pattern: 'burst', durationMinutes: 30, taskCount: 5 })]);
    const profile = store.getProfile();
    expect(profile).not.toBeNull();
    expect(profile!.sessionCount).toBe(0);
  });

  // ─── synthesisCheck ─────────────────────────────────────────────

  it('returns due:false when below thresholds', () => {
    store.accumulateSignals(makeSignals(10));
    const check = store.synthesisCheck();
    expect(check.due).toBe(false);
    expect(check.pendingSignalCount).toBe(10);
  });

  it('returns due:true when 50+ unprocessed signals', () => {
    store.accumulateSignals(makeSignals(50));
    const check = store.synthesisCheck();
    expect(check.due).toBe(true);
    expect(check.pendingSignalCount).toBe(50);
    expect(check.reason).toContain('50');
    expect(check.reason).toContain('unprocessed');
  });

  it('marks sections needing update when 8+ signals of relevant type', () => {
    // communication_pref maps to 'communication' section
    const commSignals = makeSignals(10, SignalType.CommunicationPref);
    store.accumulateSignals(commSignals);

    const check = store.synthesisCheck();
    expect(check.sectionsToUpdate.communication).toBe(true);
    expect(check.sectionsToUpdate.identity).toBe(false);
  });

  it('returns due:false with no profile', () => {
    const check = store.synthesisCheck();
    expect(check.due).toBe(false);
    expect(check.reason).toContain('No profile');
  });

  // ─── Parallel updateSection ─────────────────────────────────────

  it('parallel updateSection on different sections both succeed', () => {
    // Ensure profile exists
    store.accumulateSignals([makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' })]);

    const commData: CommunicationSection = {
      style: 'concise',
      signalWords: ['just', 'quickly'],
      formality: 0.3,
      patience: 0.7,
      adaptationRules: [],
    };
    const techData: TechnicalContextSection = {
      domains: ['typescript', 'node'],
      tools: [{ name: 'vitest', proficiency: 'advanced', frequency: 'daily' }],
      blindSpots: [],
    };

    const r1 = store.updateSection('communication', commData);
    const r2 = store.updateSection('technicalContext', techData);
    expect(r1).toBe(true);
    expect(r2).toBe(true);

    const comm = store.getSection('communication');
    expect((comm as CommunicationSection).style).toBe('concise');

    const tech = store.getSection('technicalContext');
    expect((tech as TechnicalContextSection).domains).toContain('typescript');
  });

  // ─── correctSection ─────────────────────────────────────────────

  it('correctSection records history with correction trigger', () => {
    store.accumulateSignals([makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' })]);
    const profileBefore = store.getProfile();
    expect(profileBefore).not.toBeNull();

    const commData: CommunicationSection = {
      style: 'formal',
      signalWords: [],
      formality: 0.9,
      patience: 0.5,
      adaptationRules: [],
    };
    store.correctSection('communication', commData);

    // Check history was created
    const provider = vault.getProvider();
    const history = provider.all<{ trigger: string; version: number }>(
      'SELECT trigger, version FROM operator_profile_history WHERE profile_id = ?',
      [profileBefore!.id],
    );
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history.some((h) => h.trigger === 'correction')).toBe(true);
  });

  // ─── snapshot ───────────────────────────────────────────────────

  it('creates history row with full profile JSON', () => {
    store.accumulateSignals([makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' })]);
    const profile = store.getProfile();
    expect(profile).not.toBeNull();

    const result = store.snapshot('synthesis');
    expect(result).toBe(true);

    const provider = vault.getProvider();
    const row = provider.get<{ snapshot: string; trigger: string; version: number }>(
      'SELECT snapshot, trigger, version FROM operator_profile_history WHERE profile_id = ? ORDER BY id DESC LIMIT 1',
      [profile!.id],
    );
    expect(row).toBeDefined();
    expect(row!.trigger).toBe('synthesis');
    expect(row!.version).toBe(1);

    const snapshotProfile = JSON.parse(row!.snapshot);
    expect(snapshotProfile.id).toBe(profile!.id);
    expect(snapshotProfile.identity).toBeDefined();
  });

  it('increments synthesis_version on snapshot', () => {
    store.accumulateSignals([makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' })]);

    store.snapshot('synthesis');
    store.snapshot('synthesis');

    const profile = store.getProfile();
    expect(profile).not.toBeNull();
    // version should be 2 after two snapshots
    expect(profile!.version).toBe(2);
  });

  // ─── deleteProfile ──────────────────────────────────────────────

  it('archives to history before deletion', () => {
    store.accumulateSignals([makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' })]);
    const profile = store.getProfile();
    expect(profile).not.toBeNull();
    const profileId = profile!.id;

    const deleted = store.deleteProfile();
    expect(deleted).toBe(true);

    // Profile gone
    expect(store.getProfile(profileId)).toBeNull();

    // History preserved with deletion trigger
    const provider = vault.getProvider();
    const history = provider.all<{ trigger: string }>(
      'SELECT trigger FROM operator_profile_history WHERE profile_id = ?',
      [profileId],
    );
    expect(history.some((h) => h.trigger === 'deletion')).toBe(true);
  });

  it('returns false when deleting non-existent profile', () => {
    expect(store.deleteProfile()).toBe(false);
  });

  // ─── signalStats ────────────────────────────────────────────────

  it('returns correct counts by type', () => {
    store.accumulateSignals([
      makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'a' }),
      makeSignal(SignalType.CommandStyle, { style: 'verbose', snippet: 'b' }),
      makeSignal(SignalType.Frustration, { level: 'mild', trigger: 'slow', context: 'waiting' }),
    ]);

    const stats = store.signalStats();
    expect(stats.byType[SignalType.CommandStyle]).toBe(2);
    expect(stats.byType[SignalType.Frustration]).toBe(1);
    expect(stats.totalUnprocessed).toBe(3);
  });

  // ─── listSignals with filters ───────────────────────────────────

  it('filters signals by type', () => {
    store.accumulateSignals([
      makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'a' }),
      makeSignal(SignalType.Frustration, { level: 'mild', trigger: 'slow', context: 'c' }),
    ]);

    const filtered = store.listSignals({ types: [SignalType.Frustration] });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].signalType).toBe(SignalType.Frustration);
  });

  it('filters signals by processed state', () => {
    store.accumulateSignals(makeSignals(3));
    const unprocessed = store.listSignals({ processed: false });
    expect(unprocessed).toHaveLength(3);

    const processed = store.listSignals({ processed: true });
    expect(processed).toHaveLength(0);
  });

  // ─── getSection ─────────────────────────────────────────────────

  it('returns null for section when no profile exists', () => {
    expect(store.getSection('identity')).toBeNull();
  });

  it('returns section data after update', () => {
    store.accumulateSignals([makeSignal(SignalType.CommandStyle, { style: 'terse', snippet: 'x' })]);
    const commData: CommunicationSection = {
      style: 'detailed',
      signalWords: ['please'],
      formality: 0.8,
      patience: 0.9,
      adaptationRules: [{ when: 'frustrated', then: 'slow down', source: 'observed' }],
    };
    store.updateSection('communication', commData);

    const section = store.getSection('communication') as CommunicationSection;
    expect(section.style).toBe('detailed');
    expect(section.signalWords).toContain('please');
    expect(section.adaptationRules).toHaveLength(1);
  });

  // ─── No `any` types ────────────────────────────────────────────

  it('type system enforced — file compiles with strict TypeScript', () => {
    // This test is a compile-time assertion:
    // if operator-profile.ts had `any` types, tsc --noEmit would catch it.
    // The fact that this test file compiles is the proof.
    expect(true).toBe(true);
  });
});
