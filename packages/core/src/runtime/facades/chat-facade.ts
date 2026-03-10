/**
 * Chat facade — session management, response chunking, auth for chat transports.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { ChatSessionManager } from '../../chat/chat-session.js';
import { ChatAuthManager } from '../../chat/auth-manager.js';
import { chunkResponse } from '../../chat/response-chunker.js';
import type { ChatSessionConfig, ChatAuthConfig, ChunkConfig } from '../../chat/types.js';

/**
 * Chat transport state — lazily initialized on first use.
 * Config comes from runtime flags or op params.
 */
interface ChatState {
  sessions: ChatSessionManager | null;
  auth: ChatAuthManager | null;
}

function getOrCreateSessions(state: ChatState, config: ChatSessionConfig): ChatSessionManager {
  if (!state.sessions) {
    state.sessions = new ChatSessionManager(config);
    state.sessions.startReaper();
  }
  return state.sessions;
}

function getOrCreateAuth(state: ChatState, config: ChatAuthConfig): ChatAuthManager {
  if (!state.auth) {
    state.auth = new ChatAuthManager(config);
  }
  return state.auth;
}

export function createChatFacadeOps(_runtime: AgentRuntime): OpDefinition[] {
  const state: ChatState = { sessions: null, auth: null };

  return [
    // ─── Session Ops ──────────────────────────────────────────────

    {
      name: 'chat_session_init',
      description:
        'Initialize chat session management. Must be called before other session ops. Provide the storage directory path.',
      auth: 'write',
      schema: z.object({
        storageDir: z.string().describe('Directory for session persistence.'),
        ttlMs: z.number().optional().describe('Session TTL in ms. Default: 7200000 (2 hours).'),
        compactionThreshold: z
          .number()
          .optional()
          .describe('Messages before compaction. Default: 100.'),
        compactionKeep: z
          .number()
          .optional()
          .describe('Messages to keep after compaction. Default: 40.'),
      }),
      handler: async (params) => {
        const config: ChatSessionConfig = {
          storageDir: params.storageDir as string,
          ttlMs: params.ttlMs as number | undefined,
          compactionThreshold: params.compactionThreshold as number | undefined,
          compactionKeep: params.compactionKeep as number | undefined,
        };
        const sessions = getOrCreateSessions(state, config);
        return {
          initialized: true,
          activeSessions: sessions.size,
          storageDir: config.storageDir,
        };
      },
    },

    {
      name: 'chat_session_get',
      description: 'Get or create a chat session by ID. Returns session with message history.',
      auth: 'read',
      schema: z.object({
        sessionId: z.string().describe('Session/chat ID.'),
        storageDir: z.string().describe('Storage directory (auto-initializes if needed).'),
      }),
      handler: async (params) => {
        const sessions = getOrCreateSessions(state, {
          storageDir: params.storageDir as string,
        });
        const session = sessions.getOrCreate(params.sessionId as string);
        return {
          id: session.id,
          messageCount: session.messages.length,
          createdAt: session.createdAt,
          lastActiveAt: session.lastActiveAt,
          meta: session.meta,
        };
      },
    },

    {
      name: 'chat_session_append',
      description: 'Append a message to a chat session.',
      auth: 'write',
      schema: z.object({
        sessionId: z.string().describe('Session/chat ID.'),
        storageDir: z.string().describe('Storage directory.'),
        role: z.enum(['user', 'assistant', 'system', 'tool']).describe('Message role.'),
        content: z.string().describe('Message content.'),
      }),
      handler: async (params) => {
        const sessions = getOrCreateSessions(state, {
          storageDir: params.storageDir as string,
        });
        sessions.appendMessage(params.sessionId as string, {
          role: params.role as 'user' | 'assistant' | 'system' | 'tool',
          content: params.content as string,
          timestamp: Date.now(),
        });
        return {
          sessionId: params.sessionId,
          messageCount: sessions.messageCount(params.sessionId as string),
        };
      },
    },

    {
      name: 'chat_session_clear',
      description: 'Clear message history for a session (keeps session alive).',
      auth: 'write',
      schema: z.object({
        sessionId: z.string().describe('Session/chat ID.'),
        storageDir: z.string().describe('Storage directory.'),
      }),
      handler: async (params) => {
        const sessions = getOrCreateSessions(state, {
          storageDir: params.storageDir as string,
        });
        sessions.clear(params.sessionId as string);
        return { cleared: true, sessionId: params.sessionId };
      },
    },

    {
      name: 'chat_session_delete',
      description: 'Delete a session entirely (memory + disk).',
      auth: 'write',
      schema: z.object({
        sessionId: z.string().describe('Session/chat ID.'),
        storageDir: z.string().describe('Storage directory.'),
      }),
      handler: async (params) => {
        const sessions = getOrCreateSessions(state, {
          storageDir: params.storageDir as string,
        });
        sessions.delete(params.sessionId as string);
        return { deleted: true, sessionId: params.sessionId };
      },
    },

    {
      name: 'chat_session_list',
      description: 'List all session IDs (active + persisted).',
      auth: 'read',
      schema: z.object({
        storageDir: z.string().describe('Storage directory.'),
      }),
      handler: async (params) => {
        const sessions = getOrCreateSessions(state, {
          storageDir: params.storageDir as string,
        });
        const ids = sessions.listAll();
        return { sessions: ids, count: ids.length, active: sessions.size };
      },
    },

    // ─── Response Chunking ────────────────────────────────────────

    {
      name: 'chat_chunk_response',
      description:
        'Split a long response into chunks for chat platforms. Converts Markdown to HTML by default.',
      auth: 'read',
      schema: z.object({
        text: z.string().describe('The response text to chunk.'),
        maxChunkSize: z.number().optional().describe('Max characters per chunk. Default: 4000.'),
        format: z
          .enum(['html', 'markdown', 'plain'])
          .optional()
          .describe('Output format. Default: html.'),
      }),
      handler: async (params) => {
        const config: ChunkConfig = {
          maxChunkSize: params.maxChunkSize as number | undefined,
          format: params.format as 'html' | 'markdown' | 'plain' | undefined,
        };
        const chunks = chunkResponse(params.text as string, config);
        return { chunks, count: chunks.length };
      },
    },

    // ─── Authentication ───────────────────────────────────────────

    {
      name: 'chat_auth_init',
      description: 'Initialize chat authentication. Provide passphrase and optional allowlist.',
      auth: 'write',
      schema: z.object({
        storagePath: z.string().describe('Path to auth persistence file.'),
        passphrase: z.string().optional().describe('Auth passphrase. If unset, auth is disabled.'),
        allowedUsers: z
          .array(z.union([z.string(), z.number()]))
          .optional()
          .describe('Allowed user IDs. Empty = any user.'),
      }),
      handler: async (params) => {
        const config: ChatAuthConfig = {
          storagePath: params.storagePath as string,
          passphrase: params.passphrase as string | undefined,
          allowedUsers: params.allowedUsers as (string | number)[] | undefined,
        };
        const auth = getOrCreateAuth(state, config);
        return {
          initialized: true,
          enabled: auth.enabled,
          authenticatedCount: auth.authenticatedCount,
        };
      },
    },

    {
      name: 'chat_auth_check',
      description: 'Check if a user is authenticated.',
      auth: 'read',
      schema: z.object({
        userId: z.union([z.string(), z.number()]).describe('User ID to check.'),
        storagePath: z.string().describe('Auth storage path (auto-initializes if needed).'),
      }),
      handler: async (params) => {
        const auth = getOrCreateAuth(state, {
          storagePath: params.storagePath as string,
        });
        const userId = params.userId as string | number;
        return {
          userId,
          authenticated: auth.isAuthenticated(userId),
          lockedOut: auth.isLockedOut(userId),
        };
      },
    },

    {
      name: 'chat_auth_authenticate',
      description: 'Attempt to authenticate a user with a passphrase.',
      auth: 'write',
      schema: z.object({
        userId: z.union([z.string(), z.number()]).describe('User ID.'),
        passphrase: z.string().describe('Passphrase to verify.'),
        storagePath: z.string().describe('Auth storage path.'),
      }),
      handler: async (params) => {
        const auth = getOrCreateAuth(state, {
          storagePath: params.storagePath as string,
        });
        const success = auth.authenticate(
          params.userId as string | number,
          params.passphrase as string,
        );
        return {
          userId: params.userId,
          success,
          lockedOut: auth.isLockedOut(params.userId as string | number),
        };
      },
    },

    {
      name: 'chat_auth_revoke',
      description: 'Revoke authentication for a user.',
      auth: 'write',
      schema: z.object({
        userId: z.union([z.string(), z.number()]).describe('User ID to revoke.'),
        storagePath: z.string().describe('Auth storage path.'),
      }),
      handler: async (params) => {
        const auth = getOrCreateAuth(state, {
          storagePath: params.storagePath as string,
        });
        auth.revoke(params.userId as string | number);
        return { revoked: true, userId: params.userId };
      },
    },

    {
      name: 'chat_auth_status',
      description: 'Get authentication status — enabled, user count, list.',
      auth: 'read',
      schema: z.object({
        storagePath: z.string().describe('Auth storage path.'),
      }),
      handler: async (params) => {
        const auth = getOrCreateAuth(state, {
          storagePath: params.storagePath as string,
        });
        return {
          enabled: auth.enabled,
          authenticatedCount: auth.authenticatedCount,
          authenticatedUsers: auth.listAuthenticated(),
        };
      },
    },
  ];
}
