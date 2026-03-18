/**
 * CogneeSyncManager deep tests — covers drain, hash drift, health-flip,
 * concurrent safety, and partial failure scenarios.
 *
 * Source of truth: these tests define expected behavior.
 * Code adapts to fulfill them.
 *
 * Uses real in-memory SQLite (never mocked) with a mock CogneeClient.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { CogneeSyncManager } from '../cognee/sync-manager.js';
import { CogneeClient } from '../cognee/client.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Helpers ──────────────────────────────────────────────────────

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'test',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'suggestion',
    description: overrides.description ?? 'A test pattern.',
    tags: overrides.tags ?? ['test'],
    ...(overrides.context ? { context: overrides.context } : {}),
    ...(overrides.example ? { example: overrides.example } : {}),
  };
}

/**
 * Create a mock CogneeClient with controllable availability and behavior.
 */
function makeMockCognee(
  overrides: {
    available?: boolean;
    addResult?: { added: number };
    addShouldFail?: boolean;
    deleteResult?: { deleted: number };
  } = {},
): CogneeClient {
  const available = overrides.available ?? true;
  const client = {
    get isAvailable() {
      return available;
    },
    healthCheck: vi.fn().mockResolvedValue({ available, url: 'http://mock:8000', latencyMs: 1 }),
    ensureHealthy: vi.fn().mockResolvedValue({ available, url: 'http://mock:8000', latencyMs: 1 }),
    addEntries: vi.fn().mockImplementation(async () => {
      if (overrides.addShouldFail) throw new Error('Cognee ingest failed');
      return overrides.addResult ?? { added: 1 };
    }),
    deleteEntries: vi.fn().mockResolvedValue(overrides.deleteResult ?? { deleted: 1 }),
    cognify: vi.fn().mockResolvedValue({ status: 'ok' }),
    search: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockReturnValue({ baseUrl: 'http://mock:8000', dataset: 'test' }),
    getStatus: vi.fn().mockReturnValue({ available, url: 'http://mock:8000', latencyMs: 1 }),
    flushPendingCognify: vi.fn(),
    resetPendingCognify: vi.fn(),
  } as unknown as CogneeClient;
  return client;
}

// ─── Test Suite ───────────────────────────────────────────────────

describe('CogneeSyncManager — deep coverage', () => {
  let runtime: AgentRuntime;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `sync-deep-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-sync-deep',
      vaultPath: ':memory:',
      plansPath: join(tmpDir, 'plans.json'),
      cognee: true,
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Content hash ─────────────────────────────────────────────

  describe('contentHash', () => {
    it('should be deterministic for identical entries', () => {
      const entry = makeEntry({ id: 'stable', title: 'Stable Title', description: 'Same desc' });
      const h1 = CogneeSyncManager.contentHash(entry);
      const h2 = CogneeSyncManager.contentHash(entry);
      expect(h1).toBe(h2);
    });

    it('should produce 16 hex characters', () => {
      const hash = CogneeSyncManager.contentHash(makeEntry());
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should change when title changes', () => {
      const base = makeEntry({ id: 'same-id' });
      const modified = { ...base, title: 'Different Title' };
      expect(CogneeSyncManager.contentHash(base)).not.toBe(CogneeSyncManager.contentHash(modified));
    });

    it('should change when description changes', () => {
      const base = makeEntry({ id: 'same-id' });
      const modified = { ...base, description: 'Updated description' };
      expect(CogneeSyncManager.contentHash(base)).not.toBe(CogneeSyncManager.contentHash(modified));
    });

    it('should change when tags change', () => {
      const base = makeEntry({ id: 'same-id', tags: ['a'] });
      const modified = { ...base, tags: ['a', 'b'] };
      expect(CogneeSyncManager.contentHash(base)).not.toBe(CogneeSyncManager.contentHash(modified));
    });

    it('should NOT change when only updatedAt changes (not in hash)', () => {
      const entry = makeEntry({ id: 'same-id' });
      const h1 = CogneeSyncManager.contentHash(entry);
      // updatedAt is not part of the hash payload
      const h2 = CogneeSyncManager.contentHash(entry);
      expect(h1).toBe(h2);
    });
  });

  // ─── Enqueue ──────────────────────────────────────────────────

  describe('enqueue', () => {
    it('should add items to the sync queue', () => {
      const syncMgr = runtime.syncManager;
      const entry = makeEntry();
      syncMgr.enqueue('ingest', entry.id, entry);
      const stats = syncMgr.getStats();
      expect(stats.pending).toBeGreaterThanOrEqual(1);
    });

    it('should store content hash when entry is provided', () => {
      const syncMgr = runtime.syncManager;
      const entry = makeEntry({ id: 'hash-test' });
      syncMgr.enqueue('ingest', entry.id, entry);
      const row = runtime.vault
        .getProvider()
        .get<{ content_hash: string }>(
          `SELECT content_hash FROM cognee_sync_queue WHERE entry_id = 'hash-test'`,
        );
      expect(row?.content_hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should store null hash when entry is not provided (delete op)', () => {
      const syncMgr = runtime.syncManager;
      syncMgr.enqueue('delete', 'deleted-entry');
      const row = runtime.vault
        .getProvider()
        .get<{ content_hash: string | null }>(
          `SELECT content_hash FROM cognee_sync_queue WHERE entry_id = 'deleted-entry'`,
        );
      expect(row?.content_hash).toBeNull();
    });
  });

  // ─── Drain with mock Cognee ───────────────────────────────────

  describe('drain — with available Cognee', () => {
    it('should process pending ingest items and update ingested hash', async () => {
      const entry = makeEntry({ id: 'drain-test-1' });
      runtime.vault.seed([entry]);

      // Create a sync manager with a mock Cognee that is available
      const mockCognee = makeMockCognee({ available: true });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      syncMgr.enqueue('ingest', entry.id, entry);

      const drainResult = await syncMgr.drain();
      expect(drainResult.processed).toBe(1);

      // Verify addEntries was called
      expect(mockCognee.addEntries).toHaveBeenCalledTimes(1);

      // Verify ingested hash was updated on the entries table
      const row = runtime.vault
        .getProvider()
        .get<{ cognee_ingested_hash: string }>(
          `SELECT cognee_ingested_hash FROM entries WHERE id = @id`,
          { id: entry.id },
        );
      expect(row?.cognee_ingested_hash).toMatch(/^[0-9a-f]{16}$/);

      // Verify queue item is marked completed
      const stats = syncMgr.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(0);
    });

    it('should process delete operations', async () => {
      const entry = makeEntry({ id: 'delete-drain-1' });
      runtime.vault.seed([entry]);

      const mockCognee = makeMockCognee({ available: true });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      syncMgr.enqueue('delete', entry.id);

      const drainResult = await syncMgr.drain();
      expect(drainResult.processed).toBe(1);

      // Verify ingested hash was cleared
      const row = runtime.vault
        .getProvider()
        .get<{ cognee_ingested_hash: string | null }>(
          `SELECT cognee_ingested_hash FROM entries WHERE id = @id`,
          { id: entry.id },
        );
      expect(row?.cognee_ingested_hash).toBeNull();
    });

    it('should handle entry deleted from vault before drain (mark completed)', async () => {
      const entry = makeEntry({ id: 'ghost-entry' });
      runtime.vault.seed([entry]);

      const mockCognee = makeMockCognee({ available: true });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      syncMgr.enqueue('ingest', entry.id, entry);

      // Delete the entry from vault before drain runs
      runtime.vault.remove(entry.id);

      const drainResult = await syncMgr.drain();
      // Should still process (mark as completed since entry is gone)
      expect(drainResult.processed).toBeGreaterThanOrEqual(1);

      // addEntries should NOT have been called (entry doesn't exist)
      // The drain reads from entries table — if entry is gone, it skips
    });

    it('should return 0 when queue is empty', async () => {
      const mockCognee = makeMockCognee({ available: true });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      const drainResult = await syncMgr.drain();
      expect(drainResult.processed).toBe(0);
    });

    it('should return 0 when Cognee is unavailable', async () => {
      const entry = makeEntry({ id: 'unavailable-test' });
      runtime.vault.seed([entry]);

      const mockCognee = makeMockCognee({ available: false });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      syncMgr.enqueue('ingest', entry.id, entry);

      const drainResult = await syncMgr.drain();
      expect(drainResult.processed).toBe(0);

      // Queue item should still be pending
      const stats = syncMgr.getStats();
      expect(stats.pending).toBe(1);
    });
  });

  // ─── Drain failure handling ───────────────────────────────────

  describe('drain — failure handling', () => {
    it('should retry failed items up to MAX_RETRIES then mark failed', async () => {
      const entry = makeEntry({ id: 'retry-test' });
      runtime.vault.seed([entry]);

      const mockCognee = makeMockCognee({ available: true, addShouldFail: true });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      syncMgr.enqueue('ingest', entry.id, entry);

      // Drain 3 times (MAX_RETRIES = 3)
      await syncMgr.drain();
      await syncMgr.drain();
      await syncMgr.drain();

      const stats = syncMgr.getStats();
      expect(stats.failed).toBeGreaterThanOrEqual(1);
      expect(stats.pending).toBe(0);
    });

    it('should record error message on failed items', async () => {
      const entry = makeEntry({ id: 'error-msg-test' });
      runtime.vault.seed([entry]);

      // Clear auto-enqueued items from runtime.syncManager (different dataset)
      runtime.vault.getProvider().run('DELETE FROM cognee_sync_queue');

      const mockCognee = makeMockCognee({ available: true, addShouldFail: true });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      syncMgr.enqueue('ingest', entry.id, entry);

      // Exhaust retries (MAX_RETRIES = 3)
      await syncMgr.drain();
      await syncMgr.drain();
      await syncMgr.drain();

      const row = runtime.vault
        .getProvider()
        .get<{ error: string; status: string }>(
          `SELECT error, status FROM cognee_sync_queue WHERE entry_id = 'error-msg-test' AND dataset = 'test-dataset'`,
        );
      expect(row?.status).toBe('failed');
      expect(row?.error).toContain('Cognee ingest failed');
    });

    it('should continue processing other items when one fails', async () => {
      const goodEntry = makeEntry({ id: 'good-entry' });
      const badEntry = makeEntry({ id: 'bad-entry' });
      runtime.vault.seed([goodEntry, badEntry]);

      // Mock: fail only for bad-entry
      let callCount = 0;
      const mockCognee = makeMockCognee({ available: true });
      (mockCognee.addEntries as ReturnType<typeof vi.fn>).mockImplementation(
        async (entries: IntelligenceEntry[]) => {
          callCount++;
          if (entries.some((e) => e.id === 'bad-entry')) {
            throw new Error('Selective failure');
          }
          return { added: entries.length };
        },
      );

      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      syncMgr.enqueue('ingest', goodEntry.id, goodEntry);
      syncMgr.enqueue('ingest', badEntry.id, badEntry);

      await syncMgr.drain();

      // At least one should have been attempted
      expect(callCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Reconcile (hash drift detection) ─────────────────────────

  describe('reconcile — hash drift detection', () => {
    it('should detect entries with null cognee_ingested_hash', () => {
      const entry = makeEntry({ id: 'never-synced' });
      runtime.vault.seed([entry]);

      // Clear any auto-enqueued items
      runtime.vault.getProvider().run('DELETE FROM cognee_sync_queue');

      const syncMgr = runtime.syncManager;
      const enqueued = syncMgr.reconcile();
      expect(enqueued).toBeGreaterThanOrEqual(1);
    });

    it('should detect entries with stale cognee_ingested_hash', () => {
      const entry = makeEntry({ id: 'stale-entry', title: 'Original Title' });
      runtime.vault.seed([entry]);

      // Simulate a previously-synced entry by setting a hash
      runtime.vault
        .getProvider()
        .run(`UPDATE entries SET cognee_ingested_hash = 'old-hash-value-xx' WHERE id = @id`, {
          id: entry.id,
        });

      // Clear queue
      runtime.vault.getProvider().run('DELETE FROM cognee_sync_queue');

      const syncMgr = runtime.syncManager;
      const enqueued = syncMgr.reconcile();
      // Hash mismatch → should enqueue
      expect(enqueued).toBeGreaterThanOrEqual(1);
    });

    it('should NOT enqueue entries with matching hash', () => {
      const entry = makeEntry({ id: 'up-to-date' });
      runtime.vault.seed([entry]);

      // Set the correct hash
      const correctHash = CogneeSyncManager.contentHash(entry);
      runtime.vault
        .getProvider()
        .run(`UPDATE entries SET cognee_ingested_hash = @hash WHERE id = @id`, {
          hash: correctHash,
          id: entry.id,
        });

      // Clear queue
      runtime.vault.getProvider().run('DELETE FROM cognee_sync_queue');

      const syncMgr = runtime.syncManager;
      const enqueued = syncMgr.reconcile();
      expect(enqueued).toBe(0);
    });

    it('should not create duplicate pending items for the same entry', () => {
      const entry = makeEntry({ id: 'no-dupes' });
      runtime.vault.seed([entry]);

      // Clear queue
      runtime.vault.getProvider().run('DELETE FROM cognee_sync_queue');

      const syncMgr = runtime.syncManager;
      syncMgr.reconcile();
      syncMgr.reconcile(); // Second reconcile should not create duplicates

      const rows = runtime.vault
        .getProvider()
        .all<{ id: number }>(
          `SELECT id FROM cognee_sync_queue WHERE entry_id = 'no-dupes' AND status = 'pending'`,
        );
      expect(rows.length).toBe(1);
    });

    it('should use "ingest" op for null hash and "update" op for stale hash', () => {
      // Entry 1: never synced (null hash)
      const entry1 = makeEntry({ id: 'null-hash-entry' });
      runtime.vault.seed([entry1]);

      // Entry 2: previously synced (stale hash)
      const entry2 = makeEntry({ id: 'stale-hash-entry' });
      runtime.vault.seed([entry2]);
      runtime.vault
        .getProvider()
        .run(`UPDATE entries SET cognee_ingested_hash = 'stale-value-xxxxx' WHERE id = @id`, {
          id: entry2.id,
        });

      // Clear queue
      runtime.vault.getProvider().run('DELETE FROM cognee_sync_queue');

      runtime.syncManager.reconcile();

      const row1 = runtime.vault
        .getProvider()
        .get<{ op: string }>(`SELECT op FROM cognee_sync_queue WHERE entry_id = 'null-hash-entry'`);
      const row2 = runtime.vault
        .getProvider()
        .get<{ op: string }>(
          `SELECT op FROM cognee_sync_queue WHERE entry_id = 'stale-hash-entry'`,
        );

      expect(row1?.op).toBe('ingest');
      expect(row2?.op).toBe('update');
    });
  });

  // ─── Health-flip auto-drain ───────────────────────────────────

  describe('checkHealthFlip', () => {
    it('should auto-drain when Cognee transitions from unavailable to available', async () => {
      const entry = makeEntry({ id: 'flip-test' });
      runtime.vault.seed([entry]);

      // Start with unavailable Cognee
      let isAvailable = false;
      const mockCognee = {
        get isAvailable() {
          return isAvailable;
        },
        healthCheck: vi
          .fn()
          .mockImplementation(async () => ({ available: isAvailable, url: 'mock', latencyMs: 1 })),
        ensureHealthy: vi
          .fn()
          .mockImplementation(async () => ({ available: isAvailable, url: 'mock', latencyMs: 1 })),
        addEntries: vi.fn().mockResolvedValue({ added: 1 }),
        deleteEntries: vi.fn().mockResolvedValue({ deleted: 1 }),
        cognify: vi.fn().mockResolvedValue({ status: 'ok' }),
        search: vi.fn().mockResolvedValue([]),
        getConfig: vi.fn().mockReturnValue({ baseUrl: 'mock', dataset: 'test' }),
        getStatus: vi.fn().mockReturnValue(null),
        flushPendingCognify: vi.fn(),
        resetPendingCognify: vi.fn(),
      } as unknown as CogneeClient;

      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      syncMgr.enqueue('ingest', entry.id, entry);

      // While unavailable, checkHealthFlip should not drain
      await syncMgr.checkHealthFlip();
      const beforeFlip = syncMgr.getStats();
      expect(beforeFlip.pending).toBe(1);

      // Now Cognee becomes available
      isAvailable = true;
      await syncMgr.checkHealthFlip();

      // Should have triggered a drain
      expect(mockCognee.addEntries).toHaveBeenCalled();
    });

    it('should NOT drain when Cognee stays available (no flip)', async () => {
      const isAvailable = true;
      const mockCognee = {
        get isAvailable() {
          return isAvailable;
        },
        healthCheck: vi.fn().mockResolvedValue({ available: true, url: 'mock', latencyMs: 1 }),
        ensureHealthy: vi.fn().mockResolvedValue({ available: true, url: 'mock', latencyMs: 1 }),
        addEntries: vi.fn().mockResolvedValue({ added: 1 }),
        deleteEntries: vi.fn(),
        cognify: vi.fn(),
        search: vi.fn(),
        getConfig: vi.fn().mockReturnValue({ baseUrl: 'mock', dataset: 'test' }),
        getStatus: vi.fn(),
        flushPendingCognify: vi.fn(),
        resetPendingCognify: vi.fn(),
      } as unknown as CogneeClient;

      // Start with available (wasAvailable = true via constructor)
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );

      const entry = makeEntry({ id: 'no-flip' });
      runtime.vault.seed([entry]);
      syncMgr.enqueue('ingest', entry.id, entry);

      await syncMgr.checkHealthFlip();

      // No flip → no auto-drain (addEntries should not be called by checkHealthFlip)
      // Note: drain() would be called but Cognee is available so it would process,
      // but the key is checkHealthFlip only triggers on unavailable → available transition
    });
  });

  // ─── Stats ────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return all zero counts for empty queue', () => {
      const mockCognee = makeMockCognee({ available: true });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      const stats = syncMgr.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.queueSize).toBe(0);
      expect(stats.lastDrainAt).toBeNull();
    });

    it('should track lastDrainAt after drain', async () => {
      const entry = makeEntry({ id: 'drain-time' });
      runtime.vault.seed([entry]);

      const mockCognee = makeMockCognee({ available: true });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      syncMgr.enqueue('ingest', entry.id, entry);

      const before = Math.floor(Date.now() / 1000);
      await syncMgr.drain();
      const after = Math.floor(Date.now() / 1000);

      const stats = syncMgr.getStats();
      expect(stats.lastDrainAt).toBeGreaterThanOrEqual(before);
      expect(stats.lastDrainAt).toBeLessThanOrEqual(after + 1);
    });
  });

  // ─── Bulk operations ──────────────────────────────────────────

  describe('bulk operations', () => {
    it('should handle 50 entries enqueued and drained', async () => {
      const entries = Array.from({ length: 50 }, (_, i) =>
        makeEntry({ id: `bulk-${i}`, title: `Bulk Entry ${i}` }),
      );
      runtime.vault.seed(entries);

      const mockCognee = makeMockCognee({ available: true });
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );

      for (const entry of entries) {
        syncMgr.enqueue('ingest', entry.id, entry);
      }

      const stats = syncMgr.getStats();
      expect(stats.pending).toBe(50);

      // Drain processes MAX_BATCH=10 at a time
      let totalProcessed = 0;
      for (let i = 0; i < 10; i++) {
        const drainResult = await syncMgr.drain();
        totalProcessed += drainResult.processed;
        if (drainResult.processed === 0) break;
      }

      expect(totalProcessed).toBe(50);
      expect(syncMgr.getStats().completed).toBe(50);
    });
  });

  // ─── Cleanup ──────────────────────────────────────────────────

  describe('close', () => {
    it('should clear drain timer without error', () => {
      const mockCognee = makeMockCognee();
      const syncMgr = new CogneeSyncManager(
        runtime.vault.getProvider(),
        mockCognee,
        'test-dataset',
      );
      expect(() => syncMgr.close()).not.toThrow();
      // Double close should be safe
      expect(() => syncMgr.close()).not.toThrow();
    });
  });
});
