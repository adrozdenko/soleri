/**
 * Chat facade — session management, response chunking, auth for chat transports.
 *
 * Delegates to:
 *   - chat-session-ops.ts — session lifecycle (init, get, append, clear, delete, list)
 *   - chat-transport-ops.ts — chunking, auth, bridge, compression
 *   - chat-service-ops.ts — cancellation, self-update, files, notifications,
 *     voice, queue, browser
 *   - chat-state.ts — shared state and lazy initializers
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createChatState } from './chat-state.js';
import { createChatSessionOps } from './chat-session-ops.js';
import { createChatTransportOps } from './chat-transport-ops.js';
import { createChatServiceOps } from './chat-service-ops.js';

export function createChatFacadeOps(_runtime: AgentRuntime): OpDefinition[] {
  const state = createChatState();

  return [
    ...createChatSessionOps(state),
    ...createChatTransportOps(state),
    ...createChatServiceOps(state),
  ];
}
