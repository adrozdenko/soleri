/**
 * Brain Intelligence — pattern strength scoring, session knowledge extraction,
 * and cross-domain intelligence pipeline.
 *
 * Follows the Curator pattern: separate class, own SQLite tables,
 * takes Vault + Brain as constructor deps.
 */

import { randomUUID } from 'node:crypto';
import type { Vault } from '../vault/vault.js';
import type { Brain } from './brain.js';
import type {
  PatternStrength,
  StrengthsQuery,
  BrainSession,
  SessionLifecycleInput,
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

// ─── Constants ──────────────────────────────────────────────────────

const USAGE_MAX = 10;
const SPREAD_MAX = 5;
const RECENCY_DECAY_DAYS = 30;
const EXTRACTION_TOOL_THRESHOLD = 3;
const EXTRACTION_FILE_THRESHOLD = 3;
const EXTRACTION_LONG_SESSION_MINUTES = 30;
const EXTRACTION_HIGH_FEEDBACK_RATIO = 0.8;

// ─── Class ──────────────────────────────────────────────────────────

export class BrainIntelligence {
  private vault: Vault;
  private brain: Brain;

  constructor(vault: Vault, brain: Brain) {
    this.vault = vault;
    this.brain = brain;
    this.initializeTables();
  }

  // ─── Table Initialization ─────────────────────────────────────────

  private initializeTables(): void {
    const db = this.vault.getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS brain_strengths (
        pattern TEXT NOT NULL,
        domain TEXT NOT NULL,
        strength REAL NOT NULL DEFAULT 0,
        usage_score REAL NOT NULL DEFAULT 0,
        spread_score REAL NOT NULL DEFAULT 0,
        success_score REAL NOT NULL DEFAULT 0,
        recency_score REAL NOT NULL DEFAULT 0,
        usage_count INTEGER NOT NULL DEFAULT 0,
        unique_contexts INTEGER NOT NULL DEFAULT 0,
        success_rate REAL NOT NULL DEFAULT 0,
        last_used TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (pattern, domain)
      );

      CREATE TABLE IF NOT EXISTS brain_sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        domain TEXT,
        context TEXT,
        tools_used TEXT NOT NULL DEFAULT '[]',
        files_modified TEXT NOT NULL DEFAULT '[]',
        plan_id TEXT,
        plan_outcome TEXT,
        extracted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS brain_proposals (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        rule TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'pattern',
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        promoted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES brain_sessions(id)
      );

      CREATE TABLE IF NOT EXISTS brain_global_registry (
        pattern TEXT PRIMARY KEY,
        domains TEXT NOT NULL DEFAULT '[]',
        total_strength REAL NOT NULL DEFAULT 0,
        avg_strength REAL NOT NULL DEFAULT 0,
        domain_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS brain_domain_profiles (
        domain TEXT PRIMARY KEY,
        top_patterns TEXT NOT NULL DEFAULT '[]',
        session_count INTEGER NOT NULL DEFAULT 0,
        avg_session_duration REAL NOT NULL DEFAULT 0,
        last_activity TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // ─── Session Lifecycle ────────────────────────────────────────────

  lifecycle(input: SessionLifecycleInput): BrainSession {
    const db = this.vault.getDb();

    if (input.action === 'start') {
      const id = input.sessionId ?? randomUUID();
      db.prepare(
        `INSERT INTO brain_sessions (id, domain, context, tools_used, files_modified, plan_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.domain ?? null,
        input.context ?? null,
        JSON.stringify(input.toolsUsed ?? []),
        JSON.stringify(input.filesModified ?? []),
        input.planId ?? null,
      );
      return this.getSession(id)!;
    }

    // action === 'end'
    const sessionId = input.sessionId;
    if (!sessionId) throw new Error('sessionId required for end action');

    const updates: string[] = ["ended_at = datetime('now')"];
    const values: unknown[] = [];

    if (input.toolsUsed) {
      updates.push('tools_used = ?');
      values.push(JSON.stringify(input.toolsUsed));
    }
    if (input.filesModified) {
      updates.push('files_modified = ?');
      values.push(JSON.stringify(input.filesModified));
    }
    if (input.planId) {
      updates.push('plan_id = ?');
      values.push(input.planId);
    }
    if (input.planOutcome) {
      updates.push('plan_outcome = ?');
      values.push(input.planOutcome);
    }

    values.push(sessionId);
    db.prepare(`UPDATE brain_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Auto-extract knowledge if session has enough signal
    this.autoExtractIfReady(this.getSession(sessionId)!);

    // Return fresh session (extractedAt may have been set by auto-extract)
    return this.getSession(sessionId)!;
  }

  /**
   * Attempt auto-extraction after session end if the session has enough signal.
   * Gate: at least 1 tool used OR 1 file modified OR a plan was associated.
   * Silently skips if already extracted or insufficient data.
   */
  private autoExtractIfReady(session: BrainSession): void {
    if (!session.endedAt) return;
    if (session.extractedAt) return;

    const hasSignal =
      session.toolsUsed.length > 0 || session.filesModified.length > 0 || session.planId !== null;

    if (!hasSignal) return;

    try {
      this.extractKnowledge(session.id);
    } catch {
      // Non-critical — don't break session end
    }
  }

  getSessionContext(limit = 10): SessionContext {
    const db = this.vault.getDb();

    const rows = db
      .prepare('SELECT * FROM brain_sessions ORDER BY started_at DESC LIMIT ?')
      .all(limit) as Array<{
      id: string;
      started_at: string;
      ended_at: string | null;
      domain: string | null;
      context: string | null;
      tools_used: string;
      files_modified: string;
      plan_id: string | null;
      plan_outcome: string | null;
      extracted_at: string | null;
    }>;

    const sessions = rows.map((r) => this.rowToSession(r));

    // Aggregate tool frequency
    const toolCounts = new Map<string, number>();
    const fileCounts = new Map<string, number>();
    for (const s of sessions) {
      for (const t of s.toolsUsed) {
        toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
      }
      for (const f of s.filesModified) {
        fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
      }
    }

    const toolFrequency = [...toolCounts.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count);

    const fileFrequency = [...fileCounts.entries()]
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count);

    return { recentSessions: sessions, toolFrequency, fileFrequency };
  }

  archiveSessions(olderThanDays = 30): { archived: number } {
    const db = this.vault.getDb();
    const result = db
      .prepare(
        `DELETE FROM brain_sessions
         WHERE ended_at IS NOT NULL
         AND started_at < datetime('now', '-' || ? || ' days')`,
      )
      .run(olderThanDays);
    return { archived: result.changes };
  }

  // ─── Strength Scoring ─────────────────────────────────────────────

  computeStrengths(): PatternStrength[] {
    const db = this.vault.getDb();

    // Gather feedback data grouped by entry_id
    const feedbackRows = db
      .prepare(
        `SELECT entry_id,
                COUNT(*) as total,
                SUM(CASE WHEN action = 'accepted' THEN 1 ELSE 0 END) as accepted,
                SUM(CASE WHEN action = 'dismissed' THEN 1 ELSE 0 END) as dismissed,
                SUM(CASE WHEN action = 'modified' THEN 1 ELSE 0 END) as modified,
                SUM(CASE WHEN action = 'failed' THEN 1 ELSE 0 END) as failed,
                MAX(created_at) as last_used
         FROM brain_feedback
         GROUP BY entry_id`,
      )
      .all() as Array<{
      entry_id: string;
      total: number;
      accepted: number;
      dismissed: number;
      modified: number;
      failed: number;
      last_used: string;
    }>;

    // Count unique session domains as spread proxy
    const sessionRows = db
      .prepare('SELECT DISTINCT domain FROM brain_sessions WHERE domain IS NOT NULL')
      .all() as Array<{ domain: string }>;
    const uniqueDomains = new Set(sessionRows.map((r) => r.domain));

    const now = Date.now();
    const strengths: PatternStrength[] = [];

    for (const row of feedbackRows) {
      // Look up vault entry for domain info
      const entry = this.vault.get(row.entry_id);
      const domain = entry?.domain ?? 'unknown';
      const pattern = entry?.title ?? row.entry_id;

      // Usage score: min(25, (count / USAGE_MAX) * 25)
      const usageScore = Math.min(25, (row.total / USAGE_MAX) * 25);

      // Spread score: use unique domains from sessions as proxy
      const uniqueContexts = Math.min(uniqueDomains.size, 5);
      const spreadScore = Math.min(25, (uniqueContexts / SPREAD_MAX) * 25);

      // Success score: 25 * successRate
      // modified = 0.5 positive, failed = excluded (system error, not relevance)
      const relevantTotal = row.total - row.failed;
      const successRate =
        relevantTotal > 0 ? (row.accepted + row.modified * 0.5) / relevantTotal : 0;
      const successScore = 25 * successRate;

      // Recency score: max(0, 25 * (1 - daysSince / RECENCY_DECAY_DAYS))
      const lastUsedMs = new Date(row.last_used).getTime();
      const daysSince = (now - lastUsedMs) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 25 * (1 - daysSince / RECENCY_DECAY_DAYS));

      const strength = usageScore + spreadScore + successScore + recencyScore;

      const ps: PatternStrength = {
        pattern,
        domain,
        strength,
        usageScore,
        spreadScore,
        successScore,
        recencyScore,
        usageCount: row.total,
        uniqueContexts,
        successRate,
        lastUsed: row.last_used,
      };

      strengths.push(ps);

      // Persist
      db.prepare(
        `INSERT OR REPLACE INTO brain_strengths
         (pattern, domain, strength, usage_score, spread_score, success_score, recency_score,
          usage_count, unique_contexts, success_rate, last_used, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).run(
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
      );
    }

    return strengths;
  }

  getStrengths(query?: StrengthsQuery): PatternStrength[] {
    const db = this.vault.getDb();
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

    const rows = db
      .prepare(`SELECT * FROM brain_strengths ${where} ORDER BY strength DESC LIMIT ?`)
      .all(...values) as Array<{
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
    }>;

    return rows.map((r) => ({
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
    }));
  }

  recommend(context: {
    domain?: string;
    task?: string;
    source?: string;
    limit?: number;
  }): PatternStrength[] {
    const limit = context.limit ?? 5;
    const strengths = this.getStrengths({
      domain: context.domain,
      minStrength: 30,
      limit: limit * 3,
    });

    // If task context provided, boost patterns with matching terms
    if (context.task) {
      const taskTerms = new Set(context.task.toLowerCase().split(/\W+/).filter(Boolean));
      for (const s of strengths) {
        const patternTerms = s.pattern.toLowerCase().split(/\W+/);
        const overlap = patternTerms.filter((t) => taskTerms.has(t)).length;
        if (overlap > 0) {
          // Temporarily boost strength for ranking (doesn't persist)
          (s as { strength: number }).strength += overlap * 5;
        }
      }
    }

    // Boost patterns with high source-specific acceptance rates
    if (context.source) {
      const db = this.vault.getDb();
      for (const s of strengths) {
        const row = db
          .prepare(
            `SELECT COUNT(*) as total,
                    SUM(CASE WHEN action = 'accepted' THEN 1 ELSE 0 END) as accepted,
                    SUM(CASE WHEN action = 'modified' THEN 1 ELSE 0 END) as modified
             FROM brain_feedback
             WHERE entry_id = (SELECT id FROM entries WHERE title = ? LIMIT 1)
               AND source = ?`,
          )
          .get(s.pattern, context.source) as {
          total: number;
          accepted: number;
          modified: number;
        };

        if (row.total >= 3) {
          const sourceRate = (row.accepted + row.modified * 0.5) / row.total;
          // Boost up to +10 points for high source-specific acceptance
          (s as { strength: number }).strength += sourceRate * 10;
        }
      }
    }

    strengths.sort((a, b) => b.strength - a.strength);
    return strengths.slice(0, limit);
  }

  // ─── Knowledge Extraction ─────────────────────────────────────────

  extractKnowledge(sessionId: string): ExtractionResult {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);

    const proposals: KnowledgeProposal[] = [];
    const rulesApplied: string[] = [];
    const db = this.vault.getDb();

    // Rule 1: Repeated tool usage (3+ same tool)
    const toolCounts = new Map<string, number>();
    for (const t of session.toolsUsed) {
      toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
    }
    for (const [tool, count] of toolCounts) {
      if (count >= EXTRACTION_TOOL_THRESHOLD) {
        rulesApplied.push('repeated_tool_usage');
        proposals.push(
          this.createProposal(db, sessionId, 'repeated_tool_usage', 'pattern', {
            title: `Frequent use of ${tool}`,
            description: `Tool ${tool} was used ${count} times in session. Consider automating or abstracting this workflow.`,
            confidence: Math.min(0.9, 0.5 + count * 0.1),
          }),
        );
      }
    }

    // Rule 2: Multi-file edits (3+ files)
    if (session.filesModified.length >= EXTRACTION_FILE_THRESHOLD) {
      rulesApplied.push('multi_file_edit');
      proposals.push(
        this.createProposal(db, sessionId, 'multi_file_edit', 'pattern', {
          title: `Multi-file change pattern (${session.filesModified.length} files)`,
          description: `Session modified ${session.filesModified.length} files: ${session.filesModified.slice(0, 5).join(', ')}${session.filesModified.length > 5 ? '...' : ''}. This may indicate an architectural pattern.`,
          confidence: Math.min(0.8, 0.4 + session.filesModified.length * 0.05),
        }),
      );
    }

    // Rule 3: Long session (>30min)
    if (session.endedAt && session.startedAt) {
      const durationMs =
        new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
      const durationMin = durationMs / 60000;
      if (durationMin > EXTRACTION_LONG_SESSION_MINUTES) {
        rulesApplied.push('long_session');
        proposals.push(
          this.createProposal(db, sessionId, 'long_session', 'anti-pattern', {
            title: `Long session (${Math.round(durationMin)} minutes)`,
            description: `Session lasted ${Math.round(durationMin)} minutes. Consider breaking complex tasks into smaller steps or improving automation.`,
            confidence: 0.5,
          }),
        );
      }
    }

    // Rule 4: Plan completed
    if (session.planId && session.planOutcome === 'completed') {
      rulesApplied.push('plan_completed');
      proposals.push(
        this.createProposal(db, sessionId, 'plan_completed', 'workflow', {
          title: `Successful plan: ${session.planId}`,
          description: `Plan ${session.planId} completed successfully. This workflow can be reused for similar tasks.`,
          confidence: 0.8,
        }),
      );
    }

    // Rule 5: Plan abandoned
    if (session.planId && session.planOutcome === 'abandoned') {
      rulesApplied.push('plan_abandoned');
      proposals.push(
        this.createProposal(db, sessionId, 'plan_abandoned', 'anti-pattern', {
          title: `Abandoned plan: ${session.planId}`,
          description: `Plan ${session.planId} was abandoned. Review what went wrong to avoid repeating in future sessions.`,
          confidence: 0.7,
        }),
      );
    }

    // Rule 6: High feedback ratio (>80% accept or dismiss)
    const feedbackRow = db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN action = 'accepted' THEN 1 ELSE 0 END) as accepted,
                SUM(CASE WHEN action = 'dismissed' THEN 1 ELSE 0 END) as dismissed
         FROM brain_feedback
         WHERE created_at >= ? AND created_at <= ?`,
      )
      .get(session.startedAt, session.endedAt ?? new Date().toISOString()) as {
      total: number;
      accepted: number;
      dismissed: number;
    };

    if (feedbackRow.total >= 3) {
      const acceptRate = feedbackRow.accepted / feedbackRow.total;
      const dismissRate = feedbackRow.dismissed / feedbackRow.total;

      if (acceptRate >= EXTRACTION_HIGH_FEEDBACK_RATIO) {
        rulesApplied.push('high_accept_ratio');
        proposals.push(
          this.createProposal(db, sessionId, 'high_accept_ratio', 'pattern', {
            title: `High search acceptance rate (${Math.round(acceptRate * 100)}%)`,
            description: `Search results were accepted ${Math.round(acceptRate * 100)}% of the time. Brain scoring is well-calibrated for this type of work.`,
            confidence: 0.7,
          }),
        );
      } else if (dismissRate >= EXTRACTION_HIGH_FEEDBACK_RATIO) {
        rulesApplied.push('high_dismiss_ratio');
        proposals.push(
          this.createProposal(db, sessionId, 'high_dismiss_ratio', 'anti-pattern', {
            title: `High search dismissal rate (${Math.round(dismissRate * 100)}%)`,
            description: `Search results were dismissed ${Math.round(dismissRate * 100)}% of the time. Brain scoring may need recalibration for this domain.`,
            confidence: 0.7,
          }),
        );
      }
    }

    // Mark session as extracted
    db.prepare("UPDATE brain_sessions SET extracted_at = datetime('now') WHERE id = ?").run(
      sessionId,
    );

    return {
      sessionId,
      proposals,
      rulesApplied: [...new Set(rulesApplied)],
    };
  }

  resetExtracted(options?: { sessionId?: string; since?: string; all?: boolean }): {
    reset: number;
  } {
    const db = this.vault.getDb();

    if (options?.sessionId) {
      const info = db
        .prepare(
          'UPDATE brain_sessions SET extracted_at = NULL WHERE id = ? AND extracted_at IS NOT NULL',
        )
        .run(options.sessionId);
      return { reset: info.changes };
    }

    if (options?.since) {
      const info = db
        .prepare('UPDATE brain_sessions SET extracted_at = NULL WHERE extracted_at >= ?')
        .run(options.since);
      return { reset: info.changes };
    }

    if (options?.all) {
      const info = db
        .prepare('UPDATE brain_sessions SET extracted_at = NULL WHERE extracted_at IS NOT NULL')
        .run();
      return { reset: info.changes };
    }

    return { reset: 0 };
  }

  getProposals(options?: {
    sessionId?: string;
    promoted?: boolean;
    limit?: number;
  }): KnowledgeProposal[] {
    const db = this.vault.getDb();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (options?.sessionId) {
      conditions.push('session_id = ?');
      values.push(options.sessionId);
    }
    if (options?.promoted !== undefined && options.promoted !== null) {
      conditions.push('promoted = ?');
      values.push(options.promoted ? 1 : 0);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = options?.limit ?? 50;
    values.push(limit);

    const rows = db
      .prepare(`SELECT * FROM brain_proposals ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...values) as Array<{
      id: string;
      session_id: string;
      rule: string;
      type: string;
      title: string;
      description: string;
      confidence: number;
      promoted: number;
      created_at: string;
    }>;

    return rows.map((r) => this.rowToProposal(r));
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
    const db = this.vault.getDb();
    let promoted = 0;
    const failed: string[] = [];
    const gated: Array<{ id: string; action: string; reason?: string }> = [];
    const pp = projectPath ?? '.';

    for (const id of proposalIds) {
      const row = db.prepare('SELECT * FROM brain_proposals WHERE id = ?').get(id) as
        | {
            id: string;
            session_id: string;
            rule: string;
            type: string;
            title: string;
            description: string;
            confidence: number;
            promoted: number;
            created_at: string;
          }
        | undefined;

      if (!row) {
        failed.push(id);
        continue;
      }

      if (row.promoted) continue; // Already promoted

      // Map type for vault
      const rawType = row.type;
      const vaultType: 'pattern' | 'anti-pattern' | 'rule' =
        rawType === 'anti-pattern' ? 'anti-pattern' : 'pattern';

      // Governance gate (when provided)
      if (governanceGate) {
        const decision = governanceGate.evaluateCapture(pp, {
          type: vaultType,
          category: 'brain-intelligence',
          title: row.title,
        });

        if (decision.action === 'propose') {
          governanceGate.propose(
            pp,
            {
              entryId: `proposal-${id}`,
              title: row.title,
              type: vaultType,
              category: 'brain-intelligence',
              data: {
                severity: 'suggestion',
                description: row.description,
                tags: ['auto-extracted', row.rule],
              },
            },
            'brain-promote',
          );
          gated.push({ id, action: 'propose', reason: decision.reason });
          continue;
        }

        if (decision.action !== 'capture') {
          gated.push({ id, action: decision.action, reason: decision.reason });
          continue;
        }
      }

      // Capture into vault
      this.brain.enrichAndCapture({
        id: `proposal-${id}`,
        type: vaultType,
        domain: 'brain-intelligence',
        title: row.title,
        severity: 'suggestion',
        description: row.description,
        tags: ['auto-extracted', row.rule],
      });

      db.prepare('UPDATE brain_proposals SET promoted = 1 WHERE id = ?').run(id);
      promoted++;
    }

    return { promoted, failed, gated };
  }

  // ─── Intelligence Pipeline ────────────────────────────────────────

  buildIntelligence(): BuildIntelligenceResult {
    // Step 1: Compute and persist strengths
    const strengths = this.computeStrengths();

    // Step 2: Build global registry
    const globalPatterns = this.buildGlobalRegistry(strengths);

    // Step 3: Build domain profiles
    const domainProfiles = this.buildDomainProfiles(strengths);

    return {
      strengthsComputed: strengths.length,
      globalPatterns,
      domainProfiles,
    };
  }

  getGlobalPatterns(limit = 20): GlobalPattern[] {
    const db = this.vault.getDb();
    const rows = db
      .prepare('SELECT * FROM brain_global_registry ORDER BY total_strength DESC LIMIT ?')
      .all(limit) as Array<{
      pattern: string;
      domains: string;
      total_strength: number;
      avg_strength: number;
      domain_count: number;
    }>;

    return rows.map((r) => ({
      pattern: r.pattern,
      domains: JSON.parse(r.domains) as string[],
      totalStrength: r.total_strength,
      avgStrength: r.avg_strength,
      domainCount: r.domain_count,
    }));
  }

  getDomainProfile(domain: string): DomainProfile | null {
    const db = this.vault.getDb();
    const row = db.prepare('SELECT * FROM brain_domain_profiles WHERE domain = ?').get(domain) as
      | {
          domain: string;
          top_patterns: string;
          session_count: number;
          avg_session_duration: number;
          last_activity: string;
        }
      | undefined;

    if (!row) return null;

    return {
      domain: row.domain,
      topPatterns: JSON.parse(row.top_patterns) as Array<{ pattern: string; strength: number }>,
      sessionCount: row.session_count,
      avgSessionDuration: row.avg_session_duration,
      lastActivity: row.last_activity,
    };
  }

  // ─── Data Management ──────────────────────────────────────────────

  getStats(): BrainIntelligenceStats {
    const db = this.vault.getDb();

    const strengths = (
      db.prepare('SELECT COUNT(*) as c FROM brain_strengths').get() as { c: number }
    ).c;
    const sessions = (db.prepare('SELECT COUNT(*) as c FROM brain_sessions').get() as { c: number })
      .c;
    const activeSessions = (
      db.prepare('SELECT COUNT(*) as c FROM brain_sessions WHERE ended_at IS NULL').get() as {
        c: number;
      }
    ).c;
    const proposals = (
      db.prepare('SELECT COUNT(*) as c FROM brain_proposals').get() as { c: number }
    ).c;
    const promotedProposals = (
      db.prepare('SELECT COUNT(*) as c FROM brain_proposals WHERE promoted = 1').get() as {
        c: number;
      }
    ).c;
    const globalPatterns = (
      db.prepare('SELECT COUNT(*) as c FROM brain_global_registry').get() as { c: number }
    ).c;
    const domainProfiles = (
      db.prepare('SELECT COUNT(*) as c FROM brain_domain_profiles').get() as { c: number }
    ).c;

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

  exportData(): BrainExportData {
    const db = this.vault.getDb();

    const strengths = this.getStrengths({ limit: 10000 });

    const sessionRows = db
      .prepare('SELECT * FROM brain_sessions ORDER BY started_at DESC')
      .all() as Array<{
      id: string;
      started_at: string;
      ended_at: string | null;
      domain: string | null;
      context: string | null;
      tools_used: string;
      files_modified: string;
      plan_id: string | null;
      plan_outcome: string | null;
      extracted_at: string | null;
    }>;
    const sessions = sessionRows.map((r) => this.rowToSession(r));

    const proposals = this.getProposals({ limit: 10000 });
    const globalPatterns = this.getGlobalPatterns(10000);

    const profileRows = db.prepare('SELECT * FROM brain_domain_profiles').all() as Array<{
      domain: string;
      top_patterns: string;
      session_count: number;
      avg_session_duration: number;
      last_activity: string;
    }>;
    const domainProfiles = profileRows.map((r) => ({
      domain: r.domain,
      topPatterns: JSON.parse(r.top_patterns) as Array<{ pattern: string; strength: number }>,
      sessionCount: r.session_count,
      avgSessionDuration: r.avg_session_duration,
      lastActivity: r.last_activity,
    }));

    return {
      strengths,
      sessions,
      proposals,
      globalPatterns,
      domainProfiles,
      exportedAt: new Date().toISOString(),
    };
  }

  importData(data: BrainExportData): BrainImportResult {
    const db = this.vault.getDb();
    const result: BrainImportResult = {
      imported: { strengths: 0, sessions: 0, proposals: 0, globalPatterns: 0, domainProfiles: 0 },
    };

    const tx = db.transaction(() => {
      // Import strengths
      const insertStrength = db.prepare(
        `INSERT OR REPLACE INTO brain_strengths
         (pattern, domain, strength, usage_score, spread_score, success_score, recency_score,
          usage_count, unique_contexts, success_rate, last_used, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      );
      for (const s of data.strengths) {
        insertStrength.run(
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
        );
        result.imported.strengths++;
      }

      // Import sessions
      const insertSession = db.prepare(
        `INSERT OR IGNORE INTO brain_sessions
         (id, started_at, ended_at, domain, context, tools_used, files_modified, plan_id, plan_outcome, extracted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const s of data.sessions) {
        const changes = insertSession.run(
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
        );
        if (changes.changes > 0) result.imported.sessions++;
      }

      // Import proposals
      const insertProposal = db.prepare(
        `INSERT OR IGNORE INTO brain_proposals
         (id, session_id, rule, type, title, description, confidence, promoted, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const p of data.proposals) {
        const changes = insertProposal.run(
          p.id,
          p.sessionId,
          p.rule,
          p.type,
          p.title,
          p.description,
          p.confidence,
          p.promoted ? 1 : 0,
          p.createdAt,
        );
        if (changes.changes > 0) result.imported.proposals++;
      }

      // Import global patterns
      const insertGlobal = db.prepare(
        `INSERT OR REPLACE INTO brain_global_registry
         (pattern, domains, total_strength, avg_strength, domain_count, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      );
      for (const g of data.globalPatterns) {
        insertGlobal.run(
          g.pattern,
          JSON.stringify(g.domains),
          g.totalStrength,
          g.avgStrength,
          g.domainCount,
        );
        result.imported.globalPatterns++;
      }

      // Import domain profiles
      const insertProfile = db.prepare(
        `INSERT OR REPLACE INTO brain_domain_profiles
         (domain, top_patterns, session_count, avg_session_duration, last_activity, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      );
      for (const d of data.domainProfiles) {
        insertProfile.run(
          d.domain,
          JSON.stringify(d.topPatterns),
          d.sessionCount,
          d.avgSessionDuration,
          d.lastActivity,
        );
        result.imported.domainProfiles++;
      }
    });

    tx();
    return result;
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private getSession(id: string): BrainSession | null {
    const db = this.vault.getDb();
    const row = db.prepare('SELECT * FROM brain_sessions WHERE id = ?').get(id) as
      | {
          id: string;
          started_at: string;
          ended_at: string | null;
          domain: string | null;
          context: string | null;
          tools_used: string;
          files_modified: string;
          plan_id: string | null;
          plan_outcome: string | null;
          extracted_at: string | null;
        }
      | undefined;

    if (!row) return null;
    return this.rowToSession(row);
  }

  private rowToSession(row: {
    id: string;
    started_at: string;
    ended_at: string | null;
    domain: string | null;
    context: string | null;
    tools_used: string;
    files_modified: string;
    plan_id: string | null;
    plan_outcome: string | null;
    extracted_at: string | null;
  }): BrainSession {
    return {
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      domain: row.domain,
      context: row.context,
      toolsUsed: JSON.parse(row.tools_used) as string[],
      filesModified: JSON.parse(row.files_modified) as string[],
      planId: row.plan_id,
      planOutcome: row.plan_outcome,
      extractedAt: row.extracted_at,
    };
  }

  private rowToProposal(row: {
    id: string;
    session_id: string;
    rule: string;
    type: string;
    title: string;
    description: string;
    confidence: number;
    promoted: number;
    created_at: string;
  }): KnowledgeProposal {
    return {
      id: row.id,
      sessionId: row.session_id,
      rule: row.rule,
      type: row.type as 'pattern' | 'anti-pattern' | 'workflow',
      title: row.title,
      description: row.description,
      confidence: row.confidence,
      promoted: row.promoted === 1,
      createdAt: row.created_at,
    };
  }

  private createProposal(
    db: ReturnType<Vault['getDb']>,
    sessionId: string,
    rule: string,
    type: 'pattern' | 'anti-pattern' | 'workflow',
    data: { title: string; description: string; confidence: number },
  ): KnowledgeProposal {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO brain_proposals (id, session_id, rule, type, title, description, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, sessionId, rule, type, data.title, data.description, data.confidence);

    return {
      id,
      sessionId,
      rule,
      type,
      title: data.title,
      description: data.description,
      confidence: data.confidence,
      promoted: false,
      createdAt: new Date().toISOString(),
    };
  }

  private buildGlobalRegistry(strengths: PatternStrength[]): number {
    const db = this.vault.getDb();

    // Group strengths by pattern
    const patternMap = new Map<string, PatternStrength[]>();
    for (const s of strengths) {
      const list = patternMap.get(s.pattern) ?? [];
      list.push(s);
      patternMap.set(s.pattern, list);
    }

    db.prepare('DELETE FROM brain_global_registry').run();

    const insert = db.prepare(
      `INSERT INTO brain_global_registry
       (pattern, domains, total_strength, avg_strength, domain_count, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    );

    let count = 0;
    for (const [pattern, entries] of patternMap) {
      const domains = [...new Set(entries.map((e) => e.domain))];
      const totalStrength = entries.reduce((sum, e) => sum + e.strength, 0);
      const avgStrength = totalStrength / entries.length;

      insert.run(pattern, JSON.stringify(domains), totalStrength, avgStrength, domains.length);
      count++;
    }

    return count;
  }

  private buildDomainProfiles(strengths: PatternStrength[]): number {
    const db = this.vault.getDb();

    // Group strengths by domain
    const domainMap = new Map<string, PatternStrength[]>();
    for (const s of strengths) {
      const list = domainMap.get(s.domain) ?? [];
      list.push(s);
      domainMap.set(s.domain, list);
    }

    db.prepare('DELETE FROM brain_domain_profiles').run();

    const insert = db.prepare(
      `INSERT INTO brain_domain_profiles
       (domain, top_patterns, session_count, avg_session_duration, last_activity, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    );

    let count = 0;
    for (const [domain, entries] of domainMap) {
      entries.sort((a, b) => b.strength - a.strength);
      const topPatterns = entries.slice(0, 10).map((e) => ({
        pattern: e.pattern,
        strength: e.strength,
      }));

      // Count sessions for this domain
      const sessionCount = (
        db.prepare('SELECT COUNT(*) as c FROM brain_sessions WHERE domain = ?').get(domain) as {
          c: number;
        }
      ).c;

      // Average session duration (in minutes)
      const durationRow = db
        .prepare(
          `SELECT AVG(
            (julianday(ended_at) - julianday(started_at)) * 1440
          ) as avg_min
          FROM brain_sessions
          WHERE domain = ? AND ended_at IS NOT NULL`,
        )
        .get(domain) as { avg_min: number | null };

      const lastActivity = entries.reduce(
        (latest, e) => (e.lastUsed > latest ? e.lastUsed : latest),
        '',
      );

      insert.run(
        domain,
        JSON.stringify(topPatterns),
        sessionCount,
        durationRow.avg_min ?? 0,
        lastActivity || new Date().toISOString(),
      );
      count++;
    }

    return count;
  }
}
