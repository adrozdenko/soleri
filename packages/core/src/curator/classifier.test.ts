import { describe, it, expect, vi } from 'vitest';
import { classifyEntry } from './classifier.js';
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

describe('classifyEntry', () => {
  it('returns fallback when llm is null', async () => {
    const result = await classifyEntry(makeEntry(), null);
    expect(result.classified).toBe(false);
    expect(result.suggestedDomain).toBeNull();
    expect(result.suggestedSeverity).toBeNull();
    expect(result.suggestedTags).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it('classifies entry with valid LLM response', async () => {
    const llm = mockLLM(JSON.stringify({
      domain: 'security',
      severity: 'critical',
      tags: ['auth', 'jwt', 'security'],
      confidence: 0.9,
    }));

    const result = await classifyEntry(makeEntry({ title: 'Use JWT securely' }), llm);
    expect(result.classified).toBe(true);
    expect(result.suggestedDomain).toBe('security');
    expect(result.suggestedSeverity).toBe('critical');
    expect(result.suggestedTags).toEqual(['auth', 'jwt', 'security']);
    expect(result.confidence).toBe(0.9);
  });

  it('returns fallback with error on LLM failure', async () => {
    const llm = {
      complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    } as unknown as LLMClient;

    const result = await classifyEntry(makeEntry(), llm);
    expect(result.classified).toBe(false);
    expect(result.error).toBe('LLM unavailable');
  });

  it('returns fallback with error on invalid JSON response', async () => {
    const llm = mockLLM('not valid json');
    const result = await classifyEntry(makeEntry(), llm);
    expect(result.classified).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles missing fields in LLM response gracefully', async () => {
    const llm = mockLLM(JSON.stringify({}));
    const result = await classifyEntry(makeEntry(), llm);
    expect(result.classified).toBe(true);
    expect(result.suggestedDomain).toBeNull();
    expect(result.suggestedSeverity).toBeNull();
    expect(result.suggestedTags).toEqual([]);
    expect(result.confidence).toBe(0.5);
  });

  it('passes entry fields to LLM prompt', async () => {
    const llm = mockLLM(JSON.stringify({ domain: 'test', severity: 'warning', tags: [], confidence: 0.5 }));
    const entry = makeEntry({
      title: 'Specific Title',
      type: 'anti-pattern',
      tags: ['tag-a', 'tag-b'],
      description: 'Specific description.',
    });

    await classifyEntry(entry, llm);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.userPrompt).toContain('Specific Title');
    expect(call.userPrompt).toContain('anti-pattern');
    expect(call.userPrompt).toContain('tag-a, tag-b');
    expect(call.userPrompt).toContain('Specific description.');
  });

  it('uses empty tags placeholder when entry has no tags', async () => {
    const llm = mockLLM(JSON.stringify({ domain: 'test', severity: 'warning', tags: [], confidence: 0.5 }));
    const entry = makeEntry({ tags: [] });

    await classifyEntry(entry, llm);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.userPrompt).toContain('none');
  });
});
