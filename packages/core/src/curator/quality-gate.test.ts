import { describe, it, expect, vi } from 'vitest';
import { evaluateQuality } from './quality-gate.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { LLMClient } from '../llm/llm-client.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern.',
    tags: overrides.tags ?? ['testing'],
  };
}

function mockLLM(response: string): LLMClient {
  return {
    complete: vi.fn().mockResolvedValue({ text: response }),
  } as unknown as LLMClient;
}

describe('evaluateQuality', () => {
  it('returns ACCEPT fallback when llm is null', async () => {
    const result = await evaluateQuality(makeEntry(), null);
    expect(result.evaluated).toBe(false);
    expect(result.verdict).toBe('ACCEPT');
    expect(result.overallScore).toBe(50);
    expect(result.reasoning).toContain('LLM unavailable');
  });

  it('returns ACCEPT for high-quality entry', async () => {
    const llm = mockLLM(JSON.stringify({
      verdict: 'ACCEPT',
      overallScore: 85,
      scores: { novelty: 80, actionability: 90, specificity: 85, relevance: 80, informationDensity: 90 },
      reasoning: 'High quality entry with specific guidance.',
    }));

    const result = await evaluateQuality(makeEntry(), llm);
    expect(result.evaluated).toBe(true);
    expect(result.verdict).toBe('ACCEPT');
    expect(result.overallScore).toBe(85);
  });

  it('returns REJECT for low-quality entry', async () => {
    const llm = mockLLM(JSON.stringify({
      verdict: 'REJECT',
      overallScore: 30,
      scores: { novelty: 10, actionability: 30, specificity: 40, relevance: 50, informationDensity: 20 },
      reasoning: 'Too generic.',
      rejectReasons: ['Low novelty', 'Not actionable'],
    }));

    const result = await evaluateQuality(makeEntry(), llm);
    expect(result.evaluated).toBe(true);
    expect(result.verdict).toBe('REJECT');
    expect(result.overallScore).toBe(30);
    expect(result.rejectReasons).toEqual(['Low novelty', 'Not actionable']);
  });

  it('returns fallback with error on LLM failure', async () => {
    const llm = {
      complete: vi.fn().mockRejectedValue(new Error('timeout')),
    } as unknown as LLMClient;

    const result = await evaluateQuality(makeEntry(), llm);
    expect(result.evaluated).toBe(false);
    expect(result.verdict).toBe('ACCEPT');
    expect(result.error).toBe('timeout');
  });

  it('returns fallback with error on invalid JSON', async () => {
    const llm = mockLLM('invalid json response');
    const result = await evaluateQuality(makeEntry(), llm);
    expect(result.evaluated).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles missing fields in LLM response', async () => {
    const llm = mockLLM(JSON.stringify({ verdict: 'ACCEPT' }));
    const result = await evaluateQuality(makeEntry(), llm);
    expect(result.evaluated).toBe(true);
    expect(result.overallScore).toBe(50);
    expect(result.reasoning).toBe('');
  });

  it('normalizes non-REJECT verdict to ACCEPT', async () => {
    const llm = mockLLM(JSON.stringify({
      verdict: 'MAYBE',
      overallScore: 60,
      scores: { novelty: 60, actionability: 60, specificity: 60, relevance: 60, informationDensity: 60 },
      reasoning: 'Borderline entry.',
    }));

    const result = await evaluateQuality(makeEntry(), llm);
    expect(result.verdict).toBe('ACCEPT');
  });

  it('includes optional entry fields in prompt', async () => {
    const llm = mockLLM(JSON.stringify({
      verdict: 'ACCEPT',
      overallScore: 70,
      scores: { novelty: 70, actionability: 70, specificity: 70, relevance: 70, informationDensity: 70 },
      reasoning: 'OK.',
    }));

    const entry = makeEntry();
    entry.why = 'Because security matters';
    entry.example = 'jwt.verify(token)';
    entry.context = 'Node.js backend';

    await evaluateQuality(entry, llm);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.userPrompt).toContain('Because security matters');
    expect(call.userPrompt).toContain('jwt.verify(token)');
    expect(call.userPrompt).toContain('Node.js backend');
  });

  it('uses low temperature for consistent scoring', async () => {
    const llm = mockLLM(JSON.stringify({
      verdict: 'ACCEPT',
      overallScore: 70,
      scores: { novelty: 70, actionability: 70, specificity: 70, relevance: 70, informationDensity: 70 },
      reasoning: 'OK.',
    }));

    await evaluateQuality(makeEntry(), llm);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.temperature).toBe(0.1);
  });
});
