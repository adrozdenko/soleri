/**
 * Knowledge Review Tests — team review workflows.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { KnowledgeReview } from '../vault/knowledge-review.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

describe('KnowledgeReview', () => {
  let vault: Vault;
  let review: KnowledgeReview;

  const entry: IntelligenceEntry = {
    id: 'test-entry-1',
    type: 'pattern',
    domain: 'testing',
    title: 'Test Pattern',
    severity: 'suggestion',
    description: 'A test pattern',
    tags: ['test'],
  };

  beforeEach(() => {
    vault = new Vault(':memory:');
    vault.seed([entry]);
    review = new KnowledgeReview(vault.getProvider());
  });

  afterEach(() => {
    vault.close();
  });

  test('submit transitions to pending_review', () => {
    const result = review.submit({ entryId: 'test-entry-1', submittedBy: 'alice' });
    expect(result.status).toBe('pending_review');
    expect(result.submittedBy).toBe('alice');
    expect(result.submittedAt).toBeGreaterThan(0);
  });

  test('approve transitions from pending_review to approved', () => {
    review.submit({ entryId: 'test-entry-1' });
    const result = review.approve({
      entryId: 'test-entry-1',
      reviewedBy: 'bob',
      comment: 'Looks good',
    });
    expect(result.status).toBe('approved');
    expect(result.reviewedBy).toBe('bob');
    expect(result.reviewComment).toBe('Looks good');
  });

  test('reject transitions from pending_review to rejected', () => {
    review.submit({ entryId: 'test-entry-1' });
    const result = review.reject({
      entryId: 'test-entry-1',
      reviewedBy: 'bob',
      comment: 'Needs work',
    });
    expect(result.status).toBe('rejected');
    expect(result.reviewComment).toBe('Needs work');
  });

  test('cannot approve non-pending entry', () => {
    expect(() => review.approve({ entryId: 'test-entry-1' })).toThrow('not pending review');
  });

  test('cannot submit already pending entry', () => {
    review.submit({ entryId: 'test-entry-1' });
    expect(() => review.submit({ entryId: 'test-entry-1' })).toThrow('cannot be submitted');
  });

  test('rejected entries can be resubmitted', () => {
    review.submit({ entryId: 'test-entry-1' });
    review.reject({ entryId: 'test-entry-1' });
    const result = review.submit({ entryId: 'test-entry-1', submittedBy: 'alice' });
    expect(result.status).toBe('pending_review');
  });

  test('listPending returns pending entries', () => {
    review.submit({ entryId: 'test-entry-1' });
    const pending = review.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].entryId).toBe('test-entry-1');
  });

  test('stats returns counts by status', () => {
    review.submit({ entryId: 'test-entry-1' });
    const stats = review.stats();
    expect(stats.total).toBe(1);
    expect(stats.byStatus.pending_review).toBe(1);
  });

  test('remove deletes review record', () => {
    review.submit({ entryId: 'test-entry-1' });
    const removed = review.remove('test-entry-1');
    expect(removed).toBe(true);
    expect(review.get('test-entry-1')).toBeNull();
  });

  test('get returns null for unknown entry', () => {
    expect(review.get('nonexistent')).toBeNull();
  });
});
