/**
 * Learning Radar — automatic pattern detection from agent sessions.
 *
 * Analyzes signals (corrections, search misses, explicit captures, workarounds)
 * and queues knowledge candidates by confidence level:
 *   >= 0.8  → auto-capture silently
 *   0.4-0.8 → queue for end-of-session review
 *   < 0.4   → log to metrics only
 *
 * Zero-friction: never interrupts the user. All analysis is pull-based.
 */

import type { Vault } from '../vault/vault.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type { Brain } from './brain.js';
import type { OperatorProfileStore } from '../operator/operator-profile.js';
import { extractFromRadar } from '../operator/operator-signals.js';

// ─── Types ───────────────────────────────────────────────────────────

export type SignalType =
  | 'correction'
  | 'search_miss'
  | 'explicit_capture'
  | 'pattern_success'
  | 'workaround'
  | 'repeated_question';

export type CandidateStatus = 'pending' | 'captured' | 'dismissed' | 'logged';

export interface RadarSignal {
  type: SignalType;
  title: string;
  description: string;
  /** Override suggested entry type. Default inferred from signal type. */
  suggestedType?: 'pattern' | 'anti-pattern';
  /** Override confidence. Default computed from signal type. */
  confidence?: number;
  /** Original query that triggered this signal (for search_miss, repeated_question). */
  sourceQuery?: string;
  /** Additional context (e.g., what the user said, what was corrected). */
  context?: string;
}

export interface RadarCandidate {
  id: number;
  signalType: SignalType;
  title: string;
  description: string;
  suggestedType: string;
  confidence: number;
  status: CandidateStatus;
  sourceQuery: string | null;
  context: string | null;
  createdAt: string;
}

export interface RadarStats {
  totalAnalyzed: number;
  autoCaptured: number;
  queued: number;
  dismissed: number;
  logged: number;
  knowledgeGaps: number;
}

export interface FlushResult {
  captured: number;
  capturedIds: number[];
  failed: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const HIGH_CONFIDENCE = 0.8;
const MEDIUM_CONFIDENCE = 0.4;

const DEFAULT_CONFIDENCE: Record<SignalType, number> = {
  explicit_capture: 0.95,
  correction: 0.75,
  workaround: 0.65,
  search_miss: 0.5,
  pattern_success: 0.4,
  repeated_question: 0.6,
};

const DEFAULT_TYPE: Record<SignalType, 'pattern' | 'anti-pattern'> = {
  explicit_capture: 'pattern',
  correction: 'anti-pattern',
  workaround: 'pattern',
  search_miss: 'pattern',
  pattern_success: 'pattern',
  repeated_question: 'pattern',
};

// ─── Class ───────────────────────────────────────────────────────────

export class LearningRadar {
  private provider: PersistenceProvider;
  private vault: Vault;
  private brain: Brain;
  private operatorProfile: OperatorProfileStore | null = null;

  constructor(vault: Vault, brain: Brain) {
    this.vault = vault;
    this.brain = brain;
    this.provider = vault.getProvider();
    this.initializeTable();
  }

  /** Wire operator profile for automatic signal extraction. */
  setOperatorProfile(profile: OperatorProfileStore): void {
    this.operatorProfile = profile;
  }

  private initializeTable(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS radar_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        suggested_type TEXT NOT NULL DEFAULT 'pattern',
        confidence REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        source_query TEXT,
        context TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_radar_status ON radar_candidates(status);
    `);
  }

  /**
   * Analyze a signal and classify it by confidence.
   * High confidence → auto-capture. Medium → queue. Low → log only.
   */
  analyze(signal: RadarSignal): RadarCandidate | null {
    const confidence = signal.confidence ?? DEFAULT_CONFIDENCE[signal.type] ?? 0.5;
    const suggestedType = signal.suggestedType ?? DEFAULT_TYPE[signal.type] ?? 'pattern';

    let status: CandidateStatus;
    if (confidence >= HIGH_CONFIDENCE) {
      status = 'captured';
    } else if (confidence >= MEDIUM_CONFIDENCE) {
      status = 'pending';
    } else {
      status = 'logged';
    }

    const result = this.provider.run(
      `INSERT INTO radar_candidates (signal_type, title, description, suggested_type, confidence, status, source_query, context)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        signal.type,
        signal.title,
        signal.description,
        suggestedType,
        confidence,
        status,
        signal.sourceQuery ?? null,
        signal.context ?? null,
      ],
    );

    const id = Number(result.lastInsertRowid);

    // Auto-capture high confidence signals immediately
    if (status === 'captured') {
      this.captureCandidate(id, signal.title, signal.description, suggestedType, signal.type);
    }

    // ─── Auto-signal extraction (never breaks radar) ───
    const candidate = this.getCandidate(id);
    try {
      if (this.operatorProfile && candidate) {
        const signals = extractFromRadar(candidate);
        if (signals.length > 0) {
          this.operatorProfile.accumulateSignals(signals);
        }
      }
    } catch {
      // Signal extraction must never break radar analysis
    }

    return candidate;
  }

  /**
   * Get all pending candidates (medium confidence, queued for review).
   */
  getCandidates(limit: number = 20): RadarCandidate[] {
    const rows = this.provider.all<CandidateRow>(
      'SELECT * FROM radar_candidates WHERE status = ? ORDER BY confidence DESC LIMIT ?',
      ['pending', limit],
    );
    return rows.map(rowToCandidate);
  }

  /**
   * Get a single candidate by ID.
   */
  getCandidate(id: number): RadarCandidate | null {
    const row = this.provider.get<CandidateRow>('SELECT * FROM radar_candidates WHERE id = ?', [
      id,
    ]);
    return row ? rowToCandidate(row) : null;
  }

  /**
   * Approve a pending candidate — capture it to vault.
   */
  approve(candidateId: number): { captured: boolean; entryId?: string } {
    const candidate = this.getCandidate(candidateId);
    if (!candidate || candidate.status !== 'pending') {
      return { captured: false };
    }

    const entryId = this.captureCandidate(
      candidateId,
      candidate.title,
      candidate.description,
      candidate.suggestedType,
      candidate.signalType,
    );

    return { captured: true, entryId };
  }

  /**
   * Dismiss one or more pending candidates — mark them as not worth capturing.
   */
  dismiss(candidateIds: number | number[]): { dismissed: number } {
    const ids = Array.isArray(candidateIds) ? candidateIds : [candidateIds];
    if (ids.length === 0) return { dismissed: 0 };
    const placeholders = ids.map(() => '?').join(',');
    const result = this.provider.run(
      `UPDATE radar_candidates SET status = 'dismissed' WHERE id IN (${placeholders}) AND status = 'pending'`,
      ids,
    );
    return { dismissed: result.changes };
  }

  /**
   * Flush: auto-capture all pending candidates above a confidence threshold.
   */
  flush(minConfidence: number = HIGH_CONFIDENCE): FlushResult {
    const rows = this.provider.all<CandidateRow>(
      'SELECT * FROM radar_candidates WHERE status = ? AND confidence >= ? ORDER BY confidence DESC',
      ['pending', minConfidence],
    );

    let captured = 0;
    let failed = 0;
    const capturedIds: number[] = [];

    for (const row of rows) {
      try {
        this.captureCandidate(
          row.id,
          row.title,
          row.description,
          row.suggested_type,
          row.signal_type,
        );
        captured++;
        capturedIds.push(row.id);
      } catch {
        failed++;
      }
    }

    return { captured, capturedIds, failed };
  }

  /**
   * Get radar statistics.
   */
  getStats(): RadarStats {
    const total = this.provider.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM radar_candidates',
    )!.count;

    const statusRows = this.provider.all<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM radar_candidates GROUP BY status',
    );
    const byStatus: Record<string, number> = {};
    for (const row of statusRows) byStatus[row.status] = row.count;

    const gaps = this.provider.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM radar_candidates WHERE signal_type = 'search_miss' OR signal_type = 'repeated_question'",
    )!.count;

    return {
      totalAnalyzed: total,
      autoCaptured: byStatus['captured'] ?? 0,
      queued: byStatus['pending'] ?? 0,
      dismissed: byStatus['dismissed'] ?? 0,
      logged: byStatus['logged'] ?? 0,
      knowledgeGaps: gaps,
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private captureCandidate(
    candidateId: number,
    title: string,
    description: string,
    suggestedType: string,
    signalType: string,
  ): string {
    const id = `radar-${signalType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entryType = suggestedType === 'anti-pattern' ? 'anti-pattern' : 'pattern';

    this.brain.enrichAndCapture({
      id,
      type: entryType,
      domain: 'general',
      title,
      description,
      severity: 'suggestion' as const,
      tags: ['radar-detected', signalType],
      origin: 'agent' as const,
    });

    this.provider.run("UPDATE radar_candidates SET status = 'captured' WHERE id = ?", [
      candidateId,
    ]);

    return id;
  }
}

// ─── Row Types ───────────────────────────────────────────────────────

interface CandidateRow {
  id: number;
  signal_type: string;
  title: string;
  description: string;
  suggested_type: string;
  confidence: number;
  status: string;
  source_query: string | null;
  context: string | null;
  created_at: string;
}

function rowToCandidate(row: CandidateRow): RadarCandidate {
  return {
    id: row.id,
    signalType: row.signal_type as SignalType,
    title: row.title,
    description: row.description,
    suggestedType: row.suggested_type,
    confidence: row.confidence,
    status: row.status as CandidateStatus,
    sourceQuery: row.source_query,
    context: row.context,
    createdAt: row.created_at,
  };
}
