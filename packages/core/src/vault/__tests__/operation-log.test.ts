import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OperationLogger } from '../operation-log.js';
import { SQLitePersistenceProvider } from '../../persistence/sqlite-provider.js';
import type { PersistenceProvider } from '../../persistence/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function createProvider(): SQLitePersistenceProvider {
  return new SQLitePersistenceProvider(':memory:');
}

// ── Suite ────────────────────────────────────────────────────────────────

describe('OperationLogger', () => {
  let provider: PersistenceProvider;
  let logger: OperationLogger;

  beforeEach(() => {
    provider = createProvider();
    logger = new OperationLogger(provider);
  });

  afterEach(() => {
    provider.close();
  });

  // ── log + query ────────────────────────────────────────────────────

  it('logs an operation and retrieves it', () => {
    logger.log('ingest', 'ingest_url', 'Ingested example.com', 5);

    const entries = logger.query();
    expect(entries).toHaveLength(1);
    expect(entries[0].opType).toBe('ingest');
    expect(entries[0].opName).toBe('ingest_url');
    expect(entries[0].summary).toBe('Ingested example.com');
    expect(entries[0].entriesAffected).toBe(5);
    expect(entries[0].id).toBeGreaterThan(0);
  });

  // ── query filters ─────────────────────────────────────────────────

  it('query filters by opType', () => {
    logger.log('ingest', 'ingest_url', 'Ingested A', 1);
    logger.log('capture', 'capture_pattern', 'Captured B', 2);
    logger.log('ingest', 'ingest_pdf', 'Ingested C', 3);

    const ingestOnly = logger.query({ opType: 'ingest' });
    expect(ingestOnly).toHaveLength(2);
    expect(ingestOnly.every((e) => e.opType === 'ingest')).toBe(true);

    const captureOnly = logger.query({ opType: 'capture' });
    expect(captureOnly).toHaveLength(1);
    expect(captureOnly[0].opName).toBe('capture_pattern');
  });

  it('query filters by since timestamp', () => {
    // Insert entries then override created_at for deterministic filtering
    logger.log('ingest', 'old_op', 'Old entry', 1);
    logger.log('ingest', 'new_op', 'New entry', 2);

    // Manually set timestamps via SQL
    provider.run("UPDATE vault_operations_log SET created_at = 1000 WHERE op_name = 'old_op'");
    provider.run("UPDATE vault_operations_log SET created_at = 2000 WHERE op_name = 'new_op'");

    const sinceResults = logger.query({ since: 1500 });
    expect(sinceResults).toHaveLength(1);
    expect(sinceResults[0].opName).toBe('new_op');
  });

  it('query respects limit', () => {
    logger.log('ingest', 'op1', 'First', 1);
    logger.log('ingest', 'op2', 'Second', 2);
    logger.log('ingest', 'op3', 'Third', 3);

    const limited = logger.query({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  // ── getRecent ──────────────────────────────────────────────────────

  it('getRecent returns most recent N entries', () => {
    logger.log('ingest', 'op1', 'First', 1);
    logger.log('capture', 'op2', 'Second', 2);
    logger.log('dream', 'op3', 'Third', 3);
    logger.log('sync', 'op4', 'Fourth', 4);

    // Override timestamps for deterministic ordering
    provider.run("UPDATE vault_operations_log SET created_at = 100 WHERE op_name = 'op1'");
    provider.run("UPDATE vault_operations_log SET created_at = 200 WHERE op_name = 'op2'");
    provider.run("UPDATE vault_operations_log SET created_at = 300 WHERE op_name = 'op3'");
    provider.run("UPDATE vault_operations_log SET created_at = 400 WHERE op_name = 'op4'");

    const recent = logger.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].opName).toBe('op4'); // most recent first (DESC)
    expect(recent[1].opName).toBe('op3');
  });

  // ── auto-generated timestamps ──────────────────────────────────────

  it('log entries have auto-generated timestamps', () => {
    const before = Math.floor(Date.now() / 1000);
    logger.log('link', 'link_entries', 'Linked stuff', 0);
    const after = Math.floor(Date.now() / 1000) + 1;

    const entries = logger.query();
    expect(entries).toHaveLength(1);
    // SQLite unixepoch() returns seconds since epoch
    expect(entries[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(entries[0].createdAt).toBeLessThanOrEqual(after);
  });

  // ── metadata JSON ──────────────────────────────────────────────────

  it('metadata is stored and retrieved as JSON', () => {
    const meta = { source: 'test', tags: ['a', 'b'], nested: { key: 42 } };
    logger.log('consolidate', 'consolidate_vault', 'Consolidated', 10, meta);

    const entries = logger.query();
    expect(entries).toHaveLength(1);
    expect(entries[0].metadata).toEqual(meta);
    expect(entries[0].metadata.source).toBe('test');
    expect(entries[0].metadata.nested).toEqual({ key: 42 });
  });

  // ── Idempotency ────────────────────────────────────────────────────

  it('table creation is idempotent', () => {
    // The first instance already created the table in beforeEach.
    // Creating a second logger on the same provider should not throw.
    const logger2 = new OperationLogger(provider);

    logger2.log('self_heal', 'heal_op', 'Healed', 1);
    const entries = logger2.query();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.opName === 'heal_op')).toBe(true);
  });
});
