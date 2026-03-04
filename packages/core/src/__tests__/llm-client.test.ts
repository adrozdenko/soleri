import { describe, it, expect } from 'vitest';
import { LLMClient } from '../llm/llm-client.js';
import { KeyPool } from '../llm/key-pool.js';

describe('LLMClient', () => {
  it('should create with empty key pools', () => {
    const openai = new KeyPool({ keys: [] });
    const anthropic = new KeyPool({ keys: [] });
    const client = new LLMClient(openai, anthropic);

    expect(client.isAvailable()).toEqual({ openai: false, anthropic: false });
  });

  it('should report availability when keys present', () => {
    const openai = new KeyPool({ keys: ['sk-test'] });
    const anthropic = new KeyPool({ keys: ['sk-ant-test'] });
    const client = new LLMClient(openai, anthropic);

    expect(client.isAvailable()).toEqual({ openai: true, anthropic: true });
  });

  it('should accept agentId parameter', () => {
    const openai = new KeyPool({ keys: [] });
    const anthropic = new KeyPool({ keys: [] });
    // Should not throw — agentId is used for model routing config
    const client = new LLMClient(openai, anthropic, 'test-agent');
    expect(client.isAvailable()).toEqual({ openai: false, anthropic: false });
  });

  it('should return empty routes by default', () => {
    const openai = new KeyPool({ keys: [] });
    const anthropic = new KeyPool({ keys: [] });
    const client = new LLMClient(openai, anthropic);

    expect(client.getRoutes()).toEqual([]);
  });

  it('should throw on callOpenAI without keys', async () => {
    const openai = new KeyPool({ keys: [] });
    const anthropic = new KeyPool({ keys: [] });
    const client = new LLMClient(openai, anthropic);

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

  it('should throw on callAnthropic without keys', async () => {
    const openai = new KeyPool({ keys: [] });
    const anthropic = new KeyPool({ keys: [] });
    const client = new LLMClient(openai, anthropic);

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
