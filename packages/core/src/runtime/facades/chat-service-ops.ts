/**
 * Chat service ops — cancellation, self-update, file handling,
 * notifications, and browser sessions.
 * Split from chat-facade.ts for maintainability.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import { TaskCancellationManager } from '../../chat/cancellation.js';
import { SelfUpdateManager } from '../../chat/self-update.js';
import { NotificationEngine } from '../../chat/notifications.js';
import { BrowserSessionManager } from '../../chat/browser-session.js';
import {
  detectFileIntent,
  buildMultimodalContent,
  cleanupTempFiles,
} from '../../chat/file-handler.js';
import type { FileInfo } from '../../chat/file-handler.js';
import type { ChatState } from './chat-state.js';

export function createChatServiceOps(state: ChatState): OpDefinition[] {
  return [
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
        const sessions = state.browser
          .listSessions()
          .map((id) => Object.assign({ chatId: id }, state.browser!.getInfo(id)));
        return { initialized: true, activeSessions: state.browser.size, sessions };
      },
    },
  ];
}
