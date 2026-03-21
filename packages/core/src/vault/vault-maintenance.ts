/**
 * Vault maintenance operations — optimize, FTS rebuild, export, age report, archive/restore.
 * Extracted from vault.ts as part of Wave 0C decomposition.
 */
import type { PersistenceProvider } from '../persistence/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { ProjectInfo } from './vault.js';
import { rowToEntry } from './vault-entries.js';

export function optimize(provider: PersistenceProvider): {
  vacuumed: boolean;
  analyzed: boolean;
  ftsRebuilt: boolean;
} {
  let vacuumed = false;
  let analyzed = false;
  let ftsRebuilt = false;

  if (provider.backend === 'sqlite') {
    try {
      provider.execSql('VACUUM');
      vacuumed = true;
    } catch {
      // VACUUM may fail inside a transaction
    }
  }

  try {
    provider.execSql('ANALYZE');
    analyzed = true;
  } catch {
    // Non-critical
  }

  try {
    provider.ftsRebuild('entries');
    provider.ftsRebuild('memories');
    ftsRebuilt = true;
  } catch {
    // Non-critical
  }

  return { vacuumed, analyzed, ftsRebuilt };
}

export function rebuildFtsIndex(provider: PersistenceProvider): void {
  try {
    provider.run("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
  } catch {
    // Graceful degradation — FTS rebuild failed
  }
}

export function exportAll(provider: PersistenceProvider): {
  entries: IntelligenceEntry[];
  exportedAt: number;
  count: number;
} {
  const rows = provider.all<Record<string, unknown>>(
    'SELECT * FROM entries ORDER BY domain, title',
  );
  const entries = rows.map(rowToEntry);
  return { entries, exportedAt: Math.floor(Date.now() / 1000), count: entries.length };
}

export function getAgeReport(provider: PersistenceProvider): {
  total: number;
  buckets: Array<{ label: string; count: number; minDays: number; maxDays: number }>;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
} {
  const rows = provider.all<{ created_at: number; updated_at: number }>(
    'SELECT created_at, updated_at FROM entries',
  );
  const now = Math.floor(Date.now() / 1000);
  const bucketDefs = [
    { label: 'today', minDays: 0, maxDays: 1 },
    { label: 'this_week', minDays: 1, maxDays: 7 },
    { label: 'this_month', minDays: 7, maxDays: 30 },
    { label: 'this_quarter', minDays: 30, maxDays: 90 },
    { label: 'older', minDays: 90, maxDays: Infinity },
  ];
  const counts = new Array(bucketDefs.length).fill(0) as number[];
  let oldest: number | null = null;
  let newest: number | null = null;
  for (const row of rows) {
    const ts = row.created_at;
    if (oldest === null || ts < oldest) oldest = ts;
    if (newest === null || ts > newest) newest = ts;
    const ageDays = (now - ts) / 86400;
    for (let i = 0; i < bucketDefs.length; i++) {
      if (ageDays >= bucketDefs[i].minDays && ageDays < bucketDefs[i].maxDays) {
        counts[i]++;
        break;
      }
    }
  }
  return {
    total: rows.length,
    buckets: bucketDefs.map((b, i) => Object.assign({}, b, { count: counts[i] })),
    oldestTimestamp: oldest,
    newestTimestamp: newest,
  };
}

export function archive(
  provider: PersistenceProvider,
  options: { olderThanDays: number; reason?: string },
): { archived: number } {
  const cutoff = Math.floor(Date.now() / 1000) - options.olderThanDays * 86400;
  const reason = options.reason ?? `Archived: older than ${options.olderThanDays} days`;

  return provider.transaction(() => {
    const candidates = provider.all<{ id: string }>(
      'SELECT id FROM entries WHERE updated_at < ?',
      [cutoff],
    );

    if (candidates.length === 0) return { archived: 0 };

    let archived = 0;
    for (const { id } of candidates) {
      provider.run(
        `INSERT OR IGNORE INTO entries_archive (id, type, domain, title, severity, description, context, example, counter_example, why, tags, applies_to, created_at, updated_at, valid_from, valid_until, archive_reason)
         SELECT id, type, domain, title, severity, description, context, example, counter_example, why, tags, applies_to, created_at, updated_at, valid_from, valid_until, ?
         FROM entries WHERE id = ?`,
        [reason, id],
      );
      const result = provider.run('DELETE FROM entries WHERE id = ?', [id]);
      archived += result.changes;
    }

    return { archived };
  });
}

export function restore(provider: PersistenceProvider, id: string): boolean {
  return provider.transaction(() => {
    const archivedRow = provider.get<Record<string, unknown>>(
      'SELECT * FROM entries_archive WHERE id = ?',
      [id],
    );
    if (!archivedRow) return false;

    provider.run(
      `INSERT OR REPLACE INTO entries (id, type, domain, title, severity, description, context, example, counter_example, why, tags, applies_to, created_at, updated_at, valid_from, valid_until)
       SELECT id, type, domain, title, severity, description, context, example, counter_example, why, tags, applies_to, created_at, updated_at, valid_from, valid_until
       FROM entries_archive WHERE id = ?`,
      [id],
    );
    provider.run('DELETE FROM entries_archive WHERE id = ?', [id]);
    return true;
  });
}

// ── Project operations ──────────────────────────────────────────────────

export function registerProject(
  provider: PersistenceProvider,
  path: string,
  name?: string,
): ProjectInfo {
  const projectName = name ?? path.replace(/\/$/, '').split('/').pop() ?? path;
  const existing = getProject(provider, path);
  if (existing) {
    provider.run(
      'UPDATE projects SET last_seen_at = unixepoch(), session_count = session_count + 1 WHERE path = ?',
      [path],
    );
    return getProject(provider, path)!;
  }
  provider.run('INSERT INTO projects (path, name) VALUES (?, ?)', [path, projectName]);
  return getProject(provider, path)!;
}

export function getProject(
  provider: PersistenceProvider,
  path: string,
): ProjectInfo | null {
  const row = provider.get<Record<string, unknown>>(
    'SELECT * FROM projects WHERE path = ?',
    [path],
  );
  if (!row) return null;
  return {
    path: row.path as string,
    name: row.name as string,
    registeredAt: row.registered_at as number,
    lastSeenAt: row.last_seen_at as number,
    sessionCount: row.session_count as number,
  };
}

export function listProjects(provider: PersistenceProvider): ProjectInfo[] {
  const rows = provider.all<Record<string, unknown>>(
    'SELECT * FROM projects ORDER BY last_seen_at DESC',
  );
  return rows.map((row) => ({
    path: row.path as string,
    name: row.name as string,
    registeredAt: row.registered_at as number,
    lastSeenAt: row.last_seen_at as number,
    sessionCount: row.session_count as number,
  }));
}
