import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Logger, createLogger } from '../logging/logger.js';

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

  it('should default to info level', () => {
    const logger = createLogger();
    logger.debug('hidden');
    logger.info('visible');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[Soleri][INFO] visible');
  });

  it('should suppress messages below configured level', () => {
    const logger = createLogger({ level: 'warn' });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(errorSpy).toHaveBeenCalledTimes(1); // error
    expect(warnSpy).toHaveBeenCalledTimes(1); // warn
    expect(warnSpy).toHaveBeenCalledWith('[Soleri][WARN] w');
    expect(errorSpy).toHaveBeenCalledWith('[Soleri][ERROR] e');
  });

  it('should output everything at debug level', () => {
    const logger = createLogger({ level: 'debug' });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    // debug, info, error go through console.error; warn goes through console.warn
    expect(errorSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('should route all output to stderr (not stdout)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger({ level: 'debug' });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('should use custom prefix', () => {
    const logger = createLogger({ prefix: '[my-agent]' });
    logger.info('hello');

    expect(errorSpy).toHaveBeenCalledWith('[my-agent][INFO] hello');
  });

  it('should include context in log output', () => {
    const logger = createLogger();
    logger.info('msg', { key: 'value' });

    expect(errorSpy).toHaveBeenCalledWith('[Soleri][INFO] msg', { key: 'value' });
  });

  it('should respect SOLERI_LOG_LEVEL env var', () => {
    process.env.SOLERI_LOG_LEVEL = 'error';
    const logger = createLogger();
    logger.info('hidden');
    logger.error('visible');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[Soleri][ERROR] visible');
  });

  it('should prefer explicit level over env var', () => {
    process.env.SOLERI_LOG_LEVEL = 'error';
    const logger = createLogger({ level: 'debug' });
    logger.debug('visible');

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('should fall back to info level for invalid SOLERI_LOG_LEVEL', () => {
    process.env.SOLERI_LOG_LEVEL = 'verbose'; // invalid
    const logger = createLogger();
    logger.debug('hidden');
    logger.info('visible');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[Soleri][INFO] visible');
  });

  it('createLogger with no args returns a Logger instance', () => {
    const logger = createLogger();
    expect(logger).toBeInstanceOf(Logger);
  });
});

describe('Logger file logging', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    tempDir = join(tmpdir(), `logger-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create log directory and write log files', () => {
    const logDir = join(tempDir, 'logs');
    const logger = createLogger({ fileLogDir: logDir });
    logger.info('test message');

    const logFiles = readdirSync(logDir).filter((f) => f.endsWith('.log'));
    expect(logFiles.length).toBe(1);
    expect(logFiles[0]).toMatch(/^agent-\d{4}-\d{2}-\d{2}\.log$/);

    const content = readFileSync(join(logDir, logFiles[0]), 'utf-8');
    expect(content).toContain('[INFO] test message');
  });

  it('should include context in file output', () => {
    const logDir = join(tempDir, 'logs');
    const logger = createLogger({ fileLogDir: logDir });
    logger.info('event', { action: 'test' });

    const logFile = readdirSync(logDir).find((f) => f.endsWith('.log'));
    expect(logFile).toBeDefined();
    const content = readFileSync(join(logDir, logFile!), 'utf-8');
    expect(content).toContain('"action":"test"');
  });

  it('enableFileLog with custom prefix uses that prefix', () => {
    const logDir = join(tempDir, 'logs');
    const logger = createLogger();
    logger.enableFileLog(logDir, 'custom');
    logger.info('test');

    const logFile = readdirSync(logDir).find((f) => f.endsWith('.log'));
    expect(logFile).toBeDefined();
    expect(logFile).toMatch(/^custom-/);
  });

  it('should prune log files older than 7 days', () => {
    const logDir = join(tempDir, 'logs');
    mkdirSync(logDir, { recursive: true });

    // Create an "old" log file (10 days ago)
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeFileSync(join(logDir, `agent-${oldDate}.log`), 'old log\n');

    // Create a "recent" log file (2 days ago)
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeFileSync(join(logDir, `agent-${recentDate}.log`), 'recent log\n');

    // enableFileLog triggers pruning
    const logger = createLogger();
    logger.enableFileLog(logDir);

    const files = readdirSync(logDir).filter((f) => f.endsWith('.log'));

    // Old file should be pruned, recent + today should remain
    expect(files).not.toContain(`agent-${oldDate}.log`);
    expect(files).toContain(`agent-${recentDate}.log`);
  });

  it('should not prune files from different prefix', () => {
    const logDir = join(tempDir, 'logs');
    mkdirSync(logDir, { recursive: true });

    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeFileSync(join(logDir, `other-${oldDate}.log`), 'other log\n');

    const logger = createLogger();
    logger.enableFileLog(logDir);

    const files = readdirSync(logDir).filter((f) => f.endsWith('.log'));
    expect(files).toContain(`other-${oldDate}.log`);
  });
});
