/**
 * Chat facade — session management, response chunking, auth for chat transports.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { ChatSessionManager } from '../../chat/chat-session.js';
import { ChatAuthManager } from '../../chat/auth-manager.js';
import { TaskCancellationManager } from '../../chat/cancellation.js';
import { SelfUpdateManager } from '../../chat/self-update.js';
import { NotificationEngine } from '../../chat/notifications.js';
import {
  detectFileIntent,
  buildMultimodalContent,
  cleanupTempFiles,
} from '../../chat/file-handler.js';
import type { FileInfo } from '../../chat/file-handler.js';
import { transcribeAudio, synthesizeSpeech } from '../../chat/voice.js';
import { MessageQueue } from '../../chat/queue.js';
import { BrowserSessionManager } from '../../chat/browser-session.js';
import { chunkResponse } from '../../chat/response-chunker.js';
import { McpToolBridge } from '../../chat/mcp-bridge.js';
import { createOutputCompressor } from '../../chat/output-compressor.js';
import type { ChatSessionConfig, ChatAuthConfig, ChunkConfig } from '../../chat/types.js';

/**
 * Chat transport state — lazily initialized on first use.
 * Config comes from runtime flags or op params.
 */
interface ChatState {
  sessions: ChatSessionManager | null;
  auth: ChatAuthManager | null;
  bridge: McpToolBridge | null;
  cancellation: TaskCancellationManager | null;
  updater: SelfUpdateManager | null;
  notifications: NotificationEngine | null;
  queue: MessageQueue | null;
  browser: BrowserSessionManager | null;
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
  const state: ChatState = {
    sessions: null,
    auth: null,
    bridge: null,
    cancellation: null,
    updater: null,
    notifications: null,
    queue: null,
    browser: null,
  };

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
        inputSchema: z.record(z.unknown()).describe('JSON Schema for tool input.'),
      }),
      handler: async (params) => {
        if (!state.bridge) {
          state.bridge = new McpToolBridge({ compressor: createOutputCompressor() });
        }
        // Handler is a no-op since we can't pass functions through JSON
        // Real handler registration happens in code, not via ops
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
        input: z.record(z.unknown()).optional().describe('Tool input parameters.'),
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

    // ─── Task Cancellation Ops ─────────────────────────────────────

    {
      name: 'chat_cancel_create',
      description:
        'Create an AbortSignal for a chat task. If a task is already running for this chat, it is cancelled first. Returns signal status.',
      auth: 'write',
      schema: z.object({
        chatId: z.string().describe('Chat/session ID.'),
        description: z.string().optional().describe('Description of what is running.'),
      }),
      handler: async (params) => {
        if (!state.cancellation) {
          state.cancellation = new TaskCancellationManager();
        }
        const signal = state.cancellation.create(
          params.chatId as string,
          params.description as string | undefined,
        );
        return {
          chatId: params.chatId,
          created: true,
          aborted: signal.aborted,
          activeTasks: state.cancellation.size,
        };
      },
    },

    {
      name: 'chat_cancel_stop',
      description: 'Cancel the running task for a chat. Aborts the associated AbortController.',
      auth: 'write',
      schema: z.object({
        chatId: z.string().describe('Chat/session ID to cancel.'),
      }),
      handler: async (params) => {
        if (!state.cancellation) {
          return { cancelled: false, reason: 'No cancellation manager initialized.' };
        }
        const info = state.cancellation.cancel(params.chatId as string);
        if (!info) {
          return { cancelled: false, reason: 'No running task for this chat.' };
        }
        return {
          cancelled: true,
          chatId: params.chatId,
          description: info.description ?? null,
          ranForMs: Date.now() - info.startedAt,
          activeTasks: state.cancellation.size,
        };
      },
    },

    {
      name: 'chat_cancel_status',
      description: 'Get cancellation status — running tasks, per-chat info.',
      auth: 'read',
      schema: z.object({
        chatId: z.string().optional().describe('Specific chat to check. Omit for all.'),
      }),
      handler: async (params) => {
        if (!state.cancellation) {
          return { activeTasks: 0, running: [] };
        }
        if (params.chatId) {
          const info = state.cancellation.getInfo(params.chatId as string);
          return {
            chatId: params.chatId,
            running: !!info,
            description: info?.description ?? null,
            startedAt: info?.startedAt ?? null,
            ranForMs: info ? Date.now() - info.startedAt : null,
          };
        }
        const running = state.cancellation.listRunning();
        return {
          activeTasks: state.cancellation.size,
          running: running.map((id) => {
            const info = state.cancellation!.getInfo(id);
            return {
              chatId: id,
              description: info?.description ?? null,
              startedAt: info?.startedAt ?? null,
            };
          }),
        };
      },
    },

    // ─── Self-Update Ops ───────────────────────────────────────────

    {
      name: 'chat_update_init',
      description: 'Initialize self-update manager. Provide path for restart context persistence.',
      auth: 'write',
      schema: z.object({
        contextPath: z.string().describe('Path for restart context JSON file.'),
      }),
      handler: async (params) => {
        state.updater = new SelfUpdateManager(params.contextPath as string);
        const pending = state.updater.loadContext();
        return {
          initialized: true,
          hasPendingRestart: !!pending,
          pendingContext: pending,
        };
      },
    },

    {
      name: 'chat_update_request',
      description: 'Request a restart. Saves context for post-restart confirmation.',
      auth: 'write',
      schema: z.object({
        chatId: z.string().describe('Chat ID for post-restart confirmation.'),
        reason: z
          .enum(['self-update', 'rebuild', 'manual'])
          .optional()
          .describe('Restart reason. Default: manual.'),
        commitSha: z.string().optional().describe('Git commit SHA if self-update.'),
        contextPath: z.string().describe('Path for restart context.'),
      }),
      handler: async (params) => {
        if (!state.updater) {
          state.updater = new SelfUpdateManager(params.contextPath as string);
        }
        return state.updater.requestRestart(
          params.chatId as string,
          (params.reason as 'self-update' | 'rebuild' | 'manual') ?? 'manual',
          params.commitSha as string | undefined,
        );
      },
    },

    {
      name: 'chat_update_confirm',
      description: 'Clear restart context after successful startup.',
      auth: 'write',
      schema: z.object({
        contextPath: z.string().describe('Path for restart context.'),
      }),
      handler: async (params) => {
        if (!state.updater) {
          state.updater = new SelfUpdateManager(params.contextPath as string);
        }
        const context = state.updater.loadContext();
        state.updater.clearContext();
        return { confirmed: true, previousContext: context };
      },
    },

    // ─── File Handling Ops ─────────────────────────────────────────

    {
      name: 'chat_file_detect_intent',
      description: 'Detect user intent for a file — vision, text, or intake.',
      auth: 'read',
      schema: z.object({
        filename: z.string().describe('Original filename.'),
        mimeType: z.string().describe('MIME type.'),
        userText: z.string().optional().describe('Accompanying user message text.'),
      }),
      handler: async (params) => {
        const intent = detectFileIntent(
          params.filename as string,
          params.mimeType as string,
          params.userText as string | undefined,
        );
        return { filename: params.filename, mimeType: params.mimeType, intent };
      },
    },

    {
      name: 'chat_file_build_content',
      description: 'Build multimodal content from a file for the Anthropic API.',
      auth: 'read',
      schema: z.object({
        filename: z.string().describe('Original filename.'),
        mimeType: z.string().describe('MIME type.'),
        dataBase64: z.string().describe('File content as base64.'),
        intent: z.enum(['vision', 'text', 'intake']).describe('Detected intent.'),
      }),
      handler: async (params) => {
        const file: FileInfo = {
          name: params.filename as string,
          mimeType: params.mimeType as string,
          size: Buffer.byteLength(params.dataBase64 as string, 'base64'),
          data: Buffer.from(params.dataBase64 as string, 'base64'),
        };
        return buildMultimodalContent(file, params.intent as 'vision' | 'text' | 'intake');
      },
    },

    {
      name: 'chat_file_cleanup',
      description: 'Clean up temp files older than maxAgeMs.',
      auth: 'write',
      schema: z.object({
        uploadDir: z.string().describe('Temp upload directory.'),
        maxAgeMs: z.number().optional().describe('Max age in ms. Default: 1 hour.'),
      }),
      handler: async (params) => {
        const removed = cleanupTempFiles(
          params.uploadDir as string,
          params.maxAgeMs as number | undefined,
        );
        return { removed, uploadDir: params.uploadDir };
      },
    },

    // ─── Notification Ops ──────────────────────────────────────────

    {
      name: 'chat_notify_init',
      description:
        'Initialize the notification engine. Notifications are delivered via the provided callback pattern.',
      auth: 'write',
      schema: z.object({
        intervalMs: z.number().optional().describe('Polling interval in ms. Default: 30 minutes.'),
        defaultCooldownMs: z
          .number()
          .optional()
          .describe('Default cooldown between notifications. Default: 4 hours.'),
      }),
      handler: async (params) => {
        // The onNotify callback can't be passed via JSON — it's set up in code.
        // This op initializes with a no-op that logs to console.
        state.notifications = new NotificationEngine({
          intervalMs: params.intervalMs as number | undefined,
          defaultCooldownMs: params.defaultCooldownMs as number | undefined,
          onNotify: async (checkId, message) => {
            console.log(`[notification] ${checkId}: ${message}`);
          },
        });
        return { initialized: true };
      },
    },

    {
      name: 'chat_notify_start',
      description: 'Start the notification polling loop.',
      auth: 'write',
      handler: async () => {
        if (!state.notifications) {
          return { started: false, reason: 'Notification engine not initialized.' };
        }
        state.notifications.start();
        return { started: true, ...state.notifications.stats() };
      },
    },

    {
      name: 'chat_notify_stop',
      description: 'Stop the notification polling loop.',
      auth: 'write',
      handler: async () => {
        if (!state.notifications) {
          return { stopped: false, reason: 'Notification engine not initialized.' };
        }
        state.notifications.stop();
        return { stopped: true, ...state.notifications.stats() };
      },
    },

    {
      name: 'chat_notify_poll',
      description: 'Run all notification checks once (manual trigger).',
      auth: 'write',
      handler: async () => {
        if (!state.notifications) {
          return { polled: false, reason: 'Notification engine not initialized.' };
        }
        const notified = await state.notifications.poll();
        return { polled: true, notified, ...state.notifications.stats() };
      },
    },

    {
      name: 'chat_notify_status',
      description: 'Get notification engine status.',
      auth: 'read',
      handler: async () => {
        if (!state.notifications) {
          return { initialized: false, checks: 0, running: false, sent: 0, lastPollAt: null };
        }
        return { initialized: true, ...state.notifications.stats() };
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

    // ─── Browser Session Ops ───────────────────────────────────────

    {
      name: 'chat_browser_init',
      description: 'Initialize the browser session manager for per-chat Playwright isolation.',
      auth: 'write',
      schema: z.object({
        maxSessions: z.number().optional().describe('Max concurrent sessions. Default: 3.'),
        idleTimeoutMs: z.number().optional().describe('Idle timeout in ms. Default: 5 minutes.'),
      }),
      handler: async (params) => {
        state.browser = new BrowserSessionManager({
          maxSessions: params.maxSessions as number | undefined,
          idleTimeoutMs: params.idleTimeoutMs as number | undefined,
        });
        return { initialized: true, maxSessions: params.maxSessions ?? 3 };
      },
    },

    {
      name: 'chat_browser_acquire',
      description: 'Get or create a browser session for a chat. Spawns Playwright if needed.',
      auth: 'write',
      schema: z.object({
        chatId: z.string().describe('Chat ID for isolation.'),
      }),
      handler: async (params) => {
        if (!state.browser) {
          state.browser = new BrowserSessionManager();
        }
        const session = state.browser.acquire(params.chatId as string);
        return {
          chatId: params.chatId,
          pid: session.process.pid ?? null,
          activeSessions: state.browser.size,
        };
      },
    },

    {
      name: 'chat_browser_release',
      description: 'Release a browser session for a chat.',
      auth: 'write',
      schema: z.object({
        chatId: z.string().describe('Chat ID to release.'),
      }),
      handler: async (params) => {
        if (!state.browser) return { released: false, reason: 'No browser manager.' };
        const released = state.browser.release(params.chatId as string);
        return { released, activeSessions: state.browser.size };
      },
    },

    {
      name: 'chat_browser_status',
      description: 'Get browser session status — active sessions, per-chat info.',
      auth: 'read',
      handler: async () => {
        if (!state.browser) return { initialized: false, activeSessions: 0, sessions: [] };
        const sessions = state.browser.listSessions().map((id) => (Object.assign({chatId:id}, state.browser! .getInfo(id))));
        return { initialized: true, activeSessions: state.browser.size, sessions };
      },
    },
  ];
}
