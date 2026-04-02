/**
 * Skill step tracker — converts skills from suggestions to enforceable protocols.
 * Persists step state to .soleri/skill-runs/ for context compaction survival.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvidenceType = 'tool_called' | 'file_exists';

export interface SkillStep {
  id: string;
  description: string;
  evidence: EvidenceType;
}

export interface StepEvidence {
  type: EvidenceType;
  value: string;
  timestamp: string;
  verified: boolean;
}

export interface SkillStepTracker {
  skillName: string;
  runId: string;
  steps: SkillStep[];
  currentStep: number;
  startedAt: string;
  evidence: Record<string, StepEvidence>;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTracker(skillName: string, steps: SkillStep[]): SkillStepTracker {
  return {
    skillName,
    runId: `${skillName}-${Date.now()}`,
    steps,
    currentStep: 0,
    startedAt: new Date().toISOString(),
    evidence: {},
  };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export function advanceStep(tracker: SkillStepTracker): SkillStepTracker {
  if (tracker.currentStep < tracker.steps.length - 1) {
    return { ...tracker, currentStep: tracker.currentStep + 1 };
  }
  return { ...tracker, completedAt: new Date().toISOString() };
}

export function recordEvidence(
  tracker: SkillStepTracker,
  stepId: string,
  value: string,
  verified: boolean = true,
): SkillStepTracker {
  const step = tracker.steps.find((s) => s.id === stepId);
  if (!step) return tracker;

  return {
    ...tracker,
    evidence: {
      ...tracker.evidence,
      [stepId]: {
        type: step.evidence,
        value,
        timestamp: new Date().toISOString(),
        verified,
      },
    },
  };
}

export function generateCheckpoint(tracker: SkillStepTracker): string {
  const completed = tracker.steps
    .filter((s) => tracker.evidence[s.id]?.verified)
    .map((s) => `${s.id} ✓`);

  const current = tracker.steps[tracker.currentStep];
  const total = tracker.steps.length;
  const completedCount = completed.length;

  const lines = [
    `--- Skill Checkpoint: ${tracker.skillName} ---`,
    `Completed: ${completed.length > 0 ? completed.join(', ') : 'none'}`,
    `Current: ${current ? `${current.id} (step ${tracker.currentStep + 1} of ${total})` : 'all done'}`,
  ];

  if (current) {
    lines.push(`Evidence required: ${current.evidence} → ${current.description}`);
  }

  lines.push(`Progress: ${completedCount}/${total}`, '---');
  return lines.join('\n');
}

export interface CompletionResult {
  complete: boolean;
  skippedSteps: string[];
  evidenceCount: number;
  totalSteps: number;
}

export function validateCompletion(tracker: SkillStepTracker): CompletionResult {
  const skippedSteps = tracker.steps
    .filter((s) => !tracker.evidence[s.id]?.verified)
    .map((s) => s.id);

  return {
    complete: skippedSteps.length === 0,
    skippedSteps,
    evidenceCount: Object.keys(tracker.evidence).length,
    totalSteps: tracker.steps.length,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function getRunsDir(): string {
  return join(homedir(), '.soleri', 'skill-runs');
}

export function persistTracker(tracker: SkillStepTracker): string {
  const dir = getRunsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${tracker.runId}.json`);
  writeFileSync(filePath, JSON.stringify(tracker, null, 2), 'utf-8');
  return filePath;
}

export function loadTracker(runId: string): SkillStepTracker | null {
  const filePath = join(getRunsDir(), `${runId}.json`);
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as SkillStepTracker;
  } catch {
    return null;
  }
}
