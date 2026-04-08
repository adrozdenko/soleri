/**
 * Brain Intelligence — thin coordinator that delegates to trait modules.
 *
 * Follows the Curator pattern: separate class, own SQLite tables,
 * takes Vault + Brain as constructor deps.
 */

import type { Vault } from '../vault/vault.js';
import type { Brain } from './brain.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type { OperatorProfileStore } from '../operator/operator-profile.js';
import { extractFromBrainStrengths } from '../operator/operator-signals.js';
import { initializeBrainIntelligenceTables } from './intelligence-schema.js';
import {
  getSession,
  startOrEndSession,
  getSessionByPlanId,
  listSessions as listSessionsFn,
  getSessionContext as getSessionContextFn,
  archiveSessions as archiveSessionsFn,
  computeSessionQuality as computeSessionQualityFn,
  replaySession as replaySessionFn,
} from './intelligence-sessions.js';
import {
  maybeAutoBuildAfterSession,
  maybeAutoBuildAfterFeedback,
} from './intelligence-feedback.js';
import {
  getStats as getStatsFn,
  exportData as exportDataFn,
  importData as importDataFn,
} from './intelligence-export.js';
import {
  getProposals as getProposalsFn,
  extractKnowledge as extractKnowledgeFn,
  resetExtracted as resetExtractedFn,
  autoPromoteProposals,
  promoteProposals as promoteProposalsFn,
} from './intelligence-proposals.js';
import {
  computeStrengthsFromFeedback,
  mapStrengthRows,
  persistStrengths,
  applyTaskContextBoost,
  applySourceAcceptanceBoost,
  type FeedbackAggregateRow,
} from './intelligence-strengths.js';
import { buildDomainProfiles, buildGlobalRegistry } from './intelligence-pipeline.js';
import { rowToGlobalPattern, rowToDomainProfile } from './intelligence-rows.js';
import type {
  BrainStrengthRow,
  BrainGlobalPatternRow,
  BrainDomainProfileRow,
} from './intelligence-rows.js';
import type {
  PatternStrength,
  StrengthsQuery,
  BrainSession,
  SessionLifecycleInput,
  SessionListQuery,
  SessionQuality,
  SessionReplay,
  KnowledgeProposal,
  ExtractionResult,
  GlobalPattern,
  DomainProfile,
  BuildIntelligenceResult,
  BrainIntelligenceStats,
  SessionContext,
  BrainExportData,
  BrainImportResult,
} from './types.js';

// ─── Class ──────────────────────────────────────────────────────────

export class BrainIntelligence {
  private vault: Vault;
  private brain: Brain;
  private provider: PersistenceProvider;
  private operatorProfile: OperatorProfileStore | null = null;

  constructor(vault: Vault, brain: Brain) {
    this.vault = vault;
    this.brain = brain;
    this.provider = vault.getProvider();
    initializeBrainIntelligenceTables(this.provider);
  }

  /** Wire operator profile for automatic signal extraction. */
  setOperatorProfile(profile: OperatorProfileStore): void {
    this.operatorProfile = profile;
  }

  // ─── Session Lifecycle ────────────────────────────────────────────

  lifecycle(input: SessionLifecycleInput): BrainSession {
    const session = startOrEndSession(this.provider, input);

    if (input.action === 'end') {
      this.autoExtractIfReady(session);
      // Return fresh session (extractedAt may have been set by auto-extract)
      return getSession(this.provider, session.id)!;
    }

    return session;
  }

  private autoExtractIfReady(session: BrainSession): void {
    if (!session.endedAt || session.extractedAt) return;

    const hasSignal =
      session.toolsUsed.length > 0 || session.filesModified.length > 0 || session.planId !== null;
    if (!hasSignal) return;

    try {
      const result = this.extractKnowledge(session.id);
      autoPromoteProposals(this.provider, this.brain, result.proposals);
    } catch {
      // Non-critical — don't break session end
    }

    if (session.planOutcome === 'completed') {
      maybeAutoBuildAfterSession(this.provider, () => this.buildIntelligence());
    }
  }

  maybeAutoBuildOnFeedback(): void {
    maybeAutoBuildAfterFeedback(this.provider, () => this.buildIntelligence());
  }

  getSessionContext(limit = 10): SessionContext {
    return getSessionContextFn(this.provider, limit);
  }

  archiveSessions(olderThanDays = 30): { archived: number } {
    return archiveSessionsFn(this.provider, olderThanDays);
  }

  // ─── Session Query & Quality ─────────────────────────────────────

  getSessionById(id: string): BrainSession | null {
    return getSession(this.provider, id);
  }

  getSessionByPlanId(planId: string): BrainSession | null {
    return getSessionByPlanId(this.provider, planId);
  }

  listSessions(query?: SessionListQuery): BrainSession[] {
    return listSessionsFn(this.provider, query);
  }

  computeSessionQuality(sessionId: string): SessionQuality {
    return computeSessionQualityFn(this.provider, sessionId);
  }

  replaySession(sessionId: string): SessionReplay {
    return replaySessionFn(this.provider, sessionId, (opts) => this.getProposals(opts));
  }

  // ─── Strength Scoring ─────────────────────────────────────────────

  computeStrengths(): PatternStrength[] {
    const feedbackRows = this.provider.all<FeedbackAggregateRow>(
      `SELECT bf.entry_id,
              COUNT(*) as total,
              SUM(CASE WHEN bf.action = 'accepted' THEN 1 ELSE 0 END) as accepted,
              SUM(CASE WHEN bf.action = 'dismissed' THEN 1 ELSE 0 END) as dismissed,
              SUM(CASE WHEN bf.action = 'modified' THEN 1 ELSE 0 END) as modified,
              SUM(CASE WHEN bf.action = 'failed' THEN 1 ELSE 0 END) as failed,
              MAX(bf.created_at) as last_used,
              e.title as entry_title,
              e.domain as entry_domain
       FROM brain_feedback bf
       LEFT JOIN entries e ON e.id = bf.entry_id
       GROUP BY bf.entry_id`,
    );

    const sessionRows = this.provider.all<{ domain: string }>(
      'SELECT DISTINCT domain FROM brain_sessions WHERE domain IS NOT NULL',
    );
    const strengths = computeStrengthsFromFeedback(
      feedbackRows,
      new Set(sessionRows.map((row) => row.domain)).size,
    );
    persistStrengths(this.provider, strengths);
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

    const rows = this.provider.all<BrainStrengthRow>(
      `SELECT * FROM brain_strengths ${where} ORDER BY strength DESC LIMIT ?`,
      values,
    );
    return mapStrengthRows(rows);
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
      const allStrengths = this.getStrengths({ minStrength: 20, limit: limit * 5 });
      const additional = allStrengths.filter(
        (s) =>
          !strengths.some((existing) => existing.pattern === s.pattern) &&
          (s.domain === context.domain || s.domain === 'unknown'),
      );
      strengths = [...strengths, ...additional];
    }

    if (context.task) applyTaskContextBoost(strengths, context.task);
    if (context.source) applySourceAcceptanceBoost(this.provider, strengths, context.source);

    strengths.sort((a, b) => b.strength - a.strength);
    return strengths.slice(0, limit);
  }

  // ─── Knowledge Extraction ─────────────────────────────────────────

  extractKnowledge(sessionId: string): ExtractionResult {
    const session = getSession(this.provider, sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);
    return extractKnowledgeFn(this.provider, session);
  }

  resetExtracted(options?: { sessionId?: string; since?: string; all?: boolean }): {
    reset: number;
  } {
    return resetExtractedFn(this.provider, options);
  }

  getProposals(options?: {
    sessionId?: string;
    promoted?: boolean;
    limit?: number;
  }): KnowledgeProposal[] {
    return getProposalsFn(this.provider, options);
  }

  promoteProposals(
    proposalIds: string[],
    governanceGate?: {
      evaluateCapture: (
        projectPath: string,
        entry: { type: string; category: string; title?: string },
      ) => { action: string; reason?: string };
      propose: (
        projectPath: string,
        entryData: {
          entryId?: string;
          title: string;
          type: string;
          category: string;
          data?: Record<string, unknown>;
        },
        source?: string,
      ) => number;
    },
    projectPath?: string,
  ): {
    promoted: number;
    failed: string[];
    gated: Array<{ id: string; action: string; reason?: string }>;
  } {
    return promoteProposalsFn(this.provider, this.brain, proposalIds, governanceGate, projectPath);
  }

  // ─── Intelligence Pipeline ────────────────────────────────────────

  buildIntelligence(): BuildIntelligenceResult {
    // Step 0: GC — close orphaned sessions older than 24h with no signal
    const TTL_MS = 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    const activeSessions = this.listSessions({ active: true, limit: 1000 });
    let gcClosed = 0;
    for (const s of activeSessions) {
      const isOld = s.startedAt < cutoff;
      const hasNoSignal =
        s.toolsUsed.length === 0 && s.filesModified.length === 0 && s.planOutcome === null;
      if (isOld && hasNoSignal) {
        try {
          this.lifecycle({
            action: 'end',
            sessionId: s.id,
            planOutcome: 'abandoned',
            context: 'auto-gc: no execution signal after TTL',
          });
          gcClosed++;
        } catch {
          // GC must never break the intelligence pipeline
        }
      }
    }

    // Step 1: Compute and persist strengths
    const strengths = this.computeStrengths();

    // Step 2: Build global registry
    const globalPatterns = buildGlobalRegistry(this.provider, strengths);

    // Step 3: Build domain profiles
    const domainProfiles = buildDomainProfiles(this.provider, strengths);

    // Step 4: Extract operator signals from domain expertise
    try {
      if (this.operatorProfile && strengths.length > 0) {
        const signals = extractFromBrainStrengths(strengths);
        if (signals.length > 0) {
          this.operatorProfile.accumulateSignals(signals);
        }
      }
    } catch {
      // Signal extraction must never break intelligence pipeline
    }

    return { strengthsComputed: strengths.length, globalPatterns, domainProfiles, gcClosed };
  }

  getGlobalPatterns(limit = 20): GlobalPattern[] {
    const rows = this.provider.all<BrainGlobalPatternRow>(
      'SELECT * FROM brain_global_registry ORDER BY total_strength DESC LIMIT ?',
      [limit],
    );
    return rows.map((row) => rowToGlobalPattern(row));
  }

  getDomainProfile(domain: string): DomainProfile | null {
    const row = this.provider.get<BrainDomainProfileRow>(
      'SELECT * FROM brain_domain_profiles WHERE domain = ?',
      [domain],
    );
    if (!row) return null;
    return rowToDomainProfile(row);
  }

  // ─── Data Management ──────────────────────────────────────────────

  getStats(): BrainIntelligenceStats {
    return getStatsFn(this.provider);
  }

  exportData(): BrainExportData {
    return exportDataFn(
      this.provider,
      (q) => this.getStrengths(q),
      (o) => this.getProposals(o),
      (l) => this.getGlobalPatterns(l),
    );
  }

  importData(data: BrainExportData): BrainImportResult {
    return importDataFn(this.provider, data);
  }
}
