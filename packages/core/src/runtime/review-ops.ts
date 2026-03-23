/**
 * Review Ops — knowledge review workflow.
 *
 * Covers:
 * - #65: Team review workflows (submit/approve/reject)
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

export function createReviewOps(runtime: AgentRuntime): OpDefinition[] {
  const { knowledgeReview } = runtime;

  return [
    {
      name: 'vault_submit_review',
      description:
        'Submit a vault entry for team review. Transitions entry from draft → pending_review.',
      auth: 'write' as const,
      schema: z.object({
        entryId: z.string().describe('Entry ID to submit for review'),
        submittedBy: z.string().optional().describe('Name/ID of the submitter'),
      }),
      handler: async (params) => {
        try {
          return knowledgeReview.submit({
            entryId: params.entryId as string,
            submittedBy: params.submittedBy as string | undefined,
          });
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'vault_approve',
      description: 'Approve a pending vault entry. Transitions from pending_review → approved.',
      auth: 'admin' as const,
      schema: z.object({
        entryId: z.string().describe('Entry ID to approve'),
        reviewedBy: z.string().optional().describe('Name/ID of the reviewer'),
        comment: z.string().optional().describe('Review comment'),
      }),
      handler: async (params) => {
        try {
          return knowledgeReview.approve({
            entryId: params.entryId as string,
            reviewedBy: params.reviewedBy as string | undefined,
            comment: params.comment as string | undefined,
          });
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'vault_reject',
      description: 'Reject a pending vault entry. Transitions from pending_review → rejected.',
      auth: 'admin' as const,
      schema: z.object({
        entryId: z.string().describe('Entry ID to reject'),
        reviewedBy: z.string().optional().describe('Name/ID of the reviewer'),
        comment: z.string().optional().describe('Reason for rejection'),
      }),
      handler: async (params) => {
        try {
          return knowledgeReview.reject({
            entryId: params.entryId as string,
            reviewedBy: params.reviewedBy as string | undefined,
            comment: params.comment as string | undefined,
          });
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'vault_pending_reviews',
      description: 'List all vault entries pending team review.',
      auth: 'read' as const,
      schema: z.object({
        limit: z.number().optional().describe('Max entries to return'),
      }),
      handler: async (params) => {
        const pending = knowledgeReview.listPending((params.limit as number) ?? 50);
        return { pending, count: pending.length };
      },
    },
    {
      name: 'vault_review_stats',
      description: 'Get review workflow statistics — counts by status.',
      auth: 'read' as const,
      handler: async () => {
        return knowledgeReview.stats();
      },
    },
  ];
}
