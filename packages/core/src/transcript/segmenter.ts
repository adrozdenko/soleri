/**
 * Transcript Segmenter — splits message arrays into TranscriptSegment chunks.
 *
 * Two modes:
 *   - Exchange: groups messages by user turn (user + following assistant/system/tool).
 *   - Window:   sliding character-based window with configurable overlap.
 *
 * Pure functions, no DB dependency. Zero external deps (node:crypto only).
 */

import { createHash } from 'node:crypto';
import type { TranscriptMessage, TranscriptSegment } from './types.js';
import { estimateTokens } from './jsonl-parser.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_SEGMENT_TOKENS = 4000;

// =============================================================================
// EXCHANGE SEGMENTATION
// =============================================================================

/**
 * Segment messages by exchange — each segment starts at a user message and
 * includes all following assistant/system/tool messages until the next user
 * message. Segments that exceed MAX_SEGMENT_TOKENS are split at message
 * boundaries.
 *
 * If there are no user messages, falls back to window segmentation.
 */
export function segmentByExchange(
  sessionId: string,
  messages: TranscriptMessage[],
): TranscriptSegment[] {
  if (messages.length === 0) return [];

  // Sort by seq
  const sorted = [...messages].sort((a, b) => a.seq - b.seq);

  // If no user messages, fall back to window segmentation
  const hasUserMessage = sorted.some((m) => m.role === 'user');
  if (!hasUserMessage) {
    return segmentByWindow(sessionId, messages);
  }

  // Group messages into exchanges (user turn + following non-user messages)
  const exchanges: TranscriptMessage[][] = [];
  let current: TranscriptMessage[] = [];

  for (const msg of sorted) {
    if (msg.role === 'user' && current.length > 0) {
      exchanges.push(current);
      current = [];
    }
    current.push(msg);
  }
  if (current.length > 0) {
    exchanges.push(current);
  }

  // Build segments, splitting exchanges that exceed MAX_SEGMENT_TOKENS
  const segments: TranscriptSegment[] = [];

  for (const exchange of exchanges) {
    const splits = splitByTokenCap(exchange, MAX_SEGMENT_TOKENS);
    for (const split of splits) {
      segments.push(buildSegment(sessionId, split, 'exchange'));
    }
  }

  return segments;
}

// =============================================================================
// WINDOW SEGMENTATION
// =============================================================================

export interface WindowOptions {
  /** Minimum characters to accumulate before closing a window. Default: 1200. */
  minChars?: number;
  /** Maximum characters for a single message to be its own segment. Default: 1800. */
  maxChars?: number;
  /** Number of messages to overlap between windows. Default: 1. */
  overlap?: number;
}

/**
 * Segment messages using a sliding character-based window.
 *
 * Messages are accumulated until their combined character count reaches
 * minChars, then the segment is closed. A single message exceeding maxChars
 * becomes its own segment. The next window starts with `overlap` messages
 * carried over from the end of the previous window.
 */
export function segmentByWindow(
  sessionId: string,
  messages: TranscriptMessage[],
  options?: WindowOptions,
): TranscriptSegment[] {
  if (messages.length === 0) return [];

  const minChars = options?.minChars ?? 1200;
  const maxChars = options?.maxChars ?? 1800;
  const overlap = options?.overlap ?? 1;

  const sorted = [...messages].sort((a, b) => a.seq - b.seq);
  const segments: TranscriptSegment[] = [];
  let i = 0;

  while (i < sorted.length) {
    const window: TranscriptMessage[] = [];
    let charCount = 0;

    // Single message exceeding maxChars — give it its own segment
    if (sorted[i].content.length >= maxChars) {
      window.push(sorted[i]);
      segments.push(buildSegment(sessionId, window, 'window'));
      i++;
      continue;
    }

    // Accumulate messages until we reach minChars
    while (i < sorted.length && charCount < minChars) {
      const msg = sorted[i];

      // If adding this message would make us exceed maxChars and we already
      // have content, check if this single message is oversized
      if (msg.content.length >= maxChars) {
        // Don't include it — let the next iteration handle it as its own segment
        break;
      }

      window.push(msg);
      charCount += msg.content.length;
      i++;
    }

    if (window.length > 0) {
      segments.push(buildSegment(sessionId, window, 'window'));

      // Apply overlap: step back by `overlap` messages for the next window
      if (i < sorted.length && overlap > 0) {
        i = Math.max(i - overlap, window.length > overlap ? i - overlap : i);
        // Prevent infinite loop: ensure we always make forward progress
        const minProgress = i - overlap;
        if (minProgress <= (segments.length > 1 ? i - window.length : -1)) {
          // Already at or behind where we started — just continue from i
        }
      }
    }
  }

  return segments;
}

// =============================================================================
// HELPER: hashContent
// =============================================================================

/** SHA-256 hash of content, truncated to 16 hex chars. */
export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// =============================================================================
// CONVENIENCE WRAPPER
// =============================================================================

/**
 * Segment messages using the specified mode.
 *
 * @param mode - 'exchange' (default) groups by user turns; 'window' uses a
 *   sliding character window.
 */
export function segmentMessages(
  sessionId: string,
  messages: TranscriptMessage[],
  mode: 'exchange' | 'window' = 'exchange',
  windowOptions?: WindowOptions,
): TranscriptSegment[] {
  if (mode === 'window') return segmentByWindow(sessionId, messages, windowOptions);
  return segmentByExchange(sessionId, messages);
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Build a TranscriptSegment from a group of messages.
 */
function buildSegment(
  sessionId: string,
  msgs: TranscriptMessage[],
  kind: 'exchange' | 'window',
): TranscriptSegment {
  const seqStart = msgs[0].seq;
  const seqEnd = msgs[msgs.length - 1].seq;
  const text = msgs.map((m) => m.content).join('\n');

  const roleSet = [...new Set(msgs.map((m) => m.role))];
  const speakerSet = [
    ...new Set(
      msgs.map((m) => m.speaker).filter((s): s is string => s !== null && s !== undefined),
    ),
  ];

  return {
    id: `seg-${sessionId.slice(0, 8)}-${seqStart}`,
    sessionId,
    seqStart,
    seqEnd,
    kind,
    roleSet,
    speakerSet,
    text,
    tokenEstimate: estimateTokens(text),
    createdAt: (Date.now() / 1000) | 0,
  };
}

/**
 * Split a group of messages at message boundaries so that no chunk exceeds
 * the token cap. Returns one or more arrays of messages.
 */
function splitByTokenCap(msgs: TranscriptMessage[], cap: number): TranscriptMessage[][] {
  const chunks: TranscriptMessage[][] = [];
  let current: TranscriptMessage[] = [];
  let cumulative = 0;

  for (const msg of msgs) {
    const msgTokens = estimateTokens(msg.content);

    // If adding this message would exceed the cap and we have messages already,
    // start a new chunk
    if (cumulative + msgTokens > cap && current.length > 0) {
      chunks.push(current);
      current = [];
      cumulative = 0;
    }

    current.push(msg);
    cumulative += msgTokens;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
