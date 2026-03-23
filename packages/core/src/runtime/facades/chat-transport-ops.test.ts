/**
 * Tests for chat-transport-ops — chunking, auth, bridge, compression, voice, queue.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatTransportOps } from './chat-transport-ops.js';
import { createChatState } from './chat-state.js';
import type { ChatState } from './chat-state.js';
import type { OpDefinition } from '../../facades/types.js';

// ─── Mock chat modules ─────────────────────────────────────────────

vi.mock('../../chat/response-chunker.js', () => ({
  chunkResponse: vi.fn().mockReturnValue(['chunk1', 'chunk2']),
}));

const mockAuthManager = {
  enabled: true,
  authenticatedCount: 1,
  isAuthenticated: vi.fn().mockReturnValue(true),
  isLockedOut: vi.fn().mockReturnValue(false),
  authenticate: vi.fn().mockReturnValue(true),
  revoke: vi.fn(),
  listAuthenticated: vi.fn().mockReturnValue([{ userId: 'u1', authenticatedAt: 1000 }]),
};

vi.mock('../../chat/auth-manager.js', () => ({
  ChatAuthManager: class {
    enabled = mockAuthManager.enabled;
    authenticatedCount = mockAuthManager.authenticatedCount;
    isAuthenticated = mockAuthManager.isAuthenticated;
    isLockedOut = mockAuthManager.isLockedOut;
    authenticate = mockAuthManager.authenticate;
    revoke = mockAuthManager.revoke;
    listAuthenticated = mockAuthManager.listAuthenticated;
  },
}));

const mockBridge = {
  size: 1,
  register: vi.fn(),
  listTools: vi.fn().mockReturnValue([{ name: 'tool1' }]),
  execute: vi.fn().mockResolvedValue({ output: 'result' }),
};

vi.mock('../../chat/mcp-bridge.js', () => ({
  McpToolBridge: class {
    size = mockBridge.size;
    register = mockBridge.register;
    listTools = mockBridge.listTools;
    execute = mockBridge.execute;
  },
}));

vi.mock('../../chat/output-compressor.js', () => ({
  createOutputCompressor: vi.fn().mockReturnValue(
    (_name: string, output: string, _max?: number) => output.slice(0, 10),
  ),
}));

vi.mock('../../chat/voice.js', () => ({
  transcribeAudio: vi.fn().mockResolvedValue({ text: 'hello world', language: 'en' }),
  synthesizeSpeech: vi.fn().mockResolvedValue({
    success: true,
    audio: Buffer.from('audio-data'),
  }),
}));

const mockQueue = {
  inboxCount: vi.fn().mockReturnValue(2),
  outboxCount: vi.fn().mockReturnValue(1),
  readInbox: vi.fn().mockReturnValue([{ id: 'm1', text: 'hi' }]),
  formatInbox: vi.fn().mockReturnValue('formatted'),
  sendResponse: vi.fn().mockReturnValue({ id: 'r1' }),
  drainOutbox: vi.fn().mockReturnValue([{ id: 'r1' }]),
};

vi.mock('../../chat/queue.js', () => ({
  MessageQueue: class {
    inboxCount = mockQueue.inboxCount;
    outboxCount = mockQueue.outboxCount;
    readInbox = mockQueue.readInbox;
    formatInbox = mockQueue.formatInbox;
    sendResponse = mockQueue.sendResponse;
    drainOutbox = mockQueue.drainOutbox;
  },
}));

// Needed via chat-state imports
vi.mock('../../chat/chat-session.js', () => ({
  ChatSessionManager: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op not found: ${name}`);
  return op;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('chat-transport-ops', () => {
  let state: ChatState;
  let ops: OpDefinition[];

  beforeEach(() => {
    vi.clearAllMocks();
    state = createChatState();
    ops = createChatTransportOps(state);
  });

  it('exports 17 transport ops', () => {
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'chat_chunk_response',
      'chat_auth_init', 'chat_auth_check', 'chat_auth_authenticate',
      'chat_auth_revoke', 'chat_auth_status',
      'chat_bridge_init', 'chat_bridge_register', 'chat_bridge_list', 'chat_bridge_execute',
      'chat_compress_output',
      'chat_voice_transcribe', 'chat_voice_synthesize',
      'chat_queue_init', 'chat_queue_inbox', 'chat_queue_reply', 'chat_queue_drain',
    ]);
  });

  // ─── Chunking ──────────────────────────────────────────────────

  describe('chat_chunk_response', () => {
    it('chunks text and returns result', async () => {
      const op = findOp(ops, 'chat_chunk_response');
      const result = (await op.handler({ text: 'hello world' })) as { chunks: string[]; count: number };
      expect(result.chunks).toEqual(['chunk1', 'chunk2']);
      expect(result.count).toBe(2);
    });

    it('has read auth level', () => {
      expect(findOp(ops, 'chat_chunk_response').auth).toBe('read');
    });
  });

  // ─── Authentication ────────────────────────────────────────────

  describe('chat_auth_init', () => {
    it('initializes and returns status', async () => {
      const result = await findOp(ops, 'chat_auth_init').handler({ storagePath: '/tmp/auth.json' });
      expect(result).toEqual({ initialized: true, enabled: true, authenticatedCount: 1 });
    });
  });

  describe('chat_auth_check', () => {
    it('checks authentication status', async () => {
      const result = await findOp(ops, 'chat_auth_check').handler({ userId: 'u1', storagePath: '/tmp/auth.json' });
      expect(result).toEqual({ userId: 'u1', authenticated: true, lockedOut: false });
    });
  });

  describe('chat_auth_authenticate', () => {
    it('authenticates user with passphrase', async () => {
      const result = await findOp(ops, 'chat_auth_authenticate').handler({
        userId: 'u1', passphrase: 'secret', storagePath: '/tmp/auth.json',
      });
      expect(result).toEqual({ userId: 'u1', success: true, lockedOut: false });
      expect(mockAuthManager.authenticate).toHaveBeenCalledWith('u1', 'secret');
    });
  });

  describe('chat_auth_revoke', () => {
    it('revokes authentication', async () => {
      const result = await findOp(ops, 'chat_auth_revoke').handler({ userId: 'u1', storagePath: '/tmp/auth.json' });
      expect(result).toEqual({ revoked: true, userId: 'u1' });
    });
  });

  describe('chat_auth_status', () => {
    it('returns auth status', async () => {
      const result = await findOp(ops, 'chat_auth_status').handler({ storagePath: '/tmp/auth.json' });
      expect(result).toEqual({
        enabled: true, authenticatedCount: 1,
        authenticatedUsers: [{ userId: 'u1', authenticatedAt: 1000 }],
      });
    });
  });

  // ─── MCP Bridge ────────────────────────────────────────────────

  describe('chat_bridge_init', () => {
    it('initializes bridge', async () => {
      const result = await findOp(ops, 'chat_bridge_init').handler({});
      expect(result).toEqual({ initialized: true, toolCount: 0 });
    });
  });

  describe('chat_bridge_register', () => {
    it('registers a tool', async () => {
      const result = await findOp(ops, 'chat_bridge_register').handler({
        name: 'my-tool', description: 'A tool', inputSchema: { type: 'object' },
      });
      expect(result).toEqual({ registered: true, name: 'my-tool', totalTools: 1 });
    });
  });

  describe('chat_bridge_list', () => {
    it('returns empty when bridge not initialized', async () => {
      expect(await findOp(ops, 'chat_bridge_list').handler({})).toEqual({ tools: [], count: 0 });
    });

    it('returns tools after init', async () => {
      await findOp(ops, 'chat_bridge_init').handler({});
      expect(await findOp(ops, 'chat_bridge_list').handler({})).toEqual({ tools: [{ name: 'tool1' }], count: 1 });
    });
  });

  describe('chat_bridge_execute', () => {
    it('returns error when not initialized', async () => {
      expect(await findOp(ops, 'chat_bridge_execute').handler({ name: 'tool1' }))
        .toEqual({ output: 'Bridge not initialized', isError: true });
    });

    it('executes tool after init', async () => {
      await findOp(ops, 'chat_bridge_init').handler({});
      expect(await findOp(ops, 'chat_bridge_execute').handler({ name: 'tool1', input: { a: 1 } }))
        .toEqual({ output: 'result' });
    });
  });

  describe('chat_compress_output', () => {
    it('compresses output', async () => {
      const result = (await findOp(ops, 'chat_compress_output').handler({
        toolName: 'test', output: 'long output text here',
      })) as { compressed: string; originalLength: number; compressedLength: number };
      expect(result.originalLength).toBe(21);
      expect(result.compressedLength).toBe(10);
    });
  });

  // ─── Voice ─────────────────────────────────────────────────────

  describe('chat_voice_transcribe', () => {
    it('transcribes audio', async () => {
      const result = await findOp(ops, 'chat_voice_transcribe').handler({
        audioBase64: Buffer.from('test').toString('base64'), openaiApiKey: 'key-123',
      });
      expect(result).toEqual({ text: 'hello world', language: 'en' });
    });
  });

  describe('chat_voice_synthesize', () => {
    it('synthesizes speech', async () => {
      const result = (await findOp(ops, 'chat_voice_synthesize').handler({
        text: 'hello', openaiApiKey: 'key-123',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.audioBase64).toBeDefined();
    });
  });

  // ─── Queue ─────────────────────────────────────────────────────

  describe('chat_queue_init', () => {
    it('initializes queue', async () => {
      expect(await findOp(ops, 'chat_queue_init').handler({ queueDir: '/tmp/queue' }))
        .toEqual({ initialized: true, inbox: 2, outbox: 1 });
    });
  });

  describe('chat_queue_inbox', () => {
    it('reads inbox', async () => {
      const result = (await findOp(ops, 'chat_queue_inbox').handler({ queueDir: '/tmp/queue' })) as Record<string, unknown>;
      expect(result.count).toBe(1);
      expect(result.formatted).toBe('formatted');
    });
  });

  describe('chat_queue_reply', () => {
    it('sends reply', async () => {
      expect(await findOp(ops, 'chat_queue_reply').handler({
        messageId: 'm1', chatId: 'chat-1', text: 'response', queueDir: '/tmp/queue',
      })).toEqual({ sent: true, response: { id: 'r1' } });
    });
  });

  describe('chat_queue_drain', () => {
    it('drains outbox', async () => {
      expect(await findOp(ops, 'chat_queue_drain').handler({ queueDir: '/tmp/queue' }))
        .toEqual({ responses: [{ id: 'r1' }], count: 1 });
    });
  });
});
