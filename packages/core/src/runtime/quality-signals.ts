/**
 * Quality Signals — analyze evidence reports for rework patterns and clean execution.
 *
 * Extracts anti-patterns (high rework), clean tasks (first-pass success),
 * and scope creep signals from evidence reports. Captures findings to vault
 * and feeds brain feedback. Best-effort — never throws.
 */

import type { EvidenceReport } from '../planning/evidence-collector.js';
import type { Plan } from '../planning/planner.js';
import type { Vault } from '../vault/vault.js';
import type { Brain } from '../brain/brain.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualitySignal {
  taskId: string;
  taskTitle: string;
  kind: 'anti-pattern' | 'clean' | 'scope-creep';
  fixIterations: number;
  verdict: string;
}

export interface QualityAnalysis {
  antiPatterns: QualitySignal[];
  cleanTasks: QualitySignal[];
  scopeCreep: QualitySignal[];
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Tasks with this many or more fix iterations are flagged as anti-patterns. */
const REWORK_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze an evidence report for quality signals.
 *
 * - fixIterations >= 2 → anti-pattern (rework)
 * - fixIterations === 0 + verdict DONE → clean (first-pass success)
 * - unplannedChanges → scope-creep signals
 */
export function analyzeQualitySignals(
  report: EvidenceReport,
  _plan?: Plan | null,
): QualityAnalysis {
  const antiPatterns: QualitySignal[] = [];
  const cleanTasks: QualitySignal[] = [];
  const scopeCreep: QualitySignal[] = [];

  for (const te of report.taskEvidence) {
    const iterations = te.fixIterations ?? 0;

    if (iterations >= REWORK_THRESHOLD) {
      antiPatterns.push({
        taskId: te.taskId,
        taskTitle: te.taskTitle,
        kind: 'anti-pattern',
        fixIterations: iterations,
        verdict: te.verdict,
      });
    } else if (iterations === 0 && te.verdict === 'DONE') {
      cleanTasks.push({
        taskId: te.taskId,
        taskTitle: te.taskTitle,
        kind: 'clean',
        fixIterations: 0,
        verdict: te.verdict,
      });
    }
  }

  // Unplanned changes signal scope creep
  for (const uc of report.unplannedChanges) {
    scopeCreep.push({
      taskId: 'unplanned',
      taskTitle: uc.file.path,
      kind: 'scope-creep',
      fixIterations: 0,
      verdict: uc.possibleReason,
    });
  }

  return { antiPatterns, cleanTasks, scopeCreep };
}

// ---------------------------------------------------------------------------
// Capture to vault + brain
// ---------------------------------------------------------------------------

/**
 * Persist quality signals to vault (anti-patterns) and brain (feedback).
 * Deduplicates anti-patterns via vault search before adding.
 * Best-effort — swallows all errors.
 */
export function captureQualitySignals(
  analysis: QualityAnalysis,
  vault: Vault,
  brain: Brain,
  planId: string,
): { captured: number; skipped: number; feedback: number } {
  let captured = 0;
  let skipped = 0;
  let feedback = 0;

  // Capture anti-patterns to vault (dedup first)
  for (const ap of analysis.antiPatterns) {
    try {
      const query = `rework fix-trail ${ap.taskTitle}`;
      const existing = vault.search(query, { type: 'anti-pattern', limit: 3 });
      const isDuplicate = existing.some((r) => r.score > 0.7);

      if (isDuplicate) {
        skipped++;
        continue;
      }

      const severity = ap.fixIterations > 4 ? 'critical' : 'warning';
      const entry: IntelligenceEntry = {
        id: `qs-ap-${planId}-${ap.taskId}-${Date.now()}`,
        type: 'anti-pattern',
        domain: 'engineering',
        title: `Rework detected: ${ap.taskTitle}`,
        severity,
        description:
          `Task "${ap.taskTitle}" required ${ap.fixIterations} fix iterations ` +
          `(threshold: ${REWORK_THRESHOLD}). Investigate root cause — ` +
          `unclear requirements, missing tests, or incomplete understanding.`,
        tags: ['rework', 'fix-trail', 'auto-captured'],
        origin: 'agent',
      };

      vault.add(entry);
      captured++;
    } catch {
      // Best-effort — skip this signal
    }
  }

  // Record negative brain feedback for rework tasks
  for (const ap of analysis.antiPatterns) {
    try {
      brain.recordFeedback({
        query: ap.taskTitle,
        entryId: planId,
        action: 'dismissed',
        confidence: 0.7,
        source: 'evidence-quality',
        reason: `Task needed ${ap.fixIterations} fix iterations — high rework`,
        context: JSON.stringify({
          taskId: ap.taskId,
          reworkCount: ap.fixIterations,
          verdict: ap.verdict,
        }),
      });
      feedback++;
    } catch {
      // Best-effort
    }
  }

  // Record positive brain feedback for clean tasks
  for (const ct of analysis.cleanTasks) {
    try {
      brain.recordFeedback({
        query: ct.taskTitle,
        entryId: planId,
        action: 'accepted',
        confidence: 0.9,
        source: 'evidence-quality',
        reason: 'Clean first-try completion — no rework needed',
      });
      feedback++;
    } catch {
      // Best-effort
    }
  }

  return { captured, skipped, feedback };
}

// ---------------------------------------------------------------------------
// Fix-trail summary for knowledge extraction
// ---------------------------------------------------------------------------

/**
 * Build a human-readable fix-trail summary from an evidence report.
 * Returns `undefined` when no tasks had rework iterations.
 */
export function buildFixTrailSummary(report: EvidenceReport): string | undefined {
  const entries = report.taskEvidence
    .filter((te) => (te.fixIterations ?? 0) > 0)
    .map((te) => `${te.taskTitle}: ${te.fixIterations} fix iterations`);

  return entries.length > 0 ? entries.join('; ') : undefined;
}
