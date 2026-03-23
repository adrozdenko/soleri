import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../../vault/vault.js';
import { OperatorProfileStore } from '../../operator/operator-profile.js';
import { SignalType } from '../../operator/operator-types.js';
import { createOperatorFacadeOps } from './operator-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeRuntime(vault: Vault, store: OperatorProfileStore): AgentRuntime {
  return { operatorProfile: store, vault } as unknown as AgentRuntime;
}

function makeSignalPayload(type: SignalType = SignalType.CommandStyle) {
  return {
    id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    signalType: type,
    data: { style: 'terse', snippet: 'test' },
    timestamp: new Date().toISOString(),
    sessionId: 'test-session',
    confidence: 0.8,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('operator-facade (colocated)', () => {
  let vault: Vault;
  let store: OperatorProfileStore;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    vault = new Vault(':memory:');
    store = new OperatorProfileStore(vault);
    ops = captureOps(createOperatorFacadeOps(makeRuntime(vault, store)));
  });

  afterEach(() => {
    vault.close();
  });

  it('registers all 10 ops', () => {
    expect(ops.size).toBe(10);
    expect([...ops.keys()]).toEqual(
      expect.arrayContaining([
        'profile_get',
        'profile_update_section',
        'profile_correct',
        'profile_delete',
        'profile_export',
        'signal_accumulate',
        'signal_list',
        'signal_stats',
        'synthesis_check',
        'profile_snapshot',
      ]),
    );
  });

  it('has correct auth levels', () => {
    expect(ops.get('profile_get')!.auth).toBe('read');
    expect(ops.get('profile_update_section')!.auth).toBe('write');
    expect(ops.get('profile_correct')!.auth).toBe('write');
    expect(ops.get('profile_delete')!.auth).toBe('admin');
    expect(ops.get('profile_export')!.auth).toBe('read');
    expect(ops.get('signal_accumulate')!.auth).toBe('write');
    expect(ops.get('signal_list')!.auth).toBe('read');
    expect(ops.get('signal_stats')!.auth).toBe('read');
    expect(ops.get('synthesis_check')!.auth).toBe('read');
    expect(ops.get('profile_snapshot')!.auth).toBe('write');
  });

  // ─── profile_get ───────────────────────────────────────────────

  it('profile_get returns null when no profile', async () => {
    const result = await executeOp(ops, 'profile_get', {});
    expect(result.success).toBe(true);
    expect((result.data as { profile: null }).profile).toBeNull();
  });

  it('profile_get returns specific section', async () => {
    store.accumulateSignals([makeSignalPayload() as never]);
    const result = await executeOp(ops, 'profile_get', { section: 'communication' });
    expect(result.success).toBe(true);
    expect((result.data as { section: string }).section).toBe('communication');
  });

  // ─── profile_update_section ────────────────────────────────────

  it('profile_update_section updates section', async () => {
    const result = await executeOp(ops, 'profile_update_section', {
      section: 'communication',
      data: {
        style: 'concise',
        signalWords: ['yo'],
        formality: 0.3,
        patience: 0.9,
        adaptationRules: [],
      },
    });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).updated).toBe(true);
  });

  // ─── profile_correct ──────────────────────────────────────────

  it('profile_correct takes snapshot before correcting', async () => {
    store.accumulateSignals([makeSignalPayload() as never]);
    const result = await executeOp(ops, 'profile_correct', {
      section: 'identity',
      data: { background: 'engineer', role: 'lead', philosophy: 'pragmatism', evidence: [] },
      reason: 'User correction',
    });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).corrected).toBe(true);
  });

  // ─── profile_delete ────────────────────────────────────────────

  it('profile_delete removes profile', async () => {
    store.accumulateSignals([makeSignalPayload() as never]);
    const result = await executeOp(ops, 'profile_delete', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).deleted).toBe(true);
    expect(store.getProfile()).toBeNull();
  });

  it('profile_delete returns false when no profile', async () => {
    const result = await executeOp(ops, 'profile_delete', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).deleted).toBe(false);
  });

  // ─── profile_export ────────────────────────────────────────────

  it('profile_export returns JSON by default', async () => {
    store.accumulateSignals([makeSignalPayload() as never]);
    const result = await executeOp(ops, 'profile_export', {});
    expect(result.success).toBe(true);
    const data = result.data as { exported: boolean; format: string; content: string };
    expect(data.exported).toBe(true);
    expect(data.format).toBe('json');
    expect(() => JSON.parse(data.content)).not.toThrow();
  });

  it('profile_export returns markdown', async () => {
    store.accumulateSignals([makeSignalPayload() as never]);
    const result = await executeOp(ops, 'profile_export', { format: 'markdown' });
    expect(result.success).toBe(true);
    expect((result.data as { content: string }).content).toContain('# Operator Profile');
  });

  it('profile_export handles missing profile', async () => {
    const result = await executeOp(ops, 'profile_export', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).exported).toBe(false);
  });

  // ─── signal_accumulate ─────────────────────────────────────────

  it('signal_accumulate stores signals', async () => {
    const signals = [makeSignalPayload(), makeSignalPayload(SignalType.Frustration)];
    signals[1].data = { level: 'mild', trigger: 'slow', context: 'test' };
    const result = await executeOp(ops, 'signal_accumulate', { signals });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).stored).toBe(2);
  });

  // ─── signal_list ───────────────────────────────────────────────

  it('signal_list returns stored signals', async () => {
    store.accumulateSignals([makeSignalPayload() as never]);
    const result = await executeOp(ops, 'signal_list', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });

  it('signal_list filters by type', async () => {
    store.accumulateSignals([makeSignalPayload(SignalType.CommandStyle) as never]);
    store.accumulateSignals([makeSignalPayload(SignalType.Frustration) as never]);
    const result = await executeOp(ops, 'signal_list', { types: ['command_style'] });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });

  // ─── signal_stats ──────────────────────────────────────────────

  it('signal_stats returns breakdown', async () => {
    store.accumulateSignals([makeSignalPayload() as never, makeSignalPayload() as never]);
    const result = await executeOp(ops, 'signal_stats', {});
    expect(result.success).toBe(true);
    const data = result.data as { byType: Record<string, number>; totalUnprocessed: number };
    expect(data.totalUnprocessed).toBe(2);
  });

  // ─── synthesis_check ───────────────────────────────────────────

  it('synthesis_check reports not due with few signals', async () => {
    store.accumulateSignals([makeSignalPayload() as never]);
    const result = await executeOp(ops, 'synthesis_check', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).due).toBe(false);
  });

  // ─── profile_snapshot ──────────────────────────────────────────

  it('profile_snapshot creates version', async () => {
    store.accumulateSignals([makeSignalPayload() as never]);
    const result = await executeOp(ops, 'profile_snapshot', { trigger: 'manual' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).snapshotted).toBe(true);
  });

  it('profile_snapshot returns false when no profile', async () => {
    const result = await executeOp(ops, 'profile_snapshot', { trigger: 'test' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).snapshotted).toBe(false);
  });
});
