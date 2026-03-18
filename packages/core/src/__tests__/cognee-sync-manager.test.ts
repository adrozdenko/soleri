import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { CogneeSyncManager } from '../cognee/sync-manager.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

const testEntry: IntelligenceEntry = {
  id: 'test-1',
  type: 'pattern' as const,
  domain: 'test',
  title: 'Test Pattern',
  severity: 'suggestion' as const,
  description: 'A test pattern',
  tags: ['test'],
};

describe('CogneeSyncManager', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'sync-mgr-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-sync-mgr',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
      cognee: true,
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  it('should have syncManager on runtime', () => {
    expect(runtime.syncManager).toBeDefined();
    expect(runtime.syncManager).not.toBeNull();
  });

  it('should enqueue on vault seed', () => {
    runtime.vault.seed([testEntry]);
    const stats = runtime.syncManager.getStats();
    expect(stats.pending).toBeGreaterThanOrEqual(1);
  });

  it('should enqueue delete on vault remove', () => {
    runtime.vault.seed([testEntry]);
    runtime.vault.remove(testEntry.id);
    const stats = runtime.syncManager.getStats();
    // At least 2 items: one ingest from seed + one delete from remove
    expect(stats.pending).toBeGreaterThanOrEqual(2);
  });

  it('getStats should return valid structure', () => {
    const stats = runtime.syncManager.getStats();
    expect(stats).toHaveProperty('pending');
    expect(stats).toHaveProperty('processing');
    expect(stats).toHaveProperty('completed');
    expect(stats).toHaveProperty('failed');
    expect(stats).toHaveProperty('lastDrainAt');
    expect(stats).toHaveProperty('queueSize');
    expect(typeof stats.pending).toBe('number');
    expect(typeof stats.processing).toBe('number');
    expect(typeof stats.completed).toBe('number');
    expect(typeof stats.failed).toBe('number');
    expect(typeof stats.queueSize).toBe('number');
  });

  it('reconcile should enqueue unsynced entries', () => {
    // Seed an entry (which auto-enqueues), then clear the queue manually
    runtime.vault.seed([testEntry]);
    runtime.vault.getProvider().run('DELETE FROM cognee_sync_queue');

    // Verify queue is empty
    const statsBefore = runtime.syncManager.getStats();
    expect(statsBefore.pending).toBe(0);

    // Reconcile should detect the unsynced entry and enqueue it
    const enqueued = runtime.syncManager.reconcile();
    expect(enqueued).toBeGreaterThanOrEqual(1);

    const statsAfter = runtime.syncManager.getStats();
    expect(statsAfter.pending).toBeGreaterThanOrEqual(1);
  });

  it('drain should return 0 when Cognee is unavailable', async () => {
    runtime.vault.seed([testEntry]);
    // In test env, Cognee is always unavailable (no server running).
    // ensureHealthy does a real network call with 5s timeout, so allow extra time.
    const result = await runtime.syncManager.drain();
    expect(result.processed).toBe(0);
    expect(result.reason).toBe('cognee_unavailable');
  }, 15_000);

  it('contentHash should be deterministic', () => {
    const hash1 = CogneeSyncManager.contentHash(testEntry);
    const hash2 = CogneeSyncManager.contentHash(testEntry);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });
});
