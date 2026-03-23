/**
 * Gate evaluator — colocated contract tests.
 *
 * Contract:
 * - evaluateGate() returns a GateVerdict with passed/action/message/score
 * - GATE type: evaluates condition string, STOP/BRANCH on failure
 * - SCORE type: compares extracted score against min threshold
 * - CHECKPOINT type: advisory — defaults to CONTINUE even on failure
 * - BRANCH type: always triggers BRANCH action
 * - VERIFY type: checks for verification evidence, advisory only
 * - No gate → CONTINUE (passed)
 *
 * Helper coverage for evaluateCondition/extractScore/resolvePath is lighter
 * here since __tests__/flows.test.ts covers them thoroughly.
 */

import { describe, it, expect } from 'vitest';
import { evaluateGate, evaluateCondition, extractScore } from './gate-evaluator.js';

describe('evaluateGate', () => {
  it('returns CONTINUE when no gate is defined', () => {
    const verdict = evaluateGate(undefined, {});
    expect(verdict).toEqual({ passed: true, action: 'CONTINUE' });
  });

  describe('GATE type', () => {
    it('passes when condition is true', () => {
      const gate = { type: 'GATE', condition: 'count == 0', onFail: { action: 'STOP' } };
      const verdict = evaluateGate(gate, { count: 0 });
      expect(verdict.passed).toBe(true);
      expect(verdict.action).toBe('CONTINUE');
    });

    it('returns STOP on failed condition with STOP action', () => {
      const gate = {
        type: 'GATE',
        condition: 'count == 0',
        onFail: { action: 'STOP', message: 'Count must be zero' },
      };
      const verdict = evaluateGate(gate, { count: 5 });
      expect(verdict.passed).toBe(false);
      expect(verdict.action).toBe('STOP');
      expect(verdict.message).toBe('Count must be zero');
    });

    it('returns BRANCH on failed condition with BRANCH action and goto', () => {
      const gate = {
        type: 'GATE',
        condition: 'valid == true',
        onFail: { action: 'BRANCH', goto: 'retry-step' },
      };
      const verdict = evaluateGate(gate, { valid: false });
      expect(verdict.passed).toBe(false);
      expect(verdict.action).toBe('BRANCH');
      expect(verdict.goto).toBe('retry-step');
    });

    it('passes when no condition is specified', () => {
      const gate = { type: 'GATE', onFail: { action: 'STOP' } };
      const verdict = evaluateGate(gate, {});
      expect(verdict.passed).toBe(true);
    });
  });

  describe('SCORE type', () => {
    it('passes when score meets minimum', () => {
      const gate = { type: 'SCORE', min: 80, onFail: { action: 'STOP' } };
      const verdict = evaluateGate(gate, { score: 90 });
      expect(verdict.passed).toBe(true);
      expect(verdict.score).toBe(90);
    });

    it('fails when score is below minimum', () => {
      const gate = { type: 'SCORE', min: 80, onFail: { action: 'STOP' } };
      const verdict = evaluateGate(gate, { score: 50 });
      expect(verdict.passed).toBe(false);
      expect(verdict.score).toBe(50);
      expect(verdict.message).toContain('50');
      expect(verdict.message).toContain('80');
    });

    it('uses custom onFail message when provided', () => {
      const gate = {
        type: 'SCORE',
        min: 90,
        onFail: { action: 'STOP', message: 'Too low' },
      };
      const verdict = evaluateGate(gate, { score: 70 });
      expect(verdict.message).toBe('Too low');
    });

    it('defaults min to 0 when not specified', () => {
      const gate = { type: 'SCORE', onFail: { action: 'STOP' } };
      const verdict = evaluateGate(gate, { score: 0 });
      expect(verdict.passed).toBe(true);
    });
  });

  describe('CHECKPOINT type', () => {
    it('passes when condition is true', () => {
      const gate = { type: 'CHECKPOINT', condition: 'ok == true', onFail: { action: 'CONTINUE' } };
      const verdict = evaluateGate(gate, { ok: true });
      expect(verdict.passed).toBe(true);
    });

    it('defaults to CONTINUE on failure (advisory)', () => {
      const gate = { type: 'CHECKPOINT', condition: 'ok == true' };
      const verdict = evaluateGate(gate, { ok: false });
      expect(verdict.passed).toBe(false);
      expect(verdict.action).toBe('CONTINUE');
    });

    it('passes when no condition is specified', () => {
      const gate = { type: 'CHECKPOINT' };
      const verdict = evaluateGate(gate, {});
      expect(verdict.passed).toBe(true);
    });
  });

  describe('BRANCH type', () => {
    it('always returns BRANCH action with passed=true', () => {
      const gate = { type: 'BRANCH', onFail: { goto: 'step-x', message: 'branching' } };
      const verdict = evaluateGate(gate, {});
      expect(verdict.passed).toBe(true);
      expect(verdict.action).toBe('BRANCH');
      expect(verdict.goto).toBe('step-x');
    });
  });

  describe('VERIFY type', () => {
    it('passes with verified findings', () => {
      const verdict = evaluateGate(
        { type: 'VERIFY' },
        {
          verification: { findings: [{ proven: true }] },
        },
      );
      expect(verdict.passed).toBe(true);
      expect(verdict.action).toBe('CONTINUE');
    });

    it('returns advisory message when no verification evidence', () => {
      const verdict = evaluateGate({ type: 'VERIFY' }, {});
      expect(verdict.passed).toBe(true);
      expect(verdict.action).toBe('CONTINUE');
      expect(verdict.message).toContain('Advisory');
    });

    it('returns advisory when findings exist but none proven', () => {
      const verdict = evaluateGate(
        { type: 'VERIFY' },
        {
          verification: { findings: [{ proven: false }] },
        },
      );
      expect(verdict.passed).toBe(true);
      expect(verdict.message).toContain('Advisory');
    });
  });

  describe('unknown gate type', () => {
    it('defaults to CONTINUE', () => {
      const verdict = evaluateGate({ type: 'UNKNOWN' as string }, {});
      expect(verdict.passed).toBe(true);
      expect(verdict.action).toBe('CONTINUE');
    });
  });
});

// Lighter coverage — main tests are in __tests__/flows.test.ts
describe('evaluateCondition (edge cases)', () => {
  it('handles string comparison with quotes', () => {
    expect(evaluateCondition('status == "active"', { status: 'active' })).toBe(true);
  });

  it('handles less-than operator', () => {
    expect(evaluateCondition('count < 5', { count: 3 })).toBe(true);
    expect(evaluateCondition('count < 5', { count: 7 })).toBe(false);
  });

  it('handles less-than-or-equal operator', () => {
    expect(evaluateCondition('count <= 5', { count: 5 })).toBe(true);
  });

  it('handles greater-than operator', () => {
    expect(evaluateCondition('count > 5', { count: 10 })).toBe(true);
  });
});

describe('extractScore (nested)', () => {
  it('finds score in nested result.data', () => {
    const data = { tool: { data: { score: 77 } } };
    expect(extractScore(data)).toBe(77);
  });

  it('prefers top-level score over nested', () => {
    const data = { score: 95, nested: { score: 50 } };
    expect(extractScore(data)).toBe(95);
  });
});
