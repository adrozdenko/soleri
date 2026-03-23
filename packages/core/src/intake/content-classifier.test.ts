import { describe, it, expect } from 'vitest';
import { classifyChunk, VALID_TYPES, CLASSIFICATION_PROMPT } from './content-classifier.js';
import type { LLMClient } from '../llm/llm-client.js';
import type { LLMCallResult } from '../llm/types.js';

// =============================================================================
// MOCK LLM
// =============================================================================

function mockLLM(response: string): LLMClient {
  return {
    complete: async (): Promise<LLMCallResult> => ({
      text: response,
      model: 'mock',
      provider: 'openai',
      durationMs: 0,
    }),
    isAvailable: () => ({ openai: true, anthropic: false }),
    getRoutes: () => [],
  } as unknown as LLMClient;
}

function throwingLLM(error: Error): LLMClient {
  return {
    complete: async () => {
      throw error;
    },
    isAvailable: () => ({ openai: true, anthropic: false }),
    getRoutes: () => [],
  } as unknown as LLMClient;
}

// =============================================================================
// TESTS
// =============================================================================

describe('classifyChunk', () => {
  it('parses valid JSON array response into ClassifiedItems', async () => {
    const llm = mockLLM(
      JSON.stringify([
        {
          type: 'pattern',
          title: 'Test Pattern',
          description: 'A useful design pattern.',
          tags: ['design', 'architecture'],
          severity: 'suggestion',
        },
      ]),
    );

    const result = await classifyChunk(llm, 'some text', 'page 1');

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('pattern');
    expect(result[0].title).toBe('Test Pattern');
    expect(result[0].description).toBe('A useful design pattern.');
    expect(result[0].tags).toEqual(['design', 'architecture']);
    expect(result[0].severity).toBe('suggestion');
    expect(result[0].citation).toBe('page 1');
  });

  it('handles markdown fenced JSON responses', async () => {
    const llm = mockLLM(
      '```json\n[{"type":"pattern","title":"Fenced","description":"Inside fences.","tags":["test"],"severity":"warning"}]\n```',
    );

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Fenced');
  });

  it('returns empty array for non-array response', async () => {
    const llm = mockLLM(JSON.stringify({ not: 'an array' }));

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result).toEqual([]);
  });

  it('returns empty array on LLM error (graceful degradation)', async () => {
    const llm = throwingLLM(new Error('API timeout'));

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result).toEqual([]);
  });

  it('returns empty array for invalid JSON response', async () => {
    const llm = mockLLM('this is not json at all');

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result).toEqual([]);
  });

  it('filters out items with invalid type', async () => {
    const llm = mockLLM(
      JSON.stringify([
        {
          type: 'invalid-type',
          title: 'Bad',
          description: 'Bad type',
          tags: [],
          severity: 'suggestion',
        },
        {
          type: 'pattern',
          title: 'Good',
          description: 'Good item.',
          tags: [],
          severity: 'suggestion',
        },
      ]),
    );

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Good');
  });

  it('filters out items missing required fields (title, description)', async () => {
    const llm = mockLLM(
      JSON.stringify([
        { type: 'pattern', title: '', description: 'No title', tags: [], severity: 'suggestion' },
        { type: 'pattern', title: 'No desc', description: '', tags: [], severity: 'suggestion' },
        {
          type: 'pattern',
          title: 'Valid',
          description: 'Valid item.',
          tags: [],
          severity: 'suggestion',
        },
      ]),
    );

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid');
  });

  it('truncates title to 80 characters', async () => {
    const longTitle = 'A'.repeat(100);
    const llm = mockLLM(
      JSON.stringify([
        {
          type: 'pattern',
          title: longTitle,
          description: 'Desc.',
          tags: [],
          severity: 'suggestion',
        },
      ]),
    );

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result).toHaveLength(1);
    expect(result[0].title.length).toBe(80);
  });

  it('caps tags at 5 and lowercases them', async () => {
    const llm = mockLLM(
      JSON.stringify([
        {
          type: 'pattern',
          title: 'Tagged',
          description: 'Many tags.',
          tags: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'],
          severity: 'suggestion',
        },
      ]),
    );

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result[0].tags).toHaveLength(5);
    expect(result[0].tags.every((t) => t === t.toLowerCase())).toBe(true);
  });

  it('defaults severity to suggestion for invalid values', async () => {
    const llm = mockLLM(
      JSON.stringify([
        {
          type: 'pattern',
          title: 'Bad Sev',
          description: 'Unknown sev.',
          tags: [],
          severity: 'unknown',
        },
      ]),
    );

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result[0].severity).toBe('suggestion');
  });

  it('handles all valid severity values', async () => {
    const llm = mockLLM(
      JSON.stringify([
        {
          type: 'pattern',
          title: 'Critical',
          description: 'Crit.',
          tags: [],
          severity: 'critical',
        },
        { type: 'pattern', title: 'Warning', description: 'Warn.', tags: [], severity: 'warning' },
        {
          type: 'pattern',
          title: 'Suggestion',
          description: 'Sug.',
          tags: [],
          severity: 'suggestion',
        },
      ]),
    );

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result.map((r) => r.severity)).toEqual(['critical', 'warning', 'suggestion']);
  });

  it('filters out non-object items in the array', async () => {
    const llm = mockLLM(
      JSON.stringify([
        null,
        42,
        'string',
        { type: 'pattern', title: 'Valid', description: 'OK.', tags: [], severity: 'suggestion' },
      ]),
    );

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid');
  });

  it('filters non-string tags from the tags array', async () => {
    const llm = mockLLM(
      JSON.stringify([
        {
          type: 'pattern',
          title: 'Mixed Tags',
          description: 'OK.',
          tags: ['valid', 42, null, 'also-valid'],
          severity: 'suggestion',
        },
      ]),
    );

    const result = await classifyChunk(llm, 'text', 'cite');

    expect(result[0].tags).toEqual(['valid', 'also-valid']);
  });
});

describe('VALID_TYPES and CLASSIFICATION_PROMPT', () => {
  it('VALID_TYPES has all expected knowledge types', () => {
    expect(VALID_TYPES).toContain('pattern');
    expect(VALID_TYPES).toContain('anti-pattern');
    expect(VALID_TYPES).toContain('principle');
    expect(VALID_TYPES).toContain('concept');
    expect(VALID_TYPES).toContain('reference');
    expect(VALID_TYPES).toContain('workflow');
    expect(VALID_TYPES).toContain('idea');
    expect(VALID_TYPES).toContain('roadmap');
    expect(VALID_TYPES).toHaveLength(8);
  });

  it('CLASSIFICATION_PROMPT includes valid types', () => {
    expect(CLASSIFICATION_PROMPT).toContain('pattern');
    expect(CLASSIFICATION_PROMPT).toContain('knowledge extraction');
  });
});
