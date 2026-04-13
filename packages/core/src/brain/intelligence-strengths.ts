import type { PersistenceProvider } from '../persistence/types.js';
import type { PatternStrength } from './types.js';
import {
  USAGE_MAX,
  SPREAD_MAX,
  RECENCY_DECAY_DAYS,
  STRENGTH_HALFLIFE_DAYS,
  STRENGTH_DECAY_FLOOR,
} from './intelligence-constants.js';
import { rowToStrength, type BrainStrengthRow } from './intelligence-rows.js';

export interface FeedbackAggregateRow {
  entry_id: string;
  total: number;
  accepted: number;
  dismissed: number;
  modified: number;
  failed: number;
  last_used: string;
  entry_title: string | null;
  entry_domain: string | null;
}

export function computeStrengthsFromFeedback(
  feedbackRows: FeedbackAggregateRow[],
  uniqueDomainCount: number,
  nowMs: number = Date.now(),
): PatternStrength[] {
  const strengths: PatternStrength[] = [];
  const uniqueContexts = Math.min(uniqueDomainCount, 5);

  for (const row of feedbackRows) {
    // Skip rows without a real title. Historical bug: falling back to
    // entry_id leaked machine-generated IDs (plan-..., architecture-...,
    // *-seed) into brain_strengths.pattern. Patterns are meant to be
    // human-readable labels; nameless entries can't contribute to learning.
    if (!row.entry_title) continue;
    const domain = row.entry_domain ?? 'unknown';
    const pattern = row.entry_title;

    const usageScore = Math.min(25, (row.total / USAGE_MAX) * 25);
    const spreadScore = Math.min(25, (uniqueContexts / SPREAD_MAX) * 25);

    const relevantTotal = row.total - row.failed;
    const successRate = relevantTotal > 0 ? (row.accepted + row.modified * 0.5) / relevantTotal : 0;
    const successScore = 25 * successRate;

    const lastUsedRaw = Number(row.last_used);
    const lastUsedMs = lastUsedRaw < 1e12 ? lastUsedRaw * 1000 : lastUsedRaw;
    const daysSince = (nowMs - lastUsedMs) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 25 * (1 - daysSince / RECENCY_DECAY_DAYS));

    const rawStrength = usageScore + spreadScore + successScore + recencyScore;
    const temporalMultiplier = Math.max(
      STRENGTH_DECAY_FLOOR,
      Math.exp((-Math.LN2 * daysSince) / STRENGTH_HALFLIFE_DAYS),
    );

    strengths.push({
      pattern,
      domain,
      strength: rawStrength * temporalMultiplier,
      usageScore,
      spreadScore,
      successScore,
      recencyScore,
      temporalMultiplier,
      usageCount: row.total,
      uniqueContexts,
      successRate,
      lastUsed: row.last_used,
    });
  }

  return strengths;
}

export function persistStrengths(
  provider: PersistenceProvider,
  strengths: PatternStrength[],
): void {
  provider.transaction(() => {
    for (const strength of strengths) {
      provider.run(
        `INSERT OR REPLACE INTO brain_strengths
         (pattern, domain, strength, usage_score, spread_score, success_score, recency_score,
          usage_count, unique_contexts, success_rate, last_used, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          strength.pattern,
          strength.domain,
          strength.strength,
          strength.usageScore,
          strength.spreadScore,
          strength.successScore,
          strength.recencyScore,
          strength.usageCount,
          strength.uniqueContexts,
          strength.successRate,
          strength.lastUsed,
        ],
      );
    }
  });
}

export function mapStrengthRows(rows: BrainStrengthRow[]): PatternStrength[] {
  return rows.map((row) => rowToStrength(row));
}

export function applyTaskContextBoost(strengths: PatternStrength[], task: string): void {
  const taskTerms = new Set(task.toLowerCase().split(/\W+/).filter(Boolean));

  for (const strength of strengths) {
    const patternTerms = strength.pattern.toLowerCase().split(/\W+/);
    const overlap = patternTerms.filter((term) => taskTerms.has(term)).length;
    if (overlap > 0) {
      (strength as { strength: number }).strength += overlap * 5;
    }
  }
}

export function applySourceAcceptanceBoost(
  provider: PersistenceProvider,
  strengths: PatternStrength[],
  source: string,
): void {
  for (const strength of strengths) {
    const row = provider.get<{ total: number; accepted: number; modified: number }>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN action = 'accepted' THEN 1 ELSE 0 END) as accepted,
              SUM(CASE WHEN action = 'modified' THEN 1 ELSE 0 END) as modified
       FROM brain_feedback
       WHERE entry_id = (SELECT id FROM entries WHERE title = ? LIMIT 1)
         AND source = ?`,
      [strength.pattern, source],
    ) as {
      total: number;
      accepted: number;
      modified: number;
    };

    if (row.total >= 3) {
      const sourceRate = (row.accepted + row.modified * 0.5) / row.total;
      (strength as { strength: number }).strength += sourceRate * 10;
    }
  }
}
