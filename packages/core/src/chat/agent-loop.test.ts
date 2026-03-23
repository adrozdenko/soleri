/**
 * Agent Loop — colocated tests.
 *
 * Covers: basic end_turn flow, tool dispatch, cancellation via AbortSignal,
 * max iterations, callbacks, error handling.
 *
 * All HTTP calls to Anthropic API are mocked via vi.stubGlobal('fetch').
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { runAgentLoop } from './agent-loop.js';
import type { AgentLoopConfig, ToolResult } from './agent-loop-types.js';
import type { ChatMessage } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeMessages(text: string): ChatMessage[] {
  return [{ role: 'user', content: text, timestamp: Date.now() }];
}

function makeConfig(overrides?: Partial<AgentLoopConfig>): AgentLoopConfig {
  return {
    apiKey: 'test-key',
    systemPrompt: 'You are a test assistant.',
    tools: [],
    executor: async () => ({ output: '', isError: false }),
    model: 'test-model',
    baseUrl: 'https://mock.api',
    ...overrides,
  };
}

/** Create a mock fetch response mimicking the Anthropic messages API. */
function anthropicResponse(
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>,
  stopReason: string = 'end_turn',
  usage = { input_tokens: 10, output_tokens: 20 },
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content,
      stop_reason: stopReason,
      usage,
    }),
    text: async () => '',
    headers: new Headers(),
  };
}

function anthropicError(status: number, body: string = 'error') {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
    headers: new Headers(),
  };
}

describe('runAgentLoop', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic flow', () => {
    test('returns text on end_turn', async () => {
      fetchMock.mockResolvedValueOnce(
        anthropicResponse([{ type: 'text', text: 'Hello!' }]),
      );

      const result = await runAgentLoop(makeMessages('hi'), makeConfig());
      expect(result.text).toBe('Hello!');
      expect(result.stopReason).toBe('end_turn');
      expect(result.iterations).toBe(1);
      expect(result.toolCalls).toBe(0);
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(20);
    });

    test('accumulates newMessages', async () => {
      fetchMock.mockResolvedValueOnce(
        anthropicResponse([{ type: 'text', text: 'reply' }]),
      );

      const result = await runAgentLoop(makeMessages('q'), makeConfig());
      expect(result.newMessages.length).toBeGreaterThanOrEqual(1);
      expect(result.newMessages[0].role).toBe('assistant');
      expect(result.newMessages[0].content).toBe('reply');
    });
  });

  describe('tool dispatch', () => {
    test('executes tool calls and continues', async () => {
      // First call: LLM returns a tool_use block
      fetchMock.mockResolvedValueOnce(
        anthropicResponse(
          [
            { type: 'text', text: 'Let me search...' },
            { type: 'tool_use', id: 'tu_1', name: 'search', input: { q: 'test' } },
          ],
          'tool_use',
        ),
      );
      // Second call: LLM returns final text
      fetchMock.mockResolvedValueOnce(
        anthropicResponse([{ type: 'text', text: 'Found it!' }]),
      );

      const executorResults: string[] = [];
      const executor = async (name: string, _input: Record<string, unknown>): Promise<ToolResult> => {
        executorResults.push(name);
        return { output: `result for ${name}`, isError: false };
      };

      const result = await runAgentLoop(makeMessages('search'), makeConfig({
        tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }],
        executor,
      }));

      expect(result.iterations).toBe(2);
      expect(result.toolCalls).toBe(1);
      expect(executorResults).toEqual(['search']);
      expect(result.text).toContain('Found it!');
    });

    test('handles tool execution errors gracefully', async () => {
      fetchMock.mockResolvedValueOnce(
        anthropicResponse(
          [{ type: 'tool_use', id: 'tu_1', name: 'broken', input: {} }],
          'tool_use',
        ),
      );
      fetchMock.mockResolvedValueOnce(
        anthropicResponse([{ type: 'text', text: 'Done' }]),
      );

      const errors: string[] = [];
      const result = await runAgentLoop(
        makeMessages('go'),
        makeConfig({
          tools: [{ name: 'broken', description: 'Broken', inputSchema: { type: 'object' } }],
          executor: async () => { throw new Error('tool failed'); },
        }),
        {
          onError: (err, ctx) => errors.push(`${ctx}: ${err.message}`),
        },
      );

      expect(result.iterations).toBe(2);
      expect(result.toolCalls).toBe(1);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('tool:broken');
    });
  });

  describe('cancellation', () => {
    test('returns cancelled when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await runAgentLoop(
        makeMessages('hi'),
        makeConfig({ signal: controller.signal }),
      );

      expect(result.stopReason).toBe('cancelled');
      expect(result.iterations).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('returns cancelled when aborted during tool execution', async () => {
      const controller = new AbortController();

      fetchMock.mockResolvedValueOnce(
        anthropicResponse(
          [
            { type: 'tool_use', id: 'tu_1', name: 'slow', input: {} },
            { type: 'tool_use', id: 'tu_2', name: 'slow2', input: {} },
          ],
          'tool_use',
        ),
      );

      let callCount = 0;
      const result = await runAgentLoop(
        makeMessages('go'),
        makeConfig({
          tools: [
            { name: 'slow', description: 'Slow', inputSchema: { type: 'object' } },
            { name: 'slow2', description: 'Slow2', inputSchema: { type: 'object' } },
          ],
          executor: async () => {
            callCount++;
            controller.abort(); // Abort after first tool
            return { output: 'ok', isError: false };
          },
          signal: controller.signal,
        }),
      );

      expect(result.stopReason).toBe('cancelled');
      expect(callCount).toBe(1); // Only first tool ran
    });

    test('returns cancelled when fetch aborts', async () => {
      const controller = new AbortController();

      fetchMock.mockImplementation(async () => {
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      });

      const result = await runAgentLoop(
        makeMessages('hi'),
        makeConfig({ signal: controller.signal }),
      );

      expect(result.stopReason).toBe('cancelled');
    });
  });

  describe('max iterations', () => {
    test('stops at maxIterations', async () => {
      // Always return tool_use to keep the loop going
      fetchMock.mockImplementation(async () =>
        anthropicResponse(
          [{ type: 'tool_use', id: `tu_${Date.now()}`, name: 'loop', input: {} }],
          'tool_use',
        ),
      );

      const result = await runAgentLoop(
        makeMessages('go'),
        makeConfig({
          maxIterations: 3,
          tools: [{ name: 'loop', description: 'Loop', inputSchema: { type: 'object' } }],
          executor: async () => ({ output: 'again', isError: false }),
        }),
      );

      expect(result.stopReason).toBe('max_iterations');
      expect(result.iterations).toBe(3);
    });
  });

  describe('callbacks', () => {
    test('fires onIteration for each loop', async () => {
      fetchMock.mockResolvedValueOnce(
        anthropicResponse([{ type: 'text', text: 'ok' }]),
      );

      const iterations: number[] = [];
      await runAgentLoop(makeMessages('hi'), makeConfig(), {
        onIteration: (n) => iterations.push(n),
      });

      expect(iterations).toEqual([1]);
    });

    test('fires onToolUse and onToolResult', async () => {
      fetchMock.mockResolvedValueOnce(
        anthropicResponse(
          [{ type: 'tool_use', id: 'tu_1', name: 'ping', input: { val: 1 } }],
          'tool_use',
        ),
      );
      fetchMock.mockResolvedValueOnce(
        anthropicResponse([{ type: 'text', text: 'done' }]),
      );

      const toolUses: string[] = [];
      const toolResults: string[] = [];

      await runAgentLoop(
        makeMessages('go'),
        makeConfig({
          tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object' } }],
          executor: async () => ({ output: 'pong', isError: false }),
        }),
        {
          onToolUse: (name) => toolUses.push(name),
          onToolResult: (name, result, ms) => {
            toolResults.push(`${name}:${result.output}`);
            expect(ms).toBeGreaterThanOrEqual(0);
          },
        },
      );

      expect(toolUses).toEqual(['ping']);
      expect(toolResults).toEqual(['ping:pong']);
    });
  });

  describe('API errors', () => {
    test('throws on non-retryable API error', async () => {
      fetchMock.mockResolvedValueOnce(anthropicError(400, 'bad request'));

      await expect(
        runAgentLoop(makeMessages('hi'), makeConfig()),
      ).rejects.toThrow('Anthropic API error 400');
    });

    test('fires onError callback before throwing', async () => {
      fetchMock.mockResolvedValueOnce(anthropicError(500, 'server error'));

      const errors: string[] = [];
      await expect(
        runAgentLoop(makeMessages('hi'), makeConfig(), {
          onError: (err) => errors.push(err.message),
        }),
      ).rejects.toThrow();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('500');
    });
  });

  describe('message sanitization', () => {
    test('strips leading assistant messages', async () => {
      fetchMock.mockResolvedValueOnce(
        anthropicResponse([{ type: 'text', text: 'ok' }]),
      );

      const messages: ChatMessage[] = [
        { role: 'assistant', content: 'orphan', timestamp: Date.now() },
        { role: 'user', content: 'hello', timestamp: Date.now() },
      ];

      const result = await runAgentLoop(messages, makeConfig());
      expect(result.text).toBe('ok');

      // Verify the API was called with user message first
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.messages[0].role).toBe('user');
    });

    test('skips standalone tool messages', async () => {
      fetchMock.mockResolvedValueOnce(
        anthropicResponse([{ type: 'text', text: 'ok' }]),
      );

      const messages: ChatMessage[] = [
        { role: 'user', content: 'hello', timestamp: Date.now() },
        { role: 'tool', content: 'orphan tool result', timestamp: Date.now() },
      ];

      const result = await runAgentLoop(messages, makeConfig());
      expect(result.text).toBe('ok');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      // Tool messages are stripped — only user message remains
      expect(body.messages).toHaveLength(1);
    });
  });

  describe('usage accumulation', () => {
    test('sums usage across iterations', async () => {
      fetchMock.mockResolvedValueOnce(
        anthropicResponse(
          [{ type: 'tool_use', id: 'tu_1', name: 'x', input: {} }],
          'tool_use',
          { input_tokens: 100, output_tokens: 50 },
        ),
      );
      fetchMock.mockResolvedValueOnce(
        anthropicResponse(
          [{ type: 'text', text: 'done' }],
          'end_turn',
          { input_tokens: 150, output_tokens: 30 },
        ),
      );

      const result = await runAgentLoop(
        makeMessages('go'),
        makeConfig({
          tools: [{ name: 'x', description: 'X', inputSchema: { type: 'object' } }],
          executor: async () => ({ output: 'ok', isError: false }),
        }),
      );

      expect(result.usage.inputTokens).toBe(250);
      expect(result.usage.outputTokens).toBe(80);
    });
  });
});
