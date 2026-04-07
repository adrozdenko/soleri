import { describe, it, expect } from 'vitest';
import { aggregate } from './result-aggregator.js';
import type { SubagentResult } from './types.js';

function makeResult(overrides: Partial<SubagentResult> & { taskId: string }): SubagentResult {
  return {
    status: 'completed',
    exitCode: 0,
    durationMs: 100,
    ...overrides,
  };
}

describe('aggregate', () => {
  it('returns all-passed with zeroes for empty input', () => {
    const result = aggregate([]);
    expect(result.status).toBe('all-passed');
    expect(result.totalTasks).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.totalUsage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    expect(result.filesChanged).toEqual([]);
    expect(result.combinedSummary).toBe('');
    expect(result.durationMs).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('returns all-passed when every task succeeds', () => {
    const results = [
      makeResult({ taskId: 'a', exitCode: 0 }),
      makeResult({ taskId: 'b', exitCode: 0 }),
    ];
    const agg = aggregate(results);
    expect(agg.status).toBe('all-passed');
    expect(agg.totalTasks).toBe(2);
    expect(agg.completed).toBe(2);
    expect(agg.failed).toBe(0);
  });

  it('returns all-failed when every task fails', () => {
    const results = [
      makeResult({ taskId: 'a', exitCode: 1, status: 'failed' }),
      makeResult({ taskId: 'b', exitCode: 2, status: 'failed' }),
    ];
    const agg = aggregate(results);
    expect(agg.status).toBe('all-failed');
    expect(agg.completed).toBe(0);
    expect(agg.failed).toBe(2);
  });

  it('returns partial when some tasks fail', () => {
    const results = [
      makeResult({ taskId: 'a', exitCode: 0 }),
      makeResult({ taskId: 'b', exitCode: 1, status: 'failed' }),
    ];
    const agg = aggregate(results);
    expect(agg.status).toBe('partial');
    expect(agg.completed).toBe(1);
    expect(agg.failed).toBe(1);
  });

  it('sums token usage across results', () => {
    const results = [
      makeResult({
        taskId: 'a',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
      makeResult({
        taskId: 'b',
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      }),
    ];
    const agg = aggregate(results);
    expect(agg.totalUsage).toEqual({
      inputTokens: 300,
      outputTokens: 150,
      totalTokens: 450,
    });
  });

  it('handles results with no usage gracefully', () => {
    const results = [
      makeResult({ taskId: 'a' }),
      makeResult({ taskId: 'b', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }),
    ];
    const agg = aggregate(results);
    expect(agg.totalUsage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it('deduplicates files changed across results', () => {
    const results = [
      makeResult({ taskId: 'a', filesChanged: ['file1.ts', 'file2.ts'] }),
      makeResult({ taskId: 'b', filesChanged: ['file2.ts', 'file3.ts'] }),
    ];
    const agg = aggregate(results);
    expect(agg.filesChanged.sort()).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
  });

  it('handles results with no filesChanged', () => {
    const results = [
      makeResult({ taskId: 'a' }),
      makeResult({ taskId: 'b', filesChanged: ['file1.ts'] }),
    ];
    const agg = aggregate(results);
    expect(agg.filesChanged).toEqual(['file1.ts']);
  });

  it('combines summaries with task ID prefix', () => {
    const results = [
      makeResult({ taskId: 'task-1', summary: 'Did thing A' }),
      makeResult({ taskId: 'task-2', summary: 'Did thing B' }),
    ];
    const agg = aggregate(results);
    expect(agg.combinedSummary).toBe('[task-1] Did thing A\n[task-2] Did thing B');
  });

  it('skips results without summaries in combined output', () => {
    const results = [
      makeResult({ taskId: 'task-1', summary: 'Did thing A' }),
      makeResult({ taskId: 'task-2' }),
    ];
    const agg = aggregate(results);
    expect(agg.combinedSummary).toBe('[task-1] Did thing A');
  });

  it('uses max duration as wall-clock time (parallel model)', () => {
    const results = [
      makeResult({ taskId: 'a', durationMs: 100 }),
      makeResult({ taskId: 'b', durationMs: 500 }),
      makeResult({ taskId: 'c', durationMs: 300 }),
    ];
    const agg = aggregate(results);
    expect(agg.durationMs).toBe(500);
  });

  it('preserves original results array', () => {
    const results = [makeResult({ taskId: 'a' }), makeResult({ taskId: 'b' })];
    const agg = aggregate(results);
    expect(agg.results).toBe(results);
  });
});
