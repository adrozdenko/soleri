/**
 * Structured logger for Soleri agents.
 *
 * All output routes through stderr (stdout is reserved for MCP JSON-RPC).
 * Supports optional file logging with daily rotation and 7-day retention.
 *
 * Ported from Salvador MCP's src/utils/logger.ts.
 */

import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { LogLevel, LogContext, LoggerConfig } from './types.js';

const LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error'];

// MCP stdio servers must keep stdout clean for JSON-RPC.
// Route ALL log levels through stderr (console.error/console.warn).
const LEVEL_METHODS: Record<LogLevel, 'warn' | 'error'> = {
  debug: 'error',
  info: 'error',
  warn: 'warn',
  error: 'error',
};

/** Max age for log files before auto-pruning (7 days) */
const LOG_RETENTION_DAYS = 7;

export class Logger {
  private readonly prefix: string;
  private readonly minLevel: number;
  private fileLogDir: string | null = null;
  private fileLogPrefix: string;
  private currentLogDate: string | null = null;
  private currentLogPath: string | null = null;

  constructor(config?: LoggerConfig) {
    this.prefix = config?.prefix ?? '[Soleri]';
    this.fileLogPrefix = 'agent';
    const envLevel = process.env.SOLERI_LOG_LEVEL as LogLevel | undefined;
    const level = config?.level ?? envLevel ?? 'info';
    this.minLevel = Math.max(0, LEVEL_ORDER.indexOf(level));

    if (config?.fileLogDir) {
      this.enableFileLog(config.fileLogDir);
    }
  }

  /**
   * Enable file-based logging. Output is teed to
   * {dir}/{prefix}-YYYY-MM-DD.log in addition to stderr.
   * Automatically prunes log files older than 7 days.
   */
  enableFileLog(dir: string, prefix?: string): void {
    mkdirSync(dir, { recursive: true });
    this.fileLogDir = dir;
    if (prefix) this.fileLogPrefix = prefix;
    this.rotateFileIfNeeded();
    this.pruneOldLogs();
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_ORDER.indexOf(level) < this.minLevel) return;
    const method = LEVEL_METHODS[level];
    const tag = level.toUpperCase();

    // Console output (stderr)
    if (context) {
      console[method](`${this.prefix}[${tag}] ${message}`, context);
    } else {
      console[method](`${this.prefix}[${tag}] ${message}`);
    }

    // File output (if enabled)
    if (this.fileLogDir) {
      this.writeToFile(tag, message, context);
    }
  }

  private writeToFile(tag: string, message: string, context?: LogContext): void {
    this.rotateFileIfNeeded();
    if (!this.currentLogPath) return;

    const ts = new Date().toISOString();
    let line = `${ts} [${tag}] ${message}`;
    if (context) {
      try {
        line += ' ' + JSON.stringify(context);
      } catch {
        // Skip unserializable context
      }
    }
    try {
      appendFileSync(this.currentLogPath, line + '\n');
    } catch {
      // Silently fail — file logging should never break the app
    }
  }

  /** Switch to a new log file if the date has changed */
  private rotateFileIfNeeded(): void {
    if (!this.fileLogDir) return;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (today !== this.currentLogDate) {
      this.currentLogDate = today;
      this.currentLogPath = join(this.fileLogDir, `${this.fileLogPrefix}-${today}.log`);
    }
  }

  /** Remove log files older than LOG_RETENTION_DAYS */
  private pruneOldLogs(): void {
    if (!this.fileLogDir) return;
    const prefix = this.fileLogPrefix;
    try {
      const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const files = readdirSync(this.fileLogDir);
      for (const file of files) {
        if (!file.startsWith(`${prefix}-`) || !file.endsWith('.log')) continue;
        const dateStr = file.slice(`${prefix}-`.length, -'.log'.length);
        const fileDate = new Date(dateStr).getTime();
        if (!isNaN(fileDate) && fileDate < cutoff) {
          try {
            unlinkSync(join(this.fileLogDir, file));
          } catch {
            // Ignore individual file deletion errors
          }
        }
      }
    } catch {
      // Ignore pruning errors
    }
  }
}

/** Factory function for creating a logger. */
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}
