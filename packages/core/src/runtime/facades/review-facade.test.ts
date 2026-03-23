import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReviewFacadeOps } from './review-facade.js';
import type { AgentRuntime } from '../types.js';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createReviewFacadeOps', () => {
  let ops: ReturnType<typeof createReviewFacadeOps>;

  beforeEach(() => {
    vi.clearAllMocks();
    ops = createReviewFacadeOps(mockRuntime());
  });

  it('returns 5 ops matching review-ops', () => {
    expect(ops.length).toBe(5);
  });

  it('includes all expected op names', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('vault_submit_review');
    expect(names).toContain('vault_approve');
    expect(names).toContain('vault_reject');
    expect(names).toContain('vault_pending_reviews');
    expect(names).toContain('vault_review_stats');
  });

  it('all ops have required fields', () => {
    for (const op of ops) {
      expect(op.name).toBeDefined();
      expect(op.description).toBeDefined();
      expect(op.auth).toBeDefined();
      expect(typeof op.handler).toBe('function');
    }
  });

  it('approve and reject require admin auth', () => {
    const approveOp = ops.find((o) => o.name === 'vault_approve');
    const rejectOp = ops.find((o) => o.name === 'vault_reject');
    expect(approveOp!.auth).toBe('admin');
    expect(rejectOp!.auth).toBe('admin');
  });

  it('submit uses write auth', () => {
    const op = ops.find((o) => o.name === 'vault_submit_review');
    expect(op!.auth).toBe('write');
  });

  it('pending_reviews and review_stats use read auth', () => {
    const pending = ops.find((o) => o.name === 'vault_pending_reviews');
    const stats = ops.find((o) => o.name === 'vault_review_stats');
    expect(pending!.auth).toBe('read');
    expect(stats!.auth).toBe('read');
  });

  it('handlers are callable', async () => {
    const rt = mockRuntime();
    const rtOps = createReviewFacadeOps(rt);
    const submitOp = rtOps.find((o) => o.name === 'vault_submit_review')!;
    const result = (await submitOp.handler({ entryId: 'e1' })) as Record<string, unknown>;
    expect(result.status).toBe('pending_review');
  });
});
