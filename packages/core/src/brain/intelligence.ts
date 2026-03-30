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
import type { PersistenceProvider } from '../persistence/types.js';
import type { OperatorProfileStore } from '../operator/operator-profile.js';
import { extractFromBrainStrengths } from '../operator/operator-signals.js';
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

// ─── Constants ──────────────────────────────────────────────────────

const USAGE_MAX = 10;
const SPREAD_MAX = 5;
const RECENCY_DECAY_DAYS = 30;
const STRENGTH_HALFLIFE_DAYS = 90;
const STRENGTH_DECAY_FLOOR = 0.3;
const EXTRACTION_TOOL_THRESHOLD = 3;
const EXTRACTION_FILE_THRESHOLD = 3;
const EXTRACTION_HIGH_FEEDBACK_RATIO = 0.8;
const AUTO_PROMOTE_THRESHOLD = 0.8;
const AUTO_PROMOTE_PENDING_MIN = 0.4;
const AUTO_BUILD_INTELLIGENCE_EVERY_N_SESSIONS = 3;
const AUTO_BUILD_INTELLIGENCE_EVERY_N_FEEDBACK = 5;

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
    this.initializeTables();
  }

  /** Wire operator profile for automatic signal extraction. */
  setOperatorProfile(profile: OperatorProfileStore): void {
    this.operatorProfile = profile;
  }

  // ─── Table Initialization ─────────────────────────────────────────

  private initializeTables(): void {
    this.provider.execSql(`
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

      CREATE TABLE IF NOT EXISTS brain_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // ─── Session Lifecycle ────────────────────────────────────────────

  lifecycle(input: SessionLifecycleInput): BrainSession {
    if (input.action === 'start') {
      const id = input.sessionId ?? randomUUID();
      this.provider.run(
        `INSERT INTO brain_sessions (id, domain, context, tools_used, files_modified, plan_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.domain ?? null,
          input.context ?? null,
          JSON.stringify(input.toolsUsed ?? []),
          JSON.stringify(input.filesModified ?? []),
          input.planId ?? null,
        ],
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
    if (input.context) {
      updates.push("context = COALESCE(context, '') || ?");
      values.push(' | ' + input.context);
    }

    values.push(sessionId);
    this.provider.run(`UPDATE brain_sessions SET ${updates.join(', ')} WHERE id = ?`, values);

    // Auto-extract knowledge if session has enough signal
    this.autoExtractIfReady(this.getSession(sessionId)!);

    // Return fresh session (extractedAt may have been set by auto-extract)
    return this.getSession(sessionId)!;
  }

  /**
   * Attempt auto-extraction after session end if the session has enough signal.
   * Gate: at least 1 tool used OR 1 file modified OR a plan was associated.
   * Silently skips if already extracted or insufficient data.
   *
   * After extraction, auto-promotes high-confidence proposals (>= 0.8) via
   * enrichAndCapture() (which has built-in dedup). Proposals between 0.4-0.8
   * are queued as pending. Below 0.4 are logged only.
   *
   * Also tracks completed sessions and auto-builds intelligence every N sessions.
   */
  private autoExtractIfReady(session: BrainSession): void {
    if (!session.endedAt) return;
    if (session.extractedAt) return;

    const hasSignal =
      session.toolsUsed.length > 0 || session.filesModified.length > 0 || session.planId !== null;

    if (!hasSignal) return;

    try {
      const result = this.extractKnowledge(session.id);
      this.autoPromoteProposals(result.proposals);
    } catch {
      // Non-critical — don't break session end
    }

    // Auto-build intelligence after N completed plan sessions
    if (session.planOutcome === 'completed') {
      this.maybeAutoBuildIntelligence();
    }
  }

  /**
   * Auto-promote high-confidence proposals via enrichAndCapture().
   * Dedup in enrichAndCapture() handles novelty gating:
   * - TF-IDF similarity >= 0.8 → blocked (near-duplicate)
   * - Content-hash match → blocked (exact duplicate)
   */
  private autoPromoteProposals(proposals: KnowledgeProposal[]): void {
    for (const p of proposals) {
      if (p.confidence >= AUTO_PROMOTE_THRESHOLD) {
        // High confidence — auto-promote through dedup pipeline
        try {
          const vaultType: 'pattern' | 'anti-pattern' | 'rule' =
            p.type === 'anti-pattern' ? 'anti-pattern' : 'pattern';
          const result = this.brain.enrichAndCapture({
            id: `proposal-${p.id}`,
            type: vaultType,
            domain: 'brain-intelligence',
            title: p.title,
            severity: 'suggestion',
            description: p.description,
            tags: ['auto-extracted', 'auto-promoted', p.rule],
          });
          if (result.captured) {
            this.provider.run('UPDATE brain_proposals SET promoted = 1 WHERE id = ?', [p.id]);
          }
          // If blocked by dedup, leave as unpromoted — that's correct behavior
        } catch {
          // Non-critical — proposal stays as pending
        }
      } else if (p.confidence < AUTO_PROMOTE_PENDING_MIN) {
        // Low confidence — mark as not surfaceable (promoted = false is already default)
        // Just log, don't surface in briefings
      }
      // Medium confidence (0.4-0.8) — stays as pending, surfaced in briefing
    }
  }

  /**
   * Track completed sessions and auto-trigger buildIntelligence() every N sessions.
   */
  private maybeAutoBuildIntelligence(): void {
    try {
      const row = this.provider.get<{ value: string }>(
        "SELECT value FROM brain_metadata WHERE key = 'sessions_since_last_build'",
      );
      const current = row ? parseInt(row.value, 10) : 0;
      const next = current + 1;

      if (next >= AUTO_BUILD_INTELLIGENCE_EVERY_N_SESSIONS) {
        this.buildIntelligence();
        this.provider.run(
          `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
           VALUES ('sessions_since_last_build', '0', datetime('now'))`,
        );
        // Reset feedback counter too — avoid double-trigger
        this.provider.run(
          `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
           VALUES ('feedback_since_last_build', '0', datetime('now'))`,
        );
      } else {
        this.provider.run(
          `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
           VALUES ('sessions_since_last_build', ?, datetime('now'))`,
          [String(next)],
        );
      }
    } catch {
      // Non-critical — don't break session end
    }
  }

  /**
   * Auto-rebuild intelligence after N feedback entries accumulate.
   * Called from facade after record_feedback / brain_feedback ops.
   */
  maybeAutoBuildOnFeedback(): void {
    try {
      const row = this.provider.get<{ value: string }>(
        "SELECT value FROM brain_metadata WHERE key = 'feedback_since_last_build'",
      );
      const current = row ? parseInt(row.value, 10) : 0;
      const next = current + 1;

      if (next >= AUTO_BUILD_INTELLIGENCE_EVERY_N_FEEDBACK) {
        this.buildIntelligence();
        this.provider.run(
          `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
           VALUES ('feedback_since_last_build', '0', datetime('now'))`,
        );
        // Reset session counter too — avoid double-trigger
        this.provider.run(
          `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
           VALUES ('sessions_since_last_build', '0', datetime('now'))`,
        );
      } else {
        this.provider.run(
          `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
           VALUES ('feedback_since_last_build', ?, datetime('now'))`,
          [String(next)],
        );
      }
    } catch {
      // Non-critical — don't block feedback recording
    }
  }

  getSessionContext(limit = 10): SessionContext {
    const rows = this.provider.all<{
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
    }>('SELECT * FROM brain_sessions ORDER BY started_at DESC LIMIT ?', [limit]);

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
    const result = this.provider.run(
      `DELETE FROM brain_sessions
       WHERE ended_at IS NOT NULL
       AND started_at < datetime('now', '-' || ? || ' days')`,
      [olderThanDays],
    );
    return { archived: result.changes };
  }

  // ─── Session Query & Quality ─────────────────────────────────────

  getSessionById(id: string): BrainSession | null {
    return this.getSession(id);
  }

  getSessionByPlanId(planId: string): BrainSession | null {
    const row = this.provider.get<{
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
    }>('SELECT * FROM brain_sessions WHERE plan_id = ? ORDER BY started_at DESC LIMIT 1', [planId]);

    if (!row) return null;
    return this.rowToSession(row);
  }

  listSessions(query?: SessionListQuery): BrainSession[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (query?.domain) {
      conditions.push('domain = ?');
      values.push(query.domain);
    }
    if (query?.active === true) {
      conditions.push('ended_at IS NULL');
    } else if (query?.active === false) {
      conditions.push('ended_at IS NOT NULL');
    }
    if (query?.extracted === true) {
      conditions.push('extracted_at IS NOT NULL');
    } else if (query?.extracted === false) {
      conditions.push('extracted_at IS NULL');
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;
    values.push(limit, offset);

    const rows = this.provider.all<{
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
    }>(`SELECT * FROM brain_sessions ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`, values);

    return rows.map((r) => this.rowToSession(r));
  }

  computeSessionQuality(sessionId: string): SessionQuality {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);

    // Completeness (0-25): session ended + has context + has domain
    let completeness = 0;
    if (session.endedAt) completeness += 10;
    if (session.context) completeness += 8;
    if (session.domain) completeness += 7;

    // Artifact density (0-25): files modified
    const fileCount = session.filesModified.length;
    const artifactDensity = Math.min(25, fileCount * 5);

    // Tool engagement (0-25): unique tools used
    const uniqueTools = new Set(session.toolsUsed).size;
    const toolEngagement = Math.min(25, uniqueTools * 5);

    // Outcome clarity (0-25): plan outcome + extraction status
    let outcomeClarity = 0;
    if (session.planId) outcomeClarity += 8;
    if (session.planOutcome === 'completed') outcomeClarity += 10;
    else if (session.planOutcome === 'abandoned') outcomeClarity += 5;
    else if (session.planOutcome) outcomeClarity += 7;
    if (session.extractedAt) outcomeClarity += 7;

    const overall = completeness + artifactDensity + toolEngagement + outcomeClarity;

    return {
      sessionId,
      overall,
      completeness,
      artifactDensity,
      toolEngagement,
      outcomeClarity,
    };
  }

  replaySession(sessionId: string): SessionReplay {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);

    const quality = this.computeSessionQuality(sessionId);
    const proposals = this.getProposals({ sessionId });

    let durationMinutes: number | null = null;
    if (session.startedAt && session.endedAt) {
      const ms = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
      durationMinutes = Math.round(ms / 60000);
    }

    return { session, quality, proposals, durationMinutes };
  }

  // ─── Strength Scoring ─────────────────────────────────────────────

  computeStrengths(): PatternStrength[] {
    // Gather feedback data grouped by entry_id, JOIN with entries to avoid N+1 vault.get() calls
    const feedbackRows = this.provider.all<{
      entry_id: string;
      total: number;
      accepted: number;
      dismissed: number;
      modified: number;
      failed: number;
      last_used: string;
      entry_title: string | null;
      entry_domain: string | null;
    }>(
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

    // Count unique session domains as spread proxy
    const sessionRows = this.provider.all<{ domain: string }>(
      'SELECT DISTINCT domain FROM brain_sessions WHERE domain IS NOT NULL',
    );
    const uniqueDomains = new Set(sessionRows.map((r) => r.domain));

    const now = Date.now();
    const strengths: PatternStrength[] = [];

    for (const row of feedbackRows) {
      // Use JOINed entry data — no per-row vault.get() needed
      const domain = row.entry_domain ?? 'unknown';
      const pattern = row.entry_title ?? row.entry_id;

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
      // last_used is MAX(created_at) which is unixepoch() (seconds) — convert to ms
      const lastUsedRaw = Number(row.last_used);
      const lastUsedMs = lastUsedRaw < 1e12 ? lastUsedRaw * 1000 : lastUsedRaw;
      const daysSince = (now - lastUsedMs) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 25 * (1 - daysSince / RECENCY_DECAY_DAYS));

      const rawStrength = usageScore + spreadScore + successScore + recencyScore;

      // Temporal decay multiplier: exponential halflife with floor
      // Patterns fade over time but never vanish completely
      const temporalMultiplier = Math.max(
        STRENGTH_DECAY_FLOOR,
        Math.exp((-Math.LN2 * daysSince) / STRENGTH_HALFLIFE_DAYS),
      );
      const strength = rawStrength * temporalMultiplier;

      const ps: PatternStrength = {
        pattern,
        domain,
        strength,
        usageScore,
        spreadScore,
        successScore,
        recencyScore,
        temporalMultiplier,
        usageCount: row.total,
        uniqueContexts,
        successRate,
        lastUsed: row.last_used,
      };

      strengths.push(ps);
    }

    // Persist all strengths in a single transaction to avoid N fsync calls
    this.provider.transaction(() => {
      for (const ps of strengths) {
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
    });

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

    const rows = this.provider.all<{
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
    }>(`SELECT * FROM brain_strengths ${where} ORDER BY strength DESC LIMIT ?`, values);

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

    // Try domain-filtered first, fall back to all domains if too few results
    let strengths = this.getStrengths({
      domain: context.domain,
      minStrength: 20, // lowered from 30 — small corpus needs lower threshold
      limit: limit * 3,
    });

    // If domain-filtered returns too few, try without domain filter
    // This handles cases where domain was stored as 'unknown' due to
    // vault.get() returning null during computeStrengths
    if (strengths.length < limit && context.domain) {
      const allStrengths = this.getStrengths({
        minStrength: 20,
        limit: limit * 5,
      });
      // Include domain-matching AND entries where domain lookup failed
      const additional = allStrengths.filter(
        (s) =>
          !strengths.some((existing) => existing.pattern === s.pattern) &&
          (s.domain === context.domain || s.domain === 'unknown'),
      );
      strengths = [...strengths, ...additional];
    }

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
          [s.pattern, context.source],
        ) as {
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

    // Rule 1: Repeated tool usage (3+ same tool)
    const toolCounts = new Map<string, number>();
    for (const t of session.toolsUsed) {
      toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
    }
    for (const [tool, count] of toolCounts) {
      if (count >= EXTRACTION_TOOL_THRESHOLD) {
        rulesApplied.push('repeated_tool_usage');
        const ctx = session.context ?? '';
        const objective = this.extractObjective(ctx);
        const toolTitle = objective
          ? `Tool pattern: ${tool} (${count}x) during ${objective.slice(0, 60)}`
          : `Frequent use of ${tool} (${count}x)`;
        const toolDescription = objective
          ? `Tool ${tool} used ${count} times while working on: ${objective}. This tool-task pairing may indicate a reusable workflow.`
          : `Tool ${tool} was used ${count} times in session. Consider automating or abstracting this workflow.`;
        proposals.push(
          this.createProposal(sessionId, 'repeated_tool_usage', 'pattern', {
            title: toolTitle,
            description: toolDescription,
            confidence: Math.min(0.9, 0.5 + count * 0.1),
          }),
        );
      }
    }

    // Rule 2: Multi-file edits (3+ files sharing a common parent directory)
    if (session.filesModified.length >= EXTRACTION_FILE_THRESHOLD) {
      // Group files by parent directory to filter noise
      const dirGroups = new Map<string, string[]>();
      for (const f of session.filesModified) {
        const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.';
        const list = dirGroups.get(dir) ?? [];
        list.push(f);
        dirGroups.set(dir, list);
      }
      // Only fire if at least 3 files share a common parent directory
      const significantDirs = [...dirGroups.entries()].filter(
        ([, files]) => files.length >= EXTRACTION_FILE_THRESHOLD,
      );
      if (significantDirs.length > 0) {
        const [topDir, topFiles] = significantDirs.sort((a, b) => b[1].length - a[1].length)[0];
        rulesApplied.push('multi_file_edit');
        const ctx = session.context ?? '';
        const objective = this.extractObjective(ctx);
        const isRefactor = /refactor|rename|move|extract|consolidat/i.test(ctx);
        const isFeature = /feat|add|implement|create|new/i.test(ctx);
        const inferredPattern = isRefactor
          ? 'Refactoring'
          : isFeature
            ? 'Feature'
            : 'Cross-cutting change';
        const mfeTitle = objective
          ? `${inferredPattern}: ${objective.slice(0, 70)}`
          : `${inferredPattern} in ${topDir} (${topFiles.length} files)`;
        const mfeDescription = objective
          ? `${inferredPattern} across ${topFiles.length} files in ${topDir}: ${objective}`
          : `Session modified ${topFiles.length} files in ${topDir}: ${topFiles.slice(0, 5).join(', ')}${topFiles.length > 5 ? '...' : ''}.`;
        proposals.push(
          this.createProposal(sessionId, 'multi_file_edit', 'pattern', {
            title: mfeTitle,
            description: mfeDescription,
            confidence: Math.min(0.8, 0.4 + topFiles.length * 0.05),
          }),
        );
      }
    }

    // Rule 3: Plan completed — parse session.context for actionable title + dynamic confidence
    if (session.planId && session.planOutcome === 'completed') {
      rulesApplied.push('plan_completed');
      const ctx = session.context ?? '';
      const objective = this.extractObjective(ctx);
      const hasScope = /scope|included|excluded/i.test(ctx);
      const hasCriteria = /criteria|acceptance|verification/i.test(ctx);
      const confidence =
        ctx.length > 0
          ? hasScope && hasCriteria
            ? 0.85
            : hasScope || hasCriteria
              ? 0.8
              : 0.75
          : 0.5;
      const title = objective
        ? `Workflow: ${objective.slice(0, 80)}`
        : `Successful plan: ${session.planId}`;
      const description = objective
        ? `Completed: ${objective}${hasScope ? '. Scope and constraints documented in session context.' : ''}`
        : `Plan ${session.planId} completed successfully. This workflow can be reused for similar tasks.`;
      proposals.push(
        this.createProposal(sessionId, 'plan_completed', 'workflow', {
          title,
          description,
          confidence,
        }),
      );
    }

    // Rule 4: Plan abandoned — parse context for failure reason
    if (session.planId && session.planOutcome === 'abandoned') {
      rulesApplied.push('plan_abandoned');
      const ctx = session.context ?? '';
      const objective = this.extractObjective(ctx);
      const hasFailureReason = /blocked|failed|wrong|mistake|abandoned|reverted|conflict/i.test(
        ctx,
      );
      const confidence = ctx.length > 0 ? (hasFailureReason ? 0.85 : 0.75) : 0.5;
      const title = objective
        ? `Anti-pattern: ${objective.slice(0, 80)}`
        : `Abandoned plan: ${session.planId}`;
      const description = objective
        ? `Abandoned: ${objective}${hasFailureReason ? '. Failure indicators found in session context — review for root cause.' : '. Review what went wrong to avoid repeating.'}`
        : `Plan ${session.planId} was abandoned. Review what went wrong to avoid repeating in future sessions.`;
      proposals.push(
        this.createProposal(sessionId, 'plan_abandoned', 'anti-pattern', {
          title,
          description,
          confidence,
        }),
      );
    }

    // Rule 5: Drift detected — fires when plan completed but context contains drift indicators
    if (session.planId && session.planOutcome === 'completed' && session.context) {
      const driftPattern =
        /drift|skipped|added.*unplanned|changed scope|out of scope|deviat|unplanned/i;
      if (driftPattern.test(session.context)) {
        rulesApplied.push('drift_detected');
        const objective = this.extractObjective(session.context);
        const driftMatch =
          session.context.match(/drift[:\s]+(.{1,120})/i) ??
          session.context.match(/skipped[:\s]+(.{1,120})/i) ??
          session.context.match(/unplanned[:\s]+(.{1,120})/i);
        const driftDetail = driftMatch ? driftMatch[1].trim() : 'scope changed during execution';
        proposals.push(
          this.createProposal(sessionId, 'drift_detected', 'anti-pattern', {
            title: `Plan drift: ${objective ? objective.slice(0, 60) : session.planId} — ${driftDetail.slice(0, 40)}`,
            description: `Plan ${objective ?? session.planId} completed with drift: ${driftDetail}. Review scope controls for future planning.`,
            confidence: 0.8,
          }),
        );
      }
    }

    // Rule 6: High feedback ratio (>80% accept or dismiss)
    const feedbackRow = this.provider.get<{
      total: number;
      accepted: number;
      dismissed: number;
    }>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN action = 'accepted' THEN 1 ELSE 0 END) as accepted,
              SUM(CASE WHEN action = 'dismissed' THEN 1 ELSE 0 END) as dismissed
       FROM brain_feedback
       WHERE created_at >= ? AND created_at <= ?`,
      [session.startedAt, session.endedAt ?? new Date().toISOString()],
    ) as {
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
          this.createProposal(sessionId, 'high_accept_ratio', 'pattern', {
            title: `High search acceptance rate (${Math.round(acceptRate * 100)}%)`,
            description: `Search results were accepted ${Math.round(acceptRate * 100)}% of the time. Brain scoring is well-calibrated for this type of work.`,
            confidence: 0.7,
          }),
        );
      } else if (dismissRate >= EXTRACTION_HIGH_FEEDBACK_RATIO) {
        rulesApplied.push('high_dismiss_ratio');
        proposals.push(
          this.createProposal(sessionId, 'high_dismiss_ratio', 'anti-pattern', {
            title: `High search dismissal rate (${Math.round(dismissRate * 100)}%)`,
            description: `Search results were dismissed ${Math.round(dismissRate * 100)}% of the time. Brain scoring may need recalibration for this domain.`,
            confidence: 0.7,
          }),
        );
      }
    }

    // Mark session as extracted
    this.provider.run("UPDATE brain_sessions SET extracted_at = datetime('now') WHERE id = ?", [
      sessionId,
    ]);

    return {
      sessionId,
      proposals,
      rulesApplied: [...new Set(rulesApplied)],
    };
  }

  resetExtracted(options?: { sessionId?: string; since?: string; all?: boolean }): {
    reset: number;
  } {
    if (options?.sessionId) {
      const info = this.provider.run(
        'UPDATE brain_sessions SET extracted_at = NULL WHERE id = ? AND extracted_at IS NOT NULL',
        [options.sessionId],
      );
      return { reset: info.changes };
    }

    if (options?.since) {
      const info = this.provider.run(
        'UPDATE brain_sessions SET extracted_at = NULL WHERE extracted_at >= ?',
        [options.since],
      );
      return { reset: info.changes };
    }

    if (options?.all) {
      const info = this.provider.run(
        'UPDATE brain_sessions SET extracted_at = NULL WHERE extracted_at IS NOT NULL',
      );
      return { reset: info.changes };
    }

    return { reset: 0 };
  }

  getProposals(options?: {
    sessionId?: string;
    promoted?: boolean;
    limit?: number;
  }): KnowledgeProposal[] {
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

    const rows = this.provider.all<{
      id: string;
      session_id: string;
      rule: string;
      type: string;
      title: string;
      description: string;
      confidence: number;
      promoted: number;
      created_at: string;
    }>(`SELECT * FROM brain_proposals ${where} ORDER BY created_at DESC LIMIT ?`, values);

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
    let promoted = 0;
    const failed: string[] = [];
    const gated: Array<{ id: string; action: string; reason?: string }> = [];
    const pp = projectPath ?? '.';

    for (const id of proposalIds) {
      const row = this.provider.get<{
        id: string;
        session_id: string;
        rule: string;
        type: string;
        title: string;
        description: string;
        confidence: number;
        promoted: number;
        created_at: string;
      }>('SELECT * FROM brain_proposals WHERE id = ?', [id]);

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

      this.provider.run('UPDATE brain_proposals SET promoted = 1 WHERE id = ?', [id]);
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

    return {
      strengthsComputed: strengths.length,
      globalPatterns,
      domainProfiles,
    };
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

  // ─── Data Management ──────────────────────────────────────────────

  getStats(): BrainIntelligenceStats {
    const strengths = this.provider.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM brain_strengths',
    )!.c;
    const sessions = this.provider.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM brain_sessions',
    )!.c;
    const activeSessions = this.provider.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM brain_sessions WHERE ended_at IS NULL',
    )!.c;
    const proposals = this.provider.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM brain_proposals',
    )!.c;
    const promotedProposals = this.provider.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM brain_proposals WHERE promoted = 1',
    )!.c;
    const globalPatterns = this.provider.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM brain_global_registry',
    )!.c;
    const domainProfiles = this.provider.get<{ c: number }>(
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

  exportData(): BrainExportData {
    const strengths = this.getStrengths({ limit: 10000 });

    const sessionRows = this.provider.all<{
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
    }>('SELECT * FROM brain_sessions ORDER BY started_at DESC');
    const sessions = sessionRows.map((r) => this.rowToSession(r));

    const proposals = this.getProposals({ limit: 10000 });
    const globalPatterns = this.getGlobalPatterns(10000);

    const profileRows = this.provider.all<{
      domain: string;
      top_patterns: string;
      session_count: number;
      avg_session_duration: number;
      last_activity: string;
    }>('SELECT * FROM brain_domain_profiles');
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
    const result: BrainImportResult = {
      imported: { strengths: 0, sessions: 0, proposals: 0, globalPatterns: 0, domainProfiles: 0 },
    };

    this.provider.transaction(() => {
      // Import strengths
      for (const s of data.strengths) {
        this.provider.run(
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
        const changes = this.provider.run(
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
        const changes = this.provider.run(
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
        this.provider.run(
          `INSERT OR REPLACE INTO brain_global_registry
           (pattern, domains, total_strength, avg_strength, domain_count, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          [g.pattern, JSON.stringify(g.domains), g.totalStrength, g.avgStrength, g.domainCount],
        );
        result.imported.globalPatterns++;
      }

      // Import domain profiles
      for (const d of data.domainProfiles) {
        this.provider.run(
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

  // ─── Private Helpers ──────────────────────────────────────────────

  private getSession(id: string): BrainSession | null {
    const row = this.provider.get<{
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
    }>('SELECT * FROM brain_sessions WHERE id = ?', [id]);

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

  /**
   * Extract the objective from session context — first meaningful sentence or line.
   * Returns empty string if context is empty or unparseable.
   */
  private extractObjective(context: string): string {
    if (!context || context.trim().length === 0) return '';
    // Try to find an "Objective:" line
    const objMatch = context.match(/objective[:\s]+(.+)/i);
    if (objMatch) return objMatch[1].trim().replace(/\s+/g, ' ');
    // Fall back to first non-empty line
    const firstLine = context
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    return firstLine ? firstLine.replace(/\s+/g, ' ') : '';
  }

  private createProposal(
    sessionId: string,
    rule: string,
    type: 'pattern' | 'anti-pattern' | 'workflow',
    data: { title: string; description: string; confidence: number },
  ): KnowledgeProposal {
    // Dedup guard: skip if a proposal with the same rule + sessionId already exists
    const existing = this.provider.get<{
      id: string;
      session_id: string;
      rule: string;
      type: string;
      title: string;
      description: string;
      confidence: number;
      promoted: number;
      created_at: string;
    }>('SELECT * FROM brain_proposals WHERE session_id = ? AND rule = ? LIMIT 1', [
      sessionId,
      rule,
    ]);
    if (existing) {
      return {
        id: existing.id,
        sessionId: existing.session_id,
        rule: existing.rule,
        type: existing.type as 'pattern' | 'anti-pattern' | 'workflow',
        title: existing.title,
        description: existing.description,
        confidence: existing.confidence,
        promoted: existing.promoted === 1,
        createdAt: existing.created_at,
      };
    }

    const id = randomUUID();
    this.provider.run(
      `INSERT INTO brain_proposals (id, session_id, rule, type, title, description, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, sessionId, rule, type, data.title, data.description, data.confidence],
    );

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
    // Group strengths by pattern
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

  private buildDomainProfiles(strengths: PatternStrength[]): number {
    // Group strengths by domain
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

      // Count sessions for this domain
      const sessionCount = this.provider.get<{ c: number }>(
        'SELECT COUNT(*) as c FROM brain_sessions WHERE domain = ?',
        [domain],
      )!.c;

      // Average session duration (in minutes)
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
}
