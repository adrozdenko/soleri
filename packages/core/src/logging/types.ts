export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  timestamp: string;
}

export interface LoggerConfig {
  /** Minimum log level. Default: 'info' (or SOLERI_LOG_LEVEL env var) */
  level?: LogLevel;
  /** Prefix for log messages. Default: '[Soleri]' */
  prefix?: string;
  /** Directory for file logging. If set, enables file output on construction. */
  fileLogDir?: string;
}
