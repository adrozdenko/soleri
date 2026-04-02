import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createTracker,
  advanceStep,
  recordEvidence,
  generateCheckpoint,
  validateCompletion,
  persistTracker,
  loadTracker,
} from '../skills/step-tracker.js';
import type { SkillStep, SkillStepTracker } from '../skills/step-tracker.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_STEPS: SkillStep[] = [
  { id: 'vault-query', description: 'Query vault for relevant patterns', evidence: 'tool_called' },
  { id: 'analysis', description: 'Run analysis', evidence: 'file_exists' },
  { id: 'apply-fix', description: 'Apply the fix', evidence: 'tool_called' },
];

// ---------------------------------------------------------------------------
// createTracker
// ---------------------------------------------------------------------------

describe('createTracker', () => {
  it('creates tracker with correct initial state', () => {
    const tracker = createTracker('test-skill', SAMPLE_STEPS);

    expect(tracker.skillName).toBe('test-skill');
    expect(tracker.runId).toMatch(/^test-skill-\d+$/);
    expect(tracker.steps).toEqual(SAMPLE_STEPS);
    expect(tracker.currentStep).toBe(0);
    expect(tracker.startedAt).toBeTruthy();
    expect(tracker.evidence).toEqual({});
    expect(tracker.completedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// advanceStep
// ---------------------------------------------------------------------------

describe('advanceStep', () => {
  it('increments currentStep', () => {
    const tracker = createTracker('test', SAMPLE_STEPS);
    const advanced = advanceStep(tracker);

    expect(advanced.currentStep).toBe(1);
    expect(advanced.completedAt).toBeUndefined();
  });

  it('on last step sets completedAt', () => {
    let tracker = createTracker('test', SAMPLE_STEPS);
    // Advance to last step (index 2)
    tracker = { ...tracker, currentStep: SAMPLE_STEPS.length - 1 };
    const completed = advanceStep(tracker);

    expect(completed.completedAt).toBeTruthy();
    // currentStep stays at last index
    expect(completed.currentStep).toBe(SAMPLE_STEPS.length - 1);
  });

  it('does not mutate original tracker', () => {
    const tracker = createTracker('test', SAMPLE_STEPS);
    advanceStep(tracker);

    expect(tracker.currentStep).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// recordEvidence
// ---------------------------------------------------------------------------

describe('recordEvidence', () => {
  it('stores evidence for a step', () => {
    const tracker = createTracker('test', SAMPLE_STEPS);
    const updated = recordEvidence(tracker, 'vault-query', 'vault.search called');

    expect(updated.evidence['vault-query']).toBeDefined();
    expect(updated.evidence['vault-query'].type).toBe('tool_called');
    expect(updated.evidence['vault-query'].value).toBe('vault.search called');
    expect(updated.evidence['vault-query'].verified).toBe(true);
    expect(updated.evidence['vault-query'].timestamp).toBeTruthy();
  });

  it('ignores unknown step IDs', () => {
    const tracker = createTracker('test', SAMPLE_STEPS);
    const updated = recordEvidence(tracker, 'nonexistent', 'some value');

    expect(updated).toBe(tracker); // same reference — no change
    expect(Object.keys(updated.evidence)).toHaveLength(0);
  });

  it('respects verified parameter', () => {
    const tracker = createTracker('test', SAMPLE_STEPS);
    const updated = recordEvidence(tracker, 'vault-query', 'value', false);

    expect(updated.evidence['vault-query'].verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateCheckpoint
// ---------------------------------------------------------------------------

describe('generateCheckpoint', () => {
  it('formats correctly with 0 completions', () => {
    const tracker = createTracker('my-skill', SAMPLE_STEPS);
    const cp = generateCheckpoint(tracker);

    expect(cp).toContain('--- Skill Checkpoint: my-skill ---');
    expect(cp).toContain('Completed: none');
    expect(cp).toContain('Current: vault-query (step 1 of 3)');
    expect(cp).toContain('Evidence required: tool_called');
    expect(cp).toContain('Progress: 0/3');
    expect(cp).toContain('---');
  });

  it('formats correctly with partial completion', () => {
    let tracker = createTracker('my-skill', SAMPLE_STEPS);
    tracker = recordEvidence(tracker, 'vault-query', 'called');
    tracker = advanceStep(tracker);
    const cp = generateCheckpoint(tracker);

    expect(cp).toContain('vault-query ✓');
    expect(cp).toContain('Current: analysis (step 2 of 3)');
    expect(cp).toContain('Progress: 1/3');
  });

  it('formats correctly with full completion', () => {
    let tracker = createTracker('my-skill', SAMPLE_STEPS);
    tracker = recordEvidence(tracker, 'vault-query', 'called');
    tracker = recordEvidence(tracker, 'analysis', '/tmp/result.json');
    tracker = recordEvidence(tracker, 'apply-fix', 'fix.apply called');
    // Advance past last step
    tracker = { ...tracker, currentStep: SAMPLE_STEPS.length - 1 };
    tracker = advanceStep(tracker);
    const cp = generateCheckpoint(tracker);

    expect(cp).toContain('vault-query ✓, analysis ✓, apply-fix ✓');
    expect(cp).toContain('Progress: 3/3');
  });
});

// ---------------------------------------------------------------------------
// validateCompletion
// ---------------------------------------------------------------------------

describe('validateCompletion', () => {
  it('returns correct skipped steps when none completed', () => {
    const tracker = createTracker('test', SAMPLE_STEPS);
    const result = validateCompletion(tracker);

    expect(result.complete).toBe(false);
    expect(result.skippedSteps).toEqual(['vault-query', 'analysis', 'apply-fix']);
    expect(result.evidenceCount).toBe(0);
    expect(result.totalSteps).toBe(3);
  });

  it('returns complete=true when all steps have verified evidence', () => {
    let tracker = createTracker('test', SAMPLE_STEPS);
    tracker = recordEvidence(tracker, 'vault-query', 'v');
    tracker = recordEvidence(tracker, 'analysis', 'a');
    tracker = recordEvidence(tracker, 'apply-fix', 'f');
    const result = validateCompletion(tracker);

    expect(result.complete).toBe(true);
    expect(result.skippedSteps).toEqual([]);
    expect(result.evidenceCount).toBe(3);
    expect(result.totalSteps).toBe(3);
  });

  it('does not count unverified evidence as complete', () => {
    let tracker = createTracker('test', SAMPLE_STEPS);
    tracker = recordEvidence(tracker, 'vault-query', 'v', false);
    tracker = recordEvidence(tracker, 'analysis', 'a', true);
    tracker = recordEvidence(tracker, 'apply-fix', 'f', true);
    const result = validateCompletion(tracker);

    expect(result.complete).toBe(false);
    expect(result.skippedSteps).toEqual(['vault-query']);
  });
});

// ---------------------------------------------------------------------------
// persistTracker / loadTracker
// ---------------------------------------------------------------------------

describe('persistence', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `step-tracker-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    originalHome = process.env.HOME!;
    // Override HOME so getRunsDir() writes to our temp dir
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it('round-trips correctly', () => {
    let tracker = createTracker('persist-test', SAMPLE_STEPS);
    tracker = recordEvidence(tracker, 'vault-query', 'called');
    tracker = advanceStep(tracker);

    const filePath = persistTracker(tracker);

    expect(existsSync(filePath)).toBe(true);

    const loaded = loadTracker(tracker.runId);
    expect(loaded).not.toBeNull();
    expect(loaded!.skillName).toBe('persist-test');
    expect(loaded!.currentStep).toBe(1);
    expect(loaded!.evidence['vault-query'].value).toBe('called');
    expect(loaded!.steps).toEqual(SAMPLE_STEPS);
  });

  it('returns null for non-existent runId', () => {
    const result = loadTracker('does-not-exist-12345');
    expect(result).toBeNull();
  });

  it('creates skill-runs directory if missing', () => {
    const runsDir = join(tmpDir, '.soleri', 'skill-runs');
    expect(existsSync(runsDir)).toBe(false);

    const tracker = createTracker('dir-test', SAMPLE_STEPS);
    persistTracker(tracker);

    expect(existsSync(runsDir)).toBe(true);
  });

  it('returns null for corrupted JSON', () => {
    const runsDir = join(tmpDir, '.soleri', 'skill-runs');
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, 'bad-run.json'), '{ invalid json', 'utf-8');

    const result = loadTracker('bad-run');
    expect(result).toBeNull();
  });
});
