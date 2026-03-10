/**
 * Transport Types — configuration for HTTP/SSE transport layer.
 */

/** Supported transport modes */
export type TransportMode = 'stdio' | 'http';

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

/** Combined transport configuration */
export interface TransportConfig {
  mode: TransportMode;
  http?: HttpTransportConfig;
}
