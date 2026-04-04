/**
 * Tests for chat-session-ops — session lifecycle management ops.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatSessionOps } from './chat-session-ops.js';
import { createChatState } from './chat-state.js';
import type { ChatState } from './chat-state.js';
import type { OpDefinition } from '../../facades/types.js';

// ─── Mock chat modules ─────────────────────────────────────────────

const mockSession = {
  id: 'sess-1',
  messages: [{ role: 'user', content: 'hi', timestamp: 1000 }],
  createdAt: 1000,
  lastActiveAt: 2000,
  meta: { key: 'val' },
};

const mockSessionManager = {
  size: 1,
  startReaper: vi.fn(),
  getOrCreate: vi.fn().mockReturnValue(mockSession),
  appendMessage: vi.fn(),
  messageCount: vi.fn().mockReturnValue(2),
  clear: vi.fn(),
  delete: vi.fn(),
  listAll: vi.fn().mockReturnValue(['sess-1', 'sess-2']),
};

const mockConstructorCalls: unknown[][] = [];

vi.mock('../../chat/chat-session.js', () => ({
  ChatSessionManager: class {
    size = mockSessionManager.size;
    startReaper = mockSessionManager.startReaper;
    getOrCreate = mockSessionManager.getOrCreate;
    appendMessage = mockSessionManager.appendMessage;
    messageCount = mockSessionManager.messageCount;
    clear = mockSessionManager.clear;
    delete = mockSessionManager.delete;
    listAll = mockSessionManager.listAll;
    constructor(...args: unknown[]) {
      mockConstructorCalls.push(args);
    }
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op not found: ${name}`);
  return op;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('chat-session-ops', () => {
  let state: ChatState;
  let ops: OpDefinition[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConstructorCalls.length = 0;
    state = createChatState();
    ops = createChatSessionOps(state);
  });

  describe('chat_session_init', () => {
    it('initializes session manager and returns status', async () => {
      const op = findOp(ops, 'chat_session_init');
      const result = await op.handler({ storageDir: '/tmp/sessions' });
      expect(result).toEqual({
        initialized: true,
        activeSessions: 1,
        storageDir: '/tmp/sessions',
      });
      expect(mockSessionManager.startReaper).toHaveBeenCalled();
    });

    it('passes optional config params', async () => {
      const op = findOp(ops, 'chat_session_init');
      await op.handler({
        storageDir: '/tmp/s',
        ttlMs: 5000,
        compactionThreshold: 50,
        compactionKeep: 20,
      });
      expect(mockConstructorCalls[0]).toEqual([
        {
          storageDir: '/tmp/s',
          ttlMs: 5000,
          compactionThreshold: 50,
          compactionKeep: 20,
        },
      ]);
    });

    it('has write auth level', () => {
      const op = findOp(ops, 'chat_session_init');
      expect(op.auth).toBe('write');
    });
  });

  describe('chat_session_get', () => {
    it('returns session info', async () => {
      const op = findOp(ops, 'chat_session_get');
      const result = await op.handler({ sessionId: 'sess-1', storageDir: '/tmp/s' });
      expect(result).toEqual({
        id: 'sess-1',
        messageCount: 1,
        createdAt: 1000,
        lastActiveAt: 2000,
        meta: { key: 'val' },
      });
      expect(mockSessionManager.getOrCreate).toHaveBeenCalledWith('sess-1');
    });

    it('has read auth level', () => {
      const op = findOp(ops, 'chat_session_get');
      expect(op.auth).toBe('read');
    });
  });

  describe('chat_session_append', () => {
    it('appends message and returns count', async () => {
      const op = findOp(ops, 'chat_session_append');
      const result = await op.handler({
        sessionId: 'sess-1',
        storageDir: '/tmp/s',
        role: 'user',
        content: 'hello',
      });
      expect(mockSessionManager.appendMessage).toHaveBeenCalledWith('sess-1', {
        role: 'user',
        content: 'hello',
        timestamp: expect.any(Number),
      });
      expect(result).toEqual({
        sessionId: 'sess-1',
        messageCount: 2,
      });
    });

    it('has write auth level', () => {
      const op = findOp(ops, 'chat_session_append');
      expect(op.auth).toBe('write');
    });
  });

  describe('chat_session_clear', () => {
    it('clears session messages', async () => {
      const op = findOp(ops, 'chat_session_clear');
      const result = await op.handler({ sessionId: 'sess-1', storageDir: '/tmp/s' });
      expect(mockSessionManager.clear).toHaveBeenCalledWith('sess-1');
      expect(result).toEqual({ cleared: true, sessionId: 'sess-1' });
    });
  });

  describe('chat_session_delete', () => {
    it('deletes session', async () => {
      const op = findOp(ops, 'chat_session_delete');
      const result = await op.handler({ sessionId: 'sess-1', storageDir: '/tmp/s' });
      expect(mockSessionManager.delete).toHaveBeenCalledWith('sess-1');
      expect(result).toEqual({ deleted: true, sessionId: 'sess-1' });
    });
  });

  describe('chat_session_list', () => {
    it('lists all sessions', async () => {
      const op = findOp(ops, 'chat_session_list');
      const result = await op.handler({ storageDir: '/tmp/s' });
      expect(result).toEqual({
        sessions: ['sess-1', 'sess-2'],
        count: 2,
        active: 1,
      });
    });

    it('has read auth level', () => {
      const op = findOp(ops, 'chat_session_list');
      expect(op.auth).toBe('read');
    });
  });

  describe('state sharing', () => {
    it('reuses session manager across ops (lazy init once)', async () => {
      const initOp = findOp(ops, 'chat_session_init');
      const getOp = findOp(ops, 'chat_session_get');

      await initOp.handler({ storageDir: '/tmp/s' });
      await getOp.handler({ sessionId: 'x', storageDir: '/tmp/s' });

      // ChatSessionManager should be constructed only once
      expect(mockConstructorCalls).toHaveLength(1);
    });
  });
});
