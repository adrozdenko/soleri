/**
 * Result aggregator — merges results from multiple parallel subagent
 * executions into a single summary.
 */

import type { AggregatedResult, SubagentResult } from './types.js';

export function aggregate(results: SubagentResult[]): AggregatedResult {
  if (results.length === 0) {
    return {
      status: 'all-passed',
      totalTasks: 0,
      completed: 0,
      failed: 0,
      totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      filesChanged: [],
      combinedSummary: '',
      durationMs: 0,
      results: [],
    };
  }

  const completed = results.filter((r) => r.exitCode === 0).length;
  const failed = results.length - completed;

  const status: AggregatedResult['status'] =
    failed === 0 ? 'all-passed' : completed === 0 ? 'all-failed' : 'partial';

  const totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  for (const r of results) {
    totalUsage.inputTokens += r.usage?.inputTokens ?? 0;
    totalUsage.outputTokens += r.usage?.outputTokens ?? 0;
    totalUsage.totalTokens += r.usage?.totalTokens ?? 0;
  }

  const fileSet = new Set<string>();
  for (const r of results) {
    if (r.filesChanged) {
      for (const f of r.filesChanged) fileSet.add(f);
    }
  }

  const combinedSummary = results
    .filter((r) => r.summary)
    .map((r) => `[${r.taskId}] ${r.summary}`)
    .join('\n');

  // Parallel wall-clock: max of all durations
  const durationMs = Math.max(...results.map((r) => r.durationMs));

  return {
    status,
    totalTasks: results.length,
    completed,
    failed,
    totalUsage,
    filesChanged: [...fileSet],
    combinedSummary,
    durationMs,
    results,
  };
}
