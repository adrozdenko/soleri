import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobQueue } from './job-queue.js';
import type { PersistenceProvider } from '../persistence/types.js';

// ─── Mock Persistence (in-memory SQLite-like store) ──────────────────

function createMockProvider(): PersistenceProvider {
  const rows = new Map<string, Record<string, unknown>>();

  return {
    backend: 'sqlite' as const,
    execSql: vi.fn(),
    run: vi.fn((sql: string, params?: unknown[]) => {
      const p = (params ?? []) as unknown[];
      if (sql.includes('INSERT INTO job_queue')) {
        const row: Record<string, unknown> = {
          id: p[0],
          type: p[1],
          status: 'pending',
          entry_id: p[2],
          payload: p[3],
          depends_on: p[4],
          pipeline_id: p[5],
          retry_count: 0,
          max_retries: p[6],
          result: null,
          error: null,
          created_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
        };
        rows.set(row.id as string, row);
      }
      if (sql.includes('UPDATE') && sql.includes("status = 'running'")) {
        const id = p[0] as string;
        const row = rows.get(id);
        if (row) {
          row.status = 'running';
          row.started_at = new Date().toISOString();
        }
      }
      if (sql.includes('UPDATE') && sql.includes("status = 'completed'")) {
        const id = p[1] as string;
        const row = rows.get(id);
        if (row) {
          row.status = 'completed';
          row.result = p[0] as string;
          row.completed_at = new Date().toISOString();
        }
      }
      if (sql.includes('UPDATE') && sql.includes("status = 'failed'")) {
        const id = p[1] as string;
        const row = rows.get(id);
        if (row) {
          row.status = 'failed';
          row.error = p[0] as string;
          row.completed_at = new Date().toISOString();
        }
      }
      if (
        sql.includes('UPDATE') &&
        sql.includes("status = 'pending'") &&
        sql.includes('retry_count')
      ) {
        const id = p[0] as string;
        const row = rows.get(id);
        if (row) {
          row.status = 'pending';
          row.retry_count = (row.retry_count as number) + 1;
          row.error = null;
          row.started_at = null;
          row.completed_at = null;
        }
      }
      if (sql.includes('DELETE FROM job_queue')) {
        let deleted = 0;
        for (const [id, row] of rows) {
          if (row.status === 'completed' || row.status === 'failed') {
            rows.delete(id);
            deleted++;
          }
        }
        return { changes: deleted, lastInsertRowid: 0 };
      }
      return { changes: 1, lastInsertRowid: 0 };
    }),
    get: vi.fn((sql: string, params?: unknown[]) => {
      const p = (params ?? []) as unknown[];
      const id = p[0] as string;
      return rows.get(id);
    }),
    all: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('GROUP BY status')) {
        const counts: Record<string, number> = {};
        for (const row of rows.values()) {
          const s = row.status as string;
          counts[s] = (counts[s] ?? 0) + 1;
        }
        return Object.entries(counts).map(([status, count]) => ({ status, count }));
      }
      if (sql.includes('pipeline_id')) {
        const pid = (params as unknown[])[0];
        return [...rows.values()].filter((r) => r.pipeline_id === pid);
      }
      if (sql.includes("status = 'pending'")) {
        return [...rows.values()]
          .filter((r) => r.status === 'pending')
          .sort(
            (a, b) =>
              new Date(a.created_at as string).getTime() -
              new Date(b.created_at as string).getTime(),
          );
      }
      return [...rows.values()];
    }),
    transaction: vi.fn((fn) => fn()),
    ftsSearch: vi.fn(() => []),
    ftsRebuild: vi.fn(),
    close: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('JobQueue', () => {
  let provider: PersistenceProvider;
  let queue: JobQueue;

  beforeEach(() => {
    provider = createMockProvider();
    queue = new JobQueue(provider);
  });

  it('initializes the job_queue table on construction', () => {
    // Verify the correct DDL was executed — not just that something was called
    const ddl = (provider.execSql as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | string
      | undefined;
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS job_queue');
    expect(ddl).toContain('status');
    expect(ddl).toContain('retry_count');
  });

  describe('enqueue', () => {
    it('returns a 12-char job ID', () => {
      const id = queue.enqueue('test-type');
      expect(id).toHaveLength(12);
    });

    it('inserts a row with default options', () => {
      queue.enqueue('groom');
      expect(provider.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO job_queue'),
        expect.arrayContaining([expect.any(String), 'groom', null, '{}', '[]', null, 3]),
      );
    });

    it('passes custom options through', () => {
      queue.enqueue('enrich', {
        entryId: 'e-1',
        payload: { depth: 2 },
        dependsOn: ['dep-1'],
        pipelineId: 'pipe-1',
        maxRetries: 5,
      });
      expect(provider.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO job_queue'),
        expect.arrayContaining([
          expect.any(String),
          'enrich',
          'e-1',
          '{"depth":2}',
          '["dep-1"]',
          'pipe-1',
          5,
        ]),
      );
    });
  });

  describe('dequeue', () => {
    it('returns null when queue is empty', () => {
      (provider.all as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
      const job = queue.dequeue();
      expect(job).toBeNull();
    });

    it('returns a job with status running', () => {
      queue.enqueue('groom');
      const job = queue.dequeue();
      expect(job).not.toBeNull();
      expect(job!.status).toBe('running');
      expect(job!.type).toBe('groom');
    });

    it('skips jobs whose dependencies are not completed', () => {
      const depId = queue.enqueue('step-a');
      queue.enqueue('step-b', { dependsOn: [depId] });
      // step-a is pending, so step-b should not dequeue
      // dequeue should return step-a (no deps)
      const job = queue.dequeue();
      expect(job).not.toBeNull();
      expect(job!.type).toBe('step-a');
    });
  });

  describe('complete', () => {
    it('marks a job as completed with a result', () => {
      const id = queue.enqueue('groom');
      queue.dequeue();
      queue.complete(id, { score: 95 });
      const job = queue.get(id);
      expect(job).not.toBeNull();
      expect(job!.status).toBe('completed');
    });

    it('marks a job as completed without result', () => {
      const id = queue.enqueue('groom');
      queue.dequeue();
      queue.complete(id);
      expect(provider.run).toHaveBeenCalledWith(expect.stringContaining("status = 'completed'"), [
        null,
        id,
      ]);
    });
  });

  describe('fail', () => {
    it('marks a job as failed with error message', () => {
      const id = queue.enqueue('groom');
      queue.dequeue();
      queue.fail(id, 'timeout');
      const job = queue.get(id);
      expect(job).not.toBeNull();
      expect(job!.status).toBe('failed');
      expect(job!.error).toBe('timeout');
    });
  });

  describe('retry', () => {
    it('returns true and resets status to pending', () => {
      const id = queue.enqueue('groom', { maxRetries: 3 });
      queue.dequeue();
      queue.fail(id, 'err');
      const result = queue.retry(id);
      expect(result).toBe(true);
      const job = queue.get(id);
      expect(job!.status).toBe('pending');
      expect(job!.retryCount).toBe(1);
    });

    it('returns false when job not found', () => {
      (provider.get as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);
      expect(queue.retry('nonexistent')).toBe(false);
    });

    it('returns false when max retries exceeded', () => {
      const id = queue.enqueue('groom', { maxRetries: 1 });
      queue.dequeue();
      queue.fail(id, 'err');
      queue.retry(id); // retry_count → 1, max_retries = 1
      // Now retry_count == max_retries, should return false
      expect(queue.retry(id)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns zeroes for empty queue', () => {
      (provider.all as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
      const stats = queue.getStats();
      expect(stats).toEqual({
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        total: 0,
      });
    });

    it('aggregates counts by status', () => {
      queue.enqueue('a');
      queue.enqueue('b');
      const id = queue.enqueue('c');
      queue.dequeue();
      queue.complete(id);
      const stats = queue.getStats();
      expect(stats.total).toBe(stats.pending + stats.running + stats.completed + stats.failed);
      expect(stats.completed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getByPipeline', () => {
    it('returns jobs filtered by pipeline ID', () => {
      queue.enqueue('a', { pipelineId: 'pipe-1' });
      queue.enqueue('b', { pipelineId: 'pipe-1' });
      queue.enqueue('c', { pipelineId: 'pipe-2' });
      const jobs = queue.getByPipeline('pipe-1');
      expect(jobs.length).toBe(2);
      for (const j of jobs) {
        expect(j.pipelineId).toBe('pipe-1');
      }
    });
  });

  describe('get', () => {
    it('returns a job by ID', () => {
      const id = queue.enqueue('groom');
      const job = queue.get(id);
      expect(job).not.toBeNull();
      expect(job!.id).toBe(id);
      expect(job!.type).toBe('groom');
    });

    it('returns null for unknown ID', () => {
      (provider.get as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);
      expect(queue.get('missing')).toBeNull();
    });
  });

  describe('purge', () => {
    it('deletes completed/failed jobs and returns count', () => {
      const id1 = queue.enqueue('a');
      const id2 = queue.enqueue('b');
      queue.dequeue();
      queue.complete(id1);
      queue.fail(id2, 'err');
      const deleted = queue.purge(30);
      // The mock purges all completed/failed — 2 were just created
      expect(typeof deleted).toBe('number');
      expect(deleted).toBeGreaterThanOrEqual(2);
    });
  });
});
