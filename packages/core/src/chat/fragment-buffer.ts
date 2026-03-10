/**
 * Fragment Buffer — merges split messages from chat platforms.
 *
 * Telegram, Discord, and other platforms split long pastes into multiple
 * messages (e.g. Telegram's 4096 char limit). This buffer detects near-limit
 * messages and waits briefly for follow-up parts before flushing as one unit.
 *
 * Ported from Salvador's handler-messages.ts with improvements:
 * - Transport-agnostic (works for any chat platform)
 * - Callback-based flush (no transport dependency)
 * - Configurable thresholds
 */

import type { Fragment, FragmentBufferConfig } from './types.js';

const DEFAULT_START_THRESHOLD = 4000;
const DEFAULT_MAX_GAP_MS = 1500;
const DEFAULT_MAX_PARTS = 12;
const DEFAULT_MAX_TOTAL_BYTES = 50_000;

interface PendingBuffer {
  key: string;
  fragments: Fragment[];
  totalBytes: number;
  timer: ReturnType<typeof setTimeout>;
}

export class FragmentBuffer {
  private buffers = new Map<string, PendingBuffer>();
  private config: Required<FragmentBufferConfig>;
  private onFlush: (key: string, merged: string) => void;

  constructor(
    config: FragmentBufferConfig | undefined,
    onFlush: (key: string, merged: string) => void,
  ) {
    this.config = {
      startThreshold: config?.startThreshold ?? DEFAULT_START_THRESHOLD,
      maxGapMs: config?.maxGapMs ?? DEFAULT_MAX_GAP_MS,
      maxParts: config?.maxParts ?? DEFAULT_MAX_PARTS,
      maxTotalBytes: config?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    };
    this.onFlush = onFlush;
  }

  /**
   * Receive a message. Returns true if the message was buffered (caller should wait),
   * false if the message should be processed immediately.
   */
  receive(key: string, fragment: Fragment): boolean {
    const existing = this.buffers.get(key);

    if (existing) {
      // Append to existing buffer
      return this.appendToBuffer(existing, fragment);
    }

    // Check if this message is long enough to start buffering
    if (fragment.text.length >= this.config.startThreshold) {
      this.startBuffer(key, fragment);
      return true;
    }

    // Short message — process immediately
    return false;
  }

  /**
   * Force-flush a specific buffer. Returns the merged text or null if no buffer.
   */
  flush(key: string): string | null {
    const buffer = this.buffers.get(key);
    if (!buffer) return null;

    clearTimeout(buffer.timer);
    const merged = this.mergeFragments(buffer.fragments);
    this.buffers.delete(key);
    return merged;
  }

  /**
   * Force-flush all pending buffers.
   */
  flushAll(): void {
    for (const [key, buffer] of this.buffers) {
      clearTimeout(buffer.timer);
      const merged = this.mergeFragments(buffer.fragments);
      this.buffers.delete(key);
      this.onFlush(key, merged);
    }
  }

  /**
   * Number of keys with pending fragments.
   */
  get pendingCount(): number {
    return this.buffers.size;
  }

  /**
   * Check if a key has pending fragments.
   */
  hasPending(key: string): boolean {
    return this.buffers.has(key);
  }

  /**
   * Close the buffer — flush all and clean up timers.
   */
  close(): void {
    for (const buffer of this.buffers.values()) {
      clearTimeout(buffer.timer);
    }
    this.buffers.clear();
  }

  // ─── Private ───────────────────────────────────────────────────

  private startBuffer(key: string, fragment: Fragment): void {
    const timer = setTimeout(() => this.autoFlush(key), this.config.maxGapMs);
    this.buffers.set(key, {
      key,
      fragments: [fragment],
      totalBytes: fragment.text.length,
      timer,
    });
  }

  private appendToBuffer(buffer: PendingBuffer, fragment: Fragment): boolean {
    const newTotal = buffer.totalBytes + fragment.text.length;

    // Force-flush if limits exceeded
    if (buffer.fragments.length >= this.config.maxParts || newTotal > this.config.maxTotalBytes) {
      this.autoFlush(buffer.key);
      // The new fragment starts fresh — don't buffer it
      return false;
    }

    // Append and reset timer
    clearTimeout(buffer.timer);
    buffer.fragments.push(fragment);
    buffer.totalBytes = newTotal;
    buffer.timer = setTimeout(() => this.autoFlush(buffer.key), this.config.maxGapMs);
    return true;
  }

  private autoFlush(key: string): void {
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    clearTimeout(buffer.timer);
    const merged = this.mergeFragments(buffer.fragments);
    this.buffers.delete(key);
    this.onFlush(key, merged);
  }

  private mergeFragments(fragments: Fragment[]): string {
    return fragments.map((f) => f.text).join('\n');
  }
}
