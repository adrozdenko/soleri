export { ChatSessionManager } from './chat-session.js';
export { FragmentBuffer } from './fragment-buffer.js';
export { ChatAuthManager } from './auth-manager.js';
export { TaskCancellationManager } from './cancellation.js';
export { SelfUpdateManager, RESTART_EXIT_CODE } from './self-update.js';
export { NotificationEngine } from './notifications.js';
export {
  detectFileIntent,
  buildMultimodalContent,
  saveTempFile,
  cleanupTempFiles,
  sanitizeForPersistence,
  MAX_FILE_SIZE,
  TEXT_EXTENSIONS,
  IMAGE_MIME_TYPES,
  INTAKE_KEYWORDS,
} from './file-handler.js';
export { transcribeAudio, synthesizeSpeech } from './voice.js';
export { MessageQueue } from './queue.js';
export { BrowserSessionManager } from './browser-session.js';
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

export type { CancellationInfo } from './cancellation.js';
export type { RestartContext, RestartResult } from './self-update.js';
export type {
  NotificationCheck,
  NotificationEngineConfig,
  NotificationStats,
} from './notifications.js';
export type { FileIntent, FileInfo, MultimodalContent } from './file-handler.js';
export type { VoiceConfig, TranscriptionResult, SpeechResult } from './voice.js';
export type { QueuedMessage, QueuedResponse, QueueConfig } from './queue.js';
export type {
  BrowserSessionConfig,
  BrowserSession,
  BrowserTool,
  BrowserToolResult,
} from './browser-session.js';
