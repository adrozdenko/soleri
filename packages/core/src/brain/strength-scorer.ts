/**
 * Strength Scorer — computes pattern strength scores from brain feedback data.
 *
 * Extracted from intelligence.ts (Phase 1, Wave 1A).
 * Responsible for: computeStrengths, getStrengths, recommend, buildGlobalRegistry, buildDomainProfiles.
 */

import type { Vault } from '../vault/vault.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type { PatternStrength, StrengthsQuery, GlobalPattern, DomainProfile } from './types.js';

// ─── Constants ──────────────────────────────────────────────────────

const USAGE_MAX = 10;
const SPREAD_MAX = 5;
const RECENCY_DECAY_DAYS = 30;

// ─── Row Types ──────────────────────────────────────────────────────

interface FeedbackRow {
  entry_id: string;
  total: number;
  accepted: number;
  dismissed: number;
  modified: number;
  failed: number;
  last_used: string;
}

interface StrengthRow {
  pattern: string;
  domain: string;
  strength: number;
  usage_score: number;
  spread_score: number;
  success_score: number;
  recency_score: number;
  usage_count: number;
  unique_contexts: number;
  success_rate: number;
  last_used: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeUsageScore(total: number): number {
  return Math.min(25, (total / USAGE_MAX) * 25);
}

function computeSpreadScore(uniqueDomainCount: number): number {
  const capped = Math.min(uniqueDomainCount, 5);
  return Math.min(25, (capped / SPREAD_MAX) * 25);
}

function computeSuccessRate(row: FeedbackRow): number {
  const relevantTotal = row.total - row.failed;
  if (relevantTotal <= 0) return 0;
  return (row.accepted + row.modified * 0.5) / relevantTotal;
}

function computeRecencyScore(lastUsed: string, now: number): number {
  const lastUsedMs = new Date(lastUsed).getTime();
  const daysSince = (now - lastUsedMs) / (1000 * 60 * 60 * 24);
  return Math.max(0, 25 * (1 - daysSince / RECENCY_DECAY_DAYS));
}

function rowToStrength(r: StrengthRow): PatternStrength {
  return {
    pattern: r.pattern,
    domain: r.domain,
    strength: r.strength,
    usageScore: r.usage_score,
    spreadScore: r.spread_score,
    successScore: r.success_score,
    recencyScore: r.recency_score,
    usageCount: r.usage_count,
    uniqueContexts: r.unique_contexts,
    successRate: r.success_rate,
    lastUsed: r.last_used,
  };
}

// ─── Class ──────────────────────────────────────────────────────────

export class StrengthScorer {
  private vault: Vault;
  private provider: PersistenceProvider;

  constructor(vault: Vault) {
    this.vault = vault;
    this.provider = vault.getProvider();
  }

  computeStrengths(): PatternStrength[] {
    const feedbackRows = this.provider.all<FeedbackRow>(
      `SELECT entry_id,
              COUNT(*) as total,
              SUM(CASE WHEN action = 'accepted' THEN 1 ELSE 0 END) as accepted,
              SUM(CASE WHEN action = 'dismissed' THEN 1 ELSE 0 END) as dismissed,
              SUM(CASE WHEN action = 'modified' THEN 1 ELSE 0 END) as modified,
              SUM(CASE WHEN action = 'failed' THEN 1 ELSE 0 END) as failed,
              MAX(created_at) as last_used
       FROM brain_feedback
       GROUP BY entry_id`,
    );

    const sessionRows = this.provider.all<{ domain: string }>(
      'SELECT DISTINCT domain FROM brain_sessions WHERE domain IS NOT NULL',
    );
    const uniqueDomainCount = new Set(sessionRows.map((r) => r.domain)).size;

    const now = Date.now();
    const strengths: PatternStrength[] = [];

    for (const row of feedbackRows) {
      const ps = this.scoreFromFeedback(row, uniqueDomainCount, now);
      strengths.push(ps);
      this.persistStrength(ps);
    }

    return strengths;
  }

  getStrengths(query?: StrengthsQuery): PatternStrength[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (query?.domain) {
      conditions.push('domain = ?');
      values.push(query.domain);
    }
    if (query?.minStrength !== undefined && query.minStrength !== null) {
      conditions.push('strength >= ?');
      values.push(query.minStrength);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = query?.limit ?? 50;
    values.push(limit);

    const rows = this.provider.all<StrengthRow>(
      `SELECT * FROM brain_strengths ${where} ORDER BY strength DESC LIMIT ?`,
      values,
    );

    return rows.map(rowToStrength);
  }

  recommend(context: {
    domain?: string;
    task?: string;
    source?: string;
    limit?: number;
  }): PatternStrength[] {
    const limit = context.limit ?? 5;

    let strengths = this.getStrengths({
      domain: context.domain,
      minStrength: 20,
      limit: limit * 3,
    });

    if (strengths.length < limit && context.domain) {
      strengths = this.expandWithFallback(strengths, context.domain, limit);
    }

    if (context.task) {
      this.boostByTaskContext(strengths, context.task);
    }

    if (context.source) {
      this.boostBySource(strengths, context.source);
    }

    strengths.sort((a, b) => b.strength - a.strength);
    return strengths.slice(0, limit);
  }

  buildGlobalRegistry(strengths: PatternStrength[]): number {
    const patternMap = new Map<string, PatternStrength[]>();
    for (const s of strengths) {
      const list = patternMap.get(s.pattern) ?? [];
      list.push(s);
      patternMap.set(s.pattern, list);
    }

    this.provider.run('DELETE FROM brain_global_registry');

    let count = 0;
    for (const [pattern, entries] of patternMap) {
      const domains = [...new Set(entries.map((e) => e.domain))];
      const totalStrength = entries.reduce((sum, e) => sum + e.strength, 0);
      const avgStrength = totalStrength / entries.length;

      this.provider.run(
        `INSERT INTO brain_global_registry
         (pattern, domains, total_strength, avg_strength, domain_count, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [pattern, JSON.stringify(domains), totalStrength, avgStrength, domains.length],
      );
      count++;
    }

    return count;
  }

  buildDomainProfiles(strengths: PatternStrength[]): number {
    const domainMap = new Map<string, PatternStrength[]>();
    for (const s of strengths) {
      const list = domainMap.get(s.domain) ?? [];
      list.push(s);
      domainMap.set(s.domain, list);
    }

    this.provider.run('DELETE FROM brain_domain_profiles');

    let count = 0;
    for (const [domain, entries] of domainMap) {
      entries.sort((a, b) => b.strength - a.strength);
      const topPatterns = entries.slice(0, 10).map((e) => ({
        pattern: e.pattern,
        strength: e.strength,
      }));

      const sessionCount = this.provider.get<{ c: number }>(
        'SELECT COUNT(*) as c FROM brain_sessions WHERE domain = ?',
        [domain],
      )!.c;

      const durationRow = this.provider.get<{ avg_min: number | null }>(
        `SELECT AVG(
          (julianday(ended_at) - julianday(started_at)) * 1440
        ) as avg_min
        FROM brain_sessions
        WHERE domain = ? AND ended_at IS NOT NULL`,
        [domain],
      )!;

      const lastActivity = entries.reduce(
        (latest, e) => (e.lastUsed > latest ? e.lastUsed : latest),
        '',
      );

      this.provider.run(
        `INSERT INTO brain_domain_profiles
         (domain, top_patterns, session_count, avg_session_duration, last_activity, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [
          domain,
          JSON.stringify(topPatterns),
          sessionCount,
          durationRow.avg_min ?? 0,
          lastActivity || new Date().toISOString(),
        ],
      );
      count++;
    }

    return count;
  }

  getGlobalPatterns(limit = 20): GlobalPattern[] {
    const rows = this.provider.all<{
      pattern: string;
      domains: string;
      total_strength: number;
      avg_strength: number;
      domain_count: number;
    }>('SELECT * FROM brain_global_registry ORDER BY total_strength DESC LIMIT ?', [limit]);

    return rows.map((r) => ({
      pattern: r.pattern,
      domains: JSON.parse(r.domains) as string[],
      totalStrength: r.total_strength,
      avgStrength: r.avg_strength,
      domainCount: r.domain_count,
    }));
  }

  getDomainProfile(domain: string): DomainProfile | null {
    const row = this.provider.get<{
      domain: string;
      top_patterns: string;
      session_count: number;
      avg_session_duration: number;
      last_activity: string;
    }>('SELECT * FROM brain_domain_profiles WHERE domain = ?', [domain]);

    if (!row) return null;

    return {
      domain: row.domain,
      topPatterns: JSON.parse(row.top_patterns) as Array<{ pattern: string; strength: number }>,
      sessionCount: row.session_count,
      avgSessionDuration: row.avg_session_duration,
      lastActivity: row.last_activity,
    };
  }

  // ─── Private ────────────────────────────────────────────────────

  private scoreFromFeedback(
    row: FeedbackRow,
    uniqueDomainCount: number,
    now: number,
  ): PatternStrength {
    const entry = this.vault.get(row.entry_id);
    const domain = entry?.domain ?? 'unknown';
    const pattern = entry?.title ?? row.entry_id;

    const usageScore = computeUsageScore(row.total);
    const spreadScore = computeSpreadScore(uniqueDomainCount);
    const successRate = computeSuccessRate(row);
    const successScore = 25 * successRate;
    const recencyScore = computeRecencyScore(row.last_used, now);
    const strength = usageScore + spreadScore + successScore + recencyScore;

    return {
      pattern,
      domain,
      strength,
      usageScore,
      spreadScore,
      successScore,
      recencyScore,
      usageCount: row.total,
      uniqueContexts: Math.min(uniqueDomainCount, 5),
      successRate,
      lastUsed: row.last_used,
    };
  }

  private persistStrength(ps: PatternStrength): void {
    this.provider.run(
      `INSERT OR REPLACE INTO brain_strengths
       (pattern, domain, strength, usage_score, spread_score, success_score, recency_score,
        usage_count, unique_contexts, success_rate, last_used, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        ps.pattern,
        ps.domain,
        ps.strength,
        ps.usageScore,
        ps.spreadScore,
        ps.successScore,
        ps.recencyScore,
        ps.usageCount,
        ps.uniqueContexts,
        ps.successRate,
        ps.lastUsed,
      ],
    );
  }

  private expandWithFallback(
    strengths: PatternStrength[],
    domain: string,
    limit: number,
  ): PatternStrength[] {
    const allStrengths = this.getStrengths({
      minStrength: 20,
      limit: limit * 5,
    });
    const additional = allStrengths.filter(
      (s) =>
        !strengths.some((existing) => existing.pattern === s.pattern) &&
        (s.domain === domain || s.domain === 'unknown'),
    );
    return [...strengths, ...additional];
  }

  private boostByTaskContext(strengths: PatternStrength[], task: string): void {
    const taskTerms = new Set(task.toLowerCase().split(/\W+/).filter(Boolean));
    for (const s of strengths) {
      const patternTerms = s.pattern.toLowerCase().split(/\W+/);
      const overlap = patternTerms.filter((t) => taskTerms.has(t)).length;
      if (overlap > 0) {
        (s as { strength: number }).strength += overlap * 5;
      }
    }
  }

  private boostBySource(strengths: PatternStrength[], source: string): void {
    for (const s of strengths) {
      const row = this.provider.get<{
        total: number;
        accepted: number;
        modified: number;
      }>(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN action = 'accepted' THEN 1 ELSE 0 END) as accepted,
                SUM(CASE WHEN action = 'modified' THEN 1 ELSE 0 END) as modified
         FROM brain_feedback
         WHERE entry_id = (SELECT id FROM entries WHERE title = ? LIMIT 1)
           AND source = ?`,
        [s.pattern, source],
      ) as { total: number; accepted: number; modified: number };

      if (row.total < 3) continue;
      const sourceRate = (row.accepted + row.modified * 0.5) / row.total;
      (s as { strength: number }).strength += sourceRate * 10;
    }
  }
}
