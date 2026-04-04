import { describe, it, expect, vi } from 'vitest';
import { LLMClient } from './llm-client.js';
import { KeyPool } from './key-pool.js';
import { LLMError } from './types.js';

// =============================================================================
// HELPERS
// =============================================================================

function makeClient(opts?: { openaiKeys?: string[]; anthropicKeys?: string[] }): LLMClient {
  const openai = new KeyPool({ keys: opts?.openaiKeys ?? [] });
  const anthropic = new KeyPool({ keys: opts?.anthropicKeys ?? [] });
  return new LLMClient(openai, anthropic);
}

// =============================================================================
// TESTS
// =============================================================================

describe('LLMClient — colocated', () => {
  describe('isAvailable', () => {
    it('reports both unavailable with no keys', () => {
      const client = makeClient();
      expect(client.isAvailable()).toEqual({ openai: false, anthropic: false });
    });

    it('reports openai available when keys provided', () => {
      const client = makeClient({ openaiKeys: ['sk-test'] });
      expect(client.isAvailable()).toEqual({ openai: true, anthropic: false });
    });

    it('reports anthropic available when keys provided', () => {
      const client = makeClient({ anthropicKeys: ['sk-ant-test'] });
      expect(client.isAvailable()).toEqual({ openai: false, anthropic: true });
    });

    it('reports both available when both keys provided', () => {
      const client = makeClient({ openaiKeys: ['sk-test'], anthropicKeys: ['sk-ant-test'] });
      expect(client.isAvailable()).toEqual({ openai: true, anthropic: true });
    });
  });

  describe('getRoutes', () => {
    it('returns empty routes for client without agentId', () => {
      const client = makeClient();
      expect(client.getRoutes()).toEqual([]);
    });
  });

  describe('complete — OpenAI error paths', () => {
    it('throws LLMError when no OpenAI keys configured', async () => {
      const client = makeClient();

      await expect(
        client.complete({
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'test',
          userPrompt: 'test',
          caller: 'test',
        }),
      ).rejects.toThrow('OpenAI API key not configured');
    });

    it('throws when OpenAI API returns non-OK response', async () => {
      const client = makeClient({ openaiKeys: ['sk-test'] });

      // Mock fetch to return error
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => 'Unauthorized',
      });

      try {
        await expect(
          client.complete({
            provider: 'openai',
            model: 'gpt-4o-mini',
            systemPrompt: 'test',
            userPrompt: 'test',
            caller: 'test',
          }),
        ).rejects.toThrow('OpenAI API error');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('successfully calls OpenAI with mock fetch', async () => {
      const client = makeClient({ openaiKeys: ['sk-test'] });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: 'Hello from mock!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      try {
        const result = await client.complete({
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'You are helpful.',
          userPrompt: 'Say hello.',
          caller: 'test',
          temperature: 0.5,
          maxTokens: 100,
        });

        expect(result.text).toBe('Hello from mock!');
        expect(result.model).toBe('gpt-4o-mini');
        expect(result.provider).toBe('openai');
        expect(result.inputTokens).toBe(10);
        expect(result.outputTokens).toBe(5);
        expect(typeof result.durationMs).toBe('number');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('rotates key on 429 response when pool has multiple keys', async () => {
      const openai = new KeyPool({ keys: ['sk-1', 'sk-2'] });
      const anthropic = new KeyPool({ keys: [] });
      const client = new LLMClient(openai, anthropic);

      expect(openai.activeKeyIndex).toBe(0);

      const originalFetch = globalThis.fetch;
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) {
          return {
            ok: false,
            status: 429,
            headers: new Headers(),
            text: async () => 'Rate limited',
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
            usage: {},
          }),
        };
      });

      try {
        // All 3 retry attempts will get 429, and the client retries retryable errors
        await expect(
          client.complete({
            provider: 'openai',
            model: 'gpt-4o-mini',
            systemPrompt: 'test',
            userPrompt: 'test',
            caller: 'test',
          }),
        ).rejects.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('parses rate limit headers and updates quota', async () => {
      const openai = new KeyPool({ keys: ['sk-test'] });
      const anthropic = new KeyPool({ keys: [] });
      const client = new LLMClient(openai, anthropic);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'x-ratelimit-remaining-requests': '42',
        }),
        json: async () => ({
          choices: [{ message: { content: 'ok' } }],
          usage: {},
        }),
      });

      try {
        await client.complete({
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'test',
          userPrompt: 'test',
          caller: 'test',
        });

        const status = openai.getStatus();
        expect(status.perKeyStatus[0].remainingQuota).toBe(42);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('complete — Anthropic error paths', () => {
    it('throws LLMError when no Anthropic keys configured', async () => {
      const client = makeClient();

      await expect(
        client.complete({
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'test',
          userPrompt: 'test',
          caller: 'test',
        }),
      ).rejects.toThrow('Anthropic API key not configured');
    });
  });

  describe('model routing', () => {
    it('uses explicit provider when specified', async () => {
      const client = makeClient({ openaiKeys: ['sk-test'] });

      const originalFetch = globalThis.fetch;
      let capturedBody: string = '';
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
            usage: {},
          }),
        };
      });

      try {
        await client.complete({
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: 'test',
          userPrompt: 'test',
          caller: 'test',
        });

        const parsed = JSON.parse(capturedBody);
        expect(parsed.model).toBe('gpt-4o');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('uses default temperature of 0.3 when not specified', async () => {
      const client = makeClient({ openaiKeys: ['sk-test'] });

      const originalFetch = globalThis.fetch;
      let capturedBody: string = '';
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
            usage: {},
          }),
        };
      });

      try {
        await client.complete({
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'test',
          userPrompt: 'test',
          caller: 'test',
        });

        const parsed = JSON.parse(capturedBody);
        expect(parsed.temperature).toBe(0.3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

describe('KeyPool — colocated', () => {
  it('throws when getting active key from empty pool', () => {
    const pool = new KeyPool({ keys: [] });
    expect(() => pool.getActiveKey()).toThrow('no keys');
  });

  it('returns null from rotateOnError when all keys exhausted', () => {
    const pool = new KeyPool({ keys: ['sk-1'] });
    // Trip the breaker (threshold is 3 by default)
    pool.rotateOnError();
    pool.rotateOnError();
    pool.rotateOnError();

    expect(pool.exhausted).toBe(true);
    // Further rotation returns null
    const result = pool.rotateOnError();
    expect(result).toBeNull();
  });

  it('does not preemptively rotate when quota is not set', () => {
    const pool = new KeyPool({ keys: ['sk-1', 'sk-2'], preemptiveThreshold: 50 });
    const rotated = pool.rotatePreemptive();
    expect(rotated).toBe(false);
    expect(pool.activeKeyIndex).toBe(0);
  });
});

describe('LLMError — colocated', () => {
  it('has correct name and prototype chain', () => {
    const err = new LLMError('test error');
    expect(err.name).toBe('LLMError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LLMError);
  });

  it('defaults retryable to false', () => {
    const err = new LLMError('test');
    expect(err.retryable).toBe(false);
    expect(err.statusCode).toBeUndefined();
  });

  it('accepts retryable and statusCode options', () => {
    const err = new LLMError('rate limited', { retryable: true, statusCode: 429 });
    expect(err.retryable).toBe(true);
    expect(err.statusCode).toBe(429);
  });
});
