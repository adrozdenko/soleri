/**
 * Chat session ops — session lifecycle management.
 * Split from chat-facade.ts for maintainability.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { ChatSessionConfig } from '../../chat/types.js';
import type { ChatState } from './chat-state.js';
import { getOrCreateSessions } from './chat-state.js';

export function createChatSessionOps(state: ChatState): OpDefinition[] {
  return [
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
  ];
}
