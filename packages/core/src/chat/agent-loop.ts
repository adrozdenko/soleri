/**
 * Agent Loop — conversational agent execution engine.
 *
 * Pure computation: takes messages + tools, calls LLM, dispatches tool calls, returns result.
 * Transport-specific concerns (typing indicators, progress messages) live in callbacks.
 *
 * Ported from Salvador's agent-loop.ts with improvements:
 * - Transport-agnostic (no Grammy dependency)
 * - AbortSignal support for clean cancellation
 * - Pure HTTP (no Anthropic SDK dependency — zero deps)
 * - Callbacks for all lifecycle events
 */

import type { AgentLoopConfig, AgentLoopResult, AgentCallbacks } from './agent-loop-types.js';
import type { ChatMessage } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_ITERATIONS = 200;
const DEFAULT_MAX_TOKENS = 16384;
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Run the agent loop — iteratively call LLM and dispatch tools until done.
 */
export async function runAgentLoop(
  messages: ChatMessage[],
  config: AgentLoopConfig,
  callbacks?: AgentCallbacks,
): Promise<AgentLoopResult> {
  const model = config.model ?? DEFAULT_MODEL;
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  // Convert ChatMessages to Anthropic format
  const apiMessages = sanitizeMessages(messages);
  const newMessages: ChatMessage[] = [];

  let iterations = 0;
  let toolCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const textParts: string[] = [];

  while (iterations < maxIterations) {
    // Check for cancellation
    if (config.signal?.aborted) {
      return {
        text: textParts.join('\n'),
        iterations,
        toolCalls,
        newMessages,
        stopReason: 'cancelled',
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    iterations++;
    callbacks?.onIteration?.(iterations);

    // Call the Anthropic API
    let response: AnthropicResponse;
    try {
      // oxlint-disable-next-line eslint(no-await-in-loop)
      response = await callAnthropic({
        baseUrl,
        apiKey: config.apiKey,
        model,
        systemPrompt: config.systemPrompt,
        messages: apiMessages,
        tools: config.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        })),
        maxTokens,
        signal: config.signal,
      });
    } catch (error) {
      if (config.signal?.aborted) {
        return {
          text: textParts.join('\n'),
          iterations,
          toolCalls,
          newMessages,
          stopReason: 'cancelled',
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        };
      }
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)), 'api_call');
      throw error;
    }

    totalInputTokens += response.usage?.input_tokens ?? 0;
    totalOutputTokens += response.usage?.output_tokens ?? 0;

    // Process content blocks
    const assistantContent = response.content;
    const assistantBlocks: unknown[] = [];
    const toolUseBlocks: ToolUseBlock[] = [];

    for (const block of assistantContent) {
      assistantBlocks.push(block);

      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push(block);
      }
    }

    // Record assistant message
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: assistantContent
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n'),
      blocks: assistantBlocks,
      timestamp: Date.now(),
    };
    apiMessages.push({ role: 'assistant', content: assistantContent });
    newMessages.push(assistantMsg);

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      if (toolUseBlocks.length === 0) {
        return {
          text: textParts.join('\n'),
          iterations,
          toolCalls,
          newMessages,
          stopReason: 'end_turn',
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        };
      }
    }

    // Execute tool calls
    const toolResults: ApiToolResult[] = [];
    for (const toolUse of toolUseBlocks) {
      if (config.signal?.aborted) {
        return {
          text: textParts.join('\n'),
          iterations,
          toolCalls,
          newMessages,
          stopReason: 'cancelled',
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        };
      }

      toolCalls++;
      callbacks?.onToolUse?.(toolUse.name, toolUse.input as Record<string, unknown>);

      const startTime = Date.now();
      let result;
      try {
        // oxlint-disable-next-line eslint(no-await-in-loop)
        result = await config.executor(toolUse.name, toolUse.input as Record<string, unknown>);
      } catch (error) {
        result = {
          output: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
        callbacks?.onError?.(
          error instanceof Error ? error : new Error(String(error)),
          `tool:${toolUse.name}`,
        );
      }
      const durationMs = Date.now() - startTime;
      callbacks?.onToolResult?.(toolUse.name, result, durationMs);

      // Build tool_result content
      const resultContent: ApiContent[] = [{ type: 'text', text: result.output }];
      if (result.image) {
        resultContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: result.image.mimeType,
            data: result.image.base64,
          },
        } as ApiContent);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: resultContent,
        is_error: result.isError,
      });
    }

    // Append tool results
    apiMessages.push({ role: 'user', content: toolResults as unknown as ApiContent[] });
    for (const tr of toolResults) {
      newMessages.push({
        role: 'tool',
        content:
          tr.content
            .filter((c): c is TextBlock => (c as TextBlock).type === 'text')
            .map((c) => (c as TextBlock).text)
            .join('\n') || '',
        blocks: [tr],
        timestamp: Date.now(),
      });
    }
  }

  // Max iterations reached
  return {
    text: textParts.join('\n'),
    iterations,
    toolCalls,
    newMessages,
    stopReason: 'max_iterations',
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}

// ─── Message Sanitization ───────────────────────────────────────────

/**
 * Sanitize messages for the Anthropic API:
 * - Ensure first message is from 'user'
 * - Remove orphaned tool_result blocks
 */
function sanitizeMessages(messages: ChatMessage[]): ApiMessage[] {
  const apiMessages: ApiMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      // Tool results are embedded in user messages — skip standalone ones
      // They'll be re-created during the loop
      continue;
    }

    if (msg.blocks && msg.blocks.length > 0) {
      apiMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.blocks as ApiContent[],
      });
    } else {
      apiMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
  }

  // Ensure first message is from user
  while (apiMessages.length > 0 && apiMessages[0].role !== 'user') {
    apiMessages.shift();
  }

  return apiMessages;
}

// ─── Anthropic API Call ─────────────────────────────────────────────

interface AnthropicCallParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: ApiMessage[];
  tools: ApiTool[];
  maxTokens: number;
  signal?: AbortSignal;
}

async function callAnthropic(params: AnthropicCallParams): Promise<AnthropicResponse> {
  const url = `${params.baseUrl}/v1/messages`;

  const body = {
    model: params.model,
    max_tokens: params.maxTokens,
    system: params.systemPrompt,
    messages: params.messages,
    ...(params.tools.length > 0 ? { tools: params.tools } : {}),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify(body),
    signal: params.signal ?? AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    const error = new Error(`Anthropic API error ${response.status}: ${errorText}`);
    (error as ApiError).status = response.status;
    (error as ApiError).retryAfter = parseRetryAfter(response.headers);
    throw error;
  }

  return (await response.json()) as AnthropicResponse;
}

function parseRetryAfter(headers: Headers): number | undefined {
  const retryAfter = headers.get('retry-after');
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

// ─── Anthropic API Types (minimal) ─────────────────────────────────

interface ApiError extends Error {
  status: number;
  retryAfter?: number;
}

interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

type ApiContent = TextBlock | ToolUseBlock | Record<string, unknown>;

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | ApiContent[];
}

interface ApiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface ApiToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: ApiContent[];
  is_error: boolean;
}

interface AnthropicResponse {
  content: (TextBlock | ToolUseBlock)[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage?: { input_tokens: number; output_tokens: number };
}
