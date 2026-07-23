/**
 * Curator Schema — DDL for curator tables.
 */

import type { PersistenceProvider } from '../persistence/types.js';

const CURATOR_SCHEMA = `
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

  -- Edit-Source Learning Loop (WS6) — tracks diffs between agent-produced
  -- output and the human-edited version so recurring corrections can be
  -- surfaced as source-level proposals. Rows are NEVER auto-applied.
  CREATE TABLE IF NOT EXISTS curator_edit_diffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   TEXT NOT NULL,      -- the tracked output (entry id / planId#stepId)
    source_ref  TEXT NOT NULL,      -- provenance: which contract/reference/rule produced it
    run_id      TEXT NOT NULL,      -- distinct run/session this edit belongs to
    before_text TEXT NOT NULL,      -- agent output
    after_text  TEXT NOT NULL,      -- human-edited version
    diff_kind   TEXT NOT NULL,      -- classification (see edit-source-loop.ts)
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Materialized edit-source proposals + their human review status.
  -- Persists the pending|approved|rejected review gate; identity is
  -- deterministic on (source_ref, diff_kind) so re-detection is idempotent
  -- and never re-opens a decision a human already made.
  CREATE TABLE IF NOT EXISTS curator_edit_proposals (
    id                TEXT PRIMARY KEY,   -- esp-<hash(source_ref|diff_kind)>
    source_ref        TEXT NOT NULL,
    diff_kind         TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    evidence_run_ids  TEXT NOT NULL,      -- JSON array of distinct run ids
    evidence_diff_ids TEXT NOT NULL,      -- JSON array of curator_edit_diffs.id
    proposed_change   TEXT NOT NULL,      -- JSON { type, target, suggestion }
    confidence        REAL NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
    reviewed_at       INTEGER,
    reviewed_reason   TEXT,
    UNIQUE(source_ref, diff_kind)
  );

  CREATE INDEX IF NOT EXISTS idx_curator_state_status ON curator_entry_state(status);
  CREATE INDEX IF NOT EXISTS idx_curator_changelog_entry ON curator_changelog(entry_id);
  CREATE INDEX IF NOT EXISTS idx_curator_edit_diffs_group ON curator_edit_diffs(source_ref, diff_kind);
  CREATE INDEX IF NOT EXISTS idx_curator_edit_proposals_status ON curator_edit_proposals(status);
`;

export function initializeTables(provider: PersistenceProvider): void {
  provider.execSql(CURATOR_SCHEMA);
}
