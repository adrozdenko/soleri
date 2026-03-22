/**
 * Verification protocol tests — PlanTask verification field,
 * evidence collector gap detection, and VERIFY gate evaluation.
 */

import { describe, it, expect } from 'vitest';
import { evaluateGate } from '../flows/gate-evaluator.js';
import { collectVerificationGaps } from '../planning/evidence-collector.js';
import type { PlanTask } from '../planning/planner.js';
import type { GitTaskEvidence } from '../planning/evidence-collector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'task-1',
    title: 'Fix login timeout',
    description: 'Fix the login timeout bug',
    status: 'completed',
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeEvidence(
  taskId: string,
  fileStatus: 'added' | 'modified' = 'modified',
): GitTaskEvidence {
  return {
    taskId,
    taskTitle: 'Fix login timeout',
    plannedStatus: 'completed',
    matchedFiles: [{ path: 'src/auth.ts', status: fileStatus }],
    verdict: 'DONE',
  };
}

// ---------------------------------------------------------------------------
// PlanTask verification field — backward compatibility
// ---------------------------------------------------------------------------

describe('PlanTask verification field', () => {
  it('task without verification field works fine', () => {
    const task = makeTask();
    expect(task.verification).toBeUndefined();
  });

  it('task with verification field is valid', () => {
    const task = makeTask({
      verification: {
        findings: [
          {
            description: 'Login times out after 30s',
            severity: 'high',
            proven: true,
            proof: 'Reproduced with test case in auth.test.ts',
          },
        ],
      },
    });
    expect(task.verification!.findings).toHaveLength(1);
    expect(task.verification!.findings[0].proven).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Evidence collector — verification gap detection
// ---------------------------------------------------------------------------

describe('collectVerificationGaps', () => {
  it('task with proven fix passes validation', () => {
    const task = makeTask({
      verification: {
        findings: [
          {
            description: 'Timeout bug',
            severity: 'high',
            proven: true,
            proof: 'Stack trace + test case',
          },
        ],
      },
    });
    const evidence = [makeEvidence('task-1', 'modified')];
    const gaps = collectVerificationGaps([task], evidence);
    expect(gaps).toHaveLength(0);
  });

  it('task with unproven fix flags advisory gap', () => {
    const task = makeTask({
      verification: {
        findings: [
          {
            description: 'Suspicious timeout',
            severity: 'medium',
            proven: false,
          },
        ],
      },
    });
    const evidence = [makeEvidence('task-1', 'modified')];
    const gaps = collectVerificationGaps([task], evidence);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].taskId).toBe('task-1');
    expect(gaps[0].message).toContain('Unproven finding');
    expect(gaps[0].message).toContain('Suspicious timeout');
  });

  it('task creating new code has no verification required', () => {
    const task = makeTask({
      verification: {
        findings: [
          {
            description: 'Some finding',
            severity: 'low',
            proven: false,
          },
        ],
      },
    });
    // File is 'added', not 'modified' — new code
    const evidence = [makeEvidence('task-1', 'added')];
    const gaps = collectVerificationGaps([task], evidence);
    expect(gaps).toHaveLength(0);
  });

  it('task without verification field is backward compatible', () => {
    const task = makeTask(); // no verification field
    const evidence = [makeEvidence('task-1', 'modified')];
    const gaps = collectVerificationGaps([task], evidence);
    expect(gaps).toHaveLength(0);
  });

  it('mixed proven and unproven findings flags only unproven', () => {
    const task = makeTask({
      verification: {
        findings: [
          { description: 'Proven bug', severity: 'high', proven: true, proof: 'test' },
          { description: 'Unproven hunch', severity: 'low', proven: false },
        ],
      },
    });
    const evidence = [makeEvidence('task-1', 'modified')];
    const gaps = collectVerificationGaps([task], evidence);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].message).toContain('Unproven hunch');
  });
});

// ---------------------------------------------------------------------------
// VERIFY gate evaluation
// ---------------------------------------------------------------------------

describe('VERIFY gate', () => {
  it('passes when verification evidence has proven findings', () => {
    const gate = {
      type: 'VERIFY' as const,
      onFail: { action: 'CONTINUE' as const, message: 'No verification' },
    };
    const result = evaluateGate(gate, {
      verification: {
        findings: [{ proven: true }],
      },
    });
    expect(result.passed).toBe(true);
    expect(result.action).toBe('CONTINUE');
    expect(result.message).toBeUndefined();
  });

  it('warns but continues when no verification evidence', () => {
    const gate = {
      type: 'VERIFY' as const,
      onFail: { action: 'CONTINUE' as const, message: 'Missing proof' },
    };
    const result = evaluateGate(gate, {});
    expect(result.passed).toBe(true);
    expect(result.action).toBe('CONTINUE');
    expect(result.message).toBe('Missing proof');
  });

  it('warns with default message when onFail has no message', () => {
    const gate = { type: 'VERIFY' as const };
    const result = evaluateGate(gate, {});
    expect(result.passed).toBe(true);
    expect(result.action).toBe('CONTINUE');
    expect(result.message).toContain('Advisory');
  });

  it('warns when findings exist but none are proven', () => {
    const gate = { type: 'VERIFY' as const };
    const result = evaluateGate(gate, {
      verification: {
        findings: [{ proven: false }, { proven: false }],
      },
    });
    expect(result.passed).toBe(true);
    expect(result.message).toContain('Advisory');
  });
});
