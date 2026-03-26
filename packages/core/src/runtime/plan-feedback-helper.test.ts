import { describe, it, expect, vi } from 'vitest';
import { recordPlanFeedback } from './plan-feedback-helper.js';

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

// ─── Tests ────────────────────────────────────────────────────────────

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
    expect(brain.recordFeedback).toHaveBeenCalledWith(
      'Test objective',
      'method-tdd-123',
      'accepted',
    );
    expect(brain.recordFeedback).toHaveBeenCalledWith(
      'Test objective',
      'arch-vault-456',
      'accepted',
    );
    expect(intelligence.maybeAutoBuildOnFeedback).toHaveBeenCalledOnce();
  });

  it('should handle decision objects with .decision property', () => {
    const brain = makeBrain();
    const plan = makePlan([{ decision: 'Use vault pattern [entryId:obj-entry-1]' }]);

    const count = recordPlanFeedback(plan, brain as unknown);

    expect(count).toBe(1);
    expect(brain.recordFeedback).toHaveBeenCalledWith('Test objective', 'obj-entry-1', 'accepted');
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
    expect(brain.recordFeedback).toHaveBeenCalledWith(
      'Test objective',
      'arch-vault-456',
      'accepted',
    );
  });

  it('should skip malformed entryId markers gracefully', () => {
    const brain = makeBrain();
    const plan = makePlan(['Brain pattern: X [entryId:]', 'Brain pattern: Y [entryId:valid-id]']);

    const count = recordPlanFeedback(plan, brain as unknown);

    // [entryId:] won't match because the regex requires at least one char after :
    // Actually the regex [^\]]+ requires 1+ chars, so empty entryId won't match
    expect(count).toBe(1);
    expect(brain.recordFeedback).toHaveBeenCalledWith('Test objective', 'valid-id', 'accepted');
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
    expect(brain.recordFeedback).toHaveBeenCalledWith('Test objective', 'same-entry', 'accepted');
    expect(brain.recordFeedback).toHaveBeenCalledWith(
      'Test objective',
      'different-entry',
      'accepted',
    );
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

  it('should handle empty decisions array', () => {
    const brain = makeBrain();
    const plan = makePlan([]);

    const count = recordPlanFeedback(plan, brain as unknown);

    expect(count).toBe(0);
    expect(brain.recordFeedback).not.toHaveBeenCalled();
  });

  it('should work without brainIntelligence (optional param)', () => {
    const brain = makeBrain();
    const plan = makePlan(['Decision [entryId:entry-1]']);

    const count = recordPlanFeedback(plan, brain as unknown);

    expect(count).toBe(1);
    // No error thrown despite missing brainIntelligence
  });

  it('should extract multiple entryIds from a single decision string', () => {
    const brain = makeBrain();
    const plan = makePlan(['Combined: [entryId:first-entry] and also [entryId:second-entry]']);

    const count = recordPlanFeedback(plan, brain as unknown);

    expect(count).toBe(2);
    expect(brain.recordFeedback).toHaveBeenCalledWith('Test objective', 'first-entry', 'accepted');
    expect(brain.recordFeedback).toHaveBeenCalledWith('Test objective', 'second-entry', 'accepted');
  });
});
