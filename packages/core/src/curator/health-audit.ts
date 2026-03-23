/**
 * Health Audit — pure-logic module for computing vault health scores.
 *
 * Receives data through a provider interface; no direct DB access.
 */

import type { IntelligenceEntry } from '../intelligence/types.js';
import type { DuplicateDetectionResult, Contradiction, HealthAuditResult } from './types.js';

// ─── Data Provider Interface ────────────────────────────────────────

export interface HealthDataProvider {
  getStaleCount(threshold: number): number;
  getGroomedCount(): number;
  getDuplicates(): DuplicateDetectionResult[];
  getOpenContradictions(): Contradiction[];
}

// ─── Compute ────────────────────────────────────────────────────────

export function computeHealthAudit(
  entries: IntelligenceEntry[],
  data: HealthDataProvider,
  staleDays: number,
): HealthAuditResult {
  const recommendations: string[] = [];

  if (entries.length === 0) {
    return {
      score: 100,
      metrics: { coverage: 1, freshness: 1, quality: 1, tagHealth: 1 },
      recommendations: ['Vault is empty — add knowledge entries to get started.'],
    };
  }

  let score = 100;

  // ── Coverage ──────────────────────────────────────────────────
  const typeCount: Record<string, number> = { pattern: 0, 'anti-pattern': 0, rule: 0 };
  for (const e of entries) typeCount[e.type] = (typeCount[e.type] ?? 0) + 1;

  let coverageScore = 1;
  if (!typeCount.pattern) {
    score -= 10;
    coverageScore -= 0.33;
    recommendations.push('No patterns found — add patterns to improve coverage.');
  }
  if (!typeCount['anti-pattern']) {
    score -= 5;
    coverageScore -= 0.17;
    recommendations.push('No anti-patterns found — add anti-patterns to detect contradictions.');
  }
  if (!typeCount.rule) {
    score -= 5;
    coverageScore -= 0.17;
    recommendations.push('No rules found — add rules for completeness.');
  }
  coverageScore = Math.max(0, coverageScore);

  // ── Freshness ─────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  const staleThreshold = now - staleDays * 86400;
  const staleCount = data.getStaleCount(staleThreshold);
  const staleRatio = staleCount / entries.length;
  const freshnessScore = 1 - staleRatio;
  if (staleRatio > 0.3) {
    const penalty = Math.min(20, Math.round(staleRatio * 30));
    score -= penalty;
    recommendations.push(
      `${staleCount} stale entries (${Math.round(staleRatio * 100)}%) — run grooming to update.`,
    );
  }

  // ── Quality ───────────────────────────────────────────────────
  const duplicates = data.getDuplicates();
  const contradictions = data.getOpenContradictions();
  let qualityScore = 1;
  if (duplicates.length > 0) {
    const penalty = Math.min(15, duplicates.length * 3);
    score -= penalty;
    qualityScore -= penalty / 30;
    recommendations.push(`${duplicates.length} entries have duplicates — run consolidation.`);
  }
  if (contradictions.length > 0) {
    const penalty = Math.min(15, contradictions.length * 5);
    score -= penalty;
    qualityScore -= penalty / 30;
    recommendations.push(`${contradictions.length} open contradictions — resolve or dismiss.`);
  }
  qualityScore = Math.max(0, qualityScore);

  // ── Tag Health ────────────────────────────────────────────────
  const lowTagEntries = entries.filter((e) => e.tags.length < 2);
  const lowTagRatio = lowTagEntries.length / entries.length;
  const tagHealthScore = 1 - lowTagRatio;
  if (lowTagRatio > 0.3) {
    const penalty = Math.min(10, Math.round(lowTagRatio * 15));
    score -= penalty;
    recommendations.push(
      `${lowTagEntries.length} entries have fewer than 2 tags — improve tagging.`,
    );
  }

  // ── Grooming ──────────────────────────────────────────────────
  const groomedCount = data.getGroomedCount();
  if (groomedCount < entries.length) {
    const ungroomed = entries.length - groomedCount;
    const penalty = Math.min(10, Math.round((ungroomed / entries.length) * 10));
    score -= penalty;
    recommendations.push(`${ungroomed} entries never groomed — run groomAll().`);
  }

  score = Math.max(0, score);
  if (recommendations.length === 0) recommendations.push('Vault is healthy — no issues detected.');

  return {
    score,
    metrics: {
      coverage: coverageScore,
      freshness: freshnessScore,
      quality: qualityScore,
      tagHealth: tagHealthScore,
    },
    recommendations,
  };
}
