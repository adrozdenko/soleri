/**
 * Message Queue — disk-based message passing for zero-cost chat relay.
 *
 * The queue bot writes incoming messages to inbox/. Claude Code (or any
 * processor) reads them, generates responses, and writes to outbox/.
 * The outbox poller sends replies back through the chat transport.
 *
 * Directory structure:
 *   ~/.{agentId}/queue/
 *     inbox/    ← bot writes, processor reads
 *     outbox/   ← processor writes, bot reads and sends
 */

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────

export interface QueuedMessage {
  /** Unique message ID: `{chatId}-{timestamp}`. */
  id: string;
  /** Chat/channel ID. */
  chatId: string;
  /** Sender user ID. */
  userId: string;
  /** Sender username (if available). */
  username?: string;
  /** Message type. */
  type: 'text' | 'voice' | 'photo';
  /** Text content (for text messages or transcribed voice). */
  text?: string;
  /** Voice metadata. */
  voice?: { fileId: string; duration: number };
  /** Photo metadata. */
  photo?: { fileId: string; caption?: string };
  /** ISO timestamp. */
  timestamp: string;
}

export interface QueuedResponse {
  /** Original message ID this responds to. */
  messageId: string;
  /** Target chat ID. */
  chatId: string;
  /** Response text. */
  text: string;
  /** ISO timestamp. */
  timestamp: string;
}

export interface QueueConfig {
  /** Base directory for queue (e.g., ~/.{agentId}/queue). */
  queueDir: string;
}

// ─── Queue Manager ───────────────────────────────────────────────────

export class MessageQueue {
  private readonly inboxDir: string;
  private readonly outboxDir: string;

  constructor(config: QueueConfig) {
    this.inboxDir = join(config.queueDir, 'inbox');
    this.outboxDir = join(config.queueDir, 'outbox');
    mkdirSync(this.inboxDir, { recursive: true });
    mkdirSync(this.outboxDir, { recursive: true });
  }

  /**
   * Enqueue an incoming message to inbox.
   */
  enqueue(msg: Omit<QueuedMessage, 'id' | 'timestamp'>): QueuedMessage {
    const timestamp = new Date().toISOString();
    const id = `${msg.chatId}-${Date.now()}`;
    const queued: QueuedMessage = { ...msg, id, timestamp };
    const filename = `${id}.json`;
    writeFileSync(join(this.inboxDir, filename), JSON.stringify(queued, null, 2), 'utf-8');
    return queued;
  }

  /**
   * Read all pending inbox messages, sorted by timestamp.
   */
  readInbox(): QueuedMessage[] {
    const files = this.listJsonFiles(this.inboxDir);
    const messages: QueuedMessage[] = [];

    for (const file of files) {
      try {
        const raw = readFileSync(join(this.inboxDir, file), 'utf-8');
        messages.push(JSON.parse(raw) as QueuedMessage);
      } catch {
        // Skip corrupt files
      }
    }

    return messages.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /**
   * Get the number of pending inbox messages.
   */
  inboxCount(): number {
    return this.listJsonFiles(this.inboxDir).length;
  }

  /**
   * Remove a message from inbox (after processing).
   */
  removeFromInbox(messageId: string): boolean {
    const filename = `${messageId}.json`;
    const filepath = join(this.inboxDir, filename);
    if (!existsSync(filepath)) return false;
    try {
      unlinkSync(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Write a response to outbox.
   */
  sendResponse(messageId: string, chatId: string, text: string): QueuedResponse {
    const response: QueuedResponse = {
      messageId,
      chatId,
      text,
      timestamp: new Date().toISOString(),
    };
    const filename = `${chatId}-${Date.now()}.json`;
    writeFileSync(join(this.outboxDir, filename), JSON.stringify(response, null, 2), 'utf-8');
    // Remove from inbox
    this.removeFromInbox(messageId);
    return response;
  }

  /**
   * Read and remove all pending outbox responses.
   */
  drainOutbox(): QueuedResponse[] {
    const files = this.listJsonFiles(this.outboxDir);
    const responses: QueuedResponse[] = [];

    for (const file of files) {
      const filepath = join(this.outboxDir, file);
      try {
        const raw = readFileSync(filepath, 'utf-8');
        responses.push(JSON.parse(raw) as QueuedResponse);
        unlinkSync(filepath);
      } catch {
        // Skip corrupt files
      }
    }

    return responses.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /**
   * Get outbox count.
   */
  outboxCount(): number {
    return this.listJsonFiles(this.outboxDir).length;
  }

  /**
   * Format inbox as readable text (for MCP tool output).
   */
  formatInbox(): string {
    const messages = this.readInbox();
    if (messages.length === 0) return 'No pending messages.';

    return messages
      .map((m) => {
        const age = Math.round((Date.now() - new Date(m.timestamp).getTime()) / 1000);
        const content =
          m.type === 'text'
            ? m.text
            : m.type === 'voice'
              ? `[Voice: ${m.voice?.duration}s]`
              : `[Photo: ${m.photo?.caption ?? 'no caption'}]`;
        return `[${m.id}] ${m.username ?? m.userId} (${age}s ago): ${content}`;
      })
      .join('\n');
  }

  private listJsonFiles(dir: string): string[] {
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort();
    } catch {
      return [];
    }
  }
}
