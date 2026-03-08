import { describe, it, expect, beforeEach } from 'vitest';
import { PlaybookExecutor } from '../playbooks/playbook-executor.js';
import { tddPlaybook } from '../playbooks/generic/tdd.js';
import { brainstormingPlaybook } from '../playbooks/generic/brainstorming.js';
import { mergePlaybooks } from '../playbooks/playbook-registry.js';
import type { PlaybookDefinition } from '../playbooks/playbook-types.js';

describe('PlaybookExecutor', () => {
  let executor: PlaybookExecutor;

  beforeEach(() => {
    executor = new PlaybookExecutor();
  });

  // ─── start ──────────────────────────────────────────────────────

  describe('start', () => {
    it('should start a session from a PlaybookDefinition', () => {
      const result = executor.start(tddPlaybook);

      expect(result.sessionId).toMatch(/^pbk-/);
      expect(result.label).toBe('Test-Driven Development');
      expect(result.totalSteps).toBeGreaterThan(0);
      expect(result.currentStep.index).toBe(0);
      expect(result.currentStep.status).toBe('active');
      expect(result.tools).toContain('search_intelligent');
      expect(result.gates.length).toBeGreaterThan(0);
    });

    it('should start a session from a MergedPlaybook', () => {
      const merged = mergePlaybooks(tddPlaybook, undefined);
      const result = executor.start(merged);

      expect(result.sessionId).toMatch(/^pbk-/);
      expect(result.label).toBe('Test-Driven Development');
      expect(result.totalSteps).toBeGreaterThan(0);
    });

    it('should parse numbered steps from playbook text', () => {
      const result = executor.start(tddPlaybook);

      // TDD playbook has 4 numbered steps
      expect(result.totalSteps).toBe(4);
      expect(result.currentStep.title).toContain('RED');
    });

    it('should track session in listSessions', () => {
      executor.start(tddPlaybook);
      executor.start(brainstormingPlaybook);

      const sessions = executor.listSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  // ─── step ───────────────────────────────────────────────────────

  describe('step', () => {
    it('should advance to the next step', () => {
      const { sessionId } = executor.start(tddPlaybook);

      const result = executor.step(sessionId, { output: 'Wrote failing test' });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.completedStep.status).toBe('done');
      expect(result.completedStep.output).toBe('Wrote failing test');
      expect(result.nextStep).not.toBeNull();
      expect(result.nextStep!.status).toBe('active');
      expect(result.progress.done).toBe(1);
      expect(result.isComplete).toBe(false);
    });

    it('should mark step as skipped when skip=true', () => {
      const { sessionId } = executor.start(tddPlaybook);

      const result = executor.step(sessionId, { skip: true });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.completedStep.status).toBe('skipped');
    });

    it('should signal completion when all steps are done', () => {
      const { sessionId, totalSteps } = executor.start(tddPlaybook);

      let result;
      for (let i = 0; i < totalSteps; i++) {
        result = executor.step(sessionId, { output: `Step ${i + 1} done` });
      }

      expect(result).toBeDefined();
      expect('error' in result!).toBe(false);
      if ('error' in result!) return;

      expect(result!.isComplete).toBe(true);
      expect(result!.nextStep).toBeNull();
      expect(result!.progress.done).toBe(totalSteps);
    });

    it('should return error for unknown session', () => {
      const result = executor.step('nonexistent');
      expect('error' in result).toBe(true);
    });
  });

  // ─── complete ───────────────────────────────────────────────────

  describe('complete', () => {
    it('should complete a session with all gates passed', () => {
      const { sessionId, totalSteps } = executor.start(tddPlaybook);

      // Advance through all steps
      for (let i = 0; i < totalSteps; i++) {
        executor.step(sessionId);
      }

      const result = executor.complete(sessionId, {
        gateResults: { 'tdd-red': true, 'tdd-green': true },
      });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.status).toBe('completed');
      expect(result.gatesPassed).toBe(true);
      expect(result.unsatisfiedGates).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should report unsatisfied gates', () => {
      const { sessionId, totalSteps } = executor.start(tddPlaybook);

      for (let i = 0; i < totalSteps; i++) {
        executor.step(sessionId);
      }

      // Only pass one of two gates
      const result = executor.complete(sessionId, {
        gateResults: { 'tdd-red': true },
      });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.gatesPassed).toBe(false);
      expect(result.unsatisfiedGates.length).toBeGreaterThan(0);
      expect(result.unsatisfiedGates[0]).toContain('tdd-green');
    });

    it('should abort a session', () => {
      const { sessionId } = executor.start(tddPlaybook);

      // Only do one step then abort
      executor.step(sessionId);
      const result = executor.complete(sessionId, { abort: true });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.status).toBe('aborted');
    });

    it('should remove session after completion', () => {
      const { sessionId, totalSteps } = executor.start(tddPlaybook);

      for (let i = 0; i < totalSteps; i++) {
        executor.step(sessionId);
      }

      executor.complete(sessionId);

      expect(executor.getSession(sessionId)).toBeUndefined();
      expect(executor.listSessions()).toHaveLength(0);
    });

    it('should return error for unknown session', () => {
      const result = executor.complete('nonexistent');
      expect('error' in result).toBe(true);
    });
  });

  // ─── getSession ─────────────────────────────────────────────────

  describe('getSession', () => {
    it('should return active session state', () => {
      const { sessionId } = executor.start(tddPlaybook);

      const session = executor.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.status).toBe('active');
      expect(session!.playbookId).toBe('generic-tdd');
    });

    it('should reflect step progress', () => {
      const { sessionId } = executor.start(tddPlaybook);
      executor.step(sessionId, { output: 'done' });

      const session = executor.getSession(sessionId);
      expect(session!.currentStepIndex).toBe(1);
      expect(session!.steps[0].status).toBe('done');
      expect(session!.steps[1].status).toBe('active');
    });
  });

  // ─── edge cases ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle playbook with no parseable steps', () => {
      const minimal: PlaybookDefinition = {
        id: 'test-minimal',
        tier: 'generic',
        title: 'Minimal',
        trigger: 'test',
        description: 'A minimal playbook',
        steps: 'Just do the thing',
        expectedOutcome: 'Done',
        category: 'test',
        tags: [],
        matchIntents: ['BUILD'],
        matchKeywords: [],
        gates: [],
        taskTemplates: [],
        toolInjections: [],
        verificationCriteria: [],
      };

      const result = executor.start(minimal);

      // Falls back to a single step
      expect(result.totalSteps).toBe(1);
      expect(result.currentStep.title).toBe('Minimal');
    });

    it('should not allow stepping a completed session', () => {
      const { sessionId, totalSteps } = executor.start(tddPlaybook);

      for (let i = 0; i < totalSteps; i++) {
        executor.step(sessionId);
      }
      executor.complete(sessionId);

      const result = executor.step(sessionId);
      expect('error' in result).toBe(true);
    });
  });
});
