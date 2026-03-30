import type { PersistenceProvider } from '../persistence/types.js';

export function ensureDreamSchema(provider: PersistenceProvider): void {
  provider.execSql(`
    CREATE TABLE IF NOT EXISTS dream_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sessions_since_last_dream INTEGER NOT NULL DEFAULT 0,
      last_dream_at TEXT,
      last_dream_duration_ms INTEGER,
      last_dream_report TEXT,
      total_dreams INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  provider.run('INSERT OR IGNORE INTO dream_meta (id) VALUES (1)');
}
