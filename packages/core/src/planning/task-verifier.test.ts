import { describe, it, expect } from 'vitest';
import {
  createEvidence,
  verifyTaskLogic,
  verifyPlanLogic,
  verifyDeliverablesLogic,
  createDeliverable,
  buildSpecReviewPrompt,
  buildQualityReviewPrompt,
} from './task-verifier.js';
import type { PlanTask, TaskEvidence, TaskDeliverable, ReviewEvidence } from './planner-types.js';

const makeTask = (overrides: Partial<PlanTask> = {}): PlanTask => ({
  id: 'task-1', title: 'Test task', description: 'Do something',
  status: 'pending', updatedAt: 0, ...overrides,
});

describe('task-verifier', () => {
  describe('createEvidence', () => {
    it('appends new evidence to existing array', () => {
      const existing: TaskEvidence[] = [
        { criterion: 'cr1', content: 'result', type: 'description', submittedAt: 100 },
      ];
      const result = createEvidence(existing, { criterion: 'cr2', content: 'output', type: 'command_output' });
      expect(result).toHaveLength(2);
      expect(result[1].criterion).toBe('cr2');
      expect(result[1].submittedAt).toBeGreaterThan(0);
    });
    it('does not mutate original array', () => {
      const existing: TaskEvidence[] = [];
      const result = createEvidence(existing, { criterion: 'c', content: 'x', type: 'file' });
      expect(existing).toHaveLength(0);
      expect(result).toHaveLength(1);
    });
  });

  describe('verifyTaskLogic', () => {
    it('returns verified=true when completed with all criteria met and no reviews', () => {
      const task = makeTask({
        status: 'completed',
        acceptanceCriteria: ['cr1', 'cr2'],
        evidence: [
          { criterion: 'cr1', content: 'x', type: 'description', submittedAt: 0 },
          { criterion: 'cr2', content: 'y', type: 'description', submittedAt: 0 },
        ],
      });
      const result = verifyTaskLogic(task, []);
      expect(result.verified).toBe(true);
      expect(result.missingCriteria).toEqual([]);
      expect(result.reviewStatus).toBe('no_reviews');
    });
    it('returns verified=false when not completed', () => {
      const task = makeTask({ status: 'in_progress' });
      expect(verifyTaskLogic(task, []).verified).toBe(false);
    });
    it('returns missing criteria', () => {
      const task = makeTask({
        status: 'completed',
        acceptanceCriteria: ['cr1', 'cr2'],
        evidence: [{ criterion: 'cr1', content: 'x', type: 'description', submittedAt: 0 }],
      });
      const result = verifyTaskLogic(task, []);
      expect(result.missingCriteria).toEqual(['cr2']);
      expect(result.verified).toBe(false);
    });
    it('returns verified=true when task has approved review', () => {
      const task = makeTask({ status: 'completed' });
      const reviews: ReviewEvidence[] = [
        { planId: 'p1', taskId: 'task-1', reviewer: 'r', outcome: 'approved', comments: '', reviewedAt: 0 },
      ];
      expect(verifyTaskLogic(task, reviews).verified).toBe(true);
    });
    it('returns verified=false when task has rejected review', () => {
      const task = makeTask({ status: 'completed' });
      const reviews: ReviewEvidence[] = [
        { planId: 'p1', taskId: 'task-1', reviewer: 'r', outcome: 'rejected', comments: '', reviewedAt: 0 },
      ];
      expect(verifyTaskLogic(task, reviews).verified).toBe(false);
    });
    it('uses latest review outcome', () => {
      const task = makeTask({ status: 'completed' });
      const reviews: ReviewEvidence[] = [
        { planId: 'p1', taskId: 'task-1', reviewer: 'r', outcome: 'rejected', comments: '', reviewedAt: 0 },
        { planId: 'p1', taskId: 'task-1', reviewer: 'r', outcome: 'approved', comments: '', reviewedAt: 1 },
      ];
      expect(verifyTaskLogic(task, reviews).verified).toBe(true);
    });
  });

  describe('verifyPlanLogic', () => {
    it('returns valid=true when all tasks are in final state', () => {
      const tasks: PlanTask[] = [
        makeTask({ status: 'completed' }),
        makeTask({ id: 'task-2', status: 'skipped' }),
      ];
      const result = verifyPlanLogic('plan-1', tasks);
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });
    it('flags stuck in_progress tasks', () => {
      const tasks: PlanTask[] = [makeTask({ status: 'in_progress' })];
      const result = verifyPlanLogic('plan-1', tasks);
      expect(result.valid).toBe(false);
      expect(result.issues[0].issue).toContain('stuck');
    });
    it('flags pending tasks', () => {
      const tasks: PlanTask[] = [makeTask({ status: 'pending' })];
      const result = verifyPlanLogic('plan-1', tasks);
      expect(result.valid).toBe(false);
      expect(result.issues[0].issue).toContain('pending');
    });
    it('flags missing evidence for completed tasks with acceptance criteria', () => {
      const tasks: PlanTask[] = [makeTask({
        status: 'completed', acceptanceCriteria: ['cr1'], evidence: [],
      })];
      const result = verifyPlanLogic('plan-1', tasks);
      expect(result.issues[0].issue).toContain('Missing evidence');
    });
    it('provides correct summary counts', () => {
      const tasks: PlanTask[] = [
        makeTask({ status: 'completed', verified: true }),
        makeTask({ id: 't2', status: 'failed' }),
        makeTask({ id: 't3', status: 'skipped' }),
      ];
      const result = verifyPlanLogic('plan-1', tasks);
      expect(result.summary.completed).toBe(1);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.verified).toBe(1);
      expect(result.summary.total).toBe(3);
    });
  });

  describe('verifyDeliverablesLogic', () => {
    it('returns verified=true for empty deliverables', () => {
      const result = verifyDeliverablesLogic([]);
      expect(result.verified).toBe(true);
      expect(result.staleCount).toBe(0);
    });
    it('marks file deliverables as stale when file does not exist', () => {
      const deliverables: TaskDeliverable[] = [
        { type: 'file', path: '/nonexistent/path/file.ts' },
      ];
      const result = verifyDeliverablesLogic(deliverables);
      expect(result.verified).toBe(false);
      expect(result.staleCount).toBe(1);
      expect(result.deliverables[0].stale).toBe(true);
    });
    it('marks vault_entry deliverables as stale when vault returns null', () => {
      const deliverables: TaskDeliverable[] = [
        { type: 'vault_entry', path: 'entry-123' },
      ];
      const vault = { get: () => null };
      const result = verifyDeliverablesLogic(deliverables, vault);
      expect(result.staleCount).toBe(1);
    });
    it('marks vault_entry deliverables as valid when vault returns non-null', () => {
      const deliverables: TaskDeliverable[] = [
        { type: 'vault_entry', path: 'entry-123' },
      ];
      const vault = { get: () => ({ id: 'entry-123' }) };
      const result = verifyDeliverablesLogic(deliverables, vault);
      expect(result.verified).toBe(true);
      expect(result.staleCount).toBe(0);
    });
    it('skips url deliverables (no verification)', () => {
      const deliverables: TaskDeliverable[] = [
        { type: 'url', path: 'https://example.com' },
      ];
      const result = verifyDeliverablesLogic(deliverables);
      expect(result.verified).toBe(true);
    });
    it('does not mutate original deliverables', () => {
      const original: TaskDeliverable[] = [{ type: 'url', path: 'x' }];
      const result = verifyDeliverablesLogic(original);
      expect(result.deliverables).not.toBe(original);
    });
  });

  describe('createDeliverable', () => {
    it('creates a url deliverable without hash', () => {
      const d = createDeliverable({ type: 'url', path: 'https://example.com' });
      expect(d.type).toBe('url');
      expect(d.path).toBe('https://example.com');
      expect(d.hash).toBeUndefined();
    });
    it('preserves explicit hash', () => {
      const d = createDeliverable({ type: 'file', path: '/x', hash: 'abc123' });
      expect(d.hash).toBe('abc123');
    });
    it('handles non-existent file gracefully', () => {
      const d = createDeliverable({ type: 'file', path: '/nonexistent/file.ts' });
      expect(d.hash).toBeUndefined();
    });
  });

  describe('buildSpecReviewPrompt', () => {
    it('includes task title and plan objective', () => {
      const prompt = buildSpecReviewPrompt(
        { title: 'Add auth', description: 'JWT middleware', acceptanceCriteria: [] },
        'Build secure API',
      );
      expect(prompt).toContain('Add auth');
      expect(prompt).toContain('JWT middleware');
      expect(prompt).toContain('Build secure API');
      expect(prompt).toContain('Spec Compliance Review');
    });
    it('includes acceptance criteria when present', () => {
      const prompt = buildSpecReviewPrompt(
        { title: 'T', description: 'd', acceptanceCriteria: ['All tests pass', 'No regressions'] },
        'Objective',
      );
      expect(prompt).toContain('1. All tests pass');
      expect(prompt).toContain('2. No regressions');
    });
    it('omits criteria section when empty', () => {
      const prompt = buildSpecReviewPrompt(
        { title: 'T', description: 'd' },
        'Objective',
      );
      expect(prompt).not.toContain('Acceptance Criteria');
    });
  });

  describe('buildQualityReviewPrompt', () => {
    it('includes task info and quality checklist', () => {
      const prompt = buildQualityReviewPrompt({ title: 'Refactor X', description: 'Clean up code' });
      expect(prompt).toContain('Refactor X');
      expect(prompt).toContain('Clean up code');
      expect(prompt).toContain('Code Quality Review');
      expect(prompt).toContain('Correctness');
      expect(prompt).toContain('Security');
    });
  });
});
