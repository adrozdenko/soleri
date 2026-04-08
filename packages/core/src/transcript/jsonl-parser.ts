/**
 * JSONL Parser — reads Claude Code transcript files.
 *
 * Claude Code stores conversation history as JSONL files where each line is a
 * JSON object with a `type` field. This module parses those files into a flat
 * array of TranscriptMessage objects suitable for indexing and search.
 *
 * Supported types:
 *   - "user"      — user messages (string content or tool_result arrays)
 *   - "assistant"  — assistant messages (text / tool_use / thinking blocks)
 *   - "system"     — system messages (opt-in via options.includeSystem)
 *
 * Skipped types: attachment, file-history-snapshot, permission-mode,
 * queue-operation, last-prompt, and any other unrecognized types.
 *
 * Zero external dependencies — uses only node:fs and node:crypto.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { TranscriptMessage } from './types.js';

// =============================================================================
// OPTIONS
// =============================================================================

export interface JsonlParseOptions {
  /** Include assistant thinking blocks in output. Default: false. */
  includeThinking?: boolean;
  /** Include system messages in output. Default: false. */
  includeSystem?: boolean;
  /** Maximum number of messages to return. */
  maxMessages?: number;
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse a Claude Code JSONL transcript file into TranscriptMessage objects.
 *
 * Malformed lines are silently skipped. The returned messages are ordered by
 * their sequence number (0-based).
 */
export function parseTranscriptJsonl(
  filePath: string,
  options?: JsonlParseOptions,
): TranscriptMessage[] {
  const opts = {
    includeThinking: false,
    includeSystem: false,
    ...options,
  };

  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  const messages: TranscriptMessage[] = [];
  let seq = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    // Cap if requested
    if (opts.maxMessages !== undefined && messages.length >= opts.maxMessages) {
      break;
    }

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Malformed JSON — skip
      continue;
    }

    const type = record['type'] as string | undefined;
    if (!type) continue;

    const message = record['message'] as Record<string, unknown> | undefined;
    const uuid = (record['uuid'] as string) ?? generateId(seq, filePath);
    const timestamp = parseTimestamp(record['timestamp']);
    // sessionId is a placeholder — the caller assigns the real one during capture
    const sessionId = '';

    if (type === 'user') {
      const content = message?.['content'] ?? record['content'];
      const text = flattenUserContent(content);
      if (text === '') continue;

      messages.push({
        id: uuid,
        sessionId,
        seq,
        role: 'user',
        content: text,
        tokenEstimate: estimateTokens(text),
        contentHash: hashContent(text),
        timestamp,
        meta: {},
      });
      seq++;
    } else if (type === 'assistant') {
      const content = message?.['content'] ?? record['content'];
      if (!Array.isArray(content)) continue;

      const text = flattenAssistantContent(content, opts.includeThinking);
      if (text === '') continue;

      messages.push({
        id: uuid,
        sessionId,
        seq,
        role: 'assistant',
        content: text,
        tokenEstimate: estimateTokens(text),
        contentHash: hashContent(text),
        timestamp,
        meta: {},
      });
      seq++;
    } else if (type === 'system' && opts.includeSystem) {
      const content = message?.['content'] ?? record['content'];
      const subtype = record['subtype'] as string | undefined;
      const text = typeof content === 'string' ? content : JSON.stringify(content);
      if (!text || text === '') continue;

      messages.push({
        id: uuid,
        sessionId,
        seq,
        role: 'system',
        content: text,
        tokenEstimate: estimateTokens(text),
        contentHash: hashContent(text),
        timestamp,
        meta: subtype ? { subtype } : {},
      });
      seq++;
    }
    // All other types (attachment, file-history-snapshot, permission-mode,
    // queue-operation, last-prompt, etc.) are silently skipped.
  }

  return messages;
}

// =============================================================================
// CONTENT FLATTENERS
// =============================================================================

/**
 * Flatten assistant content blocks into a single readable string.
 *
 * Block types:
 *   - `{type: "text", text: "..."}` — concatenated as-is
 *   - `{type: "tool_use", name: "...", input: {...}}` — rendered as `[Tool: name(key1, key2, ...)]`
 *   - `{type: "thinking", thinking: "..."}` — included only if `includeThinking` is true
 */
export function flattenAssistantContent(content: unknown[], includeThinking?: boolean): string {
  const parts: string[] = [];

  for (const block of content) {
    if (block === null || block === undefined || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    const blockType = b['type'] as string | undefined;

    if (blockType === 'text') {
      const text = b['text'];
      if (typeof text === 'string' && text.trim() !== '') {
        parts.push(text);
      }
    } else if (blockType === 'tool_use') {
      const name = (b['name'] as string) ?? 'unknown';
      const input = b['input'];
      const keys =
        input && typeof input === 'object' && !Array.isArray(input)
          ? Object.keys(input as Record<string, unknown>)
          : [];
      parts.push(`[Tool: ${name}(${keys.join(', ')})]`);
    } else if (blockType === 'thinking' && includeThinking) {
      const thinking = b['thinking'];
      if (typeof thinking === 'string' && thinking.trim() !== '') {
        parts.push(`[Thinking]\n${thinking}`);
      }
    }
    // Other block types are silently skipped
  }

  return parts.join('\n\n');
}

/**
 * Flatten user content into a single readable string.
 *
 * Content can be:
 *   - A plain string — returned as-is
 *   - An array of tool_result objects — each rendered as `[Tool result: tool_name]`
 *   - Anything else — JSON-stringified as fallback
 */
export function flattenUserContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (item === null || item === undefined || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;

      if (obj['type'] === 'tool_result') {
        const name = (obj['tool_use_id'] as string) ?? 'unknown';
        // tool_result content can be a string or array of content blocks
        const resultContent = obj['content'];
        if (typeof resultContent === 'string' && resultContent.trim() !== '') {
          parts.push(`[Tool result: ${name}]\n${resultContent}`);
        } else if (Array.isArray(resultContent)) {
          const text = resultContent
            .filter(
              (c): c is Record<string, unknown> =>
                c !== null &&
                c !== undefined &&
                typeof c === 'object' &&
                (c as Record<string, unknown>)['type'] === 'text',
            )
            .map((c) => (c as Record<string, unknown>)['text'] as string)
            .join('\n');
          parts.push(text ? `[Tool result: ${name}]\n${text}` : `[Tool result: ${name}]`);
        } else {
          parts.push(`[Tool result: ${name}]`);
        }
      } else if (obj['type'] === 'text') {
        const text = obj['text'];
        if (typeof text === 'string' && text.trim() !== '') {
          parts.push(text);
        }
      }
    }
    return parts.join('\n\n');
  }

  // Fallback: stringify whatever we got
  if (content === null || content === undefined) return '';
  return String(content);
}

// =============================================================================
// HELPERS
// =============================================================================

/** Estimate token count from text (rough: chars / 4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** SHA-256 hash of content, truncated to 16 hex chars. */
function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Parse an ISO-8601 timestamp string to unix epoch (ms), or undefined. */
function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : ms;
  }
  if (typeof value === 'number') {
    return value;
  }
  return undefined;
}

/** Generate a deterministic ID when the JSONL record has no uuid. */
function generateId(seq: number, filePath: string): string {
  return createHash('sha256').update(`${filePath}:${seq}`).digest('hex').slice(0, 24);
}
