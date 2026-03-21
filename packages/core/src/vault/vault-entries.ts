/**
 * Vault entry CRUD operations — search, seed, get, update, delete, archive, tags, etc.
 * Extracted from vault.ts as part of Wave 0C decomposition.
 */
import type { PersistenceProvider } from '../persistence/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { LinkManager } from './linking.js';
import { computeContentHash } from './content-hash.js';
import type { SearchResult, VaultStats } from './vault.js';

export interface AutoLinkConfig {
  linkManager: LinkManager | null;
  enabled: boolean;
  maxLinks: number;
}

/**
 * Auto-link a newly added entry using FTS5 suggestions.
 * Creates links for top N suggestions.
 */
export function autoLink(entryId: string, config: AutoLinkConfig): void {
  if (!config.linkManager || !config.enabled) return;
  try {
    const suggestions = config.linkManager.suggestLinks(entryId, config.maxLinks);
    for (const s of suggestions) {
      config.linkManager.addLink(entryId, s.entryId, s.suggestedType, `auto: ${s.reason}`);
    }
  } catch {
    // Auto-linking is best-effort — never block ingestion
  }
}

export function seed(
  provider: PersistenceProvider,
  entries: IntelligenceEntry[],
  autoLinkConfig: AutoLinkConfig,
): number {
  const sql = `
    INSERT INTO entries (id,type,domain,title,severity,description,context,example,counter_example,why,tags,applies_to,valid_from,valid_until,content_hash,tier,origin)
    VALUES (@id,@type,@domain,@title,@severity,@description,@context,@example,@counterExample,@why,@tags,@appliesTo,@validFrom,@validUntil,@contentHash,@tier,@origin)
    ON CONFLICT(id) DO UPDATE SET type=excluded.type,domain=excluded.domain,title=excluded.title,severity=excluded.severity,
      description=excluded.description,context=excluded.context,example=excluded.example,counter_example=excluded.counter_example,
      why=excluded.why,tags=excluded.tags,applies_to=excluded.applies_to,valid_from=excluded.valid_from,valid_until=excluded.valid_until,
      content_hash=excluded.content_hash,tier=excluded.tier,origin=excluded.origin,updated_at=unixepoch()
  `;
  return provider.transaction(() => {
    let count = 0;
    for (const entry of entries) {
      provider.run(sql, {
        id: entry.id,
        type: entry.type,
        domain: entry.domain,
        title: entry.title,
        severity: entry.severity,
        description: entry.description,
        context: entry.context ?? null,
        example: entry.example ?? null,
        counterExample: entry.counterExample ?? null,
        why: entry.why ?? null,
        tags: JSON.stringify(entry.tags),
        appliesTo: JSON.stringify(entry.appliesTo ?? []),
        validFrom: entry.validFrom ?? null,
        validUntil: entry.validUntil ?? null,
        contentHash: computeContentHash(entry),
        tier: entry.tier ?? 'agent',
        origin: entry.origin ?? 'agent',
      });
      count++;
    }
    // Auto-link after all entries are inserted (so they can link to each other).
    // Skip for large batches (>100) — use relink_vault for bulk imports.
    if (entries.length <= 100) {
      for (const entry of entries) {
        autoLink(entry.id, autoLinkConfig);
      }
    }
    return count;
  });
}

export function seedDedup(
  provider: PersistenceProvider,
  entries: IntelligenceEntry[],
  autoLinkConfig: AutoLinkConfig,
): Array<{ id: string; action: 'inserted' | 'duplicate'; existingId?: string }> {
  return provider.transaction(() => {
    const results: Array<{ id: string; action: 'inserted' | 'duplicate'; existingId?: string }> =
      [];
    for (const entry of entries) {
      const hash = computeContentHash(entry);
      const existing = findByContentHash(provider, hash);
      if (existing && existing !== entry.id) {
        results.push({ id: entry.id, action: 'duplicate', existingId: existing });
      } else {
        seed(provider, [entry], autoLinkConfig);
        results.push({ id: entry.id, action: 'inserted' });
      }
    }
    return results;
  });
}

export function installPack(
  provider: PersistenceProvider,
  entries: IntelligenceEntry[],
  autoLinkConfig: AutoLinkConfig,
): { installed: number; skipped: number } {
  let installed = 0;
  let skipped = 0;
  const tagged = entries.map((e) => ({ ...e, origin: 'pack' as const }));
  const results = seedDedup(provider, tagged, autoLinkConfig);
  for (const r of results) {
    if (r.action === 'inserted') installed++;
    else skipped++;
  }
  return { installed, skipped };
}

export function search(
  provider: PersistenceProvider,
  query: string,
  options?: {
    domain?: string;
    type?: string;
    severity?: string;
    origin?: 'agent' | 'pack' | 'user';
    limit?: number;
    includeExpired?: boolean;
  },
): SearchResult[] {
  const limit = options?.limit ?? 10;
  const filters: string[] = [];
  const fp: Record<string, unknown> = {};
  if (options?.domain) {
    filters.push('e.domain = @domain');
    fp.domain = options.domain;
  }
  if (options?.type) {
    filters.push('e.type = @type');
    fp.type = options.type;
  }
  if (options?.severity) {
    filters.push('e.severity = @severity');
    fp.severity = options.severity;
  }
  if (options?.origin) {
    filters.push('e.origin = @origin');
    fp.origin = options.origin;
  }
  if (!options?.includeExpired) {
    const now = Math.floor(Date.now() / 1000);
    filters.push('(e.valid_until IS NULL OR e.valid_until > @now)');
    filters.push('(e.valid_from IS NULL OR e.valid_from <= @now)');
    fp.now = now;
  }
  const wc = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

  const ftsQuery = buildFtsQuery(query);

  try {
    const rows = provider.all<Record<string, unknown>>(
      `SELECT e.*, bm25(entries_fts, 5.0, 10.0, 3.0, 1.0, 2.0) as score FROM entries_fts fts JOIN entries e ON e.rowid = fts.rowid WHERE entries_fts MATCH @query ${wc} ORDER BY score ASC LIMIT @limit`,
      { query: ftsQuery, limit, ...fp },
    );
    return rows.map(rowToSearchResult);
  } catch {
    // Fallback: try original query if FTS5 syntax fails
    try {
      const rows = provider.all<Record<string, unknown>>(
        `SELECT e.*, -rank as score FROM entries_fts fts JOIN entries e ON e.rowid = fts.rowid WHERE entries_fts MATCH @query ${wc} ORDER BY score DESC LIMIT @limit`,
        { query, limit, ...fp },
      );
      return rows.map(rowToSearchResult);
    } catch {
      return [];
    }
  }
}

export function get(provider: PersistenceProvider, id: string): IntelligenceEntry | null {
  const row = provider.get<Record<string, unknown>>('SELECT * FROM entries WHERE id = ?', [id]);
  return row ? rowToEntry(row) : null;
}

export function list(
  provider: PersistenceProvider,
  options?: {
    domain?: string;
    type?: string;
    severity?: string;
    origin?: 'agent' | 'pack' | 'user';
    tags?: string[];
    limit?: number;
    offset?: number;
    includeExpired?: boolean;
  },
): IntelligenceEntry[] {
  const filters: string[] = [];
  const params: Record<string, unknown> = {};
  if (options?.domain) {
    filters.push('domain = @domain');
    params.domain = options.domain;
  }
  if (options?.type) {
    filters.push('type = @type');
    params.type = options.type;
  }
  if (options?.severity) {
    filters.push('severity = @severity');
    params.severity = options.severity;
  }
  if (options?.origin) {
    filters.push('origin = @origin');
    params.origin = options.origin;
  }
  if (options?.tags?.length) {
    const c = options.tags.map((t, i) => {
      params[`tag${i}`] = `%"${t}"%`;
      return `tags LIKE @tag${i}`;
    });
    filters.push(`(${c.join(' OR ')})`);
  }
  if (!options?.includeExpired) {
    const now = Math.floor(Date.now() / 1000);
    filters.push('(valid_until IS NULL OR valid_until > @now)');
    filters.push('(valid_from IS NULL OR valid_from <= @now)');
    params.now = now;
  }
  const wc = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = provider.all<Record<string, unknown>>(
    `SELECT * FROM entries ${wc} ORDER BY severity, domain, title LIMIT @limit OFFSET @offset`,
    { ...params, limit: options?.limit ?? 50, offset: options?.offset ?? 0 },
  );
  return rows.map(rowToEntry);
}

export function stats(provider: PersistenceProvider): VaultStats {
  const total = provider.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM entries',
  )!.count;
  return {
    totalEntries: total,
    byType: gc(provider, 'type'),
    byDomain: gc(provider, 'domain'),
    bySeverity: gc(provider, 'severity'),
  };
}

export function add(
  provider: PersistenceProvider,
  entry: IntelligenceEntry,
  autoLinkConfig: AutoLinkConfig,
): void {
  seed(provider, [entry], autoLinkConfig);
}

export function remove(provider: PersistenceProvider, id: string): boolean {
  return provider.run('DELETE FROM entries WHERE id = ?', [id]).changes > 0;
}

export function update(
  provider: PersistenceProvider,
  id: string,
  fields: Partial<
    Pick<
      IntelligenceEntry,
      | 'title'
      | 'description'
      | 'context'
      | 'example'
      | 'counterExample'
      | 'why'
      | 'tags'
      | 'appliesTo'
      | 'severity'
      | 'type'
      | 'domain'
      | 'validFrom'
      | 'validUntil'
    >
  >,
  autoLinkConfig: AutoLinkConfig,
): IntelligenceEntry | null {
  const existing = get(provider, id);
  if (!existing) return null;
  const merged: IntelligenceEntry = { ...existing, ...fields };
  seed(provider, [merged], autoLinkConfig);
  return get(provider, id);
}

export function setTemporal(
  provider: PersistenceProvider,
  id: string,
  validFrom?: number,
  validUntil?: number,
): boolean {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if (validFrom !== undefined) {
    sets.push('valid_from = @validFrom');
    params.validFrom = validFrom;
  }
  if (validUntil !== undefined) {
    sets.push('valid_until = @validUntil');
    params.validUntil = validUntil;
  }
  if (sets.length === 0) return false;
  sets.push('updated_at = unixepoch()');
  return (
    provider.run(`UPDATE entries SET ${sets.join(', ')} WHERE id = @id`, params).changes > 0
  );
}

export function findExpiring(
  provider: PersistenceProvider,
  withinDays: number,
): IntelligenceEntry[] {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now + withinDays * 86400;
  const rows = provider.all<Record<string, unknown>>(
    'SELECT * FROM entries WHERE valid_until IS NOT NULL AND valid_until > @now AND valid_until <= @cutoff ORDER BY valid_until ASC',
    { now, cutoff },
  );
  return rows.map(rowToEntry);
}

export function findExpired(
  provider: PersistenceProvider,
  limit: number = 50,
): IntelligenceEntry[] {
  const now = Math.floor(Date.now() / 1000);
  const rows = provider.all<Record<string, unknown>>(
    'SELECT * FROM entries WHERE valid_until IS NOT NULL AND valid_until <= @now ORDER BY valid_until DESC LIMIT @limit',
    { now, limit },
  );
  return rows.map(rowToEntry);
}

export function bulkRemove(provider: PersistenceProvider, ids: string[]): number {
  return provider.transaction(() => {
    let count = 0;
    for (const id of ids) {
      count += provider.run('DELETE FROM entries WHERE id = ?', [id]).changes;
    }
    return count;
  });
}

export function getTags(
  provider: PersistenceProvider,
): Array<{ tag: string; count: number }> {
  const rows = provider.all<{ tags: string }>('SELECT tags FROM entries');
  const counts = new Map<string, number>();
  for (const row of rows) {
    const tags: string[] = JSON.parse(row.tags || '[]');
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function getDomains(
  provider: PersistenceProvider,
): Array<{ domain: string; count: number }> {
  return provider.all<{ domain: string; count: number }>(
    'SELECT domain, COUNT(*) as count FROM entries GROUP BY domain ORDER BY count DESC',
  );
}

export function getRecent(
  provider: PersistenceProvider,
  limit: number = 20,
): IntelligenceEntry[] {
  const rows = provider.all<Record<string, unknown>>(
    'SELECT * FROM entries ORDER BY updated_at DESC LIMIT ?',
    [limit],
  );
  return rows.map(rowToEntry);
}

export function findByContentHash(
  provider: PersistenceProvider,
  hash: string,
): string | null {
  const row = provider.get<{ id: string }>(
    'SELECT id FROM entries WHERE content_hash = @hash',
    { hash },
  );
  return row?.id ?? null;
}

export function contentHashStats(
  provider: PersistenceProvider,
): { total: number; hashed: number; uniqueHashes: number } {
  const total = provider.get<{ c: number }>('SELECT COUNT(*) as c FROM entries')?.c ?? 0;
  const hashed =
    provider.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM entries WHERE content_hash IS NOT NULL',
    )?.c ?? 0;
  const uniqueHashes =
    provider.get<{ c: number }>(
      'SELECT COUNT(DISTINCT content_hash) as c FROM entries WHERE content_hash IS NOT NULL',
    )?.c ?? 0;
  return { total, hashed, uniqueHashes };
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

export function exportAll(
  provider: PersistenceProvider,
): { entries: IntelligenceEntry[]; exportedAt: number; count: number } {
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

// ── Helpers ──────────────────────────────────────────────────────────────

function gc(provider: PersistenceProvider, col: string): Record<string, number> {
  const rows = provider.all<{ key: string; count: number }>(
    `SELECT ${col} as key, COUNT(*) as count FROM entries GROUP BY ${col}`,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.count]));
}

export function rowToEntry(row: Record<string, unknown>): IntelligenceEntry {
  return {
    id: row.id as string,
    type: row.type as IntelligenceEntry['type'],
    domain: row.domain as IntelligenceEntry['domain'],
    title: row.title as string,
    severity: row.severity as IntelligenceEntry['severity'],
    description: row.description as string,
    context: (row.context as string) ?? undefined,
    example: (row.example as string) ?? undefined,
    counterExample: (row.counter_example as string) ?? undefined,
    why: (row.why as string) ?? undefined,
    tags: JSON.parse((row.tags as string) || '[]'),
    appliesTo: JSON.parse((row.applies_to as string) || '[]'),
    tier: (row.tier as IntelligenceEntry['tier']) ?? undefined,
    origin: (row.origin as IntelligenceEntry['origin']) ?? undefined,
    validFrom: (row.valid_from as number) ?? undefined,
    validUntil: (row.valid_until as number) ?? undefined,
  };
}

export function rowToSearchResult(row: Record<string, unknown>): SearchResult {
  // bm25() returns negative scores (lower = better), normalize to positive
  const rawScore = row.score as number;
  const score = rawScore < 0 ? -rawScore : rawScore;
  return { entry: rowToEntry(row), score };
}

/**
 * Build an FTS5 query from natural language input.
 *
 * Converts "React render performance memo" to:
 *   (react OR render OR performance OR memo)
 *
 * Uses OR matching (not AND) so results include partial matches.
 * FTS5 BM25 ranks documents with more matching terms higher.
 * Title column is boosted via bm25() weights in the SQL query.
 */
export function buildFtsQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  if (terms.length === 0) return query;
  if (terms.length === 1) return terms[0];

  // Use OR to match any term — BM25 ranks by how many terms match
  const orTerms = terms.join(' OR ');
  return orTerms;
}
