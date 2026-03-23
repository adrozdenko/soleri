/**
 * Shared chat state and lazy initializers.
 * Used by chat-session-ops.ts and chat-transport-ops.ts.
 */

import { ChatSessionManager } from '../../chat/chat-session.js';
import { ChatAuthManager } from '../../chat/auth-manager.js';
import { TaskCancellationManager } from '../../chat/cancellation.js';
import { SelfUpdateManager } from '../../chat/self-update.js';
import { NotificationEngine } from '../../chat/notifications.js';
import { MessageQueue } from '../../chat/queue.js';
import { BrowserSessionManager } from '../../chat/browser-session.js';
import { McpToolBridge } from '../../chat/mcp-bridge.js';
import type { ChatSessionConfig, ChatAuthConfig } from '../../chat/types.js';

/**
 * Chat transport state — lazily initialized on first use.
 * Config comes from runtime flags or op params.
 */
export interface ChatState {
  sessions: ChatSessionManager | null;
  auth: ChatAuthManager | null;
  bridge: McpToolBridge | null;
  cancellation: TaskCancellationManager | null;
  updater: SelfUpdateManager | null;
  notifications: NotificationEngine | null;
  queue: MessageQueue | null;
  browser: BrowserSessionManager | null;
}

export function createChatState(): ChatState {
  return {
    sessions: null,
    auth: null,
    bridge: null,
    cancellation: null,
    updater: null,
    notifications: null,
    queue: null,
    browser: null,
  };
}

export function getOrCreateSessions(
  state: ChatState,
  config: ChatSessionConfig,
): ChatSessionManager {
  if (!state.sessions) {
    state.sessions = new ChatSessionManager(config);
    state.sessions.startReaper();
  }
  return state.sessions;
}

export function getOrCreateAuth(state: ChatState, config: ChatAuthConfig): ChatAuthManager {
  if (!state.auth) {
    state.auth = new ChatAuthManager(config);
  }
  return state.auth;
}
