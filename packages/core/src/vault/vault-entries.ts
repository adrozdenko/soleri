/**
 * Vault entry CRUD operations — search, seed, get, update, delete, tags, etc.
 * Extracted from vault.ts as part of Wave 0C decomposition.
 */
import type { PersistenceProvider } from '../persistence/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { StoredVector } from '../embeddings/types.js';
import type { EmbeddingPipeline } from '../embeddings/pipeline.js';
import type { LinkManager } from './linking.js';
import { computeContentHash } from './content-hash.js';
import type { SearchResult, VaultStats } from './vault-types.js';

export interface AutoLinkConfig {
  linkManager: LinkManager | null;
  enabled: boolean;
  maxLinks: number;
}

export interface AutoEmbedConfig {
  pipeline: EmbeddingPipeline | null;
  enabled: boolean;
}

/** Updatable fields on an entry. */
export type EntryUpdateFields = Partial<
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
>;

/** Search/list filter options. */
export interface EntryFilterOptions {
  domain?: string;
  type?: string;
  severity?: string;
  origin?: 'agent' | 'pack' | 'user';
  limit?: number;
  includeExpired?: boolean;
}

export function autoLink(entryId: string, config: AutoLinkConfig): void {
  if (!config.linkManager || !config.enabled) return;
  try {
    const suggestions = config.linkManager.suggestLinks(entryId, config.maxLinks);
    for (const s of suggestions) {
      config.linkManager.addLink(entryId, s.entryId, s.suggestedType, `auto: ${s.reason}`);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Fire-and-forget embedding for newly seeded entries.
 * Best-effort: never blocks vault writes, never throws.
 * Skips when pipeline is null, disabled, or batch >100 entries.
 */
export function autoEmbed(
  entryList: Array<Pick<IntelligenceEntry, 'id' | 'title' | 'description' | 'context'>>,
  config: AutoEmbedConfig,
): void {
  if (!config.pipeline || !config.enabled) return;
  if (entryList.length > 100) return; // use batchEmbed for bulk imports

  const pipeline = config.pipeline;
  Promise.resolve()
    .then(async () => {
      for (const entry of entryList) {
        const text = [entry.title, entry.description, entry.context].filter(Boolean).join('\n');
        if (text) {
          await pipeline.embedEntry(entry.id, text);
        }
      }
    })
    .catch((err) => {
      console.error(
        '[autoEmbed] embedding failed:',
        err instanceof Error ? err.message : String(err),
      );
    });
}

/** Result of a single link suggestion with auto-link status. */
export interface AutoLinkSuggestion {
  entryId: string;
  title: string;
  suggestedType: string;
  score: number;
  autoLinked: boolean;
}

/** Aggregated result of auto-linking one or more entries. */
export interface AutoLinkReport {
  autoLinkedCount: number;
  suggestedLinks: AutoLinkSuggestion[];
}

export function autoLinkWithReport(
  entryIds: string[],
  linkManager: LinkManager,
  opts: { threshold?: number; maxLinks?: number } = {},
): AutoLinkReport {
  const threshold = opts.threshold ?? 0.7;
  const maxLinks = opts.maxLinks ?? 3;
  let autoLinkedCount = 0;
  const suggestedLinks: AutoLinkSuggestion[] = [];

  for (const entryId of entryIds) {
    const suggestions = linkManager.suggestLinks(entryId, maxLinks + 2);
    const filtered = suggestions.filter(
      (s) => s.entryId !== entryId && !s.entryId.endsWith(entryId),
    );

    let linkedForThisEntry = 0;
    for (const s of filtered) {
      const aboveThreshold = s.score >= threshold;
      const canAutoLink = aboveThreshold && linkedForThisEntry < maxLinks;
      if (canAutoLink) {
        linkManager.addLink(entryId, s.entryId, s.suggestedType);
        linkedForThisEntry++;
        autoLinkedCount++;
      }
      suggestedLinks.push({
        entryId: s.entryId,
        title: s.title,
        suggestedType: s.suggestedType,
        score: s.score,
        autoLinked: canAutoLink,
      });
    }
  }

  return { autoLinkedCount, suggestedLinks };
}

export function seed(
  provider: PersistenceProvider,
  entries: IntelligenceEntry[],
  alc: AutoLinkConfig,
  aec?: AutoEmbedConfig,
): number {
  const sql = `
    INSERT INTO entries (id,type,domain,title,severity,description,context,example,counter_example,why,tags,applies_to,valid_from,valid_until,content_hash,tier,origin)
    VALUES (@id,@type,@domain,@title,@severity,@description,@context,@example,@counterExample,@why,@tags,@appliesTo,@validFrom,@validUntil,@contentHash,@tier,@origin)
    ON CONFLICT(id) DO UPDATE SET type=excluded.type,domain=excluded.domain,title=excluded.title,severity=excluded.severity,
      description=excluded.description,context=excluded.context,example=excluded.example,counter_example=excluded.counter_example,
      why=excluded.why,tags=excluded.tags,applies_to=excluded.applies_to,valid_from=excluded.valid_from,valid_until=excluded.valid_until,
      content_hash=excluded.content_hash,tier=excluded.tier,origin=excluded.origin,updated_at=unixepoch()
  `;
  const count = provider.transaction(() => {
    let c = 0;
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
      c++;
    }
    // Auto-link after insert; skip large batches (>100) — use relink_vault for bulk imports.
    if (entries.length <= 100) {
      for (const entry of entries) autoLink(entry.id, alc);
    }
    return c;
  });

  // Auto-embed after transaction completes — fire-and-forget, never blocks writes.
  if (aec) {
    autoEmbed(entries, aec);
  }

  return count;
}

export function seedDedup(
  provider: PersistenceProvider,
  entries: IntelligenceEntry[],
  alc: AutoLinkConfig,
  aec?: AutoEmbedConfig,
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
        seed(provider, [entry], alc, aec);
        results.push({ id: entry.id, action: 'inserted' });
      }
    }
    return results;
  });
}

export function installPack(
  provider: PersistenceProvider,
  entries: IntelligenceEntry[],
  alc: AutoLinkConfig,
  aec?: AutoEmbedConfig,
): { installed: number; skipped: number } {
  let installed = 0,
    skipped = 0;
  const tagged = entries.map((e) => ({ ...e, origin: 'pack' as const }));
  for (const r of seedDedup(provider, tagged, alc, aec)) {
    if (r.action === 'inserted') installed++;
    else skipped++;
  }
  return { installed, skipped };
}

export function search(
  provider: PersistenceProvider,
  query: string,
  options?: EntryFilterOptions,
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

export function getByIds(provider: PersistenceProvider, ids: string[]): IntelligenceEntry[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = provider.all<Record<string, unknown>>(
    `SELECT * FROM entries WHERE id IN (${placeholders})`,
    ids,
  );
  return rows.map(rowToEntry);
}

export function list(
  provider: PersistenceProvider,
  options?: EntryFilterOptions & { tags?: string[]; offset?: number },
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
  const total = provider.get<{ count: number }>('SELECT COUNT(*) as count FROM entries')!.count;
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
  alc: AutoLinkConfig,
  aec?: AutoEmbedConfig,
): void {
  seed(provider, [entry], alc, aec);
}

export function remove(provider: PersistenceProvider, id: string): boolean {
  return provider.run('DELETE FROM entries WHERE id = ?', [id]).changes > 0;
}

export function update(
  provider: PersistenceProvider,
  id: string,
  fields: EntryUpdateFields,
  alc: AutoLinkConfig,
  aec?: AutoEmbedConfig,
): IntelligenceEntry | null {
  const existing = get(provider, id);
  if (!existing) return null;
  seed(provider, [{ ...existing, ...fields }], alc, aec);
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
  return provider.run(`UPDATE entries SET ${sets.join(', ')} WHERE id = @id`, params).changes > 0;
}

export function findExpiring(
  provider: PersistenceProvider,
  withinDays: number,
): IntelligenceEntry[] {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now + withinDays * 86400;
  return provider
    .all<Record<string, unknown>>(
      'SELECT * FROM entries WHERE valid_until IS NOT NULL AND valid_until > @now AND valid_until <= @cutoff ORDER BY valid_until ASC',
      { now, cutoff },
    )
    .map(rowToEntry);
}

export function findExpired(
  provider: PersistenceProvider,
  limit: number = 50,
): IntelligenceEntry[] {
  const now = Math.floor(Date.now() / 1000);
  return provider
    .all<Record<string, unknown>>(
      'SELECT * FROM entries WHERE valid_until IS NOT NULL AND valid_until <= @now ORDER BY valid_until DESC LIMIT @limit',
      { now, limit },
    )
    .map(rowToEntry);
}

export function bulkRemove(provider: PersistenceProvider, ids: string[]): number {
  return provider.transaction(() => {
    let count = 0;
    for (const id of ids) count += provider.run('DELETE FROM entries WHERE id = ?', [id]).changes;
    return count;
  });
}

export function getTags(provider: PersistenceProvider): Array<{ tag: string; count: number }> {
  const rows = provider.all<{ tags: string }>('SELECT tags FROM entries');
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of JSON.parse(row.tags || '[]') as string[]) {
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
  return provider.all(
    'SELECT domain, COUNT(*) as count FROM entries GROUP BY domain ORDER BY count DESC',
  );
}

export function getRecent(provider: PersistenceProvider, limit: number = 20): IntelligenceEntry[] {
  return provider
    .all<Record<string, unknown>>('SELECT * FROM entries ORDER BY updated_at DESC LIMIT ?', [limit])
    .map(rowToEntry);
}

export function findByContentHash(provider: PersistenceProvider, hash: string): string | null {
  return (
    provider.get<{ id: string }>('SELECT id FROM entries WHERE content_hash = @hash', { hash })
      ?.id ?? null
  );
}

export function contentHashStats(provider: PersistenceProvider): {
  total: number;
  hashed: number;
  uniqueHashes: number;
} {
  const total = provider.get<{ c: number }>('SELECT COUNT(*) as c FROM entries')?.c ?? 0;
  const hashed =
    provider.get<{ c: number }>('SELECT COUNT(*) as c FROM entries WHERE content_hash IS NOT NULL')
      ?.c ?? 0;
  const uniqueHashes =
    provider.get<{ c: number }>(
      'SELECT COUNT(DISTINCT content_hash) as c FROM entries WHERE content_hash IS NOT NULL',
    )?.c ?? 0;
  return { total, hashed, uniqueHashes };
}

// ── Vector Operations ────────────────────────────────────────────────────

/** Store a vector for an entry. Upserts — replaces if exists. */
export function storeVector(
  provider: PersistenceProvider,
  entryId: string,
  vector: number[],
  model: string,
  dimensions: number,
): void {
  const blob = Buffer.from(new Float32Array(vector).buffer);
  provider.run(
    `INSERT INTO entry_vectors (entry_id, vector, model, dimensions, created_at)
     VALUES (@entryId, @vector, @model, @dimensions, @createdAt)
     ON CONFLICT(entry_id) DO UPDATE SET
       vector = excluded.vector, model = excluded.model,
       dimensions = excluded.dimensions, created_at = excluded.created_at`,
    {
      entryId,
      vector: blob,
      model,
      dimensions,
      createdAt: Date.now(),
    },
  );
}

/** Get the stored vector for an entry, or null. */
export function getVector(provider: PersistenceProvider, entryId: string): StoredVector | null {
  const row = provider.get<{
    entry_id: string;
    vector: Buffer;
    model: string;
    dimensions: number;
    created_at: number;
  }>('SELECT * FROM entry_vectors WHERE entry_id = ?', [entryId]);
  if (!row) return null;
  return {
    entryId: row.entry_id,
    vector: Array.from(
      new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4),
    ),
    model: row.model,
    dimensions: row.dimensions,
    createdAt: row.created_at,
  };
}

/** Delete the vector for an entry. */
export function deleteVector(provider: PersistenceProvider, entryId: string): void {
  provider.run('DELETE FROM entry_vectors WHERE entry_id = ?', [entryId]);
}

/** Get IDs of entries that have no vector for the given model. */
export function getEntriesWithoutVectors(provider: PersistenceProvider, model: string): string[] {
  const rows = provider.all<{ id: string }>(
    `SELECT e.id FROM entries e
     LEFT JOIN entry_vectors ev ON e.id = ev.entry_id AND ev.model = @model
     WHERE ev.entry_id IS NULL`,
    { model },
  );
  return rows.map((r) => r.id);
}

/**
 * Brute-force cosine similarity search over all stored vectors.
 * Returns top-K entries sorted by similarity descending.
 * For <100K entries, brute-force is fast enough (~50ms).
 */
export function cosineSearch(
  provider: PersistenceProvider,
  queryVector: number[],
  topK: number,
): Array<{ entryId: string; similarity: number }> {
  const rows = provider.all<{
    entry_id: string;
    vector: Buffer;
  }>('SELECT entry_id, vector FROM entry_vectors');

  // Precompute query norm
  let queryNorm = 0;
  for (let i = 0; i < queryVector.length; i++) {
    queryNorm += queryVector[i] * queryVector[i];
  }
  queryNorm = Math.sqrt(queryNorm);
  if (queryNorm === 0) return [];

  const results: Array<{ entryId: string; similarity: number }> = [];

  for (const row of rows) {
    const stored = new Float32Array(
      row.vector.buffer,
      row.vector.byteOffset,
      row.vector.byteLength / 4,
    );
    let dot = 0;
    let storedNorm = 0;
    for (let i = 0; i < stored.length; i++) {
      dot += queryVector[i] * stored[i];
      storedNorm += stored[i] * stored[i];
    }
    storedNorm = Math.sqrt(storedNorm);
    if (storedNorm === 0) continue;
    const similarity = dot / (queryNorm * storedNorm);
    results.push({ entryId: row.entry_id, similarity });
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
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
  const rawScore = row.score as number;
  return { entry: rowToEntry(row), score: rawScore < 0 ? -rawScore : rawScore };
}

/** Build FTS5 query from natural language: terms joined with OR for broad matching. */
export function buildFtsQuery(query: string): string {
  // Split on whitespace AND punctuation (hyphens, underscores, dots, slashes)
  // so that "smoke-test-entry" and "snake_case" are treated as multi-term queries.
  const terms = query
    .toLowerCase()
    .split(/[\s\-_./\\]+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  if (terms.length === 0) return query;
  if (terms.length === 1) return terms[0];
  return terms.join(' OR ');
}
