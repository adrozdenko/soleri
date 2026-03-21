import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeReview, type ReviewEntry } from './knowledge-review.js';
import type { PersistenceProvider, RunResult } from '../persistence/types.js';

// ─── In-memory mock persistence ──────────────────────────────────────

class MockPersistence implements PersistenceProvider {
  readonly backend = 'sqlite' as const;
  private tables = new Map<string, Array<Record<string, unknown>>>();
  private schemas: string[] = [];

  execSql(sql: string): void {
    this.schemas.push(sql);
    // Auto-create table name from CREATE TABLE statement
    const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    if (match && !this.tables.has(match[1])) {
      this.tables.set(match[1], []);
    }
  }

  run(sql: string, params?: Record<string, unknown> | unknown[]): RunResult {
    const table = this.getTable();
    const normalizedParams = this.normalizeParams(sql, params);

    if (sql.includes('INSERT')) {
      return this.handleInsert(sql, normalizedParams, table);
    }
    if (sql.includes('UPDATE')) {
      return this.handleUpdate(sql, normalizedParams, table);
    }
    if (sql.includes('DELETE')) {
      return this.handleDelete(normalizedParams, table);
    }
    return { changes: 0, lastInsertRowid: 0 };
  }

  get<T>(sql: string, params?: Record<string, unknown> | unknown[]): T | undefined {
    const table = this.getTable();
    const normalizedParams = this.normalizeParams(sql, params);

    if (sql.includes('COUNT(*)')) {
      return { c: table.length } as T;
    }
    if (sql.includes('GROUP BY')) {
      return undefined;
    }

    const entryId = normalizedParams.entryId ?? normalizedParams.entry_id;
    if (entryId) {
      const row = table.find((r) => r.entry_id === entryId);
      return row as T | undefined;
    }
    return table[0] as T | undefined;
  }

  all<T>(sql: string, params?: Record<string, unknown> | unknown[]): T[] {
    const table = this.getTable();
    const normalizedParams = this.normalizeParams(sql, params);

    if (sql.includes('GROUP BY')) {
      const groups = new Map<string, number>();
      for (const row of table) {
        const status = row.status as string;
        groups.set(status, (groups.get(status) ?? 0) + 1);
      }
      return Array.from(groups.entries()).map(([status, count]) => ({
        status,
        count,
      })) as T[];
    }

    if (normalizedParams.status) {
      return table.filter((r) => r.status === normalizedParams.status) as T[];
    }
    return table as T[];
  }

  transaction<T>(fn: () => T): T {
    return fn();
  }

  ftsSearch<T>(): T[] {
    return [];
  }
  ftsRebuild(): void {}
  close(): void {}

  // ── Internal helpers ───────────────────────────────────────────────

  private getTable(): Array<Record<string, unknown>> {
    if (!this.tables.has('entry_reviews')) {
      this.tables.set('entry_reviews', []);
    }
    return this.tables.get('entry_reviews')!;
  }

  private normalizeParams(
    sql: string,
    params?: Record<string, unknown> | unknown[],
  ): Record<string, unknown> {
    if (!params) return {};
    if (Array.isArray(params)) return {};
    return params;
  }

  private handleInsert(
    sql: string,
    params: Record<string, unknown>,
    table: Array<Record<string, unknown>>,
  ): RunResult {
    const existing = table.findIndex((r) => r.entry_id === params.entryId);
    const row: Record<string, unknown> = {
      entry_id: params.entryId,
      status: 'pending_review',
      submitted_by: params.submittedBy ?? null,
      reviewed_by: null,
      review_comment: null,
      submitted_at: params.now ?? null,
      reviewed_at: null,
    };
    if (existing >= 0 && sql.includes('ON CONFLICT')) {
      table[existing] = row;
    } else {
      table.push(row);
    }
    return { changes: 1, lastInsertRowid: table.length };
  }

  private handleUpdate(
    _sql: string,
    params: Record<string, unknown>,
    table: Array<Record<string, unknown>>,
  ): RunResult {
    const idx = table.findIndex((r) => r.entry_id === params.entryId);
    if (idx < 0) return { changes: 0, lastInsertRowid: 0 };
    table[idx] = {
      ...table[idx],
      status: params.status,
      reviewed_by: params.reviewedBy ?? null,
      review_comment: params.comment ?? null,
      reviewed_at: params.now ?? null,
    };
    return { changes: 1, lastInsertRowid: 0 };
  }

  private handleDelete(
    params: Record<string, unknown>,
    table: Array<Record<string, unknown>>,
  ): RunResult {
    const idx = table.findIndex((r) => r.entry_id === params.entryId);
    if (idx < 0) return { changes: 0, lastInsertRowid: 0 };
    table.splice(idx, 1);
    return { changes: 1, lastInsertRowid: 0 };
  }
}

describe('KnowledgeReview', () => {
  let review: KnowledgeReview;

  beforeEach(() => {
    const provider = new MockPersistence();
    review = new KnowledgeReview(provider);
  });

  // ── submit ──────────────────────────────────────────────────────────

  it('submits a new entry for review', () => {
    const result = review.submit({ entryId: 'e1' });
    expect(result.entryId).toBe('e1');
    expect(result.status).toBe('pending_review');
  });

  it('submits with submittedBy field', () => {
    const result = review.submit({ entryId: 'e1', submittedBy: 'alice' });
    expect(result.submittedBy).toBe('alice');
  });

  it('allows resubmission of rejected entries', () => {
    review.submit({ entryId: 'e1' });
    review.reject({ entryId: 'e1' });
    const result = review.submit({ entryId: 'e1' });
    expect(result.status).toBe('pending_review');
  });

  it('throws when submitting an already-pending entry', () => {
    review.submit({ entryId: 'e1' });
    expect(() => review.submit({ entryId: 'e1' })).toThrow('cannot be submitted');
  });

  it('throws when submitting an approved entry', () => {
    review.submit({ entryId: 'e1' });
    review.approve({ entryId: 'e1' });
    expect(() => review.submit({ entryId: 'e1' })).toThrow('cannot be submitted');
  });

  // ── approve ─────────────────────────────────────────────────────────

  it('approves a pending entry', () => {
    review.submit({ entryId: 'e1' });
    const result = review.approve({ entryId: 'e1', reviewedBy: 'bob', comment: 'Looks good' });
    expect(result.status).toBe('approved');
    expect(result.reviewedBy).toBe('bob');
    expect(result.reviewComment).toBe('Looks good');
  });

  it('throws when approving non-pending entry', () => {
    expect(() => review.approve({ entryId: 'nonexistent' })).toThrow('not pending review');
  });

  // ── reject ──────────────────────────────────────────────────────────

  it('rejects a pending entry', () => {
    review.submit({ entryId: 'e1' });
    const result = review.reject({ entryId: 'e1', comment: 'Needs work' });
    expect(result.status).toBe('rejected');
    expect(result.reviewComment).toBe('Needs work');
  });

  it('throws when rejecting non-pending entry', () => {
    expect(() => review.reject({ entryId: 'missing' })).toThrow('not pending review');
  });

  // ── get ─────────────────────────────────────────────────────────────

  it('returns null for unknown entry', () => {
    expect(review.get('unknown')).toBeNull();
  });

  it('returns review entry for known entry', () => {
    review.submit({ entryId: 'e1' });
    const entry = review.get('e1');
    expect(entry).not.toBeNull();
    expect(entry!.entryId).toBe('e1');
  });

  // ── listPending ─────────────────────────────────────────────────────

  it('lists pending entries', () => {
    review.submit({ entryId: 'e1' });
    review.submit({ entryId: 'e2' });
    const pending = review.listPending();
    expect(pending).toHaveLength(2);
    expect(pending.every((e) => e.status === 'pending_review')).toBe(true);
  });

  // ── stats ───────────────────────────────────────────────────────────

  it('returns stats with totals and breakdown', () => {
    review.submit({ entryId: 'e1' });
    review.submit({ entryId: 'e2' });
    review.approve({ entryId: 'e1' });
    const s = review.stats();
    expect(s.total).toBe(2);
    expect(s.byStatus.approved).toBe(1);
    expect(s.byStatus.pending_review).toBe(1);
  });

  // ── remove ──────────────────────────────────────────────────────────

  it('removes a review entry', () => {
    review.submit({ entryId: 'e1' });
    expect(review.remove('e1')).toBe(true);
    expect(review.get('e1')).toBeNull();
  });

  it('returns false when removing nonexistent entry', () => {
    expect(review.remove('nonexistent')).toBe(false);
  });
});
