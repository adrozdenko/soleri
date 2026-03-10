/**
 * Agent Loop Types — interfaces for the conversational agent execution engine.
 *
 * Transport-agnostic: the agent loop doesn't know about Telegram, Discord, etc.
 * It takes messages and tools, calls the LLM, dispatches tool calls, and returns.
 */

import type { ChatMessage } from './types.js';

// ─── Tool Types ──────────────────────────────────────────────────────

export interface AgentTool {
  /** Tool name (unique identifier). */
  name: string;
  /** Human-readable description for the LLM. */
  description: string;
  /** JSON Schema for tool input parameters. */
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  /** Output text (may be truncated). */
  output: string;
  /** Whether the tool execution errored. */
  isError: boolean;
  /** Optional base64-encoded image (e.g. screenshots). */
  image?: { base64: string; mimeType: string };
}

export type ToolExecutor = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<ToolResult>;

// ─── Agent Loop Config ──────────────────────────────────────────────

export interface AgentLoopConfig {
  /** Anthropic API key. */
  apiKey: string;
  /** Model to use. Default: 'claude-sonnet-4-20250514'. */
  model?: string;
  /** System prompt. */
  systemPrompt: string;
  /** Available tools. */
  tools: AgentTool[];
  /** Tool executor function — routes tool calls to handlers. */
  executor: ToolExecutor;
  /** Max iterations (LLM calls) before stopping. Default: 200. */
  maxIterations?: number;
  /** Max output tokens per LLM call. Default: 16384. */
  maxTokens?: number;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Base URL for Anthropic API. Default: 'https://api.anthropic.com'. */
  baseUrl?: string;
}

// ─── Callbacks ──────────────────────────────────────────────────────

export interface AgentCallbacks {
  /** Called when the LLM invokes a tool. */
  onToolUse?: (toolName: string, input: Record<string, unknown>) => void;
  /** Called when a tool returns a result. */
  onToolResult?: (toolName: string, result: ToolResult, durationMs: number) => void;
  /** Called on each iteration (LLM call). */
  onIteration?: (iteration: number) => void;
  /** Called when an error occurs (non-fatal — loop may continue). */
  onError?: (error: Error, context: string) => void;
}

// ─── Agent Loop Result ──────────────────────────────────────────────

export interface AgentLoopResult {
  /** Final text response (concatenated from all text blocks). */
  text: string;
  /** Number of LLM iterations. */
  iterations: number;
  /** Total tool calls made. */
  toolCalls: number;
  /** New messages to append to session (assistant + tool_result pairs). */
  newMessages: ChatMessage[];
  /** Stop reason: 'end_turn', 'max_iterations', 'cancelled'. */
  stopReason: 'end_turn' | 'max_iterations' | 'cancelled';
  /** Usage stats. */
  usage: { inputTokens: number; outputTokens: number };
}

// ─── MCP Bridge Types ───────────────────────────────────────────────

export interface McpToolRegistration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

// ─── Output Compressor ──────────────────────────────────────────────

export type OutputCompressor = (toolName: string, output: string, maxLength?: number) => string;
