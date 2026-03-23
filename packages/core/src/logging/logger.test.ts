import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Logger, createLogger } from './logger.js';

describe('Logger', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SOLERI_LOG_LEVEL;
  });

  it('defaults to info level (debug suppressed, info visible)', () => {
    const logger = createLogger();
    logger.debug('hidden');
    logger.info('visible');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[Soleri][INFO] visible');
  });

  it('suppresses below configured level', () => {
    const logger = createLogger({ level: 'error' });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('shows everything at debug level', () => {
    const logger = createLogger({ level: 'debug' });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(errorSpy).toHaveBeenCalledTimes(3); // debug, info, error
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('never uses console.log (stdout reserved for MCP)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger({ level: 'debug' });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('uses custom prefix', () => {
    const logger = createLogger({ prefix: '[MyAgent]' });
    logger.info('hi');
    expect(errorSpy).toHaveBeenCalledWith('[MyAgent][INFO] hi');
  });

  it('passes context object alongside message', () => {
    const logger = createLogger();
    logger.info('event', { key: 'val' });
    expect(errorSpy).toHaveBeenCalledWith('[Soleri][INFO] event', { key: 'val' });
  });

  it('respects SOLERI_LOG_LEVEL env var', () => {
    process.env.SOLERI_LOG_LEVEL = 'warn';
    const logger = createLogger();
    logger.info('hidden');
    logger.warn('visible');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('prefers explicit level over env var', () => {
    process.env.SOLERI_LOG_LEVEL = 'error';
    const logger = createLogger({ level: 'debug' });
    logger.debug('visible');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to info for invalid SOLERI_LOG_LEVEL', () => {
    process.env.SOLERI_LOG_LEVEL = 'banana';
    const logger = createLogger();
    logger.debug('hidden');
    logger.info('visible');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('createLogger returns Logger instance', () => {
    expect(createLogger()).toBeInstanceOf(Logger);
  });
});

describe('Logger file logging', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    tempDir = join(
      tmpdir(),
      `logger-colocated-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates log directory and writes daily log file', () => {
    const logDir = join(tempDir, 'logs');
    const logger = createLogger({ fileLogDir: logDir });
    logger.info('test message');

    const logFiles = readdirSync(logDir).filter((f) => f.endsWith('.log'));
    expect(logFiles.length).toBe(1);
    expect(logFiles[0]).toMatch(/^agent-\d{4}-\d{2}-\d{2}\.log$/);

    const content = readFileSync(join(logDir, logFiles[0]), 'utf-8');
    expect(content).toContain('[INFO] test message');
  });

  it('includes JSON-serialized context in file output', () => {
    const logDir = join(tempDir, 'logs');
    const logger = createLogger({ fileLogDir: logDir });
    logger.info('action', { id: 42 });

    const logFile = readdirSync(logDir).find((f) => f.endsWith('.log'))!;
    const content = readFileSync(join(logDir, logFile), 'utf-8');
    expect(content).toContain('"id":42');
  });

  it('enableFileLog accepts custom prefix for filename', () => {
    const logDir = join(tempDir, 'logs');
    const logger = createLogger();
    logger.enableFileLog(logDir, 'custom');
    logger.info('test');

    const logFile = readdirSync(logDir).find((f) => f.endsWith('.log'))!;
    expect(logFile).toMatch(/^custom-/);
  });

  it('prunes log files older than 7 days', () => {
    const logDir = join(tempDir, 'logs');
    mkdirSync(logDir, { recursive: true });

    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeFileSync(join(logDir, `agent-${oldDate}.log`), 'old\n');

    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeFileSync(join(logDir, `agent-${recentDate}.log`), 'recent\n');

    const logger = createLogger();
    logger.enableFileLog(logDir);

    const files = readdirSync(logDir).filter((f) => f.endsWith('.log'));
    expect(files).not.toContain(`agent-${oldDate}.log`);
    expect(files).toContain(`agent-${recentDate}.log`);
  });

  it('does not prune files with different prefix', () => {
    const logDir = join(tempDir, 'logs');
    mkdirSync(logDir, { recursive: true });

    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeFileSync(join(logDir, `other-${oldDate}.log`), 'keep\n');

    const logger = createLogger();
    logger.enableFileLog(logDir);

    const files = readdirSync(logDir);
    expect(files).toContain(`other-${oldDate}.log`);
  });
});
