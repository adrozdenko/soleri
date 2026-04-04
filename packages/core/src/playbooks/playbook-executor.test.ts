import { describe, it, expect, beforeEach } from 'vitest';
import { PlaybookExecutor } from './playbook-executor.js';
import type { PlaybookDefinition, MergedPlaybook } from './playbook-types.js';

function makePlaybook(overrides: Partial<PlaybookDefinition> = {}): PlaybookDefinition {
  return {
    id: 'test-playbook',
    tier: 'generic',
    title: 'Test Playbook',
    trigger: 'test',
    description: 'A test playbook',
    steps: `1. First step
   - Detail A
2. Second step
   - Detail B
3. Third step`,
    expectedOutcome: 'Done',
    category: 'test',
    tags: [],
    matchIntents: ['BUILD'],
    matchKeywords: [],
    gates: [{ phase: 'completion', requirement: 'Tests pass', checkType: 'test-pass' }],
    taskTemplates: [],
    toolInjections: ['search_intelligent'],
    verificationCriteria: ['All tests pass'],
    ...overrides,
  };
}

describe('PlaybookExecutor', () => {
  let executor: PlaybookExecutor;

  beforeEach(() => {
    executor = new PlaybookExecutor();
  });

  // ─── start ──────────────────────────────────────────────────────

  describe('start', () => {
    it('creates a session with correct metadata', () => {
      const result = executor.start(makePlaybook());

      expect(result.sessionId).toMatch(/^pbk-/);
      expect(result.label).toBe('Test Playbook');
      expect(result.totalSteps).toBe(3);
      expect(result.currentStep.index).toBe(0);
      expect(result.currentStep.status).toBe('active');
      expect(result.tools).toContain('search_intelligent');
    });

    it('parses numbered steps from steps text', () => {
      const result = executor.start(makePlaybook());
      expect(result.totalSteps).toBe(3);
      expect(result.currentStep.title).toBe('First step');
    });

    it('falls back to single step when no numbered steps found', () => {
      const result = executor.start(makePlaybook({ steps: 'Just do it' }));
      expect(result.totalSteps).toBe(1);
      expect(result.currentStep.title).toBe('Test Playbook');
    });

    it('starts from a MergedPlaybook', () => {
      const merged: MergedPlaybook = {
        generic: makePlaybook(),
        mergedGates: [],
        mergedTasks: [],
        mergedTools: ['tool_a'],
        mergedVerification: [],
        label: 'Merged Label',
      };

      const result = executor.start(merged);
      expect(result.label).toBe('Merged Label');
      expect(result.tools).toEqual(['tool_a']);
    });

    it('handles MergedPlaybook with domain only', () => {
      const domain = makePlaybook({ id: 'domain-pb', title: 'Domain PB' });
      const merged: MergedPlaybook = {
        domain,
        mergedGates: [],
        mergedTasks: [],
        mergedTools: [],
        mergedVerification: [],
        label: 'Domain Only',
      };

      const result = executor.start(merged);
      expect(result.label).toBe('Domain Only');
    });
  });

  // ─── step ───────────────────────────────────────────────────────

  describe('step', () => {
    it('advances to the next step and records output', () => {
      const { sessionId } = executor.start(makePlaybook());
      const result = executor.step(sessionId, { output: 'Step 1 done' });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.completedStep.status).toBe('done');
      expect(result.completedStep.output).toBe('Step 1 done');
      expect(result.nextStep?.status).toBe('active');
      expect(result.progress).toEqual({ done: 1, total: 3 });
      expect(result.isComplete).toBe(false);
    });

    it('marks step as skipped when skip=true', () => {
      const { sessionId } = executor.start(makePlaybook());
      const result = executor.step(sessionId, { skip: true });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.completedStep.status).toBe('skipped');
    });

    it('signals completion after all steps', () => {
      const { sessionId, totalSteps } = executor.start(makePlaybook());

      let result;
      for (let i = 0; i < totalSteps; i++) {
        result = executor.step(sessionId);
      }

      expect('error' in result!).toBe(false);
      if ('error' in result!) return;

      expect(result!.isComplete).toBe(true);
      expect(result!.nextStep).toBeNull();
      expect(result!.progress.done).toBe(totalSteps);
    });

    it('returns error for nonexistent session', () => {
      const result = executor.step('nonexistent');
      expect('error' in result).toBe(true);
    });

    it('returns error for completed session', () => {
      const { sessionId, totalSteps } = executor.start(makePlaybook());
      for (let i = 0; i < totalSteps; i++) executor.step(sessionId);
      executor.complete(sessionId);

      const result = executor.step(sessionId);
      expect('error' in result).toBe(true);
    });
  });

  // ─── complete ───────────────────────────────────────────────────

  describe('complete', () => {
    it('completes with all gates passed', () => {
      const { sessionId, totalSteps } = executor.start(makePlaybook());
      for (let i = 0; i < totalSteps; i++) executor.step(sessionId);

      const result = executor.complete(sessionId, {
        gateResults: { 'test-pass': true },
      });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.status).toBe('completed');
      expect(result.gatesPassed).toBe(true);
      expect(result.unsatisfiedGates).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('reports unsatisfied completion gates', () => {
      const { sessionId, totalSteps } = executor.start(makePlaybook());
      for (let i = 0; i < totalSteps; i++) executor.step(sessionId);

      const result = executor.complete(sessionId, { gateResults: {} });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.gatesPassed).toBe(false);
      expect(result.unsatisfiedGates).toHaveLength(1);
      expect(result.unsatisfiedGates[0]).toContain('test-pass');
    });

    it('aborts a session and marks remaining steps as skipped', () => {
      const { sessionId } = executor.start(makePlaybook());
      executor.step(sessionId); // complete first step only

      const result = executor.complete(sessionId, { abort: true });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.status).toBe('aborted');
    });

    it('removes session from memory after completion', () => {
      const { sessionId, totalSteps } = executor.start(makePlaybook());
      for (let i = 0; i < totalSteps; i++) executor.step(sessionId);
      executor.complete(sessionId);

      expect(executor.getSession(sessionId)).toBeUndefined();
    });

    it('returns error for unknown session', () => {
      const result = executor.complete('unknown');
      expect('error' in result).toBe(true);
    });

    it('returns error for already completed session', () => {
      const { sessionId, totalSteps } = executor.start(makePlaybook());
      for (let i = 0; i < totalSteps; i++) executor.step(sessionId);
      executor.complete(sessionId);

      // Session was removed; second complete gets "not found"
      const result = executor.complete(sessionId);
      expect('error' in result).toBe(true);
    });

    // ── evidence source ──────────────────────────────────────────────

    describe('evidence source', () => {
      function makePlaybookWithUserGate(): PlaybookDefinition {
        return makePlaybook({
          gates: [
            {
              phase: 'completion',
              requirement: 'User confirmed result',
              checkType: 'user-confirm',
              requiresUserEvidence: true,
            },
          ],
        });
      }

      it('agent-source evidence fails a requiresUserEvidence gate', () => {
        const { sessionId, totalSteps } = executor.start(makePlaybookWithUserGate());
        for (let i = 0; i < totalSteps; i++) executor.step(sessionId);

        const result = executor.complete(sessionId, {
          gateResults: { 'user-confirm': { satisfied: true, source: 'agent' } },
        });

        expect('error' in result).toBe(false);
        if ('error' in result) return;

        expect(result.gatesPassed).toBe(false);
        expect(result.unsatisfiedGates[0]).toContain('user-confirm');
        expect(result.unsatisfiedGates[0]).toContain('requires user confirmation');
      });

      it('user-source evidence satisfies a requiresUserEvidence gate', () => {
        const { sessionId, totalSteps } = executor.start(makePlaybookWithUserGate());
        for (let i = 0; i < totalSteps; i++) executor.step(sessionId);

        const result = executor.complete(sessionId, {
          gateResults: { 'user-confirm': { satisfied: true, source: 'user' } },
        });

        expect('error' in result).toBe(false);
        if ('error' in result) return;

        expect(result.gatesPassed).toBe(true);
        expect(result.unsatisfiedGates).toHaveLength(0);
      });

      it('plain boolean true satisfies a gate without requiresUserEvidence', () => {
        const { sessionId, totalSteps } = executor.start(makePlaybook());
        for (let i = 0; i < totalSteps; i++) executor.step(sessionId);

        const result = executor.complete(sessionId, {
          gateResults: { 'test-pass': true },
        });

        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.gatesPassed).toBe(true);
      });

      it('plain boolean true does not satisfy a requiresUserEvidence gate', () => {
        const { sessionId, totalSteps } = executor.start(makePlaybookWithUserGate());
        for (let i = 0; i < totalSteps; i++) executor.step(sessionId);

        // bare true = no source = treated as agent
        const result = executor.complete(sessionId, {
          gateResults: { 'user-confirm': true },
        });

        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.gatesPassed).toBe(false);
        expect(result.unsatisfiedGates[0]).toContain('requires user confirmation');
      });
    });
  });

  // ─── getSession / listSessions ──────────────────────────────────

  describe('getSession', () => {
    it('returns active session state', () => {
      const { sessionId } = executor.start(makePlaybook());
      const session = executor.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session!.status).toBe('active');
      expect(session!.playbookId).toBe('test-playbook');
    });

    it('returns undefined for unknown session', () => {
      expect(executor.getSession('nope')).toBeUndefined();
    });
  });

  describe('listSessions', () => {
    it('lists all active sessions', () => {
      executor.start(makePlaybook({ id: 'pb1', title: 'PB1' }));
      executor.start(makePlaybook({ id: 'pb2', title: 'PB2' }));

      const sessions = executor.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].progress).toBe('0/3');
    });

    it('returns empty array when no sessions exist', () => {
      expect(executor.listSessions()).toEqual([]);
    });
  });
});
