import { describe, it, expect } from 'vitest';
import { aggregate } from '../../subagent/result-aggregator.js';
import type { SubagentResult } from '../../subagent/types.js';

function makeResult(overrides: Partial<SubagentResult> & { taskId: string }): SubagentResult {
  return {
    status: overrides.exitCode === 0 ? 'completed' : 'failed',
    exitCode: 0,
    durationMs: 100,
    ...overrides,
  };
}

describe('aggregate()', () => {
  it('returns all-passed for all exitCode 0', () => {
    const results: SubagentResult[] = [
      makeResult({ taskId: 'a', exitCode: 0 }),
      makeResult({ taskId: 'b', exitCode: 0 }),
    ];
    const agg = aggregate(results);
    expect(agg.status).toBe('all-passed');
    expect(agg.completed).toBe(2);
    expect(agg.failed).toBe(0);
  });

  it('returns all-failed for all non-zero exitCodes', () => {
    const results: SubagentResult[] = [
      makeResult({ taskId: 'a', exitCode: 1, status: 'failed' }),
      makeResult({ taskId: 'b', exitCode: 1, status: 'failed' }),
    ];
    const agg = aggregate(results);
    expect(agg.status).toBe('all-failed');
    expect(agg.completed).toBe(0);
    expect(agg.failed).toBe(2);
  });

  it('returns partial for mixed results', () => {
    const results: SubagentResult[] = [
      makeResult({ taskId: 'a', exitCode: 0 }),
      makeResult({ taskId: 'b', exitCode: 1, status: 'failed' }),
    ];
    const agg = aggregate(results);
    expect(agg.status).toBe('partial');
    expect(agg.completed).toBe(1);
    expect(agg.failed).toBe(1);
  });

  it('sums token usage across results', () => {
    const results: SubagentResult[] = [
      makeResult({
        taskId: 'a',
        exitCode: 0,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
      makeResult({
        taskId: 'b',
        exitCode: 0,
        usage: { inputTokens: 200, outputTokens: 75, totalTokens: 275 },
      }),
    ];
    const agg = aggregate(results);
    expect(agg.totalUsage.inputTokens).toBe(300);
    expect(agg.totalUsage.outputTokens).toBe(125);
    expect(agg.totalUsage.totalTokens).toBe(425);
  });

  it('handles results with no usage field', () => {
    const results: SubagentResult[] = [
      makeResult({ taskId: 'a', exitCode: 0 }),
      makeResult({
        taskId: 'b',
        exitCode: 0,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    ];
    const agg = aggregate(results);
    expect(agg.totalUsage.inputTokens).toBe(10);
    expect(agg.totalUsage.outputTokens).toBe(5);
    expect(agg.totalUsage.totalTokens).toBe(15);
  });

  it('deduplicates filesChanged', () => {
    const results: SubagentResult[] = [
      makeResult({ taskId: 'a', exitCode: 0, filesChanged: ['file1.ts', 'file2.ts'] }),
      makeResult({ taskId: 'b', exitCode: 0, filesChanged: ['file2.ts', 'file3.ts'] }),
    ];
    const agg = aggregate(results);
    expect(agg.filesChanged.sort()).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
  });

  it('handles empty results array', () => {
    const agg = aggregate([]);
    expect(agg.status).toBe('all-passed');
    expect(agg.totalTasks).toBe(0);
    expect(agg.completed).toBe(0);
    expect(agg.failed).toBe(0);
    expect(agg.filesChanged).toEqual([]);
    expect(agg.combinedSummary).toBe('');
    expect(agg.durationMs).toBe(0);
    expect(agg.results).toEqual([]);
  });

  it('builds combinedSummary with taskId prefixes', () => {
    const results: SubagentResult[] = [
      makeResult({ taskId: 'task-1', exitCode: 0, summary: 'Fixed the bug' }),
      makeResult({ taskId: 'task-2', exitCode: 0, summary: 'Added tests' }),
    ];
    const agg = aggregate(results);
    expect(agg.combinedSummary).toContain('[task-1] Fixed the bug');
    expect(agg.combinedSummary).toContain('[task-2] Added tests');
  });

  it('skips tasks without summary in combinedSummary', () => {
    const results: SubagentResult[] = [
      makeResult({ taskId: 'task-1', exitCode: 0, summary: 'Done' }),
      makeResult({ taskId: 'task-2', exitCode: 0 }),
    ];
    const agg = aggregate(results);
    expect(agg.combinedSummary).toBe('[task-1] Done');
  });

  it('uses max duration for durationMs', () => {
    const results: SubagentResult[] = [
      makeResult({ taskId: 'a', exitCode: 0, durationMs: 100 }),
      makeResult({ taskId: 'b', exitCode: 0, durationMs: 500 }),
      makeResult({ taskId: 'c', exitCode: 0, durationMs: 250 }),
    ];
    const agg = aggregate(results);
    expect(agg.durationMs).toBe(500);
  });

  it('totalTasks matches the input count', () => {
    const results: SubagentResult[] = [
      makeResult({ taskId: 'a', exitCode: 0 }),
      makeResult({ taskId: 'b', exitCode: 1, status: 'failed' }),
      makeResult({ taskId: 'c', exitCode: 0 }),
    ];
    const agg = aggregate(results);
    expect(agg.totalTasks).toBe(3);
  });
});
