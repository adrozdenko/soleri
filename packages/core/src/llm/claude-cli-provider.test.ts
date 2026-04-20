import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { LLMError } from './types.js';

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args) as unknown,
}));

import { callClaudeCLI } from './claude-cli-provider.js';

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.kill = vi.fn();
  return child;
}

function emitClose(child: FakeChild, stdout: string, stderr: string, code: number | null) {
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', code);
  });
}

const baseOptions = {
  binary: '/usr/local/bin/claude',
  model: 'claude-sonnet-4-6',
  systemPrompt: 'be helpful',
  userPrompt: 'hello',
};

beforeEach(() => spawnMock.mockReset());
afterEach(() => vi.useRealTimers());

describe('callClaudeCLI', () => {
  it('returns parsed text + tokens when claude exits 0 with valid JSON', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const payload = JSON.stringify({
      result: 'hi there',
      usage: { input_tokens: 12, output_tokens: 4 },
    });
    emitClose(child, payload, '', 0);

    const result = await callClaudeCLI(baseOptions);

    expect(result.text).toBe('hi there');
    expect(result.provider).toBe('claude-cli');
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(4);
    expect(typeof result.durationMs).toBe('number');
  });

  it('passes -p, --output-format json, --model in argv', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    emitClose(child, JSON.stringify({ result: 'x' }), '', 0);

    await callClaudeCLI(baseOptions);

    const call = spawnMock.mock.calls[0];
    expect(call[0]).toBe('/usr/local/bin/claude');
    expect(call[1]).toEqual(['-p', '--output-format', 'json', '--model', 'claude-sonnet-4-6']);
  });

  it('writes combined system + user prompt to stdin and ends it', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    emitClose(child, JSON.stringify({ result: 'x' }), '', 0);

    await callClaudeCLI(baseOptions);

    expect(child.stdin.write).toHaveBeenCalledTimes(1);
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    const written = child.stdin.write.mock.calls[0][0] as string;
    expect(written).toContain('be helpful');
    expect(written).toContain('hello');
    expect(written.indexOf('be helpful')).toBeLessThan(written.indexOf('hello'));
  });

  it('falls back to text field when result field is absent', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    emitClose(child, JSON.stringify({ text: 'alt shape' }), '', 0);

    const result = await callClaudeCLI(baseOptions);

    expect(result.text).toBe('alt shape');
  });

  it('throws LLMError with stderr content when claude exits non-zero', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    emitClose(child, '', 'rate limited', 1);

    await expect(callClaudeCLI(baseOptions)).rejects.toThrow(/exited 1.*rate limited/);
  });

  it('throws LLMError when stdout is empty', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    emitClose(child, '', '', 0);

    await expect(callClaudeCLI(baseOptions)).rejects.toThrow(/empty stdout/);
  });

  it('throws LLMError when stdout is not valid JSON', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    emitClose(child, 'this is not json', '', 0);

    await expect(callClaudeCLI(baseOptions)).rejects.toThrow(/malformed JSON/);
  });

  it('throws LLMError when JSON has is_error: true', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    emitClose(child, JSON.stringify({ is_error: true, error: 'context too long' }), '', 0);

    await expect(callClaudeCLI(baseOptions)).rejects.toThrow(/context too long/);
  });

  it('throws LLMError when JSON parses but text fields are all empty', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    emitClose(child, JSON.stringify({ usage: { input_tokens: 1 } }), '', 0);

    await expect(callClaudeCLI(baseOptions)).rejects.toThrow(/missing text field/);
  });

  it('rejects with timeout error and kills child when timeout exceeded', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    // never emit close — let the timer fire
    const promise = callClaudeCLI({ ...baseOptions, timeoutMs: 50 });

    await expect(promise).rejects.toThrow(/timed out after 50ms/);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('throws LLMError on spawn error event', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    setImmediate(() => child.emit('error', new Error('ENOENT')));

    await expect(callClaudeCLI(baseOptions)).rejects.toThrow(LLMError);
  });
});
