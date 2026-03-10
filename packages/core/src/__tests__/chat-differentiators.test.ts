/**
 * Chat Differentiators Tests — voice, queue, browser sessions.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { transcribeAudio, synthesizeSpeech } from '../chat/voice.js';
import { MessageQueue } from '../chat/queue.js';
import { BrowserSessionManager } from '../chat/browser-session.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'chat-diff-'));
}

// ─── Voice ───────────────────────────────────────────────────────────

describe('Voice', () => {
  describe('transcribeAudio', () => {
    test('returns fallback when no API key', async () => {
      const result = await transcribeAudio(Buffer.from('fake-audio'), {});
      expect(result.success).toBe(false);
      expect(result.text).toContain('unavailable');
    });

    test('returns fallback with empty API key', async () => {
      const result = await transcribeAudio(Buffer.from('fake-audio'), {
        openaiApiKey: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('synthesizeSpeech', () => {
    test('returns null when no API key', async () => {
      const result = await synthesizeSpeech('hello', {});
      expect(result).toBeNull();
    });

    test('returns null with empty API key', async () => {
      const result = await synthesizeSpeech('hello', { openaiApiKey: '' });
      expect(result).toBeNull();
    });
  });
});

// ─── MessageQueue ────────────────────────────────────────────────────

describe('MessageQueue', () => {
  let tmpDir: string;
  let queue: MessageQueue;

  beforeEach(() => {
    tmpDir = makeTempDir();
    queue = new MessageQueue({ queueDir: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('enqueue creates a file in inbox', () => {
    const msg = queue.enqueue({
      chatId: 'chat-1',
      userId: 'user-1',
      type: 'text',
      text: 'hello',
    });
    expect(msg.id).toContain('chat-1');
    expect(msg.timestamp).toBeTruthy();

    const inboxFiles = readdirSync(join(tmpDir, 'inbox'));
    expect(inboxFiles).toHaveLength(1);
  });

  test('readInbox returns sorted messages', () => {
    queue.enqueue({ chatId: 'a', userId: 'u1', type: 'text', text: 'first' });
    queue.enqueue({ chatId: 'b', userId: 'u2', type: 'text', text: 'second' });

    const messages = queue.readInbox();
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe('first');
    expect(messages[1].text).toBe('second');
  });

  test('inboxCount reflects state', () => {
    expect(queue.inboxCount()).toBe(0);
    queue.enqueue({ chatId: 'a', userId: 'u1', type: 'text', text: 'x' });
    expect(queue.inboxCount()).toBe(1);
    queue.enqueue({ chatId: 'b', userId: 'u2', type: 'text', text: 'y' });
    expect(queue.inboxCount()).toBe(2);
  });

  test('removeFromInbox deletes the file', () => {
    const msg = queue.enqueue({ chatId: 'a', userId: 'u1', type: 'text', text: 'x' });
    expect(queue.removeFromInbox(msg.id)).toBe(true);
    expect(queue.inboxCount()).toBe(0);
  });

  test('removeFromInbox returns false for unknown ID', () => {
    expect(queue.removeFromInbox('nonexistent')).toBe(false);
  });

  test('sendResponse writes to outbox and removes from inbox', () => {
    const msg = queue.enqueue({ chatId: 'chat-1', userId: 'u1', type: 'text', text: 'q' });
    const resp = queue.sendResponse(msg.id, 'chat-1', 'answer');
    expect(resp.chatId).toBe('chat-1');
    expect(resp.text).toBe('answer');
    expect(queue.inboxCount()).toBe(0);
    expect(queue.outboxCount()).toBe(1);
  });

  test('drainOutbox returns and removes responses', () => {
    const msg = queue.enqueue({ chatId: 'chat-1', userId: 'u1', type: 'text', text: 'q' });
    queue.sendResponse(msg.id, 'chat-1', 'a');

    const responses = queue.drainOutbox();
    expect(responses).toHaveLength(1);
    expect(responses[0].text).toBe('a');
    expect(queue.outboxCount()).toBe(0);
  });

  test('formatInbox returns readable text', () => {
    queue.enqueue({
      chatId: 'chat-1',
      userId: 'user-1',
      username: 'alice',
      type: 'text',
      text: 'hello',
    });
    const formatted = queue.formatInbox();
    expect(formatted).toContain('alice');
    expect(formatted).toContain('hello');
  });

  test('formatInbox handles empty inbox', () => {
    expect(queue.formatInbox()).toBe('No pending messages.');
  });

  test('enqueue handles voice messages', () => {
    const msg = queue.enqueue({
      chatId: 'chat-1',
      userId: 'u1',
      type: 'voice',
      voice: { fileId: 'file-123', duration: 5 },
    });
    expect(msg.type).toBe('voice');
    expect(msg.voice?.duration).toBe(5);
  });

  test('enqueue handles photo messages', () => {
    const msg = queue.enqueue({
      chatId: 'chat-1',
      userId: 'u1',
      type: 'photo',
      photo: { fileId: 'file-456', caption: 'a photo' },
    });
    expect(msg.type).toBe('photo');
    expect(msg.photo?.caption).toBe('a photo');
  });
});

// ─── BrowserSessionManager ──────────────────────────────────────────

describe('BrowserSessionManager', () => {
  let mgr: BrowserSessionManager;

  beforeEach(() => {
    // Use 'echo' as the command so we don't actually spawn Playwright
    mgr = new BrowserSessionManager({
      command: 'echo',
      args: ['test'],
      idleTimeoutMs: 60_000,
      maxSessions: 3,
    });
  });

  afterEach(() => {
    mgr.closeAll();
  });

  test('acquire creates a session', () => {
    const session = mgr.acquire('chat-1');
    expect(session.chatId).toBe('chat-1');
    expect(session.process).toBeTruthy();
    expect(mgr.size).toBe(1);
  });

  test('acquire reuses existing session', () => {
    const s1 = mgr.acquire('chat-1');
    const s2 = mgr.acquire('chat-1');
    expect(s1.process).toBe(s2.process);
    expect(mgr.size).toBe(1);
  });

  test('release removes session', () => {
    mgr.acquire('chat-1');
    expect(mgr.release('chat-1')).toBe(true);
    expect(mgr.size).toBe(0);
  });

  test('release returns false for unknown', () => {
    expect(mgr.release('nonexistent')).toBe(false);
  });

  test('has checks session existence', () => {
    expect(mgr.has('chat-1')).toBe(false);
    mgr.acquire('chat-1');
    expect(mgr.has('chat-1')).toBe(true);
  });

  test('closeAll closes everything', () => {
    mgr.acquire('a');
    mgr.acquire('b');
    mgr.acquire('c');
    const count = mgr.closeAll();
    expect(count).toBe(3);
    expect(mgr.size).toBe(0);
  });

  test('evicts oldest when at capacity', () => {
    mgr.acquire('a');
    mgr.acquire('b');
    mgr.acquire('c');
    expect(mgr.size).toBe(3);

    // This should evict 'a' (oldest)
    mgr.acquire('d');
    expect(mgr.size).toBe(3);
    expect(mgr.has('a')).toBe(false);
    expect(mgr.has('d')).toBe(true);
  });

  test('listSessions returns chat IDs', () => {
    mgr.acquire('x');
    mgr.acquire('y');
    expect(mgr.listSessions().sort()).toEqual(['x', 'y']);
  });

  test('getInfo returns session details', () => {
    mgr.acquire('chat-1');
    const info = mgr.getInfo('chat-1');
    expect(info).not.toBeNull();
    expect(info!.lastUsed).toBeGreaterThan(0);
  });

  test('getInfo returns null for unknown', () => {
    expect(mgr.getInfo('nonexistent')).toBeNull();
  });
});
