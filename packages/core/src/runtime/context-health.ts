/**
 * Context Health Monitor — tracks tool call volume and estimates
 * context window fill to recommend proactive session captures.
 *
 * Heuristic: tool calls x average payload size x 1.5 overhead factor.
 * Assumes ~200K token context window for fill estimation.
 *
 * Also integrates with CompactionPolicy to trigger session rotation
 * when policy thresholds are breached.
 */

import type {
  CompactionPolicy,
  CompactionResult,
  SessionState,
} from '../session/compaction-policy.js';
import { shouldCompact } from '../session/compaction-evaluator.js';

// =============================================================================
// TYPES
// =============================================================================

export type HealthLevel = 'green' | 'yellow' | 'red';

export interface ContextHealthStatus {
  level: HealthLevel;
  estimatedFill: number; // 0.0 - 1.0
  toolCallCount: number;
  estimatedTokens: number;
  recommendation: string;
  /** When a compaction policy is set, this contains the evaluation result. */
  compaction?: CompactionResult;
}

export interface TrackEvent {
  type: string;
  payloadSize: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CONTEXT_WINDOW = 200_000;
const OVERHEAD_FACTOR = 1.5;
const YELLOW_THRESHOLD = 0.4;
const RED_THRESHOLD = 0.6;

const RECOMMENDATIONS: Record<HealthLevel, string> = {
  green: 'Context usage is healthy. No action needed.',
  yellow: 'Consider compacting context soon.',
  red: 'Session capture recommended before context degradation.',
};

// =============================================================================
// CONTEXT HEALTH MONITOR
// =============================================================================

export class ContextHealthMonitor {
  private toolCallCount = 0;
  private totalPayloadSize = 0;
  private compactionPolicy: CompactionPolicy | undefined;
  private sessionStartedAt: string | undefined;

  /**
   * Set the compaction policy and session start time.
   * When set, `check()` will evaluate compaction thresholds.
   */
  setCompactionPolicy(policy: CompactionPolicy, startedAt?: string): void {
    this.compactionPolicy = policy;
    this.sessionStartedAt = startedAt ?? new Date().toISOString();
  }

  /** Track a tool call event. */
  track(event: TrackEvent): void {
    this.toolCallCount += 1;
    this.totalPayloadSize += event.payloadSize;
  }

  /** Check current context health status (including compaction policy). */
  check(): ContextHealthStatus {
    const estimatedTokens = Math.round(this.totalPayloadSize * OVERHEAD_FACTOR);
    const estimatedFill = Math.min(estimatedTokens / CONTEXT_WINDOW, 1.0);
    const level = this.classifyLevel(estimatedFill);

    const status: ContextHealthStatus = {
      level,
      estimatedFill: Math.round(estimatedFill * 1000) / 1000,
      toolCallCount: this.toolCallCount,
      estimatedTokens,
      recommendation: RECOMMENDATIONS[level],
    };

    // Evaluate compaction policy if configured
    if (this.compactionPolicy && this.sessionStartedAt) {
      const session: SessionState = {
        runCount: this.toolCallCount,
        inputTokens: estimatedTokens,
        startedAt: this.sessionStartedAt,
      };
      status.compaction = shouldCompact(session, this.compactionPolicy);

      // Escalate recommendation when compaction is triggered
      if (status.compaction.compact) {
        status.recommendation = `Compaction triggered: ${status.compaction.reason}`;
      }
    }

    return status;
  }

  /** Reset all tracking (on session clear). */
  reset(): void {
    this.toolCallCount = 0;
    this.totalPayloadSize = 0;
  }

  private classifyLevel(fill: number): HealthLevel {
    if (fill >= RED_THRESHOLD) return 'red';
    if (fill >= YELLOW_THRESHOLD) return 'yellow';
    return 'green';
  }
}
