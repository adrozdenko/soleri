/**
 * Curator Schema — DDL for curator tables.
 */

import type { PersistenceProvider } from '../persistence/types.js';

export const CURATOR_SCHEMA = `
  CREATE TABLE IF NOT EXISTS curator_entry_state (
    entry_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'stale', 'archived')),
    confidence REAL NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL DEFAULT 'unknown' CHECK(source IN ('manual', 'capture', 'seed', 'unknown')),
    last_groomed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS curator_tag_canonical (
    tag TEXT PRIMARY KEY,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS curator_tag_alias (
    alias TEXT PRIMARY KEY,
    canonical TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (canonical) REFERENCES curator_tag_canonical(tag)
  );

  CREATE TABLE IF NOT EXISTS curator_changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    before_value TEXT,
    after_value TEXT,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS curator_entry_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    changed_by TEXT DEFAULT 'system',
    change_reason TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS curator_contradictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id TEXT NOT NULL,
    antipattern_id TEXT NOT NULL,
    similarity REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'dismissed')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    resolved_at INTEGER,
    UNIQUE(pattern_id, antipattern_id)
  );
  CREATE TABLE IF NOT EXISTS curator_duplicate_dismissals (
    entry_id_a TEXT NOT NULL,
    entry_id_b TEXT NOT NULL,
    dismissed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    reason TEXT,
    PRIMARY KEY (entry_id_a, entry_id_b)
  );

  CREATE INDEX IF NOT EXISTS idx_curator_state_status ON curator_entry_state(status);
  CREATE INDEX IF NOT EXISTS idx_curator_changelog_entry ON curator_changelog(entry_id);
`;

export function initializeTables(provider: PersistenceProvider): void {
  provider.execSql(CURATOR_SCHEMA);
}
