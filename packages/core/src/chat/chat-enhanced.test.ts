/**
 * Chat Enhanced Tests — self-update, file handling, and notifications.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SelfUpdateManager, RESTART_EXIT_CODE } from './self-update.js';
import {
  detectFileIntent,
  buildMultimodalContent,
  saveTempFile,
  cleanupTempFiles,
  sanitizeForPersistence,
  MAX_FILE_SIZE,
  TEXT_EXTENSIONS,
} from './file-handler.js';
import { NotificationEngine } from './notifications.js';
import type { FileInfo, MultimodalContent } from './file-handler.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'chat-enhanced-'));
}

// ─── SelfUpdateManager ───────────────────────────────────────────────

describe('SelfUpdateManager', () => {
  let tmpDir: string;
  let mgr: SelfUpdateManager;

  beforeEach(() => {
    tmpDir = makeTempDir();
    mgr = new SelfUpdateManager(join(tmpDir, 'restart.json'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('RESTART_EXIT_CODE is 75', () => {
    expect(RESTART_EXIT_CODE).toBe(75);
  });

  test('requestRestart saves context and returns initiated', () => {
    const result = mgr.requestRestart('chat-123', 'self-update', 'abc123');
    expect(result.initiated).toBe(true);
    expect(result.context?.chatId).toBe('chat-123');
    expect(result.context?.reason).toBe('self-update');
    expect(result.context?.commitSha).toBe('abc123');
  });

  test('loadContext returns saved context', () => {
    mgr.requestRestart('chat-1', 'manual');
    const ctx = mgr.loadContext();
    expect(ctx).not.toBeNull();
    expect(ctx!.chatId).toBe('chat-1');
    expect(ctx!.reason).toBe('manual');
    expect(ctx!.requestedAt).toBeGreaterThan(0);
  });

  test('loadContext returns null when no context', () => {
    expect(mgr.loadContext()).toBeNull();
  });

  test('clearContext removes the file', () => {
    mgr.requestRestart('chat-1', 'rebuild');
    expect(mgr.hasPendingRestart()).toBe(true);
    mgr.clearContext();
    expect(mgr.hasPendingRestart()).toBe(false);
  });

  test('clearContext is safe when no file exists', () => {
    expect(() => mgr.clearContext()).not.toThrow();
  });

  test('hasPendingRestart reflects state', () => {
    expect(mgr.hasPendingRestart()).toBe(false);
    mgr.requestRestart('chat-1');
    expect(mgr.hasPendingRestart()).toBe(true);
  });

  test('sanitizeCommitMessage strips dangerous chars', () => {
    expect(SelfUpdateManager.sanitizeCommitMessage('feat: add feature')).toBe('feat: add feature');
    expect(SelfUpdateManager.sanitizeCommitMessage('rm -rf / && echo pwned')).toBe(
      'rm -rf /  echo pwned',
    );
    expect(SelfUpdateManager.sanitizeCommitMessage('a'.repeat(200))).toHaveLength(120);
  });

  test('context persists to disk as JSON', () => {
    const ctxPath = join(tmpDir, 'restart.json');
    mgr.requestRestart('chat-42', 'self-update', 'deadbeef');
    const raw = readFileSync(ctxPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.chatId).toBe('chat-42');
    expect(parsed.commitSha).toBe('deadbeef');
  });
});

// ─── File Handler ────────────────────────────────────────────────────

describe('File Handler', () => {
  describe('detectFileIntent', () => {
    test('text extensions return text', () => {
      expect(detectFileIntent('app.ts', 'text/plain')).toBe('text');
      expect(detectFileIntent('data.json', 'application/json')).toBe('text');
      expect(detectFileIntent('readme.md', 'text/markdown')).toBe('text');
    });

    test('images return vision', () => {
      expect(detectFileIntent('photo.jpg', 'image/jpeg')).toBe('vision');
      expect(detectFileIntent('screen.png', 'image/png')).toBe('vision');
    });

    test('PDFs return vision', () => {
      expect(detectFileIntent('doc.pdf', 'application/pdf')).toBe('vision');
    });

    test('intake keywords override file type', () => {
      expect(detectFileIntent('doc.pdf', 'application/pdf', 'learn this')).toBe('intake');
      expect(detectFileIntent('notes.md', 'text/plain', 'ingest this document')).toBe('intake');
      expect(detectFileIntent('img.png', 'image/png', 'add to vault')).toBe('intake');
    });

    test('normal text does not trigger intake', () => {
      expect(detectFileIntent('doc.pdf', 'application/pdf', 'what is this?')).toBe('vision');
    });
  });

  describe('buildMultimodalContent', () => {
    test('text files return text content', () => {
      const file: FileInfo = {
        name: 'test.ts',
        mimeType: 'text/plain',
        size: 11,
        data: Buffer.from('hello world'),
      };
      const result = buildMultimodalContent(file, 'text');
      expect(result.type).toBe('text');
      expect(result.content).toBe('hello world');
      expect(result.filename).toBe('test.ts');
    });

    test('images return base64', () => {
      const data = Buffer.from('fake-image-data');
      const file: FileInfo = {
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: data.length,
        data,
      };
      const result = buildMultimodalContent(file, 'vision');
      expect(result.type).toBe('image');
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.content).toBe(data.toString('base64'));
    });

    test('PDFs return document type', () => {
      const data = Buffer.from('fake-pdf-data');
      const file: FileInfo = {
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        size: data.length,
        data,
      };
      const result = buildMultimodalContent(file, 'vision');
      expect(result.type).toBe('document');
      expect(result.mimeType).toBe('application/pdf');
    });
  });

  describe('saveTempFile', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    test('saves file and returns path', () => {
      const path = saveTempFile(tmpDir, 'test.txt', Buffer.from('hello'));
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, 'utf-8')).toBe('hello');
    });

    test('sanitizes filename', () => {
      const path = saveTempFile(tmpDir, '../evil/../file.txt', Buffer.from('x'));
      // The filename portion (after tmpDir) should not contain path traversal
      const filename = path.slice(tmpDir.length + 1);
      expect(filename).not.toContain('/');
      expect(existsSync(path)).toBe(true);
    });
  });

  describe('cleanupTempFiles', () => {
    test('returns 0 for empty directory', () => {
      const tmpDir = makeTempDir();
      expect(cleanupTempFiles(tmpDir, 0)).toBe(0);
      rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns 0 for nonexistent directory', () => {
      expect(cleanupTempFiles('/nonexistent/path')).toBe(0);
    });
  });

  describe('sanitizeForPersistence', () => {
    test('passes text through unchanged', () => {
      const content: MultimodalContent = {
        type: 'text',
        content: 'hello world',
        filename: 'test.ts',
      };
      expect(sanitizeForPersistence(content)).toEqual(content);
    });

    test('replaces binary content with placeholder', () => {
      const content: MultimodalContent = {
        type: 'image',
        content: Buffer.from('x'.repeat(1024)).toString('base64'),
        mimeType: 'image/png',
        filename: 'photo.png',
      };
      const sanitized = sanitizeForPersistence(content);
      expect(sanitized.content).toMatch(/\[image: photo\.png, \d+KB\]/);
      expect(sanitized.type).toBe('image');
    });
  });

  test('TEXT_EXTENSIONS includes common types', () => {
    expect(TEXT_EXTENSIONS.has('.ts')).toBe(true);
    expect(TEXT_EXTENSIONS.has('.py')).toBe(true);
    expect(TEXT_EXTENSIONS.has('.json')).toBe(true);
    expect(TEXT_EXTENSIONS.has('.md')).toBe(true);
  });

  test('MAX_FILE_SIZE is 20MB', () => {
    expect(MAX_FILE_SIZE).toBe(20 * 1024 * 1024);
  });
});

// ─── NotificationEngine ─────────────────────────────────────────────

describe('NotificationEngine', () => {
  let engine: NotificationEngine;
  let notifications: Array<{ checkId: string; message: string }>;

  beforeEach(() => {
    notifications = [];
    engine = new NotificationEngine({
      intervalMs: 60_000,
      defaultCooldownMs: 0, // No cooldown for tests
      onNotify: async (checkId, message) => {
        notifications.push({ checkId, message });
      },
    });
  });

  afterEach(() => {
    engine.stop();
  });

  test('register and poll', async () => {
    engine.register({
      id: 'test-check',
      label: 'Test Check',
      check: async () => 'Something happened!',
    });

    const count = await engine.poll();
    expect(count).toBe(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].checkId).toBe('test-check');
    expect(notifications[0].message).toBe('Something happened!');
  });

  test('null return skips notification', async () => {
    engine.register({
      id: 'quiet-check',
      label: 'Quiet',
      check: async () => null,
    });

    const count = await engine.poll();
    expect(count).toBe(0);
    expect(notifications).toHaveLength(0);
  });

  test('cooldown prevents repeated notifications', async () => {
    engine = new NotificationEngine({
      defaultCooldownMs: 60_000, // 1 minute cooldown
      onNotify: async (checkId, message) => {
        notifications.push({ checkId, message });
      },
    });

    engine.register({
      id: 'cooldown-check',
      label: 'Cooldown',
      check: async () => 'alert!',
    });

    await engine.poll();
    expect(notifications).toHaveLength(1);

    // Second poll should be suppressed by cooldown
    await engine.poll();
    expect(notifications).toHaveLength(1);
  });

  test('activeHours restricts when checks run', async () => {
    const currentHour = new Date().getHours();

    engine.register({
      id: 'window-check',
      label: 'Window',
      check: async () => 'should not fire',
      // Set window to an hour that's definitely not now
      activeHours: { start: (currentHour + 12) % 24, end: (currentHour + 13) % 24 },
    });

    const count = await engine.poll();
    expect(count).toBe(0);
  });

  test('unregister removes check', async () => {
    engine.register({
      id: 'temp',
      label: 'Temp',
      check: async () => 'hi',
    });
    expect(engine.unregister('temp')).toBe(true);
    expect(engine.unregister('nonexistent')).toBe(false);

    const count = await engine.poll();
    expect(count).toBe(0);
  });

  test('stats reports correct state', () => {
    const stats = engine.stats();
    expect(stats.checks).toBe(0);
    expect(stats.running).toBe(false);
    expect(stats.sent).toBe(0);
    expect(stats.lastPollAt).toBeNull();
  });

  test('start and stop lifecycle', () => {
    engine.start();
    expect(engine.stats().running).toBe(true);
    engine.stop();
    expect(engine.stats().running).toBe(false);
  });

  test('multiple checks in single poll', async () => {
    engine.register({ id: 'a', label: 'A', check: async () => 'msg a' });
    engine.register({ id: 'b', label: 'B', check: async () => 'msg b' });
    engine.register({ id: 'c', label: 'C', check: async () => null }); // silent

    const count = await engine.poll();
    expect(count).toBe(2);
    expect(notifications).toHaveLength(2);
  });

  test('failing check does not break others', async () => {
    engine.register({
      id: 'broken',
      label: 'Broken',
      check: async () => {
        throw new Error('boom');
      },
    });
    engine.register({ id: 'ok', label: 'OK', check: async () => 'fine' });

    const count = await engine.poll();
    expect(count).toBe(1);
    expect(notifications[0].checkId).toBe('ok');
  });

  test('sent counter increments', async () => {
    engine.register({ id: 'x', label: 'X', check: async () => 'msg' });

    await engine.poll();
    await engine.poll();
    expect(engine.stats().sent).toBe(2);
  });
});
