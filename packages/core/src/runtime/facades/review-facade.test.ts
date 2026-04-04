import { describe, it, expect, vi } from 'vitest';
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
  it('handlers are callable', async () => {
    const rt = mockRuntime();
    const rtOps = createReviewFacadeOps(rt);
    const submitOp = rtOps.find((o) => o.name === 'vault_submit_review')!;
    const result = (await submitOp.handler({ entryId: 'e1' })) as Record<string, unknown>;
    expect(result.status).toBe('pending_review');
  });
});
