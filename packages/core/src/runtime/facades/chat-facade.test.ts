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
      id: 'x',
      messages: [],
      createdAt: 0,
      lastActiveAt: 0,
      meta: {},
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
    enabled: false,
    authenticatedCount: 0,
    isAuthenticated: vi.fn(),
    isLockedOut: vi.fn(),
    authenticate: vi.fn(),
    revoke: vi.fn(),
    listAuthenticated: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../chat/response-chunker.js', () => ({
  chunkResponse: vi.fn().mockReturnValue([]),
}));

vi.mock('../../chat/cancellation.js', () => ({
  TaskCancellationManager: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockReturnValue({ aborted: false }),
    cancel: vi.fn(),
    getInfo: vi.fn(),
    listRunning: vi.fn().mockReturnValue([]),
    size: 0,
  })),
}));

vi.mock('../../chat/self-update.js', () => ({
  SelfUpdateManager: vi.fn().mockImplementation(() => ({
    loadContext: vi.fn(),
    clearContext: vi.fn(),
    requestRestart: vi.fn(),
  })),
}));

vi.mock('../../chat/file-handler.js', () => ({
  detectFileIntent: vi.fn(),
  buildMultimodalContent: vi.fn(),
  cleanupTempFiles: vi.fn(),
}));

vi.mock('../../chat/voice.js', () => ({
  transcribeAudio: vi.fn(),
  synthesizeSpeech: vi.fn(),
}));

vi.mock('../../chat/notifications.js', () => ({
  NotificationEngine: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    poll: vi.fn(),
    stats: vi.fn().mockReturnValue({}),
  })),
}));

vi.mock('../../chat/queue.js', () => ({
  MessageQueue: vi.fn().mockImplementation(() => ({
    inboxCount: vi.fn().mockReturnValue(0),
    outboxCount: vi.fn().mockReturnValue(0),
    readInbox: vi.fn().mockReturnValue([]),
    formatInbox: vi.fn().mockReturnValue(''),
    sendResponse: vi.fn(),
    drainOutbox: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../chat/browser-session.js', () => ({
  BrowserSessionManager: vi.fn().mockImplementation(() => ({
    acquire: vi.fn(),
    release: vi.fn(),
    size: 0,
    listSessions: vi.fn().mockReturnValue([]),
    getInfo: vi.fn(),
  })),
}));

vi.mock('../../chat/mcp-bridge.js', () => ({
  McpToolBridge: vi.fn().mockImplementation(() => ({
    size: 0,
    register: vi.fn(),
    listTools: vi.fn().mockReturnValue([]),
    execute: vi.fn(),
  })),
}));

vi.mock('../../chat/output-compressor.js', () => ({
  createOutputCompressor: vi.fn().mockReturnValue(() => ''),
}));

// ─── Tests ──────────────────────────────────────────────────────────

describe('createChatFacadeOps', () => {
  const mockRuntime = {} as AgentRuntime;

  it('all op names are unique', () => {
    const ops = createChatFacadeOps(mockRuntime);
    const names = ops.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
