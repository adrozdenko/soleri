/**
 * Tests for chat-facade — verifies the composition of session + transport + service ops.
 */

import { describe, it, expect, vi } from 'vitest';
import { createChatFacadeOps } from './chat-facade.js';
import type { AgentRuntime } from '../types.js';

// ─── Mock all chat dependencies ─────────────────────────────────────

vi.mock('../../chat/chat-session.js', () => ({
  ChatSessionManager: vi.fn().mockImplementation(() => ({
    size: 0,
    startReaper: vi.fn(),
    getOrCreate: vi.fn().mockReturnValue({
      id: 'x', messages: [], createdAt: 0, lastActiveAt: 0, meta: {},
    }),
    appendMessage: vi.fn(),
    messageCount: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    delete: vi.fn(),
    listAll: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../chat/auth-manager.js', () => ({
  ChatAuthManager: vi.fn().mockImplementation(() => ({
    enabled: false, authenticatedCount: 0,
    isAuthenticated: vi.fn(), isLockedOut: vi.fn(),
    authenticate: vi.fn(), revoke: vi.fn(), listAuthenticated: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../chat/response-chunker.js', () => ({
  chunkResponse: vi.fn().mockReturnValue([]),
}));

vi.mock('../../chat/cancellation.js', () => ({
  TaskCancellationManager: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockReturnValue({ aborted: false }),
    cancel: vi.fn(), getInfo: vi.fn(), listRunning: vi.fn().mockReturnValue([]), size: 0,
  })),
}));

vi.mock('../../chat/self-update.js', () => ({
  SelfUpdateManager: vi.fn().mockImplementation(() => ({
    loadContext: vi.fn(), clearContext: vi.fn(), requestRestart: vi.fn(),
  })),
}));

vi.mock('../../chat/file-handler.js', () => ({
  detectFileIntent: vi.fn(), buildMultimodalContent: vi.fn(), cleanupTempFiles: vi.fn(),
}));

vi.mock('../../chat/voice.js', () => ({
  transcribeAudio: vi.fn(), synthesizeSpeech: vi.fn(),
}));

vi.mock('../../chat/notifications.js', () => ({
  NotificationEngine: vi.fn().mockImplementation(() => ({
    start: vi.fn(), stop: vi.fn(), poll: vi.fn(), stats: vi.fn().mockReturnValue({}),
  })),
}));

vi.mock('../../chat/queue.js', () => ({
  MessageQueue: vi.fn().mockImplementation(() => ({
    inboxCount: vi.fn().mockReturnValue(0), outboxCount: vi.fn().mockReturnValue(0),
    readInbox: vi.fn().mockReturnValue([]), formatInbox: vi.fn().mockReturnValue(''),
    sendResponse: vi.fn(), drainOutbox: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../chat/browser-session.js', () => ({
  BrowserSessionManager: vi.fn().mockImplementation(() => ({
    acquire: vi.fn(), release: vi.fn(), size: 0,
    listSessions: vi.fn().mockReturnValue([]), getInfo: vi.fn(),
  })),
}));

vi.mock('../../chat/mcp-bridge.js', () => ({
  McpToolBridge: vi.fn().mockImplementation(() => ({
    size: 0, register: vi.fn(), listTools: vi.fn().mockReturnValue([]),
    execute: vi.fn(),
  })),
}));

vi.mock('../../chat/output-compressor.js', () => ({
  createOutputCompressor: vi.fn().mockReturnValue(() => ''),
}));

// ─── Tests ──────────────────────────────────────────────────────────

describe('createChatFacadeOps', () => {
  const mockRuntime = {} as AgentRuntime;

  it('returns all 41 ops (6 session + 17 transport + 18 service)', () => {
    const ops = createChatFacadeOps(mockRuntime);
    expect(ops.length).toBe(41);
  });

  it('session ops come first', () => {
    const ops = createChatFacadeOps(mockRuntime);
    expect(ops[0].name).toBe('chat_session_init');
    expect(ops[5].name).toBe('chat_session_list');
  });

  it('transport ops follow session ops', () => {
    const ops = createChatFacadeOps(mockRuntime);
    expect(ops[6].name).toBe('chat_chunk_response');
  });

  it('service ops follow transport ops', () => {
    const ops = createChatFacadeOps(mockRuntime);
    // 6 session + 17 transport = index 23 is first service op
    expect(ops[23].name).toBe('chat_cancel_create');
  });

  it('all op names are unique', () => {
    const ops = createChatFacadeOps(mockRuntime);
    const names = ops.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all ops have valid auth levels', () => {
    const ops = createChatFacadeOps(mockRuntime);
    for (const op of ops) {
      expect(['read', 'write', 'admin']).toContain(op.auth);
    }
  });

  it('all ops have async handlers', () => {
    const ops = createChatFacadeOps(mockRuntime);
    for (const op of ops) {
      expect(typeof op.handler).toBe('function');
    }
  });

  it('contains all expected op names', () => {
    const ops = createChatFacadeOps(mockRuntime);
    const names = new Set(ops.map((o) => o.name));
    const expectedOps = [
      // Session ops (6)
      'chat_session_init', 'chat_session_get', 'chat_session_append',
      'chat_session_clear', 'chat_session_delete', 'chat_session_list',
      // Transport ops (17)
      'chat_chunk_response',
      'chat_auth_init', 'chat_auth_check', 'chat_auth_authenticate',
      'chat_auth_revoke', 'chat_auth_status',
      'chat_bridge_init', 'chat_bridge_register', 'chat_bridge_list', 'chat_bridge_execute',
      'chat_compress_output',
      'chat_voice_transcribe', 'chat_voice_synthesize',
      'chat_queue_init', 'chat_queue_inbox', 'chat_queue_reply', 'chat_queue_drain',
      // Service ops (18)
      'chat_cancel_create', 'chat_cancel_stop', 'chat_cancel_status',
      'chat_update_init', 'chat_update_request', 'chat_update_confirm',
      'chat_file_detect_intent', 'chat_file_build_content', 'chat_file_cleanup',
      'chat_notify_init', 'chat_notify_start', 'chat_notify_stop',
      'chat_notify_poll', 'chat_notify_status',
      'chat_browser_init', 'chat_browser_acquire', 'chat_browser_release', 'chat_browser_status',
    ];
    for (const name of expectedOps) {
      expect(names.has(name)).toBe(true);
    }
    expect(names.size).toBe(expectedOps.length);
  });
});
