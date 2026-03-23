/**
 * Tests for chat-service-ops — cancellation, self-update, file handling,
 * notifications, and browser sessions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatServiceOps } from './chat-service-ops.js';
import { createChatState } from './chat-state.js';
import type { ChatState } from './chat-state.js';
import type { OpDefinition } from '../../facades/types.js';

// ─── Mock chat modules ─────────────────────────────────────────────

vi.mock('../../chat/cancellation.js', () => ({
  TaskCancellationManager: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockReturnValue({ aborted: false }),
    cancel: vi.fn().mockReturnValue({ description: 'test', startedAt: 1000 }),
    getInfo: vi.fn().mockReturnValue({ description: 'test', startedAt: 1000 }),
    listRunning: vi.fn().mockReturnValue(['chat-1']),
    size: 1,
  })),
}));

vi.mock('../../chat/self-update.js', () => ({
  SelfUpdateManager: vi.fn().mockImplementation(() => ({
    loadContext: vi.fn().mockReturnValue(null),
    clearContext: vi.fn(),
    requestRestart: vi.fn().mockReturnValue({ scheduled: true }),
  })),
}));

vi.mock('../../chat/file-handler.js', () => ({
  detectFileIntent: vi.fn().mockReturnValue('vision'),
  buildMultimodalContent: vi.fn().mockReturnValue({ type: 'image', data: 'abc' }),
  cleanupTempFiles: vi.fn().mockReturnValue(3),
}));

vi.mock('../../chat/notifications.js', () => ({
  NotificationEngine: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    poll: vi.fn().mockResolvedValue(2),
    stats: vi.fn().mockReturnValue({ checks: 3, running: true, sent: 5, lastPollAt: 1000 }),
  })),
}));

const mockBrowserSession = {
  process: { pid: 1234 },
};

vi.mock('../../chat/browser-session.js', () => ({
  BrowserSessionManager: vi.fn().mockImplementation(() => ({
    acquire: vi.fn().mockReturnValue(mockBrowserSession),
    release: vi.fn().mockReturnValue(true),
    size: 1,
    listSessions: vi.fn().mockReturnValue(['c1']),
    getInfo: vi.fn().mockReturnValue({ startedAt: 1000 }),
  })),
}));

// Needed via chat-state imports
vi.mock('../../chat/chat-session.js', () => ({ ChatSessionManager: vi.fn() }));
vi.mock('../../chat/auth-manager.js', () => ({ ChatAuthManager: vi.fn() }));

// ─── Helpers ────────────────────────────────────────────────────────

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op not found: ${name}`);
  return op;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('chat-service-ops', () => {
  let state: ChatState;
  let ops: OpDefinition[];

  beforeEach(() => {
    vi.clearAllMocks();
    state = createChatState();
    ops = createChatServiceOps(state);
  });

  it('exports 18 service ops', () => {
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'chat_cancel_create',
      'chat_cancel_stop',
      'chat_cancel_status',
      'chat_update_init',
      'chat_update_request',
      'chat_update_confirm',
      'chat_file_detect_intent',
      'chat_file_build_content',
      'chat_file_cleanup',
      'chat_notify_init',
      'chat_notify_start',
      'chat_notify_stop',
      'chat_notify_poll',
      'chat_notify_status',
      'chat_browser_init',
      'chat_browser_acquire',
      'chat_browser_release',
      'chat_browser_status',
    ]);
  });

  // ─── Task Cancellation ─────────────────────────────────────────

  describe('chat_cancel_create', () => {
    it('creates cancellation signal', async () => {
      const result = await findOp(ops, 'chat_cancel_create').handler({
        chatId: 'chat-1',
        description: 'processing',
      });
      expect(result).toEqual({ chatId: 'chat-1', created: true, aborted: false, activeTasks: 1 });
    });
  });

  describe('chat_cancel_stop', () => {
    it('returns false when no cancellation manager', async () => {
      const result = await findOp(ops, 'chat_cancel_stop').handler({ chatId: 'chat-1' });
      expect(result).toEqual({ cancelled: false, reason: 'No cancellation manager initialized.' });
    });

    it('cancels task after create', async () => {
      await findOp(ops, 'chat_cancel_create').handler({ chatId: 'chat-1' });
      const result = (await findOp(ops, 'chat_cancel_stop').handler({
        chatId: 'chat-1',
      })) as Record<string, unknown>;
      expect(result.cancelled).toBe(true);
    });
  });

  describe('chat_cancel_status', () => {
    it('returns empty when no manager', async () => {
      expect(await findOp(ops, 'chat_cancel_status').handler({})).toEqual({
        activeTasks: 0,
        running: [],
      });
    });

    it('returns per-chat status', async () => {
      await findOp(ops, 'chat_cancel_create').handler({ chatId: 'chat-1' });
      const result = (await findOp(ops, 'chat_cancel_status').handler({
        chatId: 'chat-1',
      })) as Record<string, unknown>;
      expect(result.running).toBe(true);
    });

    it('returns all running tasks when no chatId', async () => {
      await findOp(ops, 'chat_cancel_create').handler({ chatId: 'chat-1' });
      const result = (await findOp(ops, 'chat_cancel_status').handler({})) as {
        activeTasks: number;
        running: unknown[];
      };
      expect(result.activeTasks).toBe(1);
      expect(result.running).toHaveLength(1);
    });
  });

  // ─── Self-Update ───────────────────────────────────────────────

  describe('chat_update_init', () => {
    it('initializes updater', async () => {
      expect(
        await findOp(ops, 'chat_update_init').handler({ contextPath: '/tmp/ctx.json' }),
      ).toEqual({ initialized: true, hasPendingRestart: false, pendingContext: null });
    });
  });

  describe('chat_update_request', () => {
    it('requests restart', async () => {
      expect(
        await findOp(ops, 'chat_update_request').handler({
          chatId: 'chat-1',
          reason: 'self-update',
          contextPath: '/tmp/ctx.json',
        }),
      ).toEqual({ scheduled: true });
    });
  });

  describe('chat_update_confirm', () => {
    it('confirms and clears context', async () => {
      expect(
        await findOp(ops, 'chat_update_confirm').handler({ contextPath: '/tmp/ctx.json' }),
      ).toEqual({ confirmed: true, previousContext: null });
    });
  });

  // ─── File Handling ─────────────────────────────────────────────

  describe('chat_file_detect_intent', () => {
    it('detects file intent', async () => {
      expect(
        await findOp(ops, 'chat_file_detect_intent').handler({
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
        }),
      ).toEqual({ filename: 'photo.jpg', mimeType: 'image/jpeg', intent: 'vision' });
    });
  });

  describe('chat_file_cleanup', () => {
    it('cleans up temp files', async () => {
      expect(await findOp(ops, 'chat_file_cleanup').handler({ uploadDir: '/tmp/uploads' })).toEqual(
        { removed: 3, uploadDir: '/tmp/uploads' },
      );
    });
  });

  // ─── Notifications ─────────────────────────────────────────────

  describe('chat_notify_init', () => {
    it('initializes notification engine', async () => {
      expect(await findOp(ops, 'chat_notify_init').handler({})).toEqual({ initialized: true });
    });
  });

  describe('chat_notify_start', () => {
    it('returns error when not initialized', async () => {
      expect(await findOp(ops, 'chat_notify_start').handler({})).toEqual({
        started: false,
        reason: 'Notification engine not initialized.',
      });
    });

    it('starts after init', async () => {
      await findOp(ops, 'chat_notify_init').handler({});
      const result = (await findOp(ops, 'chat_notify_start').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.started).toBe(true);
    });
  });

  describe('chat_notify_stop', () => {
    it('returns error when not initialized', async () => {
      expect(await findOp(ops, 'chat_notify_stop').handler({})).toEqual({
        stopped: false,
        reason: 'Notification engine not initialized.',
      });
    });
  });

  describe('chat_notify_poll', () => {
    it('returns error when not initialized', async () => {
      expect(await findOp(ops, 'chat_notify_poll').handler({})).toEqual({
        polled: false,
        reason: 'Notification engine not initialized.',
      });
    });

    it('polls after init', async () => {
      await findOp(ops, 'chat_notify_init').handler({});
      const result = (await findOp(ops, 'chat_notify_poll').handler({})) as Record<string, unknown>;
      expect(result.polled).toBe(true);
      expect(result.notified).toBe(2);
    });
  });

  describe('chat_notify_status', () => {
    it('returns uninitialized status', async () => {
      expect(await findOp(ops, 'chat_notify_status').handler({})).toEqual({
        initialized: false,
        checks: 0,
        running: false,
        sent: 0,
        lastPollAt: null,
      });
    });

    it('returns stats after init', async () => {
      await findOp(ops, 'chat_notify_init').handler({});
      const result = (await findOp(ops, 'chat_notify_status').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.initialized).toBe(true);
    });
  });

  // ─── Browser Sessions ──────────────────────────────────────────

  describe('chat_browser_init', () => {
    it('initializes browser manager', async () => {
      expect(await findOp(ops, 'chat_browser_init').handler({ maxSessions: 5 })).toEqual({
        initialized: true,
        maxSessions: 5,
      });
    });
  });

  describe('chat_browser_acquire', () => {
    it('acquires browser session', async () => {
      const result = (await findOp(ops, 'chat_browser_acquire').handler({
        chatId: 'chat-1',
      })) as Record<string, unknown>;
      expect(result.chatId).toBe('chat-1');
      expect(result.pid).toBe(1234);
    });
  });

  describe('chat_browser_release', () => {
    it('returns false when no browser manager', async () => {
      expect(await findOp(ops, 'chat_browser_release').handler({ chatId: 'chat-1' })).toEqual({
        released: false,
        reason: 'No browser manager.',
      });
    });

    it('releases after init', async () => {
      await findOp(ops, 'chat_browser_init').handler({});
      const result = (await findOp(ops, 'chat_browser_release').handler({
        chatId: 'chat-1',
      })) as Record<string, unknown>;
      expect(result.released).toBe(true);
    });
  });

  describe('chat_browser_status', () => {
    it('returns uninitialized status', async () => {
      expect(await findOp(ops, 'chat_browser_status').handler({})).toEqual({
        initialized: false,
        activeSessions: 0,
        sessions: [],
      });
    });

    it('returns status after init', async () => {
      await findOp(ops, 'chat_browser_init').handler({});
      const result = (await findOp(ops, 'chat_browser_status').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.initialized).toBe(true);
    });
  });
});
