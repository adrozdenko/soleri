import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReviewOps } from './review-ops.js';
import type { AgentRuntime } from './types.js';

// ---------------------------------------------------------------------------
// Mock runtime
// ---------------------------------------------------------------------------

function mockRuntime(): AgentRuntime {
  return {
    config: { agentId: 'test-agent' },
    knowledgeReview: {
      submit: vi.fn().mockReturnValue({ entryId: 'e1', status: 'pending_review' }),
      approve: vi.fn().mockReturnValue({ entryId: 'e1', status: 'approved' }),
      reject: vi.fn().mockReturnValue({ entryId: 'e1', status: 'rejected' }),
      listPending: vi.fn().mockReturnValue([]),
      stats: vi.fn().mockReturnValue({ pending: 0, approved: 5, rejected: 1 }),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: ReturnType<typeof createReviewOps>, name: string) {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createReviewOps', () => {
  let rt: AgentRuntime;
  let ops: ReturnType<typeof createReviewOps>;

  beforeEach(() => {
    vi.clearAllMocks();
    rt = mockRuntime();
    ops = createReviewOps(rt);
  });

  it('returns 5 ops', () => {
    expect(ops.length).toBe(5);
  });

  it('has the expected op names', () => {
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'vault_submit_review',
      'vault_approve',
      'vault_reject',
      'vault_pending_reviews',
      'vault_review_stats',
    ]);
  });

  // ─── vault_submit_review ──────────────────────────────────────

  describe('vault_submit_review', () => {
    it('submits entry for review', async () => {
      const op = findOp(ops, 'vault_submit_review');
      const result = (await op.handler({ entryId: 'e1' })) as Record<string, unknown>;
      expect(result.status).toBe('pending_review');
    });

    it('returns error on failure', async () => {
      const op = findOp(ops, 'vault_submit_review');
      vi.mocked(rt.knowledgeReview.submit).mockImplementation(() => {
        throw new Error('Not found');
      });
      const result = (await op.handler({ entryId: 'missing' })) as Record<string, unknown>;
      expect(result.error).toContain('Not found');
    });
  });

  // ─── vault_approve ────────────────────────────────────────────

  describe('vault_approve', () => {
    it('approves a pending entry', async () => {
      const op = findOp(ops, 'vault_approve');
      const result = (await op.handler({ entryId: 'e1' })) as Record<string, unknown>;
      expect(result.status).toBe('approved');
    });

    it('returns error on failure', async () => {
      const op = findOp(ops, 'vault_approve');
      vi.mocked(rt.knowledgeReview.approve).mockImplementation(() => {
        throw new Error('Already reviewed');
      });
      const result = (await op.handler({ entryId: 'e1' })) as Record<string, unknown>;
      expect(result.error).toContain('Already reviewed');
    });
  });

  // ─── vault_reject ─────────────────────────────────────────────

  describe('vault_reject', () => {
    it('rejects a pending entry with comment', async () => {
      const op = findOp(ops, 'vault_reject');
      const result = (await op.handler({
        entryId: 'e1',
        comment: 'Needs more detail',
      })) as Record<string, unknown>;
      expect(result.status).toBe('rejected');
    });

    it('returns error on failure', async () => {
      const op = findOp(ops, 'vault_reject');
      vi.mocked(rt.knowledgeReview.reject).mockImplementation(() => {
        throw new Error('Not pending');
      });
      const result = (await op.handler({ entryId: 'e1' })) as Record<string, unknown>;
      expect(result.error).toContain('Not pending');
    });
  });

  // ─── vault_pending_reviews ────────────────────────────────────

  describe('vault_pending_reviews', () => {
    it('lists pending reviews', async () => {
      const op = findOp(ops, 'vault_pending_reviews');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.count).toBe(0);
    });

    it('passes limit parameter', async () => {
      const op = findOp(ops, 'vault_pending_reviews');
      await op.handler({ limit: 10 });
      expect(rt.knowledgeReview.listPending).toHaveBeenCalledWith(10);
    });
  });

  // ─── vault_review_stats ───────────────────────────────────────

  describe('vault_review_stats', () => {
    it('returns review statistics', async () => {
      const op = findOp(ops, 'vault_review_stats');
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.approved).toBe(5);
    });
  });
});
