import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatFacadeOps } from './chat-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeRuntime(): AgentRuntime {
  return {} as unknown as AgentRuntime;
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'chat-facade-test-'));
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('chat-facade', () => {
  let ops: Map<string, CapturedOp>;
  let tempDirs: string[];

  beforeEach(() => {
    ops = captureOps(createChatFacadeOps(makeRuntime()));
    tempDirs = [];
  });

  afterAll(() => {
    for (const dir of tempDirs) {
      try { rmSync(dir, { recursive: true }); } catch { /* cleanup best-effort */ }
    }
  });

  function getTempDir(): string {
    const dir = makeTempDir();
    tempDirs.push(dir);
    return dir;
  }

  it('registers all ~40 ops', () => {
    expect(ops.size).toBeGreaterThanOrEqual(38);
  });

  it('has expected op names', () => {
    const names = [...ops.keys()];
    expect(names).toContain('chat_session_init');
    expect(names).toContain('chat_session_get');
    expect(names).toContain('chat_session_append');
    expect(names).toContain('chat_session_clear');
    expect(names).toContain('chat_session_delete');
    expect(names).toContain('chat_session_list');
    expect(names).toContain('chat_chunk_response');
    expect(names).toContain('chat_auth_init');
    expect(names).toContain('chat_auth_check');
    expect(names).toContain('chat_auth_authenticate');
    expect(names).toContain('chat_auth_revoke');
    expect(names).toContain('chat_auth_status');
    expect(names).toContain('chat_bridge_init');
    expect(names).toContain('chat_bridge_register');
    expect(names).toContain('chat_bridge_list');
    expect(names).toContain('chat_bridge_execute');
    expect(names).toContain('chat_compress_output');
    expect(names).toContain('chat_cancel_create');
    expect(names).toContain('chat_cancel_stop');
    expect(names).toContain('chat_cancel_status');
    expect(names).toContain('chat_update_init');
    expect(names).toContain('chat_update_request');
    expect(names).toContain('chat_update_confirm');
    expect(names).toContain('chat_file_detect_intent');
    expect(names).toContain('chat_file_build_content');
    expect(names).toContain('chat_file_cleanup');
    expect(names).toContain('chat_notify_init');
    expect(names).toContain('chat_notify_start');
    expect(names).toContain('chat_notify_stop');
    expect(names).toContain('chat_notify_poll');
    expect(names).toContain('chat_notify_status');
    expect(names).toContain('chat_voice_transcribe');
    expect(names).toContain('chat_voice_synthesize');
    expect(names).toContain('chat_queue_init');
    expect(names).toContain('chat_queue_inbox');
    expect(names).toContain('chat_queue_reply');
    expect(names).toContain('chat_queue_drain');
    expect(names).toContain('chat_browser_init');
    expect(names).toContain('chat_browser_status');
  });

  // ═══════════════════════════════════════════════════════════════
  // Session Ops
  // ═══════════════════════════════════════════════════════════════

  describe('session ops', () => {
    it('chat_session_init initializes session manager', async () => {
      const dir = getTempDir();
      const result = await executeOp(ops, 'chat_session_init', { storageDir: dir });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.initialized).toBe(true);
      expect(data.activeSessions).toBe(0);
    });

    it('chat_session_get creates a new session', async () => {
      const dir = getTempDir();
      const result = await executeOp(ops, 'chat_session_get', { sessionId: 'chat-1', storageDir: dir });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.id).toBe('chat-1');
      expect(data.messageCount).toBe(0);
    });

    it('chat_session_append adds a message', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_session_get', { sessionId: 'chat-1', storageDir: dir });
      const result = await executeOp(ops, 'chat_session_append', {
        sessionId: 'chat-1', storageDir: dir, role: 'user', content: 'Hello!',
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).messageCount).toBe(1);
    });

    it('chat_session_append increments message count', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_session_get', { sessionId: 'chat-1', storageDir: dir });
      await executeOp(ops, 'chat_session_append', {
        sessionId: 'chat-1', storageDir: dir, role: 'user', content: 'msg 1',
      });
      const result = await executeOp(ops, 'chat_session_append', {
        sessionId: 'chat-1', storageDir: dir, role: 'assistant', content: 'msg 2',
      });
      expect((result.data as Record<string, unknown>).messageCount).toBe(2);
    });

    it('chat_session_clear clears messages', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_session_append', {
        sessionId: 'chat-1', storageDir: dir, role: 'user', content: 'Hello',
      });
      const result = await executeOp(ops, 'chat_session_clear', { sessionId: 'chat-1', storageDir: dir });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).cleared).toBe(true);
    });

    it('chat_session_delete removes session', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_session_get', { sessionId: 'chat-1', storageDir: dir });
      const result = await executeOp(ops, 'chat_session_delete', { sessionId: 'chat-1', storageDir: dir });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).deleted).toBe(true);
    });

    it('chat_session_list returns session ids', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_session_get', { sessionId: 'chat-1', storageDir: dir });
      await executeOp(ops, 'chat_session_get', { sessionId: 'chat-2', storageDir: dir });
      const result = await executeOp(ops, 'chat_session_list', { storageDir: dir });
      expect(result.success).toBe(true);
      const data = result.data as { sessions: string[]; count: number };
      expect(data.count).toBeGreaterThanOrEqual(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Response Chunking
  // ═══════════════════════════════════════════════════════════════

  describe('chat_chunk_response', () => {
    it('returns single chunk for short text', async () => {
      const result = await executeOp(ops, 'chat_chunk_response', { text: 'Hello world' });
      expect(result.success).toBe(true);
      const data = result.data as { chunks: string[]; count: number };
      expect(data.count).toBe(1);
    });

    it('chunks long text', async () => {
      const longText = 'A'.repeat(10000);
      const result = await executeOp(ops, 'chat_chunk_response', { text: longText, maxChunkSize: 2000 });
      expect(result.success).toBe(true);
      expect((result.data as { count: number }).count).toBeGreaterThan(1);
    });

    it('respects format parameter', async () => {
      const result = await executeOp(ops, 'chat_chunk_response', { text: '**bold**', format: 'markdown' });
      expect(result.success).toBe(true);
      const data = result.data as { chunks: string[] };
      expect(data.chunks[0]).toContain('**bold**');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Authentication
  // ═══════════════════════════════════════════════════════════════

  describe('auth ops', () => {
    it('chat_auth_init initializes auth', async () => {
      const dir = getTempDir();
      const result = await executeOp(ops, 'chat_auth_init', {
        storagePath: join(dir, 'auth.json'), passphrase: 'secret',
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).initialized).toBe(true);
      expect((result.data as Record<string, unknown>).enabled).toBe(true);
    });

    it('chat_auth_init without passphrase disables auth', async () => {
      const dir = getTempDir();
      const result = await executeOp(ops, 'chat_auth_init', {
        storagePath: join(dir, 'auth.json'),
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).enabled).toBe(false);
    });

    it('chat_auth_check returns unauthenticated by default', async () => {
      const dir = getTempDir();
      // Init with passphrase first
      await executeOp(ops, 'chat_auth_init', {
        storagePath: join(dir, 'auth.json'), passphrase: 'secret',
      });
      const result = await executeOp(ops, 'chat_auth_check', {
        userId: 'user1', storagePath: join(dir, 'auth.json'),
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).authenticated).toBe(false);
    });

    it('chat_auth_authenticate with correct passphrase succeeds', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_auth_init', {
        storagePath: join(dir, 'auth.json'), passphrase: 'secret',
      });
      const result = await executeOp(ops, 'chat_auth_authenticate', {
        userId: 'user1', passphrase: 'secret', storagePath: join(dir, 'auth.json'),
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).success).toBe(true);
    });

    it('chat_auth_authenticate with wrong passphrase fails', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_auth_init', {
        storagePath: join(dir, 'auth.json'), passphrase: 'secret',
      });
      const result = await executeOp(ops, 'chat_auth_authenticate', {
        userId: 'user1', passphrase: 'wrong', storagePath: join(dir, 'auth.json'),
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).success).toBe(false);
    });

    it('chat_auth_revoke removes authentication', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_auth_init', {
        storagePath: join(dir, 'auth.json'), passphrase: 'secret',
      });
      await executeOp(ops, 'chat_auth_authenticate', {
        userId: 'user1', passphrase: 'secret', storagePath: join(dir, 'auth.json'),
      });
      const result = await executeOp(ops, 'chat_auth_revoke', {
        userId: 'user1', storagePath: join(dir, 'auth.json'),
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).revoked).toBe(true);
    });

    it('chat_auth_status returns auth stats', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_auth_init', {
        storagePath: join(dir, 'auth.json'), passphrase: 'secret',
      });
      const result = await executeOp(ops, 'chat_auth_status', {
        storagePath: join(dir, 'auth.json'),
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).enabled).toBe(true);
      expect((result.data as Record<string, unknown>).authenticatedCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MCP Bridge
  // ═══════════════════════════════════════════════════════════════

  describe('bridge ops', () => {
    it('chat_bridge_init initializes bridge', async () => {
      const result = await executeOp(ops, 'chat_bridge_init', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).initialized).toBe(true);
    });

    it('chat_bridge_register adds a tool', async () => {
      await executeOp(ops, 'chat_bridge_init', {});
      const result = await executeOp(ops, 'chat_bridge_register', {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { type: 'object', properties: {} },
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).registered).toBe(true);
      expect((result.data as Record<string, unknown>).totalTools).toBe(1);
    });

    it('chat_bridge_list returns registered tools', async () => {
      await executeOp(ops, 'chat_bridge_init', {});
      await executeOp(ops, 'chat_bridge_register', {
        name: 'tool1', description: 'Tool 1', inputSchema: {},
      });
      const result = await executeOp(ops, 'chat_bridge_list', {});
      expect(result.success).toBe(true);
      expect((result.data as { count: number }).count).toBe(1);
    });

    it('chat_bridge_list returns empty when not initialized', async () => {
      // Create fresh ops to avoid state from other tests
      const freshOps = captureOps(createChatFacadeOps(makeRuntime()));
      const result = await executeOp(freshOps, 'chat_bridge_list', {});
      expect(result.success).toBe(true);
      expect((result.data as { count: number }).count).toBe(0);
    });

    it('chat_bridge_execute on uninitialized bridge returns error', async () => {
      const freshOps = captureOps(createChatFacadeOps(makeRuntime()));
      const result = await executeOp(freshOps, 'chat_bridge_execute', { name: 'test' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).isError).toBe(true);
    });

    it('chat_bridge_execute runs registered tool', async () => {
      await executeOp(ops, 'chat_bridge_init', {});
      await executeOp(ops, 'chat_bridge_register', {
        name: 'echo', description: 'Echo tool', inputSchema: {},
      });
      const result = await executeOp(ops, 'chat_bridge_execute', { name: 'echo', input: {} });
      expect(result.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Output Compression
  // ═══════════════════════════════════════════════════════════════

  describe('chat_compress_output', () => {
    it('compresses output', async () => {
      const result = await executeOp(ops, 'chat_compress_output', {
        toolName: 'vault_search',
        output: JSON.stringify({ results: Array.from({ length: 20 }, (_, i) => ({ id: i, text: 'x'.repeat(100) })) }),
        maxLength: 500,
      });
      expect(result.success).toBe(true);
      const data = result.data as { compressedLength: number; originalLength: number };
      expect(data.compressedLength).toBeLessThanOrEqual(data.originalLength);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Task Cancellation
  // ═══════════════════════════════════════════════════════════════

  describe('cancellation ops', () => {
    it('chat_cancel_create creates an abort signal', async () => {
      const result = await executeOp(ops, 'chat_cancel_create', {
        chatId: 'chat-1', description: 'Running query',
      });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.created).toBe(true);
      expect(data.aborted).toBe(false);
      expect(data.activeTasks).toBe(1);
    });

    it('chat_cancel_stop cancels a running task', async () => {
      await executeOp(ops, 'chat_cancel_create', { chatId: 'chat-1' });
      const result = await executeOp(ops, 'chat_cancel_stop', { chatId: 'chat-1' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).cancelled).toBe(true);
    });

    it('chat_cancel_stop returns false for non-existent task', async () => {
      const freshOps = captureOps(createChatFacadeOps(makeRuntime()));
      const result = await executeOp(freshOps, 'chat_cancel_stop', { chatId: 'nonexistent' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).cancelled).toBe(false);
    });

    it('chat_cancel_status shows active tasks', async () => {
      await executeOp(ops, 'chat_cancel_create', { chatId: 'chat-1', description: 'task 1' });
      const result = await executeOp(ops, 'chat_cancel_status', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).activeTasks).toBe(1);
    });

    it('chat_cancel_status for specific chat', async () => {
      await executeOp(ops, 'chat_cancel_create', { chatId: 'chat-1', description: 'task 1' });
      const result = await executeOp(ops, 'chat_cancel_status', { chatId: 'chat-1' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).running).toBe(true);
      expect((result.data as Record<string, unknown>).description).toBe('task 1');
    });

    it('chat_cancel_status returns zero when uninitialized', async () => {
      const freshOps = captureOps(createChatFacadeOps(makeRuntime()));
      const result = await executeOp(freshOps, 'chat_cancel_status', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).activeTasks).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Self-Update
  // ═══════════════════════════════════════════════════════════════

  describe('update ops', () => {
    it('chat_update_init initializes updater', async () => {
      const dir = getTempDir();
      const result = await executeOp(ops, 'chat_update_init', {
        contextPath: join(dir, 'restart.json'),
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).initialized).toBe(true);
      expect((result.data as Record<string, unknown>).hasPendingRestart).toBe(false);
    });

    it('chat_update_request saves restart context', async () => {
      const dir = getTempDir();
      await executeOp(ops, 'chat_update_init', { contextPath: join(dir, 'restart.json') });
      const result = await executeOp(ops, 'chat_update_request', {
        chatId: 'chat-1',
        reason: 'self-update',
        contextPath: join(dir, 'restart.json'),
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).initiated).toBe(true);
    });

    it('chat_update_confirm clears restart context', async () => {
      const dir = getTempDir();
      const contextPath = join(dir, 'restart.json');
      await executeOp(ops, 'chat_update_init', { contextPath });
      await executeOp(ops, 'chat_update_request', {
        chatId: 'chat-1', reason: 'manual', contextPath,
      });
      const result = await executeOp(ops, 'chat_update_confirm', { contextPath });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).confirmed).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // File Handling
  // ═══════════════════════════════════════════════════════════════

  describe('file ops', () => {
    it('chat_file_detect_intent detects image intent', async () => {
      const result = await executeOp(ops, 'chat_file_detect_intent', {
        filename: 'photo.jpg', mimeType: 'image/jpeg',
      });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.intent).toBe('vision');
    });

    it('chat_file_detect_intent detects text intent for code', async () => {
      const result = await executeOp(ops, 'chat_file_detect_intent', {
        filename: 'app.ts', mimeType: 'text/typescript',
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).intent).toBe('text');
    });

    it('chat_file_build_content builds from base64', async () => {
      const data = Buffer.from('hello world').toString('base64');
      const result = await executeOp(ops, 'chat_file_build_content', {
        filename: 'test.txt', mimeType: 'text/plain', dataBase64: data, intent: 'text',
      });
      expect(result.success).toBe(true);
    });

    it('chat_file_cleanup handles nonexistent dir', async () => {
      const result = await executeOp(ops, 'chat_file_cleanup', {
        uploadDir: '/nonexistent/dir/that/doesnt/exist',
      });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).removed).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Notifications
  // ═══════════════════════════════════════════════════════════════

  describe('notification ops', () => {
    it('chat_notify_status returns uninitialized state', async () => {
      const freshOps = captureOps(createChatFacadeOps(makeRuntime()));
      const result = await executeOp(freshOps, 'chat_notify_status', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).initialized).toBe(false);
    });

    it('chat_notify_init initializes engine', async () => {
      const result = await executeOp(ops, 'chat_notify_init', { intervalMs: 60000 });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).initialized).toBe(true);
    });

    it('chat_notify_start starts polling', async () => {
      await executeOp(ops, 'chat_notify_init', {});
      const result = await executeOp(ops, 'chat_notify_start', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).started).toBe(true);
      // Stop to clean up timer
      await executeOp(ops, 'chat_notify_stop', {});
    });

    it('chat_notify_start returns false when not initialized', async () => {
      const freshOps = captureOps(createChatFacadeOps(makeRuntime()));
      const result = await executeOp(freshOps, 'chat_notify_start', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).started).toBe(false);
    });

    it('chat_notify_stop stops polling', async () => {
      await executeOp(ops, 'chat_notify_init', {});
      await executeOp(ops, 'chat_notify_start', {});
      const result = await executeOp(ops, 'chat_notify_stop', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).stopped).toBe(true);
    });

    it('chat_notify_poll runs checks', async () => {
      await executeOp(ops, 'chat_notify_init', {});
      const result = await executeOp(ops, 'chat_notify_poll', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).polled).toBe(true);
    });

    it('chat_notify_poll returns false when not initialized', async () => {
      const freshOps = captureOps(createChatFacadeOps(makeRuntime()));
      const result = await executeOp(freshOps, 'chat_notify_poll', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).polled).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Queue
  // ═══════════════════════════════════════════════════════════════

  describe('queue ops', () => {
    it('chat_queue_init initializes queue', async () => {
      const dir = getTempDir();
      const result = await executeOp(ops, 'chat_queue_init', { queueDir: dir });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.initialized).toBe(true);
      expect(data.inbox).toBe(0);
      expect(data.outbox).toBe(0);
    });

    it('chat_queue_inbox returns empty initially', async () => {
      const dir = getTempDir();
      const result = await executeOp(ops, 'chat_queue_inbox', { queueDir: dir });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).count).toBe(0);
    });

    it('chat_queue_drain returns empty initially', async () => {
      const dir = getTempDir();
      const result = await executeOp(ops, 'chat_queue_drain', { queueDir: dir });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).count).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Browser Sessions
  // ═══════════════════════════════════════════════════════════════

  describe('browser ops', () => {
    it('chat_browser_init initializes browser manager', async () => {
      const result = await executeOp(ops, 'chat_browser_init', { maxSessions: 2 });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).initialized).toBe(true);
      expect((result.data as Record<string, unknown>).maxSessions).toBe(2);
    });

    it('chat_browser_status returns uninitialized state', async () => {
      const freshOps = captureOps(createChatFacadeOps(makeRuntime()));
      const result = await executeOp(freshOps, 'chat_browser_status', {});
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).initialized).toBe(false);
    });

    it('chat_browser_release returns false when not initialized', async () => {
      const freshOps = captureOps(createChatFacadeOps(makeRuntime()));
      const result = await executeOp(freshOps, 'chat_browser_release', { chatId: 'chat-1' });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).released).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Auth Levels
  // ═══════════════════════════════════════════════════════════════

  describe('auth levels', () => {
    it('session ops have correct auth', () => {
      expect(ops.get('chat_session_init')!.auth).toBe('write');
      expect(ops.get('chat_session_get')!.auth).toBe('read');
      expect(ops.get('chat_session_append')!.auth).toBe('write');
      expect(ops.get('chat_session_clear')!.auth).toBe('write');
      expect(ops.get('chat_session_delete')!.auth).toBe('write');
      expect(ops.get('chat_session_list')!.auth).toBe('read');
    });

    it('auth ops have correct auth', () => {
      expect(ops.get('chat_auth_init')!.auth).toBe('write');
      expect(ops.get('chat_auth_check')!.auth).toBe('read');
      expect(ops.get('chat_auth_authenticate')!.auth).toBe('write');
      expect(ops.get('chat_auth_revoke')!.auth).toBe('write');
      expect(ops.get('chat_auth_status')!.auth).toBe('read');
    });

    it('chunk op is read', () => {
      expect(ops.get('chat_chunk_response')!.auth).toBe('read');
    });

    it('bridge ops have correct auth', () => {
      expect(ops.get('chat_bridge_init')!.auth).toBe('write');
      expect(ops.get('chat_bridge_register')!.auth).toBe('write');
      expect(ops.get('chat_bridge_list')!.auth).toBe('read');
      expect(ops.get('chat_bridge_execute')!.auth).toBe('write');
    });

    it('cancellation ops have correct auth', () => {
      expect(ops.get('chat_cancel_create')!.auth).toBe('write');
      expect(ops.get('chat_cancel_stop')!.auth).toBe('write');
      expect(ops.get('chat_cancel_status')!.auth).toBe('read');
    });

    it('notification ops have correct auth', () => {
      expect(ops.get('chat_notify_init')!.auth).toBe('write');
      expect(ops.get('chat_notify_start')!.auth).toBe('write');
      expect(ops.get('chat_notify_stop')!.auth).toBe('write');
      expect(ops.get('chat_notify_poll')!.auth).toBe('write');
      expect(ops.get('chat_notify_status')!.auth).toBe('read');
    });
  });
});
