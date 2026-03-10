export { ChatSessionManager } from './chat-session.js';
export { FragmentBuffer } from './fragment-buffer.js';
export { ChatAuthManager } from './auth-manager.js';
export { chunkResponse, convertMarkup, markdownToHtml } from './response-chunker.js';
export { runAgentLoop } from './agent-loop.js';
export { McpToolBridge } from './mcp-bridge.js';
export {
  createOutputCompressor,
  registerCompressor,
  clearCompressors,
} from './output-compressor.js';

export type {
  ChatRole,
  ChatMessage,
  ChatSession,
  ChatSessionConfig,
  Fragment,
  FragmentBufferConfig,
  MarkupFormat,
  ChunkConfig,
  ChatAuthConfig,
  AuthRecord,
  AuthState,
  ChatManagerConfig,
  ChatManagerStatus,
} from './types.js';

export type {
  AgentTool,
  ToolResult,
  ToolExecutor,
  AgentLoopConfig,
  AgentCallbacks,
  AgentLoopResult,
  McpToolRegistration,
  OutputCompressor,
} from './agent-loop-types.js';
