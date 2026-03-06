/**
 * Loop manager — iterative validation loop state tracking with
 * output scanning and gate decision system.
 *
 * Ported from Salvador's loop.facade.ts with:
 * - Promise tag extraction (<promise>...</promise>)
 * - 5-tier heuristic completion detection
 * - Gate decision pattern (allow/block) for Stop hook integration
 * - Knowledge tracking for brain session recording
 *
 * Session-scoped (in-memory). Persistence is optional via external store.
 */

import type {
  LoopConfig,
  LoopIteration,
  LoopMode,
  LoopState,
  LoopKnowledge,
  LoopHistoryEntry,
  LoopIterateDecision,
} from './types.js';

// ─── Grade ordering for plan-iteration mode ──────────────────────
const GRADE_ORDER = ['A+', 'A', 'B', 'C', 'D', 'F'];

// ─── Output Scanning ─────────────────────────────────────────────

/**
 * Extract text between <promise>...</promise> tags from output.
 * Ported from Salvador's extractPromise.
 */
export function extractPromise(text: string): string | null {
  const match = /<promise>([\s\S]*?)<\/promise>/.exec(text);
  if (!match) return null;
  return match[1].trim().replace(/\s+/g, ' ');
}

/**
 * 5-tier heuristic completion detection.
 * Returns a reason string if completion is detected, null otherwise.
 * Ported from Salvador's detectImplicitCompletion.
 *
 * Tiers:
 * 1. Validation tool score (token-migration, component-build)
 * 2. Contrast mode — all PASS, no FAIL
 * 3. Plan mode — grade meets target
 * 4. Completion language + file modification signals (requires BOTH)
 * 5. Test pass signals
 */
export function detectImplicitCompletion(lastOutput: string, config: LoopConfig): string | null {
  const text = lastOutput;

  // 1. Validation tool score (token-migration, component-build)
  if (config.mode === 'token-migration' || config.mode === 'component-build') {
    const scoreMatch = /"score"\s*:\s*(\d+(?:\.\d+)?)/.exec(text);
    if (scoreMatch) {
      const score = parseFloat(scoreMatch[1]);
      const target = config.targetScore ?? (config.mode === 'token-migration' ? 95 : 90);
      if (score >= target) {
        return `Auto-detected: validation score ${score} >= target ${target}`;
      }
    }
  }

  // 2. Contrast mode — all PASS, no FAIL
  if (config.mode === 'contrast-fix') {
    const hasPass = /\bPASS\b/i.test(text);
    const hasFail = /\bFAIL\b/i.test(text);
    if (hasPass && !hasFail) {
      return 'Auto-detected: all contrast checks PASS, no FAIL';
    }
  }

  // 3. Plan mode — grade meets target
  if (config.mode === 'plan-iteration') {
    const gradeMatch = /"grade"\s*:\s*"([A-F][+-]?)"/.exec(text);
    if (gradeMatch) {
      const grade = gradeMatch[1];
      const target = config.targetGrade ?? 'A';
      const gradeIdx = GRADE_ORDER.indexOf(grade);
      const targetIdx = GRADE_ORDER.indexOf(target);
      if (gradeIdx >= 0 && targetIdx >= 0 && gradeIdx <= targetIdx) {
        return `Auto-detected: plan grade ${grade} >= target ${target}`;
      }
    }
  }

  // 4. Completion language + file modification signals (requires BOTH)
  const completionPhrases =
    /\b(task complete|implementation finished|implementation complete|work complete|all done|changes complete|finished implementing|done implementing)\b/i;
  const fileModPhrases =
    /\b(file modified|wrote to|saved to|created file|updated file|edited file|changes written)\b/i;
  if (completionPhrases.test(text) && fileModPhrases.test(text)) {
    return 'Auto-detected: completion language with file modification evidence';
  }

  // 5. Test pass signals
  const testPass =
    /(\d+)\s+tests?\s+passed[,\s]+0\s+fail/i.test(text) ||
    /\ball\s+tests?\s+(passing|passed)\b/i.test(text);
  if (testPass) {
    return 'Auto-detected: test suite passing';
  }

  return null;
}

// ─── Anomaly Detection ──────────────────────────────────────────

/**
 * Minimum expected duration (ms) per mode.
 * Iterations finishing faster than this with low scores are flagged as anomalous.
 */
const MIN_DURATION_MS: Record<LoopMode, number> = {
  'token-migration': 5000,
  'contrast-fix': 2000,
  'component-build': 5000,
  'plan-iteration': 3000,
  custom: 0,
};

/**
 * Detect anomalous loop iteration patterns.
 * Flags fast + low-score combos that suggest the agent is spinning without making progress.
 */
export function detectAnomaly(iteration: LoopIteration, mode: LoopMode): string | null {
  const minDuration = MIN_DURATION_MS[mode];
  if (minDuration === 0) return null; // custom mode — no threshold

  const duration = iteration.durationMs ?? 0;
  const score = iteration.validationScore ?? 0;

  // Flag: iteration completed very fast with a low score
  if (duration > 0 && duration < minDuration && !iteration.passed && score < 50) {
    return `Anomaly: iteration ${iteration.iteration} completed in ${duration}ms (min expected: ${minDuration}ms) with score ${score} — possible no-op loop`;
  }

  return null;
}

// ─── LoopManager ─────────────────────────────────────────────────

export class LoopManager {
  private activeLoop: LoopState | null = null;
  private completedLoops: LoopState[] = [];
  private historyEntries: LoopHistoryEntry[] = [];

  /**
   * Start a new validation loop.
   * Throws if a loop is already active.
   */
  startLoop(config: LoopConfig): LoopState {
    if (this.activeLoop) {
      throw new Error(
        `Loop already active: ${this.activeLoop.id} (mode: ${this.activeLoop.config.mode}). ` +
          'Cancel or complete it first.',
      );
    }

    const loop: LoopState = {
      id: `loop-${Date.now()}`,
      config,
      iterations: [],
      status: 'active',
      startedAt: new Date().toISOString(),
    };

    this.activeLoop = loop;
    return loop;
  }

  /**
   * Record an iteration result on the active loop (simple API).
   * If the iteration passes, the loop status is NOT automatically changed —
   * call completeLoop() explicitly when validation is confirmed.
   * If max iterations reached and this iteration fails, status becomes 'max-iterations'.
   */
  iterate(result: {
    validationScore?: number;
    validationResult?: string;
    passed: boolean;
  }): LoopIteration {
    if (!this.activeLoop) {
      throw new Error('No active loop. Start one first.');
    }

    const iteration: LoopIteration = {
      iteration: this.activeLoop.iterations.length + 1,
      timestamp: new Date().toISOString(),
      validationScore: result.validationScore,
      validationResult: result.validationResult,
      passed: result.passed,
    };

    this.activeLoop.iterations.push(iteration);

    // Auto-transition to max-iterations if limit reached and not passing
    if (
      !result.passed &&
      this.activeLoop.iterations.length >= this.activeLoop.config.maxIterations
    ) {
      this.activeLoop.status = 'max-iterations';
      this.activeLoop.completedAt = new Date().toISOString();
      this.moveToHistory('max_iterations');
      this.completedLoops.push(this.activeLoop);
      this.activeLoop = null;
    }

    return iteration;
  }

  /**
   * Gate-based iteration — accepts LLM output and returns allow/block decision.
   * Ported from Salvador's loop_iterate handler.
   *
   * This is the primary method for Stop hook integration:
   * - Scans output for completion promise tags
   * - Runs 5-tier heuristic completion detection
   * - Returns 'block' with injected prompt/systemMessage for next iteration
   * - Returns 'allow' when loop ends (completed, max_iterations)
   *
   * @param lastOutput - The LLM's last response to scan for completion signals
   * @param knowledge - Optional knowledge items discovered during this iteration
   */
  iterateWithGate(
    lastOutput: string,
    knowledge?: LoopKnowledge,
    durationMs?: number,
  ): LoopIterateDecision {
    if (!this.activeLoop) {
      return { decision: 'allow', reason: 'No active loop' };
    }

    const config = this.activeLoop.config;

    // Accumulate knowledge
    if (knowledge) {
      if (!this.activeLoop.knowledge) {
        this.activeLoop.knowledge = {};
      }
      if (knowledge.items) {
        this.activeLoop.knowledge.items = [
          ...(this.activeLoop.knowledge.items ?? []),
          ...knowledge.items,
        ];
      }
      if (knowledge.patternsApplied) {
        this.activeLoop.knowledge.patternsApplied = [
          ...(this.activeLoop.knowledge.patternsApplied ?? []),
          ...knowledge.patternsApplied,
        ];
      }
      if (knowledge.antiPatternsAvoided) {
        this.activeLoop.knowledge.antiPatternsAvoided = [
          ...(this.activeLoop.knowledge.antiPatternsAvoided ?? []),
          ...knowledge.antiPatternsAvoided,
        ];
      }
    }

    // Check for completion promise
    if (config.completionPromise) {
      const promiseText = extractPromise(lastOutput);
      if (promiseText && promiseText === config.completionPromise) {
        const iterCount = this.activeLoop.iterations.length;
        this.activeLoop.status = 'completed';
        this.activeLoop.completedAt = new Date().toISOString();
        this.moveToHistory('completed');
        this.completedLoops.push(this.activeLoop);
        this.activeLoop = null;
        return {
          decision: 'allow',
          reason: `Loop completed — promise "${config.completionPromise}" detected`,
          outcome: 'completed',
          iteration: iterCount,
        };
      }
    }

    // Heuristic completion detection
    const autoReason = detectImplicitCompletion(lastOutput, config);
    if (autoReason) {
      const iterCount = this.activeLoop.iterations.length;
      this.activeLoop.status = 'completed';
      this.activeLoop.completedAt = new Date().toISOString();
      this.moveToHistory('completed');
      this.completedLoops.push(this.activeLoop);
      this.activeLoop = null;
      return {
        decision: 'allow',
        reason: autoReason,
        outcome: 'completed',
        iteration: iterCount,
        autoCompleted: true,
      };
    }

    // Check max iterations
    if (config.maxIterations > 0 && this.activeLoop.iterations.length >= config.maxIterations) {
      const iterCount = this.activeLoop.iterations.length;
      this.activeLoop.status = 'max-iterations';
      this.activeLoop.completedAt = new Date().toISOString();
      this.moveToHistory('max_iterations');
      this.completedLoops.push(this.activeLoop);
      this.activeLoop = null;
      return {
        decision: 'allow',
        reason: `Max iterations (${config.maxIterations}) reached`,
        outcome: 'max_iterations',
        iteration: iterCount,
      };
    }

    // Continue loop — increment iteration
    const nextIteration = this.activeLoop.iterations.length + 1;
    const iterationEntry: LoopIteration = {
      iteration: nextIteration,
      timestamp: new Date().toISOString(),
      passed: false,
      ...(durationMs !== undefined && { durationMs }),
    };
    this.activeLoop.iterations.push(iterationEntry);

    // Run anomaly detection
    const anomalyWarning = detectAnomaly(iterationEntry, config.mode);

    // Build validation hint for system message
    let validationHint = '';
    switch (config.mode) {
      case 'token-migration':
        validationHint = `Run validation (tokens check). Target: score >= ${config.targetScore ?? 95}`;
        break;
      case 'contrast-fix':
        validationHint = 'Run contrast check on all color pairs. Target: all PASS';
        break;
      case 'component-build':
        validationHint = `Run validation (full check). Target: score >= ${config.targetScore ?? 90}`;
        break;
      case 'plan-iteration':
        validationHint = `Run plan grading. Target: grade >= ${config.targetGrade ?? 'A'}`;
        break;
      case 'custom':
        validationHint = 'Complete the task and validate your work';
        break;
    }

    const maxDisplay = config.maxIterations > 0 ? String(config.maxIterations) : 'unlimited';
    const systemMessage =
      `[Loop — Iteration ${nextIteration}/${maxDisplay} | Mode: ${config.mode}] ${validationHint}` +
      (config.completionPromise
        ? ` | Output <promise>${config.completionPromise}</promise> ONLY when validation passes`
        : '');

    // Build full prompt with validation instructions
    const fullPrompt = config.validationInstructions
      ? `${config.prompt}\n\n${config.validationInstructions}`
      : config.prompt;

    return {
      decision: 'block',
      reason: fullPrompt,
      prompt: fullPrompt,
      systemMessage,
      iteration: nextIteration,
      ...(anomalyWarning && { anomalyWarning }),
    };
  }

  /**
   * Mark the active loop as completed (validation passed).
   */
  completeLoop(): LoopState {
    if (!this.activeLoop) {
      throw new Error('No active loop to complete.');
    }

    this.activeLoop.status = 'completed';
    this.activeLoop.completedAt = new Date().toISOString();
    const completed = this.activeLoop;
    this.moveToHistory('completed');
    this.completedLoops.push(completed);
    this.activeLoop = null;
    return completed;
  }

  /**
   * Cancel the active loop.
   */
  cancelLoop(): LoopState {
    if (!this.activeLoop) {
      throw new Error('No active loop to cancel.');
    }

    this.activeLoop.status = 'cancelled';
    this.activeLoop.completedAt = new Date().toISOString();
    const cancelled = this.activeLoop;
    this.moveToHistory('cancelled');
    this.completedLoops.push(cancelled);
    this.activeLoop = null;
    return cancelled;
  }

  /**
   * Get current loop status. Returns null if no active loop.
   */
  getStatus(): LoopState | null {
    return this.activeLoop;
  }

  /**
   * Get history of all completed/cancelled/max-iterations loops.
   */
  getHistory(): LoopState[] {
    return [...this.completedLoops];
  }

  /**
   * Get structured history entries (for brain session recording).
   */
  getHistoryEntries(): LoopHistoryEntry[] {
    return [...this.historyEntries];
  }

  /**
   * Check if a loop is currently active.
   */
  isActive(): boolean {
    return this.activeLoop !== null;
  }

  /**
   * Move active loop to history entries.
   */
  private moveToHistory(outcome: 'completed' | 'cancelled' | 'max_iterations'): void {
    if (!this.activeLoop) return;
    this.historyEntries.push({
      id: this.activeLoop.id,
      mode: this.activeLoop.config.mode,
      intent: this.activeLoop.config.intent,
      prompt: this.activeLoop.config.prompt,
      iterations: this.activeLoop.iterations.length,
      outcome,
      startedAt: this.activeLoop.startedAt,
      completedAt: this.activeLoop.completedAt ?? new Date().toISOString(),
    });
  }
}
