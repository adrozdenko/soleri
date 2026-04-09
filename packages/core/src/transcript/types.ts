/**
 * Transcript Memory Lane — types for transcript sessions, messages, segments,
 * search, and capture.
 *
 * These types model conversation transcripts ingested from Claude Code JSONL
 * files (or other sources). They are intentionally storage-agnostic — no DB
 * dependency, pure data shapes.
 */

// =============================================================================
// SESSION
// =============================================================================

/** Origin of the transcript content. */
export type TranscriptSourceKind = 'live_chat' | 'imported_text' | 'imported_file' | 'external';

/** A captured conversation session with aggregate metadata. */
export interface TranscriptSession {
  id: string;
  projectPath: string;
  sourceKind: TranscriptSourceKind;
  sourceRef?: string;
  title?: string;
  participants: string[];
  tags: string[];
  importance: number;
  startedAt?: number;
  endedAt?: number;
  messageCount: number;
  segmentCount: number;
  tokenEstimate: number;
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}

// =============================================================================
// MESSAGE
// =============================================================================

/** Role of the message sender. */
export type TranscriptRole = 'user' | 'assistant' | 'system' | 'tool';

/** A single message within a transcript session. */
export interface TranscriptMessage {
  id: string;
  sessionId: string;
  seq: number;
  role: TranscriptRole;
  speaker?: string;
  content: string;
  tokenEstimate: number;
  contentHash?: string;
  timestamp?: number;
  meta: Record<string, unknown>;
}

// =============================================================================
// SEGMENT
// =============================================================================

/** Segment kind — an exchange (user+assistant pair) or a sliding window. */
export type TranscriptSegmentKind = 'exchange' | 'window';

/** A contiguous slice of messages grouped for search/retrieval. */
export interface TranscriptSegment {
  id: string;
  sessionId: string;
  seqStart: number;
  seqEnd: number;
  kind: TranscriptSegmentKind;
  roleSet: string[];
  speakerSet: string[];
  text: string;
  tokenEstimate: number;
  createdAt: number;
}

// =============================================================================
// SEARCH
// =============================================================================

/** A single search result with scoring breakdown. */
export interface TranscriptSearchHit {
  id: string;
  sessionId: string;
  title?: string;
  excerpt: string;
  seqStart: number;
  seqEnd: number;
  score: number;
  breakdown: {
    bm25: number;
    exactPhrase: number;
    tokenOverlap: number;
  };
  startedAt?: number;
  endedAt?: number;
}

/** Options for searching across transcript segments. */
export interface TranscriptSearchOptions {
  query: string;
  projectPath?: string;
  sessionId?: string;
  sourceKind?: TranscriptSourceKind;
  role?: TranscriptRole;
  startedAfter?: number;
  startedBefore?: number;
  limit?: number;
  verbose?: boolean;
}

// =============================================================================
// CAPTURE
// =============================================================================

/** Input for capturing a new transcript into storage. */
export interface TranscriptCaptureInput {
  projectPath?: string;
  sessionId?: string;
  title?: string;
  sourceKind?: TranscriptSourceKind;
  sourceRef?: string;
  participants?: string[];
  tags?: string[];
  importance?: number;
  segmentMode?: TranscriptSegmentKind;
  messages?: Array<{
    role: TranscriptRole;
    content: string;
    speaker?: string;
    timestamp?: number;
  }>;
  text?: string;
  transcriptPath?: string;
}

/** Result returned after capturing a transcript. */
export interface TranscriptCaptureResult {
  captured: boolean;
  sessionId: string;
  messagesStored: number;
  segmentsStored: number;
  tokenEstimate: number;
}
