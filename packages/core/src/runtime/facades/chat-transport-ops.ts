/**
 * Chat transport ops — response chunking, authentication, MCP bridge,
 * output compression, voice, message queue, and browser sessions.
 * Split from chat-facade.ts for maintainability.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import { chunkResponse } from '../../chat/response-chunker.js';
import { McpToolBridge } from '../../chat/mcp-bridge.js';
import { createOutputCompressor } from '../../chat/output-compressor.js';
import { transcribeAudio, synthesizeSpeech } from '../../chat/voice.js';
import { MessageQueue } from '../../chat/queue.js';
import type { ChatAuthConfig, ChunkConfig } from '../../chat/types.js';
import type { ChatState } from './chat-state.js';
import { getOrCreateAuth } from './chat-state.js';

export function createChatTransportOps(state: ChatState): OpDefinition[] {
  return [
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

    // ─── MCP Bridge Ops ─────────────────────────────────────────────

    {
      name: 'chat_bridge_init',
      description:
        'Initialize the MCP tool bridge for local tool execution. Optional allowlist filters which tools are registered.',
      auth: 'write',
      schema: z.object({
        allowlist: z
          .array(z.string())
          .optional()
          .describe('Tool name allowlist. If unset, all tools are allowed.'),
        maxOutput: z
          .number()
          .optional()
          .describe('Max output length per tool call. Default: 10000.'),
      }),
      handler: async (params) => {
        state.bridge = new McpToolBridge({
          allowlist: params.allowlist as string[] | undefined,
          compressor: createOutputCompressor(),
          maxOutput: params.maxOutput as number | undefined,
        });
        return { initialized: true, toolCount: 0 };
      },
    },

    {
      name: 'chat_bridge_register',
      description: 'Register a tool with the MCP bridge.',
      auth: 'write',
      schema: z.object({
        name: z.string().describe('Tool name.'),
        description: z.string().describe('Tool description.'),
        inputSchema: z.record(z.string(), z.unknown()).describe('JSON Schema for tool input.'),
      }),
      handler: async (params) => {
        if (!state.bridge) {
          state.bridge = new McpToolBridge({ compressor: createOutputCompressor() });
        }
        state.bridge.register({
          name: params.name as string,
          description: params.description as string,
          inputSchema: params.inputSchema as Record<string, unknown>,
          handler: async () => ({ message: 'Registered via op — handler is a placeholder' }),
        });
        return { registered: true, name: params.name, totalTools: state.bridge.size };
      },
    },

    {
      name: 'chat_bridge_list',
      description: 'List all tools registered with the MCP bridge.',
      auth: 'read',
      handler: async () => {
        if (!state.bridge) return { tools: [], count: 0 };
        const tools = state.bridge.listTools();
        return { tools, count: tools.length };
      },
    },

    {
      name: 'chat_bridge_execute',
      description: 'Execute a registered tool via the MCP bridge.',
      auth: 'write',
      schema: z.object({
        name: z.string().describe('Tool name to execute.'),
        input: z.record(z.string(), z.unknown()).optional().describe('Tool input parameters.'),
      }),
      handler: async (params) => {
        if (!state.bridge) return { output: 'Bridge not initialized', isError: true };
        const result = await state.bridge.execute(
          params.name as string,
          (params.input as Record<string, unknown>) ?? {},
        );
        return result;
      },
    },

    {
      name: 'chat_compress_output',
      description: 'Compress verbose tool output for chat display. Uses JSON-aware truncation.',
      auth: 'read',
      schema: z.object({
        toolName: z.string().describe('Tool name (for compressor lookup).'),
        output: z.string().describe('Raw tool output to compress.'),
        maxLength: z.number().optional().describe('Max output length. Default: 4000.'),
      }),
      handler: async (params) => {
        const compressor = createOutputCompressor();
        const compressed = compressor(
          params.toolName as string,
          params.output as string,
          params.maxLength as number | undefined,
        );
        return {
          compressed,
          originalLength: (params.output as string).length,
          compressedLength: compressed.length,
        };
      },
    },

    // ─── Voice Ops ─────────────────────────────────────────────────

    {
      name: 'chat_voice_transcribe',
      description: 'Transcribe audio using OpenAI Whisper. Provide base64-encoded audio.',
      auth: 'write',
      schema: z.object({
        audioBase64: z.string().describe('Base64-encoded audio data.'),
        openaiApiKey: z.string().describe('OpenAI API key.'),
        filename: z.string().optional().describe('Audio filename. Default: audio.ogg.'),
      }),
      handler: async (params) => {
        const buffer = Buffer.from(params.audioBase64 as string, 'base64');
        return transcribeAudio(
          buffer,
          {
            openaiApiKey: params.openaiApiKey as string,
          },
          params.filename as string | undefined,
        );
      },
    },

    {
      name: 'chat_voice_synthesize',
      description: 'Synthesize speech from text using OpenAI TTS. Returns base64 MP3.',
      auth: 'write',
      schema: z.object({
        text: z.string().describe('Text to synthesize.'),
        openaiApiKey: z.string().describe('OpenAI API key.'),
        voice: z.string().optional().describe('Voice ID. Default: onyx.'),
      }),
      handler: async (params) => {
        const result = await synthesizeSpeech(params.text as string, {
          openaiApiKey: params.openaiApiKey as string,
          ttsVoice: params.voice as string | undefined,
        });
        if (!result) return { success: false, reason: 'No API key.' };
        return {
          success: result.success,
          audioBase64: result.audio.toString('base64'),
          audioSize: result.audio.length,
        };
      },
    },

    // ─── Queue Ops ─────────────────────────────────────────────────

    {
      name: 'chat_queue_init',
      description: 'Initialize the message queue for disk-based chat relay.',
      auth: 'write',
      schema: z.object({
        queueDir: z.string().describe('Base directory for inbox/outbox.'),
      }),
      handler: async (params) => {
        state.queue = new MessageQueue({ queueDir: params.queueDir as string });
        return {
          initialized: true,
          inbox: state.queue.inboxCount(),
          outbox: state.queue.outboxCount(),
        };
      },
    },

    {
      name: 'chat_queue_inbox',
      description: 'Read pending messages from the queue inbox.',
      auth: 'read',
      schema: z.object({
        queueDir: z.string().describe('Queue directory (auto-initializes).'),
      }),
      handler: async (params) => {
        if (!state.queue) {
          state.queue = new MessageQueue({ queueDir: params.queueDir as string });
        }
        const messages = state.queue.readInbox();
        return { messages, count: messages.length, formatted: state.queue.formatInbox() };
      },
    },

    {
      name: 'chat_queue_reply',
      description: 'Send a reply to a queued message. Removes from inbox, writes to outbox.',
      auth: 'write',
      schema: z.object({
        messageId: z.string().describe('Original message ID.'),
        chatId: z.string().describe('Target chat ID.'),
        text: z.string().describe('Response text.'),
        queueDir: z.string().describe('Queue directory.'),
      }),
      handler: async (params) => {
        if (!state.queue) {
          state.queue = new MessageQueue({ queueDir: params.queueDir as string });
        }
        const response = state.queue.sendResponse(
          params.messageId as string,
          params.chatId as string,
          params.text as string,
        );
        return { sent: true, response };
      },
    },

    {
      name: 'chat_queue_drain',
      description: 'Drain outbox — read and remove all pending responses.',
      auth: 'write',
      schema: z.object({
        queueDir: z.string().describe('Queue directory.'),
      }),
      handler: async (params) => {
        if (!state.queue) {
          state.queue = new MessageQueue({ queueDir: params.queueDir as string });
        }
        const responses = state.queue.drainOutbox();
        return { responses, count: responses.length };
      },
    },
  ];
}
