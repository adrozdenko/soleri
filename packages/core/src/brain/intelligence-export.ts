/**
 * Export, import, and stats functions for BrainIntelligence data.
 * Extracted from BrainIntelligence to keep the coordinator thin.
 */

import type { PersistenceProvider } from '../persistence/types.js';
import type {
  PatternStrength,
  BrainSession,
  KnowledgeProposal,
  GlobalPattern,
  DomainProfile,
  BrainIntelligenceStats,
  BrainExportData,
  BrainImportResult,
} from './types.js';
import {
  rowToSession,
  rowToDomainProfile,
  type BrainSessionRow,
  type BrainDomainProfileRow,
} from './intelligence-rows.js';

// ─── Stats ────────────────────────────────────────────────────────

export function getStats(provider: PersistenceProvider): BrainIntelligenceStats {
  const strengths = provider.get<{ c: number }>('SELECT COUNT(*) as c FROM brain_strengths')!.c;
  const sessions = provider.get<{ c: number }>('SELECT COUNT(*) as c FROM brain_sessions')!.c;
  const activeSessions = provider.get<{ c: number }>(
    'SELECT COUNT(*) as c FROM brain_sessions WHERE ended_at IS NULL',
  )!.c;
  const proposals = provider.get<{ c: number }>('SELECT COUNT(*) as c FROM brain_proposals')!.c;
  const promotedProposals = provider.get<{ c: number }>(
    'SELECT COUNT(*) as c FROM brain_proposals WHERE promoted = 1',
  )!.c;
  const globalPatterns = provider.get<{ c: number }>(
    'SELECT COUNT(*) as c FROM brain_global_registry',
  )!.c;
  const domainProfiles = provider.get<{ c: number }>(
    'SELECT COUNT(*) as c FROM brain_domain_profiles',
  )!.c;

  return {
    strengths,
    sessions,
    activeSessions,
    proposals,
    promotedProposals,
    globalPatterns,
    domainProfiles,
  };
}

// ─── Export ───────────────────────────────────────────────────────

export function exportData(
  provider: PersistenceProvider,
  getStrengths: (query?: { limit?: number }) => PatternStrength[],
  getProposals: (options?: { limit?: number }) => KnowledgeProposal[],
  getGlobalPatterns: (limit?: number) => GlobalPattern[],
): BrainExportData {
  const strengths = getStrengths({ limit: 10000 });

  const sessionRows = provider.all<BrainSessionRow>(
    'SELECT * FROM brain_sessions ORDER BY started_at DESC',
  );
  const sessions: BrainSession[] = sessionRows.map((row) => rowToSession(row));

  const proposals = getProposals({ limit: 10000 });
  const globalPatterns = getGlobalPatterns(10000);

  const profileRows = provider.all<BrainDomainProfileRow>('SELECT * FROM brain_domain_profiles');
  const domainProfiles: DomainProfile[] = profileRows.map((row) => rowToDomainProfile(row));

  return {
    strengths,
    sessions,
    proposals,
    globalPatterns,
    domainProfiles,
    exportedAt: new Date().toISOString(),
  };
}

// ─── Import ───────────────────────────────────────────────────────

export function importData(
  provider: PersistenceProvider,
  data: BrainExportData,
): BrainImportResult {
  const result: BrainImportResult = {
    imported: { strengths: 0, sessions: 0, proposals: 0, globalPatterns: 0, domainProfiles: 0 },
  };

  provider.transaction(() => {
    // Import strengths
    for (const s of data.strengths) {
      provider.run(
        `INSERT OR REPLACE INTO brain_strengths
         (pattern, domain, strength, usage_score, spread_score, success_score, recency_score,
          usage_count, unique_contexts, success_rate, last_used, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          s.pattern,
          s.domain,
          s.strength,
          s.usageScore,
          s.spreadScore,
          s.successScore,
          s.recencyScore,
          s.usageCount,
          s.uniqueContexts,
          s.successRate,
          s.lastUsed,
        ],
      );
      result.imported.strengths++;
    }

    // Import sessions
    for (const s of data.sessions) {
      const changes = provider.run(
        `INSERT OR IGNORE INTO brain_sessions
         (id, started_at, ended_at, domain, context, tools_used, files_modified, plan_id, plan_outcome, extracted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.id,
          s.startedAt,
          s.endedAt,
          s.domain,
          s.context,
          JSON.stringify(s.toolsUsed),
          JSON.stringify(s.filesModified),
          s.planId,
          s.planOutcome,
          s.extractedAt ?? null,
        ],
      );
      if (changes.changes > 0) result.imported.sessions++;
    }

    // Import proposals
    for (const p of data.proposals) {
      const changes = provider.run(
        `INSERT OR IGNORE INTO brain_proposals
         (id, session_id, rule, type, title, description, confidence, promoted, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.sessionId,
          p.rule,
          p.type,
          p.title,
          p.description,
          p.confidence,
          p.promoted ? 1 : 0,
          p.createdAt,
        ],
      );
      if (changes.changes > 0) result.imported.proposals++;
    }

    // Import global patterns
    for (const g of data.globalPatterns) {
      provider.run(
        `INSERT OR REPLACE INTO brain_global_registry
         (pattern, domains, total_strength, avg_strength, domain_count, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [g.pattern, JSON.stringify(g.domains), g.totalStrength, g.avgStrength, g.domainCount],
      );
      result.imported.globalPatterns++;
    }

    // Import domain profiles
    for (const d of data.domainProfiles) {
      provider.run(
        `INSERT OR REPLACE INTO brain_domain_profiles
         (domain, top_patterns, session_count, avg_session_duration, last_activity, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [
          d.domain,
          JSON.stringify(d.topPatterns),
          d.sessionCount,
          d.avgSessionDuration,
          d.lastActivity,
        ],
      );
      result.imported.domainProfiles++;
    }
  });

  return result;
}
