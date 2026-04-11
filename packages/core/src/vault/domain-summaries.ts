/**
 * DomainSummaryManager — pre-computed domain-level knowledge summaries.
 *
 * Provides a compression layer between raw vault entries and context injection.
 * Summaries are built heuristically (no LLM dependency) from top entries per domain.
 * Invalidation is lazy: mark stale on write, rebuild on next read.
 */
import type { PersistenceProvider } from '../persistence/types.js';

export interface DomainSummary {
  domain: string;
  summary: string;
  entryCount: number;
  lastRebuilt: number;
  topPatterns: string[];
  topAntipatterns: string[];
  stale: boolean;
}

export interface DomainSummaryStats {
  totalDomains: number;
  staleDomains: number;
  freshDomains: number;
  totalEntries: number;
}

/**
 * Lightweight row from an entry used for heuristic summarization.
 * Avoids loading full IntelligenceEntry objects.
 */
interface SummarySourceRow {
  id: string;
  type: string;
  title: string;
  severity: string;
  tags: string;
  description: string;
}

const MAX_SUMMARY_CHARS = 1200; // ~200-300 tokens at ~4 chars/token

export class DomainSummaryManager {
  constructor(private provider: PersistenceProvider) {}

  /**
   * Get summary for a domain. Rebuilds if stale or missing.
   */
  get(domain: string): DomainSummary | null {
    const row = this.provider.get<Record<string, unknown>>(
      'SELECT * FROM domain_summaries WHERE domain = ?',
      [domain],
    );

    if (!row) {
      // Domain might exist in entries but have no summary yet — try to build one
      const count = this.provider.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM entries WHERE domain = ?',
        [domain],
      );
      if (!count || count.count === 0) return null;
      return this.rebuild(domain);
    }

    if (row.stale) {
      return this.rebuild(domain);
    }

    return rowToSummary(row);
  }

  /**
   * Get summaries for multiple domains. Rebuilds stale ones.
   */
  getMultiple(domains: string[]): DomainSummary[] {
    if (domains.length === 0) return [];
    const results: DomainSummary[] = [];
    for (const domain of domains) {
      const summary = this.get(domain);
      if (summary) results.push(summary);
    }
    return results;
  }

  /**
   * Rebuild summary for a single domain from vault entries.
   * Uses heuristic summarization — no LLM calls.
   */
  rebuild(domain: string): DomainSummary | null {
    const rows = this.provider.all<SummarySourceRow>(
      `SELECT id, type, title, severity, tags, description
       FROM entries
       WHERE domain = @domain
         AND (valid_until IS NULL OR valid_until > @now)
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
         updated_at DESC
       LIMIT 15`,
      { domain, now: Math.floor(Date.now() / 1000) },
    );

    if (rows.length === 0) {
      // Clean up summary for empty domain
      this.provider.run('DELETE FROM domain_summaries WHERE domain = ?', [domain]);
      return null;
    }

    const patterns: string[] = [];
    const antipatterns: string[] = [];

    for (const row of rows) {
      if (row.type === 'pattern' || row.type === 'rule' || row.type === 'playbook') {
        patterns.push(row.title);
      } else if (row.type === 'anti-pattern') {
        antipatterns.push(row.title);
      }
    }

    const summary = buildHeuristicSummary(domain, rows, patterns, antipatterns);
    const entryCount = this.provider.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM entries WHERE domain = ?',
      [domain],
    )!.count;

    const now = Math.floor(Date.now() / 1000);
    this.provider.run(
      `INSERT INTO domain_summaries (domain, summary, entry_count, last_rebuilt, top_patterns, top_antipatterns, stale)
       VALUES (@domain, @summary, @entryCount, @lastRebuilt, @topPatterns, @topAntipatterns, 0)
       ON CONFLICT(domain) DO UPDATE SET
         summary = excluded.summary,
         entry_count = excluded.entry_count,
         last_rebuilt = excluded.last_rebuilt,
         top_patterns = excluded.top_patterns,
         top_antipatterns = excluded.top_antipatterns,
         stale = 0`,
      {
        domain,
        summary,
        entryCount,
        lastRebuilt: now,
        topPatterns: JSON.stringify(patterns.slice(0, 10)),
        topAntipatterns: JSON.stringify(antipatterns.slice(0, 5)),
      },
    );

    return {
      domain,
      summary,
      entryCount,
      lastRebuilt: now,
      topPatterns: patterns.slice(0, 10),
      topAntipatterns: antipatterns.slice(0, 5),
      stale: false,
    };
  }

  /**
   * Rebuild all stale summaries. Returns count of summaries rebuilt.
   */
  rebuildAll(): number {
    // Get all domains from entries, not just those with existing summaries
    const domains = this.provider.all<{ domain: string }>('SELECT DISTINCT domain FROM entries');

    let rebuilt = 0;
    for (const { domain } of domains) {
      const existing = this.provider.get<{ stale: number }>(
        'SELECT stale FROM domain_summaries WHERE domain = ?',
        [domain],
      );
      // Rebuild if no summary exists or it's stale
      if (!existing || existing.stale) {
        this.rebuild(domain);
        rebuilt++;
      }
    }
    return rebuilt;
  }

  /**
   * Mark a domain's summary as stale. Called after vault writes.
   * Fast — just flips a flag, no rebuild.
   */
  markStale(domain: string): void {
    // Upsert: if domain summary doesn't exist yet, create a stale placeholder
    this.provider.run(
      `INSERT INTO domain_summaries (domain, stale) VALUES (@domain, 1)
       ON CONFLICT(domain) DO UPDATE SET stale = 1`,
      { domain },
    );
  }

  /**
   * Get statistics about domain summaries.
   */
  stats(): DomainSummaryStats {
    const totals = this.provider.get<{ total: number; stale: number; fresh: number }>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN stale = 1 THEN 1 ELSE 0 END) as stale,
        SUM(CASE WHEN stale = 0 THEN 1 ELSE 0 END) as fresh
       FROM domain_summaries`,
    );
    const entryTotal = this.provider.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM entries',
    );

    return {
      totalDomains: totals?.total ?? 0,
      staleDomains: totals?.stale ?? 0,
      freshDomains: totals?.fresh ?? 0,
      totalEntries: entryTotal?.count ?? 0,
    };
  }

  /**
   * List all domain summaries (both fresh and stale).
   */
  list(): DomainSummary[] {
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM domain_summaries ORDER BY entry_count DESC',
    );
    return rows.map(rowToSummary);
  }
}

// ── Heuristic Summary Builder ─────────────────────────────────────

function buildHeuristicSummary(
  domain: string,
  rows: SummarySourceRow[],
  patterns: string[],
  antipatterns: string[],
): string {
  const parts: string[] = [];

  // Domain header with entry count
  parts.push(`${domain} (${rows.length} top entries)`);

  // Critical items first
  const critical = rows.filter((r) => r.severity === 'critical');
  if (critical.length > 0) {
    const titles = critical.slice(0, 3).map((r) => r.title);
    parts.push(`Critical: ${titles.join('; ')}`);
  }

  // Top patterns
  if (patterns.length > 0) {
    const top = patterns.slice(0, 5);
    parts.push(`Patterns: ${top.join('; ')}`);
  }

  // Anti-patterns
  if (antipatterns.length > 0) {
    const top = antipatterns.slice(0, 3);
    parts.push(`Avoid: ${top.join('; ')}`);
  }

  // Key tags across all entries
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    const tags: string[] = JSON.parse(row.tags || '[]');
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag]) => tag);
  if (topTags.length > 0) {
    parts.push(`Tags: ${topTags.join(', ')}`);
  }

  let summary = parts.join('. ');
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = summary.slice(0, MAX_SUMMARY_CHARS - 3) + '...';
  }
  return summary;
}

// ── Row Mapping ───────────────────────────────────────────────────

function rowToSummary(row: Record<string, unknown>): DomainSummary {
  return {
    domain: row.domain as string,
    summary: (row.summary as string) || '',
    entryCount: (row.entry_count as number) || 0,
    lastRebuilt: (row.last_rebuilt as number) || 0,
    topPatterns: JSON.parse((row.top_patterns as string) || '[]'),
    topAntipatterns: JSON.parse((row.top_antipatterns as string) || '[]'),
    stale: Boolean(row.stale),
  };
}
