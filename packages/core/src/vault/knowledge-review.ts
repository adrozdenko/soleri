/**
 * Knowledge Review — team review workflows for vault entries.
 *
 * Lifecycle: draft → pending_review → approved | rejected
 *
 * Improved over Salvador: uses PersistenceProvider abstraction,
 * decoupled from governance engine, and tracks review metadata.
 */

import type { PersistenceProvider } from '../persistence/types.js';

// =============================================================================
// TYPES
// =============================================================================

export type ReviewStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

export interface ReviewEntry {
  entryId: string;
  status: ReviewStatus;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewComment: string | null;
  submittedAt: number | null;
  reviewedAt: number | null;
}

export interface ReviewSubmission {
  entryId: string;
  submittedBy?: string;
}

export interface ReviewDecision {
  entryId: string;
  reviewedBy?: string;
  comment?: string;
}

// =============================================================================
// KNOWLEDGE REVIEW
// =============================================================================

export class KnowledgeReview {
  private provider: PersistenceProvider;

  constructor(provider: PersistenceProvider) {
    this.provider = provider;
    this.initialize();
  }

  private initialize(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS entry_reviews (
        entry_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'approved', 'rejected')),
        submitted_by TEXT,
        reviewed_by TEXT,
        review_comment TEXT,
        submitted_at INTEGER,
        reviewed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_status ON entry_reviews(status);
    `);
  }

  /**
   * Submit an entry for review. Transitions from draft → pending_review.
   */
  submit(submission: ReviewSubmission): ReviewEntry {
    const { entryId, submittedBy } = submission;
    const existing = this.get(entryId);

    if (existing && existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new Error(
        `Entry '${entryId}' cannot be submitted — current status: ${existing.status}`,
      );
    }

    const now = Math.floor(Date.now() / 1000);
    this.provider.run(
      `INSERT INTO entry_reviews (entry_id, status, submitted_by, submitted_at, reviewed_by, review_comment, reviewed_at)
       VALUES (@entryId, 'pending_review', @submittedBy, @now, NULL, NULL, NULL)
       ON CONFLICT(entry_id) DO UPDATE SET
         status = 'pending_review',
         submitted_by = @submittedBy,
         submitted_at = @now,
         reviewed_by = NULL,
         review_comment = NULL,
         reviewed_at = NULL`,
      { entryId, submittedBy: submittedBy ?? null, now },
    );
    return this.get(entryId)!;
  }

  /**
   * Approve a pending entry. Transitions from pending_review → approved.
   */
  approve(decision: ReviewDecision): ReviewEntry {
    return this.decide(decision, 'approved');
  }

  /**
   * Reject a pending entry. Transitions from pending_review → rejected.
   */
  reject(decision: ReviewDecision): ReviewEntry {
    return this.decide(decision, 'rejected');
  }

  /**
   * Get the review status for an entry.
   */
  get(entryId: string): ReviewEntry | null {
    const row = this.provider.get<{
      entry_id: string;
      status: string;
      submitted_by: string | null;
      reviewed_by: string | null;
      review_comment: string | null;
      submitted_at: number | null;
      reviewed_at: number | null;
    }>('SELECT * FROM entry_reviews WHERE entry_id = @entryId', { entryId });

    if (!row) return null;
    return rowToReview(row);
  }

  /**
   * List entries by review status.
   */
  listPending(limit = 50): ReviewEntry[] {
    return this.listByStatus('pending_review', limit);
  }

  listByStatus(status: ReviewStatus, limit = 50): ReviewEntry[] {
    const rows = this.provider.all<{
      entry_id: string;
      status: string;
      submitted_by: string | null;
      reviewed_by: string | null;
      review_comment: string | null;
      submitted_at: number | null;
      reviewed_at: number | null;
    }>(
      'SELECT * FROM entry_reviews WHERE status = @status ORDER BY submitted_at DESC LIMIT @limit',
      {
        status,
        limit,
      },
    );
    return rows.map(rowToReview);
  }

  /**
   * Get review statistics.
   */
  stats(): { total: number; byStatus: Record<string, number> } {
    const total =
      this.provider.get<{ c: number }>('SELECT COUNT(*) as c FROM entry_reviews')?.c ?? 0;
    const rows = this.provider.all<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM entry_reviews GROUP BY status',
    );
    return {
      total,
      byStatus: Object.fromEntries(rows.map((r) => [r.status, r.count])),
    };
  }

  /**
   * Remove review record (e.g., when entry is deleted).
   */
  remove(entryId: string): boolean {
    return (
      this.provider.run('DELETE FROM entry_reviews WHERE entry_id = @entryId', { entryId })
        .changes > 0
    );
  }

  // ─── Internal ───────────────────────────────────────────────

  private decide(decision: ReviewDecision, newStatus: 'approved' | 'rejected'): ReviewEntry {
    const existing = this.get(decision.entryId);
    if (!existing || existing.status !== 'pending_review') {
      throw new Error(
        `Entry '${decision.entryId}' is not pending review — current status: ${existing?.status ?? 'none'}`,
      );
    }

    const now = Math.floor(Date.now() / 1000);
    this.provider.run(
      `UPDATE entry_reviews SET status = @status, reviewed_by = @reviewedBy, review_comment = @comment, reviewed_at = @now WHERE entry_id = @entryId`,
      {
        status: newStatus,
        reviewedBy: decision.reviewedBy ?? null,
        comment: decision.comment ?? null,
        now,
        entryId: decision.entryId,
      },
    );
    return this.get(decision.entryId)!;
  }
}

function rowToReview(row: {
  entry_id: string;
  status: string;
  submitted_by: string | null;
  reviewed_by: string | null;
  review_comment: string | null;
  submitted_at: number | null;
  reviewed_at: number | null;
}): ReviewEntry {
  return {
    entryId: row.entry_id,
    status: row.status as ReviewStatus,
    submittedBy: row.submitted_by,
    reviewedBy: row.reviewed_by,
    reviewComment: row.review_comment,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  };
}
