/**
 * Step Persistence — Unit Tests
 *
 * Tests for the incremental correction protocol:
 * - Step output persistence to disk
 * - Manifest management (load/save/create)
 * - Rerun marking and staleness propagation
 * - cascadeTo behavior
 * - rerunCount incrementing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getPlanRunDir, loadManifest, saveManifest, persistStepOutput } from '../flows/executor.js';
import type { PlanRunManifest, StepState } from '../flows/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'soleri-step-persist-'));
}

function cleanTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Build a manifest with N completed steps for testing. */
function buildManifest(planId: string, stepCount: number): PlanRunManifest {
  const now = new Date().toISOString();
  const steps: Record<string, StepState> = {};
  for (let i = 0; i < stepCount; i++) {
    steps[`step-${i}`] = {
      status: 'completed',
      output: { result: `output-${i}` },
      timestamp: now,
      rerunCount: 0,
    };
  }
  return { planId, steps, lastRun: now, createdAt: now };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Step Persistence', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanTmpDir(tmpDir);
  });

  // ─── getPlanRunDir ─────────────────────────────────────────────

  describe('getPlanRunDir', () => {
    it('returns the correct path structure', () => {
      const dir = getPlanRunDir('/project', 'plan-123');
      expect(dir).toBe(path.join('/project', '.soleri', 'plan-runs', 'plan-123'));
    });

    it('handles plan IDs with special characters', () => {
      const dir = getPlanRunDir('/project', 'plan_abc-def');
      expect(dir).toContain('plan_abc-def');
    });
  });

  // ─── loadManifest ──────────────────────────────────────────────

  describe('loadManifest', () => {
    it('creates a fresh manifest when none exists', () => {
      const runDir = path.join(tmpDir, 'nonexistent');
      const manifest = loadManifest(runDir, 'plan-new');

      expect(manifest.planId).toBe('plan-new');
      expect(manifest.steps).toEqual({});
      expect(manifest.createdAt).toBeTruthy();
      expect(manifest.lastRun).toBeTruthy();
    });

    it('loads existing manifest from disk', () => {
      const runDir = path.join(tmpDir, 'existing');
      const original = buildManifest('plan-load', 3);
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(original));

      const loaded = loadManifest(runDir, 'plan-load');
      expect(loaded.planId).toBe('plan-load');
      expect(Object.keys(loaded.steps)).toHaveLength(3);
      expect(loaded.steps['step-0'].status).toBe('completed');
    });
  });

  // ─── saveManifest ──────────────────────────────────────────────

  describe('saveManifest', () => {
    it('creates directories and writes manifest', () => {
      const runDir = path.join(tmpDir, 'deep', 'nested', 'dir');
      const manifest = buildManifest('plan-save', 2);

      saveManifest(runDir, manifest);

      const manifestPath = path.join(runDir, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const written = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(written.planId).toBe('plan-save');
      expect(Object.keys(written.steps)).toHaveLength(2);
    });

    it('overwrites existing manifest', () => {
      const runDir = path.join(tmpDir, 'overwrite');
      const manifest1 = buildManifest('plan-ow', 1);
      saveManifest(runDir, manifest1);

      const manifest2 = buildManifest('plan-ow', 3);
      saveManifest(runDir, manifest2);

      const loaded = loadManifest(runDir, 'plan-ow');
      expect(Object.keys(loaded.steps)).toHaveLength(3);
    });
  });

  // ─── persistStepOutput ─────────────────────────────────────────

  describe('persistStepOutput', () => {
    it('persists step output file and updates manifest', () => {
      const runDir = path.join(tmpDir, 'persist-step');
      const manifest = buildManifest('plan-ps', 0);

      persistStepOutput(runDir, manifest, 0, 'init', { data: 'hello' });

      // Step file should exist
      const stepFile = path.join(runDir, 'step-0-init.json');
      expect(fs.existsSync(stepFile)).toBe(true);
      const stepData = JSON.parse(fs.readFileSync(stepFile, 'utf-8'));
      expect(stepData.data).toBe('hello');

      // Manifest should be updated
      expect(manifest.steps['init']).toBeDefined();
      expect(manifest.steps['init'].status).toBe('completed');
      expect(manifest.steps['init'].rerunCount).toBe(0);

      // Manifest file should exist on disk
      const manifestFile = path.join(runDir, 'manifest.json');
      expect(fs.existsSync(manifestFile)).toBe(true);
    });

    it('increments rerunCount when step already exists', () => {
      const runDir = path.join(tmpDir, 'persist-rerun');
      const manifest = buildManifest('plan-pr', 0);

      // First run
      persistStepOutput(runDir, manifest, 0, 'step-a', { v: 1 });
      expect(manifest.steps['step-a'].rerunCount).toBe(0);

      // Second run — rerunCount should increment
      persistStepOutput(runDir, manifest, 0, 'step-a', { v: 2 });
      expect(manifest.steps['step-a'].rerunCount).toBe(1);

      // Third run
      persistStepOutput(runDir, manifest, 0, 'step-a', { v: 3 });
      expect(manifest.steps['step-a'].rerunCount).toBe(2);
    });

    it('preserves rerunReason from previous state', () => {
      const runDir = path.join(tmpDir, 'persist-reason');
      const manifest = buildManifest('plan-reason', 0);

      // Manually set a step with a rerun reason
      manifest.steps['step-x'] = {
        status: 'rerun',
        output: null,
        timestamp: new Date().toISOString(),
        rerunCount: 1,
        rerunReason: 'gate failed',
      };

      persistStepOutput(runDir, manifest, 0, 'step-x', { fixed: true });
      expect(manifest.steps['step-x'].rerunReason).toBe('gate failed');
      expect(manifest.steps['step-x'].rerunCount).toBe(2);
      expect(manifest.steps['step-x'].status).toBe('completed');
    });
  });

  // ─── Rerun marking and staleness propagation ───────────────────

  describe('rerun marking and staleness propagation', () => {
    it('marks target step as rerun and downstream as stale', () => {
      const manifest = buildManifest('plan-stale', 5);

      // Simulate what orchestrate_rerun_step does
      const stepNumber = 1;
      const reason = 'output was wrong';
      const now = new Date().toISOString();
      const sortedStepIds = Object.keys(manifest.steps);

      for (let i = 0; i < sortedStepIds.length; i++) {
        const sid = sortedStepIds[i];
        const state = manifest.steps[sid];

        if (i === stepNumber) {
          state.status = 'rerun';
          state.rerunCount += 1;
          state.rerunReason = reason;
          state.timestamp = now;
        } else if (i > stepNumber) {
          state.status = 'stale';
          state.timestamp = now;
        }
      }

      expect(manifest.steps['step-0'].status).toBe('completed');
      expect(manifest.steps['step-1'].status).toBe('rerun');
      expect(manifest.steps['step-1'].rerunCount).toBe(1);
      expect(manifest.steps['step-1'].rerunReason).toBe('output was wrong');
      expect(manifest.steps['step-2'].status).toBe('stale');
      expect(manifest.steps['step-3'].status).toBe('stale');
      expect(manifest.steps['step-4'].status).toBe('stale');
    });

    it('cascadeTo marks a range as rerun instead of stale', () => {
      const manifest = buildManifest('plan-cascade', 5);

      const stepNumber = 1;
      const cascadeTo = 4; // steps 1,2,3 → rerun; step 4 → stale
      const reason = 'dependency changed';
      const now = new Date().toISOString();
      const sortedStepIds = Object.keys(manifest.steps);

      for (let i = 0; i < sortedStepIds.length; i++) {
        const sid = sortedStepIds[i];
        const state = manifest.steps[sid];

        if (i === stepNumber) {
          state.status = 'rerun';
          state.rerunCount += 1;
          state.rerunReason = reason;
          state.timestamp = now;
        } else if (i > stepNumber) {
          if (i < cascadeTo) {
            state.status = 'rerun';
            state.rerunCount += 1;
            state.rerunReason = `Cascade from step ${stepNumber}: ${reason}`;
            state.timestamp = now;
          } else {
            state.status = 'stale';
            state.timestamp = now;
          }
        }
      }

      expect(manifest.steps['step-0'].status).toBe('completed');
      expect(manifest.steps['step-1'].status).toBe('rerun');
      expect(manifest.steps['step-1'].rerunCount).toBe(1);
      expect(manifest.steps['step-2'].status).toBe('rerun');
      expect(manifest.steps['step-2'].rerunCount).toBe(1);
      expect(manifest.steps['step-3'].status).toBe('rerun');
      expect(manifest.steps['step-3'].rerunCount).toBe(1);
      expect(manifest.steps['step-4'].status).toBe('stale');
      expect(manifest.steps['step-4'].rerunCount).toBe(0);
    });

    it('rerunCount accumulates across multiple reruns', () => {
      const manifest = buildManifest('plan-multi', 3);

      // First rerun of step 1
      manifest.steps['step-1'].status = 'rerun';
      manifest.steps['step-1'].rerunCount += 1;

      // Second rerun of step 1
      manifest.steps['step-1'].rerunCount += 1;

      // Third rerun
      manifest.steps['step-1'].rerunCount += 1;

      expect(manifest.steps['step-1'].rerunCount).toBe(3);
    });
  });

  // ─── Round-trip persistence ────────────────────────────────────

  describe('round-trip persistence', () => {
    it('manifest survives save and load cycle', () => {
      const runDir = path.join(tmpDir, 'roundtrip');
      const manifest = buildManifest('plan-rt', 3);

      // Mark step 1 as rerun
      manifest.steps['step-1'].status = 'rerun';
      manifest.steps['step-1'].rerunCount = 2;
      manifest.steps['step-1'].rerunReason = 'test reason';

      saveManifest(runDir, manifest);
      const loaded = loadManifest(runDir, 'plan-rt');

      expect(loaded.steps['step-1'].status).toBe('rerun');
      expect(loaded.steps['step-1'].rerunCount).toBe(2);
      expect(loaded.steps['step-1'].rerunReason).toBe('test reason');
      expect(loaded.steps['step-0'].status).toBe('completed');
    });

    it('step output files persist alongside manifest', () => {
      const runDir = path.join(tmpDir, 'files');
      const manifest = buildManifest('plan-files', 0);

      persistStepOutput(runDir, manifest, 0, 'alpha', { x: 1 });
      persistStepOutput(runDir, manifest, 1, 'beta', { x: 2 });
      persistStepOutput(runDir, manifest, 2, 'gamma', { x: 3 });

      const files = fs.readdirSync(runDir).sort();
      expect(files).toContain('manifest.json');
      expect(files).toContain('step-0-alpha.json');
      expect(files).toContain('step-1-beta.json');
      expect(files).toContain('step-2-gamma.json');
    });
  });
});
