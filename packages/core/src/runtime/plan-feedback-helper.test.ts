import { describe, it, expect, vi } from 'vitest';
import { recordPlanFeedback, extractEntryIds } from './plan-feedback-helper.js';
import { Vault } from '../vault/vault.js';
import { Brain } from '../brain/brain.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Mock Factories ───────────────────────────────────────────────────

function makeBrain() {
  return {
    recordFeedback: vi.fn(),
  };
}

function makeBrainIntelligence() {
  return {
    maybeAutoBuildOnFeedback: vi.fn(),
  };
}

function makePlan(decisions: (string | { decision: string })[] = []) {
  return {
    objective: 'Test objective',
    decisions,
  };
}

function feedbackWith(entryId: string, action: string) {
  return expect.objectContaining({
    query: 'Test objective',
    entryId,
    action,
    source: 'evidence-quality',
  });
}

// ─── extractEntryIds ──────────────────────────────────────────────────

describe('extractEntryIds', () => {
  it('should extract ids from strings and decision objects', () => {
    const ids = extractEntryIds([
      'Brain pattern: TDD [entryId:method-tdd-123]',
      { decision: 'Use vault pattern [entryId:obj-entry-1]' },
    ]);
    expect(ids).toEqual(['method-tdd-123', 'obj-entry-1']);
  });

  it('should dedupe and skip strings without markers', () => {
    const ids = extractEntryIds([
      'Decision 1 [entryId:same-entry]',
      'Decision 2 [entryId:same-entry]',
      'Plain decision',
    ]);
    expect(ids).toEqual(['same-entry']);
  });

  it('should extract multiple ids from a single string', () => {
    const ids = extractEntryIds(['Combined: [entryId:first] and [entryId:second]']);
    expect(ids).toEqual(['first', 'second']);
  });

  it('should ignore empty markers', () => {
    const ids = extractEntryIds(['X [entryId:]', 'Y [entryId:valid-id]']);
    expect(ids).toEqual(['valid-id']);
  });
});

// ─── recordPlanFeedback ───────────────────────────────────────────────

describe('recordPlanFeedback', () => {
  it('should extract entryIds from decision strings and record feedback', () => {
    const brain = makeBrain();
    const intelligence = makeBrainIntelligence();
    const plan = makePlan([
      'Brain pattern: TDD (strength: 52.5) [entryId:method-tdd-123]',
      'Brain pattern: Vault hooks (strength: 87.5) [entryId:arch-vault-456]',
    ]);

    const count = recordPlanFeedback(plan, brain as unknown, intelligence as unknown);

    expect(count).toBe(2);
    expect(brain.recordFeedback).toHaveBeenCalledTimes(2);
    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('method-tdd-123', 'accepted'));
    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('arch-vault-456', 'accepted'));
    expect(intelligence.maybeAutoBuildOnFeedback).toHaveBeenCalledOnce();
  });

  it('should handle decision objects with .decision property', () => {
    const brain = makeBrain();
    const plan = makePlan([{ decision: 'Use vault pattern [entryId:obj-entry-1]' }]);

    const count = recordPlanFeedback(plan, brain as unknown);

    expect(count).toBe(1);
    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('obj-entry-1', 'accepted'));
  });

  it('should skip decisions without entryId markers', () => {
    const brain = makeBrain();
    const plan = makePlan([
      'Brain pattern: TDD (strength: 52.5)',
      'Some decision without an entry ID',
      'Brain pattern: Vault hooks (strength: 87.5) [entryId:arch-vault-456]',
    ]);

    const count = recordPlanFeedback(plan, brain as unknown);

    expect(count).toBe(1);
    expect(brain.recordFeedback).toHaveBeenCalledTimes(1);
    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('arch-vault-456', 'accepted'));
  });

  it('should not double-record duplicate entryIds', () => {
    const brain = makeBrain();
    const plan = makePlan([
      'Decision 1 [entryId:same-entry]',
      'Decision 2 [entryId:same-entry]',
      'Decision 3 [entryId:different-entry]',
    ]);

    const count = recordPlanFeedback(plan, brain as unknown);

    expect(count).toBe(2);
    expect(brain.recordFeedback).toHaveBeenCalledTimes(2);
    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('same-entry', 'accepted'));
    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('different-entry', 'accepted'));
  });

  it('should gracefully handle recordFeedback throwing', () => {
    const brain = makeBrain();
    brain.recordFeedback.mockImplementationOnce(() => {
      throw new Error('Entry not found');
    });
    const plan = makePlan([
      'Decision 1 [entryId:missing-entry]',
      'Decision 2 [entryId:valid-entry]',
    ]);

    const count = recordPlanFeedback(plan, brain as unknown);

    // First one throws, second succeeds
    expect(count).toBe(1);
    expect(brain.recordFeedback).toHaveBeenCalledTimes(2);
  });

  it('should return 0 and not call maybeAutoBuild when no entryIds found', () => {
    const brain = makeBrain();
    const intelligence = makeBrainIntelligence();
    const plan = makePlan(['Decision without markers', 'Another plain decision']);

    const count = recordPlanFeedback(plan, brain as unknown, intelligence as unknown);

    expect(count).toBe(0);
    expect(brain.recordFeedback).not.toHaveBeenCalled();
    expect(intelligence.maybeAutoBuildOnFeedback).not.toHaveBeenCalled();
  });

  it('should work without brainIntelligence (optional param)', () => {
    const brain = makeBrain();
    const plan = makePlan(['Decision [entryId:entry-1]']);

    const count = recordPlanFeedback(plan, brain as unknown);

    expect(count).toBe(1);
  });
});

// ─── Outcome-conditional actions ──────────────────────────────────────

describe('recordPlanFeedback outcome grading', () => {
  const plan = () => makePlan(['Decision [entryId:entry-1]', 'Decision [entryId:entry-2]']);

  it('should record failed when plan outcome is failed', () => {
    const brain = makeBrain();

    recordPlanFeedback(plan(), brain as unknown, undefined, { outcome: 'failed' });

    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('entry-1', 'failed'));
    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('entry-2', 'failed'));
  });

  it('should record failed when accuracy is below threshold', () => {
    const brain = makeBrain();

    recordPlanFeedback(plan(), brain as unknown, undefined, { outcome: 'completed', accuracy: 40 });

    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('entry-1', 'failed'));
  });

  it('should record modified when any task hit the rework threshold', () => {
    const brain = makeBrain();

    recordPlanFeedback(plan(), brain as unknown, undefined, {
      outcome: 'completed',
      accuracy: 90,
      tasks: [{ fixIterations: 0 }, { fixIterations: 2 }],
    });

    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('entry-1', 'modified'));
    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('entry-2', 'modified'));
  });

  it('should record accepted for a clean plan', () => {
    const brain = makeBrain();

    recordPlanFeedback(plan(), brain as unknown, undefined, {
      outcome: 'completed',
      accuracy: 100,
      tasks: [{ fixIterations: 0 }, { fixIterations: 1 }],
    });

    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('entry-1', 'accepted'));
  });

  it('should treat accuracy at the threshold as not failed', () => {
    const brain = makeBrain();

    recordPlanFeedback(plan(), brain as unknown, undefined, { accuracy: 50, tasks: [] });

    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('entry-1', 'accepted'));
  });

  it('should record accepted when no outcome context is given (back-compat)', () => {
    const brain = makeBrain();

    recordPlanFeedback(plan(), brain as unknown);

    expect(brain.recordFeedback).toHaveBeenCalledWith(feedbackWith('entry-1', 'accepted'));
  });
});

// ─── Round-trip with real Brain (Soleri #800) ─────────────────────────
// Negative actions must land as queryable rows for real vault entry IDs —
// guards against the write path silently dropping non-accepted actions.

describe('recordPlanFeedback round-trip (real Brain)', () => {
  function makeEntry(id: string): IntelligenceEntry {
    return {
      id,
      type: 'pattern',
      domain: 'testing',
      title: `Pattern ${id}`,
      severity: 'warning',
      description: 'A test pattern for feedback round-trips.',
      tags: ['testing', 'feedback'],
    };
  }

  it('should persist modified rows for reworked plans against real entry IDs', () => {
    const vault = new Vault(':memory:');
    vault.seed([makeEntry('rt-entry-1'), makeEntry('rt-entry-2')]);
    const brain = new Brain(vault);
    const plan = makePlan(['Used [entryId:rt-entry-1] and [entryId:rt-entry-2]']);

    const count = recordPlanFeedback(plan, brain, undefined, {
      outcome: 'completed',
      accuracy: 80,
      tasks: [{ fixIterations: 3 }],
    });

    const stats = brain.getFeedbackStats();
    expect(count).toBe(2);
    expect(stats.byAction['modified']).toBe(2);
    expect(stats.bySource['evidence-quality']).toBe(2);
    vault.close();
  });

  it('should persist failed rows for failed plans', () => {
    const vault = new Vault(':memory:');
    vault.seed([makeEntry('rt-entry-1')]);
    const brain = new Brain(vault);
    const plan = makePlan(['Used [entryId:rt-entry-1]']);

    const count = recordPlanFeedback(plan, brain, undefined, { outcome: 'failed' });

    const stats = brain.getFeedbackStats();
    expect(count).toBe(1);
    expect(stats.byAction['failed']).toBe(1);
    expect(stats.byAction['accepted']).toBeUndefined();
    vault.close();
  });
});
