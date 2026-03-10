/**
 * Chat transport types — generic primitives for conversational agent transports.
 *
 * Works for Telegram, Discord, Slack, or any chat-based interface.
 * Transport-specific wiring (Grammy, discord.js, etc.) belongs in forge templates.
 */

// ─── Messages ────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Optional structured content blocks (e.g. tool_use, tool_result, image). */
  blocks?: unknown[];
  /** Unix timestamp ms. */
  timestamp: number;
  /** Transport-specific metadata (message ID, chat ID, etc.). */
  meta?: Record<string, unknown>;
}

// ─── Sessions ────────────────────────────────────────────────────────

export interface ChatSession {
  /** Unique session ID (typically the chat/channel ID from the transport). */
  id: string;
  /** Conversation messages. */
  messages: ChatMessage[];
  /** Unix timestamp ms when the session was created. */
  createdAt: number;
  /** Unix timestamp ms of the last activity. */
  lastActiveAt: number;
  /** Custom metadata (personality state, counters, etc.). */
  meta?: Record<string, unknown>;
}

export interface ChatSessionConfig {
  /** Directory for session persistence. */
  storageDir: string;
  /** TTL in ms for inactivity expiry. Default: 7_200_000 (2 hours). */
  ttlMs?: number;
  /** Max messages before compaction triggers. Default: 100. */
  compactionThreshold?: number;
  /** Messages to keep after compaction. Default: 40. */
  compactionKeep?: number;
}

// ─── Fragment Buffering ──────────────────────────────────────────────

export interface Fragment {
  /** The message text. */
  text: string;
  /** Transport message ID (for ordering). */
  messageId: number | string;
  /** Unix timestamp ms when received. */
  receivedAt: number;
}

export interface FragmentBufferConfig {
  /** Character threshold to start buffering. Default: 4000. */
  startThreshold?: number;
  /** Max gap in ms between fragments before auto-flush. Default: 1500. */
  maxGapMs?: number;
  /** Maximum number of fragments to merge. Default: 12. */
  maxParts?: number;
  /** Maximum total bytes before force-flush. Default: 50_000. */
  maxTotalBytes?: number;
}

// ─── Response Chunking ──────────────────────────────────────────────

export type MarkupFormat = 'html' | 'markdown' | 'plain';

export interface ChunkConfig {
  /** Max characters per chunk. Default: 4000. */
  maxChunkSize?: number;
  /** Output markup format. Default: 'html'. */
  format?: MarkupFormat;
}

// ─── Authentication ──────────────────────────────────────────────────

export interface ChatAuthConfig {
  /** Path to auth persistence file. */
  storagePath: string;
  /** Passphrase required for authentication. If unset, auth is disabled. */
  passphrase?: string;
  /** Allowed user IDs. If empty or unset, any authenticated user is allowed. */
  allowedUsers?: (string | number)[];
  /** Rate limit: max failed attempts before temporary lockout. Default: 5. */
  maxFailedAttempts?: number;
  /** Lockout duration in ms. Default: 300_000 (5 minutes). */
  lockoutMs?: number;
}

export interface AuthRecord {
  userId: string | number;
  authenticatedAt: number;
}

export interface AuthState {
  authenticated: AuthRecord[];
  failedAttempts: Map<string, { count: number; lastAttempt: number }>;
}

// ─── Chat Manager (combines everything) ─────────────────────────────

export interface ChatManagerConfig {
  session: ChatSessionConfig;
  fragment?: FragmentBufferConfig;
  chunk?: ChunkConfig;
  auth?: ChatAuthConfig;
}

export interface ChatManagerStatus {
  activeSessions: number;
  authenticatedUsers: number;
  pendingFragments: number;
  config: {
    ttlMs: number;
    compactionThreshold: number;
    maxChunkSize: number;
    authEnabled: boolean;
  };
}
