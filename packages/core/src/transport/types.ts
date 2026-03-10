/**
 * Transport Types — configuration for HTTP/SSE transport layer.
 */

/** Supported transport modes */
export type TransportMode = 'stdio' | 'http' | 'ws' | 'lsp';

/** HTTP transport configuration */
export interface HttpTransportConfig {
  /** Port to listen on (default: 3100) */
  port: number;
  /** Host to bind to (default: 127.0.0.1) */
  host: string;
  /** CORS allowed origins (empty = no CORS headers) */
  corsOrigins: string[];
  /** Bearer token for authentication */
  authToken: string;
  /** Session TTL in milliseconds (default: 3600000 = 1 hour). 0 to disable. */
  sessionTTL?: number;
  /** Session reaper interval in milliseconds (default: 60000 = 1 minute) */
  reaperInterval?: number;
  /** Rate limit: max requests per window (default: 100) */
  rateLimit?: number;
  /** Rate limit window in milliseconds (default: 60000 = 1 minute) */
  rateLimitWindow?: number;
}

/** WebSocket transport configuration */
export interface WsTransportConfig {
  /** Bearer token for authentication (validated on upgrade) */
  authToken: string;
  /** Heartbeat interval in ms (default: 30000). 0 to disable. */
  heartbeatInterval?: number;
  /** Max message size in bytes (default: 1MB) */
  maxMessageSize?: number;
  /** Session TTL in milliseconds (default: 3600000 = 1 hour). 0 to disable. */
  sessionTTL?: number;
  /** Session reaper interval in milliseconds (default: 60000 = 1 minute) */
  reaperInterval?: number;
}

/** LSP transport configuration */
export interface LspTransportConfig {
  /** Agent capabilities to expose as LSP features */
  capabilities?: LspCapabilities;
}

/** Which agent features to expose via LSP */
export interface LspCapabilities {
  /** Expose vault search as completions (default: true) */
  completions?: boolean;
  /** Expose quality gate violations as diagnostics (default: true) */
  diagnostics?: boolean;
  /** Expose pattern documentation as hover (default: true) */
  hover?: boolean;
  /** Expose agent ops as code actions (default: false) */
  codeActions?: boolean;
}

/** Combined transport configuration */
export interface TransportConfig {
  mode: TransportMode;
  http?: HttpTransportConfig;
  ws?: WsTransportConfig;
  lsp?: LspTransportConfig;
}
