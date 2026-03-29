import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeQualitySignals, captureQualitySignals } from './quality-signals.js';
import type { EvidenceReport } from '../planning/evidence-collector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<EvidenceReport> = {}): EvidenceReport {
  return {
    planId: 'plan-test',
    planObjective: 'Test plan',
    accuracy: 80,
    evidenceSources: ['git'],
    taskEvidence: [],
    unplannedChanges: [],
    missingWork: [],
    verificationGaps: [],
    summary: '',
    ...overrides,
  };
}

function makeVault() {
  return {
    search: vi.fn().mockReturnValue([]),
    add: vi.fn(),
  } as unknown as ReturnType<
    (typeof import('../vault/vault.js'))['Vault']['prototype']['search']
  > & { add: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn> };
}

function makeBrain() {
  return {
    recordFeedback: vi.fn(),
  } as unknown as { recordFeedback: ReturnType<typeof vi.fn> };
}

// ---------------------------------------------------------------------------
// analyzeQualitySignals
// ---------------------------------------------------------------------------

describe('analyzeQualitySignals', () => {
  it('detects anti-pattern when fixIterations > 2', () => {
    const report = makeReport({
      taskEvidence: [
        {
          taskId: 't1',
          taskTitle: 'Fix login bug',
          plannedStatus: 'completed',
          matchedFiles: [],
          verdict: 'DONE',
          fixIterations: 3,
        },
      ],
    });

    const result = analyzeQualitySignals(report);

    expect(result.antiPatterns).toHaveLength(1);
    expect(result.antiPatterns[0].taskId).toBe('t1');
    expect(result.antiPatterns[0].kind).toBe('anti-pattern');
    expect(result.antiPatterns[0].fixIterations).toBe(3);
  });

  it('detects clean task when fixIterations === 0 and verdict DONE', () => {
    const report = makeReport({
      taskEvidence: [
        {
          taskId: 't2',
          taskTitle: 'Add feature',
          plannedStatus: 'completed',
          matchedFiles: [],
          verdict: 'DONE',
          fixIterations: 0,
        },
      ],
    });

    const result = analyzeQualitySignals(report);

    expect(result.cleanTasks).toHaveLength(1);
    expect(result.cleanTasks[0].taskId).toBe('t2');
    expect(result.cleanTasks[0].kind).toBe('clean');
  });

  it('does not flag task with fixIterations === 0 but verdict PARTIAL', () => {
    const report = makeReport({
      taskEvidence: [
        {
          taskId: 't3',
          taskTitle: 'Partial work',
          plannedStatus: 'in_progress',
          matchedFiles: [],
          verdict: 'PARTIAL',
          fixIterations: 0,
        },
      ],
    });

    const result = analyzeQualitySignals(report);

    expect(result.cleanTasks).toHaveLength(0);
    expect(result.antiPatterns).toHaveLength(0);
  });

  it('does not flag task with fixIterations === 2 (at threshold, not above)', () => {
    const report = makeReport({
      taskEvidence: [
        {
          taskId: 't4',
          taskTitle: 'Borderline task',
          plannedStatus: 'completed',
          matchedFiles: [],
          verdict: 'DONE',
          fixIterations: 2,
        },
      ],
    });

    const result = analyzeQualitySignals(report);

    expect(result.antiPatterns).toHaveLength(0);
  });

  it('detects scope creep from unplanned changes', () => {
    const report = makeReport({
      unplannedChanges: [
        {
          file: { path: 'src/extra.ts', status: 'added' },
          possibleReason: 'unplanned scope',
        },
      ],
    });

    const result = analyzeQualitySignals(report);

    expect(result.scopeCreep).toHaveLength(1);
    expect(result.scopeCreep[0].kind).toBe('scope-creep');
  });

  it('handles undefined fixIterations as 0', () => {
    const report = makeReport({
      taskEvidence: [
        {
          taskId: 't5',
          taskTitle: 'No iterations field',
          plannedStatus: 'completed',
          matchedFiles: [],
          verdict: 'DONE',
          // fixIterations omitted
        },
      ],
    });

    const result = analyzeQualitySignals(report);

    expect(result.cleanTasks).toHaveLength(1);
    expect(result.antiPatterns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// captureQualitySignals
// ---------------------------------------------------------------------------

describe('captureQualitySignals', () => {
  let vault: ReturnType<typeof makeVault>;
  let brain: ReturnType<typeof makeBrain>;

  beforeEach(() => {
    vault = makeVault();
    brain = makeBrain();
  });

  it('captures anti-pattern to vault and records negative brain feedback', () => {
    const analysis = {
      antiPatterns: [
        {
          taskId: 't1',
          taskTitle: 'Fix login',
          kind: 'anti-pattern' as const,
          fixIterations: 3,
          verdict: 'DONE',
        },
      ],
      cleanTasks: [],
      scopeCreep: [],
    };

    const result = captureQualitySignals(analysis, vault, brain, 'plan-1');

    expect(vault.add).toHaveBeenCalledTimes(1);
    const entry = vault.add.mock.calls[0][0];
    expect(entry.type).toBe('anti-pattern');
    expect(entry.severity).toBe('warning');
    expect(entry.tags).toContain('rework');
    expect(entry.tags).toContain('fix-trail');
    expect(entry.tags).toContain('auto-captured');

    expect(brain.recordFeedback).toHaveBeenCalledWith(
      'quality-signal:rework:Fix login',
      't1',
      'dismissed',
    );

    expect(result.captured).toBe(1);
    expect(result.feedback).toBe(1);
  });

  it('records positive brain feedback for clean tasks', () => {
    const analysis = {
      antiPatterns: [],
      cleanTasks: [
        {
          taskId: 't2',
          taskTitle: 'Add feature',
          kind: 'clean' as const,
          fixIterations: 0,
          verdict: 'DONE',
        },
      ],
      scopeCreep: [],
    };

    const result = captureQualitySignals(analysis, vault, brain, 'plan-1');

    expect(brain.recordFeedback).toHaveBeenCalledWith(
      'quality-signal:clean:Add feature',
      't2',
      'accepted',
    );
    expect(result.feedback).toBe(1);
    expect(result.captured).toBe(0);
  });

  it('skips duplicate anti-patterns when vault search returns high-score match', () => {
    vault.search.mockReturnValue([{ entry: { id: 'existing' }, score: 0.8 }]);

    const analysis = {
      antiPatterns: [
        {
          taskId: 't1',
          taskTitle: 'Fix login',
          kind: 'anti-pattern' as const,
          fixIterations: 3,
          verdict: 'DONE',
        },
      ],
      cleanTasks: [],
      scopeCreep: [],
    };

    const result = captureQualitySignals(analysis, vault, brain, 'plan-1');

    expect(vault.add).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.captured).toBe(0);
    // Brain feedback still recorded even for deduplicated captures
    expect(brain.recordFeedback).toHaveBeenCalledTimes(1);
  });

  it('assigns critical severity for fixIterations > 4', () => {
    const analysis = {
      antiPatterns: [
        {
          taskId: 't1',
          taskTitle: 'Hard bug',
          kind: 'anti-pattern' as const,
          fixIterations: 5,
          verdict: 'DONE',
        },
      ],
      cleanTasks: [],
      scopeCreep: [],
    };

    captureQualitySignals(analysis, vault, brain, 'plan-1');

    const entry = vault.add.mock.calls[0][0];
    expect(entry.severity).toBe('critical');
  });

  it('handles mixed signals correctly', () => {
    const analysis = {
      antiPatterns: [
        {
          taskId: 't1',
          taskTitle: 'Rework task',
          kind: 'anti-pattern' as const,
          fixIterations: 4,
          verdict: 'DONE',
        },
      ],
      cleanTasks: [
        {
          taskId: 't2',
          taskTitle: 'Clean task',
          kind: 'clean' as const,
          fixIterations: 0,
          verdict: 'DONE',
        },
      ],
      scopeCreep: [],
    };

    const result = captureQualitySignals(analysis, vault, brain, 'plan-1');

    expect(result.captured).toBe(1);
    expect(result.feedback).toBe(2); // 1 dismissed + 1 accepted
  });
});
