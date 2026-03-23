/**
 * Chat Transport Tests — session management, fragment buffering,
 * response chunking, and authentication.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatSessionManager } from './chat-session.js';
import { FragmentBuffer } from './fragment-buffer.js';
import { ChatAuthManager } from './auth-manager.js';
import { TaskCancellationManager } from './cancellation.js';
import { chunkResponse, markdownToHtml, convertMarkup } from './response-chunker.js';
import type { Fragment } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'chat-test-'));
}

// ─── Session Manager ────────────────────────────────────────────────

describe('ChatSessionManager', () => {
  let dir: string;
  let manager: ChatSessionManager;

  beforeEach(() => {
    dir = makeTempDir();
    manager = new ChatSessionManager({ storageDir: dir });
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('lifecycle', () => {
    test('creates new session', () => {
      const session = manager.getOrCreate('chat-1');
      expect(session.id).toBe('chat-1');
      expect(session.messages).toEqual([]);
      expect(session.createdAt).toBeGreaterThan(0);
    });

    test('returns existing session', () => {
      const s1 = manager.getOrCreate('chat-1');
      const s2 = manager.getOrCreate('chat-1');
      expect(s1).toBe(s2);
    });

    test('get returns undefined for missing session', () => {
      expect(manager.get('nonexistent')).toBeUndefined();
    });

    test('has checks existence', () => {
      expect(manager.has('chat-1')).toBe(false);
      manager.getOrCreate('chat-1');
      expect(manager.has('chat-1')).toBe(true);
    });

    test('size reflects active sessions', () => {
      expect(manager.size).toBe(0);
      manager.getOrCreate('chat-1');
      manager.getOrCreate('chat-2');
      expect(manager.size).toBe(2);
    });
  });

  describe('messages', () => {
    test('append message persists', () => {
      manager.appendMessage('chat-1', {
        role: 'user',
        content: 'hello',
        timestamp: Date.now(),
      });
      expect(manager.messageCount('chat-1')).toBe(1);
    });

    test('append multiple messages', () => {
      manager.appendMessages('chat-1', [
        { role: 'user', content: 'hello', timestamp: Date.now() },
        { role: 'assistant', content: 'hi', timestamp: Date.now() },
      ]);
      expect(manager.messageCount('chat-1')).toBe(2);
    });

    test('compaction keeps last N messages', () => {
      const compactManager = new ChatSessionManager({
        storageDir: dir,
        compactionThreshold: 10,
        compactionKeep: 5,
      });

      for (let i = 0; i < 15; i++) {
        compactManager.appendMessage('chat-1', {
          role: 'user',
          content: `message ${i}`,
          timestamp: Date.now(),
        });
      }

      const session = compactManager.getOrCreate('chat-1');
      // After compaction(s), messages should be fewer than the 15 we added
      expect(session.messages.length).toBeLessThan(15);
      // Last message should be the most recent
      expect(session.messages[session.messages.length - 1].content).toBe('message 14');
      compactManager.close();
    });
  });

  describe('operations', () => {
    test('clear wipes messages', () => {
      manager.appendMessage('chat-1', {
        role: 'user',
        content: 'hello',
        timestamp: Date.now(),
      });
      manager.clear('chat-1');
      expect(manager.messageCount('chat-1')).toBe(0);
    });

    test('delete removes session', () => {
      manager.getOrCreate('chat-1');
      manager.delete('chat-1');
      expect(manager.has('chat-1')).toBe(false);
      expect(manager.size).toBe(0);
    });

    test('listAll includes all sessions', () => {
      manager.getOrCreate('chat-1');
      manager.getOrCreate('chat-2');
      const all = manager.listAll();
      expect(all).toContain('chat-1');
      expect(all).toContain('chat-2');
    });

    test('setMeta updates metadata', () => {
      manager.getOrCreate('chat-1');
      manager.setMeta('chat-1', { mood: 'happy' });
      const session = manager.getOrCreate('chat-1');
      expect(session.meta).toEqual({ mood: 'happy' });
    });
  });

  describe('persistence', () => {
    test('session survives manager restart', () => {
      manager.appendMessage('chat-1', {
        role: 'user',
        content: 'persist me',
        timestamp: Date.now(),
      });
      manager.close();

      // New manager loads from disk
      const manager2 = new ChatSessionManager({ storageDir: dir });
      expect(manager2.has('chat-1')).toBe(true);
      const session = manager2.getOrCreate('chat-1');
      expect(session.messages.length).toBe(1);
      expect(session.messages[0].content).toBe('persist me');
      manager2.close();
    });

    test('delete removes from disk', () => {
      manager.getOrCreate('chat-1');
      manager.delete('chat-1');

      const manager2 = new ChatSessionManager({ storageDir: dir });
      expect(manager2.has('chat-1')).toBe(false);
      manager2.close();
    });
  });

  describe('reaping', () => {
    test('reap removes expired sessions', () => {
      const shortTtl = new ChatSessionManager({
        storageDir: dir,
        ttlMs: 1, // 1ms TTL
      });

      shortTtl.getOrCreate('chat-1');

      // Force the session to be old
      const session = shortTtl.getOrCreate('chat-1');
      session.lastActiveAt = Date.now() - 100;

      const reaped = shortTtl.reap();
      expect(reaped).toBe(1);
      expect(shortTtl.size).toBe(0);
      shortTtl.close();
    });

    test('reap skips active sessions', () => {
      const shortTtl = new ChatSessionManager({
        storageDir: dir,
        ttlMs: 60_000,
      });

      shortTtl.getOrCreate('chat-1');
      const reaped = shortTtl.reap();
      expect(reaped).toBe(0);
      expect(shortTtl.size).toBe(1);
      shortTtl.close();
    });

    test('disabled TTL skips reaping', () => {
      const noTtl = new ChatSessionManager({
        storageDir: dir,
        ttlMs: 0,
      });
      noTtl.getOrCreate('chat-1');
      expect(noTtl.reap()).toBe(0);
      noTtl.close();
    });
  });
});

// ─── Fragment Buffer ────────────────────────────────────────────────

describe('FragmentBuffer', () => {
  test('short messages pass through', () => {
    const flushed: string[] = [];
    const buffer = new FragmentBuffer(undefined, (_key, text) => flushed.push(text));

    const fragment: Fragment = {
      text: 'short message',
      messageId: 1,
      receivedAt: Date.now(),
    };

    const buffered = buffer.receive('user-1', fragment);
    expect(buffered).toBe(false);
    expect(flushed.length).toBe(0);
    buffer.close();
  });

  test('long messages start buffering', () => {
    const flushed: string[] = [];
    const buffer = new FragmentBuffer(undefined, (_key, text) => flushed.push(text));

    const longText = 'x'.repeat(4000);
    const buffered = buffer.receive('user-1', {
      text: longText,
      messageId: 1,
      receivedAt: Date.now(),
    });

    expect(buffered).toBe(true);
    expect(buffer.hasPending('user-1')).toBe(true);
    buffer.close();
  });

  test('manual flush returns merged text', () => {
    const flushed: string[] = [];
    const buffer = new FragmentBuffer(undefined, (_key, text) => flushed.push(text));

    buffer.receive('user-1', {
      text: 'x'.repeat(4000),
      messageId: 1,
      receivedAt: Date.now(),
    });

    const merged = buffer.flush('user-1');
    expect(merged).toBe('x'.repeat(4000));
    expect(buffer.hasPending('user-1')).toBe(false);
    buffer.close();
  });

  test('multiple fragments merge with newlines', () => {
    const flushed: string[] = [];
    const buffer = new FragmentBuffer(undefined, (_key, text) => flushed.push(text));

    buffer.receive('user-1', {
      text: 'x'.repeat(4000),
      messageId: 1,
      receivedAt: Date.now(),
    });

    buffer.receive('user-1', {
      text: 'y'.repeat(100),
      messageId: 2,
      receivedAt: Date.now(),
    });

    const merged = buffer.flush('user-1');
    expect(merged).toBe('x'.repeat(4000) + '\n' + 'y'.repeat(100));
    buffer.close();
  });

  test('flushAll flushes all pending buffers', () => {
    const flushed: string[] = [];
    const buffer = new FragmentBuffer(undefined, (_key, text) => flushed.push(text));

    buffer.receive('user-1', {
      text: 'x'.repeat(4000),
      messageId: 1,
      receivedAt: Date.now(),
    });

    buffer.receive('user-2', {
      text: 'y'.repeat(4000),
      messageId: 1,
      receivedAt: Date.now(),
    });

    buffer.flushAll();
    expect(flushed.length).toBe(2);
    expect(buffer.pendingCount).toBe(0);
    buffer.close();
  });

  test('custom threshold changes buffer trigger', () => {
    const flushed: string[] = [];
    const buffer = new FragmentBuffer({ startThreshold: 10 }, (_key, text) => flushed.push(text));

    const buffered = buffer.receive('user-1', {
      text: 'short text!',
      messageId: 1,
      receivedAt: Date.now(),
    });

    expect(buffered).toBe(true);
    buffer.close();
  });

  test('auto-flushes after timeout', async () => {
    const flushed: string[] = [];
    const buffer = new FragmentBuffer({ maxGapMs: 50 }, (_key, text) => flushed.push(text));

    buffer.receive('user-1', {
      text: 'x'.repeat(4000),
      messageId: 1,
      receivedAt: Date.now(),
    });

    // Wait for auto-flush
    await new Promise((r) => setTimeout(r, 100));
    expect(flushed.length).toBe(1);
    buffer.close();
  });

  test('flush returns null for missing key', () => {
    const buffer = new FragmentBuffer(undefined, () => {});
    expect(buffer.flush('nonexistent')).toBeNull();
    buffer.close();
  });
});

// ─── Response Chunker ───────────────────────────────────────────────

describe('Response Chunker', () => {
  describe('chunkResponse', () => {
    test('short text returns single chunk', () => {
      const chunks = chunkResponse('Hello world');
      expect(chunks.length).toBe(1);
    });

    test('long text splits into multiple chunks', () => {
      const longText = 'Word '.repeat(2000);
      const chunks = chunkResponse(longText, { maxChunkSize: 100 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(100);
      }
    });

    test('splits at paragraph boundaries', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const chunks = chunkResponse(text, { maxChunkSize: 30, format: 'plain' });
      expect(chunks.length).toBeGreaterThan(1);
    });

    test('markdown format passes through', () => {
      const chunks = chunkResponse('**bold**', { format: 'markdown' });
      expect(chunks[0]).toBe('**bold**');
    });

    test('plain format strips markdown', () => {
      const chunks = chunkResponse('**bold** and *italic*', { format: 'plain' });
      expect(chunks[0]).toBe('bold and italic');
    });
  });

  describe('markdownToHtml', () => {
    test('converts bold', () => {
      expect(markdownToHtml('**bold**')).toBe('<b>bold</b>');
    });

    test('converts italic', () => {
      expect(markdownToHtml('*italic*')).toBe('<i>italic</i>');
    });

    test('converts bold+italic', () => {
      expect(markdownToHtml('***both***')).toBe('<b><i>both</i></b>');
    });

    test('converts strikethrough', () => {
      expect(markdownToHtml('~~deleted~~')).toBe('<s>deleted</s>');
    });

    test('converts inline code', () => {
      expect(markdownToHtml('use `const`')).toBe('use <code>const</code>');
    });

    test('converts fenced code blocks', () => {
      const md = '```ts\nconst x = 1;\n```';
      const html = markdownToHtml(md);
      expect(html).toContain('<pre><code class="language-ts">');
      expect(html).toContain('const x = 1;');
    });

    test('escapes HTML in code blocks', () => {
      const md = '```\n<div>test</div>\n```';
      const html = markdownToHtml(md);
      expect(html).toContain('&lt;div&gt;');
    });

    test('converts headings to bold', () => {
      expect(markdownToHtml('# Title')).toBe('<b>Title</b>');
      expect(markdownToHtml('## Subtitle')).toBe('<b>Subtitle</b>');
    });

    test('converts links', () => {
      expect(markdownToHtml('[text](https://example.com)')).toBe(
        '<a href="https://example.com">text</a>',
      );
    });

    test('converts blockquotes', () => {
      const result = markdownToHtml('> quoted text');
      expect(result).toContain('<blockquote>');
      expect(result).toContain('quoted text');
    });

    test('converts unordered lists', () => {
      expect(markdownToHtml('- item 1')).toBe('• item 1');
      expect(markdownToHtml('* item 2')).toBe('• item 2');
    });

    test('converts ordered lists', () => {
      expect(markdownToHtml('1. first')).toBe('• first');
    });

    test('converts horizontal rules', () => {
      const result = markdownToHtml('---');
      expect(result).toContain('─');
    });
  });

  describe('convertMarkup', () => {
    test('html format converts markdown', () => {
      expect(convertMarkup('**bold**', 'html')).toBe('<b>bold</b>');
    });

    test('plain format strips formatting', () => {
      expect(convertMarkup('**bold**', 'plain')).toBe('bold');
    });

    test('markdown format passes through', () => {
      expect(convertMarkup('**bold**', 'markdown')).toBe('**bold**');
    });
  });
});

// ─── Auth Manager ───────────────────────────────────────────────────

describe('ChatAuthManager', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('disabled when no passphrase', () => {
    const auth = new ChatAuthManager({ storagePath: join(dir, 'auth.json') });
    expect(auth.enabled).toBe(false);
    expect(auth.isAuthenticated('user-1')).toBe(true); // everyone passes
  });

  test('enabled with passphrase', () => {
    const auth = new ChatAuthManager({
      storagePath: join(dir, 'auth.json'),
      passphrase: 'secret',
    });
    expect(auth.enabled).toBe(true);
    expect(auth.isAuthenticated('user-1')).toBe(false);
  });

  test('successful authentication', () => {
    const auth = new ChatAuthManager({
      storagePath: join(dir, 'auth.json'),
      passphrase: 'secret',
    });
    expect(auth.authenticate('user-1', 'secret')).toBe(true);
    expect(auth.isAuthenticated('user-1')).toBe(true);
  });

  test('failed authentication', () => {
    const auth = new ChatAuthManager({
      storagePath: join(dir, 'auth.json'),
      passphrase: 'secret',
    });
    expect(auth.authenticate('user-1', 'wrong')).toBe(false);
    expect(auth.isAuthenticated('user-1')).toBe(false);
  });

  test('revoke removes authentication', () => {
    const auth = new ChatAuthManager({
      storagePath: join(dir, 'auth.json'),
      passphrase: 'secret',
    });
    auth.authenticate('user-1', 'secret');
    auth.revoke('user-1');
    expect(auth.isAuthenticated('user-1')).toBe(false);
  });

  test('lockout after failed attempts', () => {
    const auth = new ChatAuthManager({
      storagePath: join(dir, 'auth.json'),
      passphrase: 'secret',
      maxFailedAttempts: 3,
      lockoutMs: 60_000,
    });

    auth.authenticate('user-1', 'wrong');
    auth.authenticate('user-1', 'wrong');
    auth.authenticate('user-1', 'wrong');

    expect(auth.isLockedOut('user-1')).toBe(true);
    // Even correct passphrase is rejected during lockout
    expect(auth.authenticate('user-1', 'secret')).toBe(false);
  });

  test('allowlist restricts users', () => {
    const auth = new ChatAuthManager({
      storagePath: join(dir, 'auth.json'),
      passphrase: 'secret',
      allowedUsers: [100, 200],
    });

    // Allowed user can authenticate
    expect(auth.authenticate(100, 'secret')).toBe(true);
    // Non-allowed user cannot even with correct passphrase
    expect(auth.authenticate(300, 'secret')).toBe(false);
  });

  test('persistence survives restart', () => {
    const path = join(dir, 'auth.json');
    const auth1 = new ChatAuthManager({
      storagePath: path,
      passphrase: 'secret',
    });
    auth1.authenticate('user-1', 'secret');

    // New instance loads from disk
    const auth2 = new ChatAuthManager({
      storagePath: path,
      passphrase: 'secret',
    });
    expect(auth2.isAuthenticated('user-1')).toBe(true);
    expect(auth2.authenticatedCount).toBe(1);
  });

  test('listAuthenticated returns user IDs', () => {
    const auth = new ChatAuthManager({
      storagePath: join(dir, 'auth.json'),
      passphrase: 'secret',
    });
    auth.authenticate('user-1', 'secret');
    auth.authenticate('user-2', 'secret');
    expect(auth.listAuthenticated()).toEqual(['user-1', 'user-2']);
  });
});

// ─── TaskCancellationManager ────────────────────────────────────────

describe('TaskCancellationManager', () => {
  let mgr: TaskCancellationManager;

  beforeEach(() => {
    mgr = new TaskCancellationManager();
  });

  test('create returns an AbortSignal', () => {
    const signal = mgr.create('chat-1', 'running test');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  test('cancel aborts the signal and returns info', () => {
    const signal = mgr.create('chat-1', 'task A');
    const info = mgr.cancel('chat-1');
    expect(info).not.toBeNull();
    expect(info!.description).toBe('task A');
    expect(signal.aborted).toBe(true);
    expect(mgr.size).toBe(0);
  });

  test('cancel returns null for unknown chatId', () => {
    expect(mgr.cancel('nonexistent')).toBeNull();
  });

  test('create cancels existing task for same chatId', () => {
    const signal1 = mgr.create('chat-1', 'task 1');
    const signal2 = mgr.create('chat-1', 'task 2');
    expect(signal1.aborted).toBe(true);
    expect(signal2.aborted).toBe(false);
    expect(mgr.size).toBe(1);
  });

  test('complete removes without aborting', () => {
    const signal = mgr.create('chat-1');
    mgr.complete('chat-1');
    expect(signal.aborted).toBe(false);
    expect(mgr.size).toBe(0);
  });

  test('isRunning returns correct state', () => {
    expect(mgr.isRunning('chat-1')).toBe(false);
    mgr.create('chat-1');
    expect(mgr.isRunning('chat-1')).toBe(true);
    mgr.cancel('chat-1');
    expect(mgr.isRunning('chat-1')).toBe(false);
  });

  test('getInfo returns task details', () => {
    mgr.create('chat-1', 'my task');
    const info = mgr.getInfo('chat-1');
    expect(info).not.toBeNull();
    expect(info!.description).toBe('my task');
    expect(info!.startedAt).toBeGreaterThan(0);
    expect(mgr.getInfo('nonexistent')).toBeNull();
  });

  test('listRunning returns all active chat IDs', () => {
    mgr.create('a');
    mgr.create('b');
    mgr.create('c');
    expect(mgr.listRunning().sort()).toEqual(['a', 'b', 'c']);
  });

  test('cancelAll cancels everything', () => {
    const s1 = mgr.create('a');
    const s2 = mgr.create('b');
    const count = mgr.cancelAll();
    expect(count).toBe(2);
    expect(s1.aborted).toBe(true);
    expect(s2.aborted).toBe(true);
    expect(mgr.size).toBe(0);
  });

  test('size reflects active task count', () => {
    expect(mgr.size).toBe(0);
    mgr.create('a');
    mgr.create('b');
    expect(mgr.size).toBe(2);
    mgr.cancel('a');
    expect(mgr.size).toBe(1);
  });
});
