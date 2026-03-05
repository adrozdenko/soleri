/**
 * In-memory telemetry tracker for facade calls.
 *
 * No external deps — records calls, computes stats, bounds memory usage.
 * Max 10 000 entries; auto-trims to 5 000 when limit is hit.
 */

export interface FacadeCall {
  facade: string;
  op: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface TelemetryStats {
  totalCalls: number;
  successRate: number;
  avgDurationMs: number;
  callsByFacade: Record<string, number>;
  callsByOp: Record<string, number>;
  errorsByOp: Record<string, number>;
  slowestOps: Array<{ op: string; avgMs: number }>;
  since: number;
}

const MAX_ENTRIES = 10_000;
const TRIM_TO = 5_000;

export class Telemetry {
  private calls: FacadeCall[] = [];
  private startedAt = Date.now();

  /**
   * Record a facade call. Timestamp is auto-set to Date.now().
   */
  record(call: Omit<FacadeCall, 'timestamp'>): void {
    this.calls.push({ ...call, timestamp: Date.now() });
    if (this.calls.length > MAX_ENTRIES) {
      this.calls = this.calls.slice(-TRIM_TO);
    }
  }

  /**
   * Compute aggregate stats from all recorded calls.
   */
  getStats(): TelemetryStats {
    const total = this.calls.length;
    if (total === 0) {
      return {
        totalCalls: 0,
        successRate: 1,
        avgDurationMs: 0,
        callsByFacade: {},
        callsByOp: {},
        errorsByOp: {},
        slowestOps: [],
        since: this.startedAt,
      };
    }

    const successes = this.calls.filter((c) => c.success).length;
    const totalDuration = this.calls.reduce((sum, c) => sum + c.durationMs, 0);

    const callsByFacade: Record<string, number> = {};
    const callsByOp: Record<string, number> = {};
    const errorsByOp: Record<string, number> = {};
    const durationsByOp: Record<string, number[]> = {};

    for (const call of this.calls) {
      callsByFacade[call.facade] = (callsByFacade[call.facade] ?? 0) + 1;
      callsByOp[call.op] = (callsByOp[call.op] ?? 0) + 1;

      if (!call.success) {
        errorsByOp[call.op] = (errorsByOp[call.op] ?? 0) + 1;
      }

      if (!durationsByOp[call.op]) durationsByOp[call.op] = [];
      durationsByOp[call.op].push(call.durationMs);
    }

    // Compute slowest ops by average duration, top 10
    const opAvgDurations = Object.entries(durationsByOp)
      .map(([op, durations]) => ({
        op,
        avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 10);

    return {
      totalCalls: total,
      successRate: Math.round((successes / total) * 1000) / 1000,
      avgDurationMs: Math.round(totalDuration / total),
      callsByFacade,
      callsByOp,
      errorsByOp,
      slowestOps: opAvgDurations,
      since: this.startedAt,
    };
  }

  /**
   * Get the N most recent calls, newest first.
   */
  getRecent(limit = 50): FacadeCall[] {
    return this.calls.slice(-limit).reverse();
  }

  /**
   * Clear all recorded data and reset the start timestamp.
   */
  reset(): void {
    this.calls = [];
    this.startedAt = Date.now();
  }
}
