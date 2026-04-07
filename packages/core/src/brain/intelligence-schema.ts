import type { PersistenceProvider } from '../persistence/types.js';

const BRAIN_INTELLIGENCE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS brain_strengths (
    pattern TEXT NOT NULL,
    domain TEXT NOT NULL,
    strength REAL NOT NULL DEFAULT 0,
    usage_score REAL NOT NULL DEFAULT 0,
    spread_score REAL NOT NULL DEFAULT 0,
    success_score REAL NOT NULL DEFAULT 0,
    recency_score REAL NOT NULL DEFAULT 0,
    usage_count INTEGER NOT NULL DEFAULT 0,
    unique_contexts INTEGER NOT NULL DEFAULT 0,
    success_rate REAL NOT NULL DEFAULT 0,
    last_used TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (pattern, domain)
  );

  CREATE TABLE IF NOT EXISTS brain_sessions (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    domain TEXT,
    context TEXT,
    tools_used TEXT NOT NULL DEFAULT '[]',
    files_modified TEXT NOT NULL DEFAULT '[]',
    plan_id TEXT,
    plan_outcome TEXT,
    extracted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS brain_proposals (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    rule TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'pattern',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    promoted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES brain_sessions(id)
  );

  CREATE TABLE IF NOT EXISTS brain_global_registry (
    pattern TEXT PRIMARY KEY,
    domains TEXT NOT NULL DEFAULT '[]',
    total_strength REAL NOT NULL DEFAULT 0,
    avg_strength REAL NOT NULL DEFAULT 0,
    domain_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS brain_domain_profiles (
    domain TEXT PRIMARY KEY,
    top_patterns TEXT NOT NULL DEFAULT '[]',
    session_count INTEGER NOT NULL DEFAULT 0,
    avg_session_duration REAL NOT NULL DEFAULT 0,
    last_activity TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS brain_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export function initializeBrainIntelligenceTables(provider: PersistenceProvider): void {
  provider.execSql(BRAIN_INTELLIGENCE_SCHEMA_SQL);
}
