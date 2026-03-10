/**
 * LSP Transport Tests — lsp-server.ts
 *
 * Tests the LSP JSON-RPC server using in-memory PassThrough streams.
 */

import { describe, test, expect, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { LspServer } from '../transport/index.js';
import type {
  LspServerCallbacks,
  LspCompletionItem,
  LspDiagnostic,
  LspHover,
  LspCodeAction,
} from '../transport/index.js';

// =============================================================================
// HELPERS
// =============================================================================

/** Encode a message in LSP wire format */
function encodeLsp(obj: unknown): string {
  const json = JSON.stringify(obj);
  const len = Buffer.byteLength(json, 'utf-8');
  return `Content-Length: ${len}\r\n\r\n${json}`;
}

/** Parse one LSP response from a buffer string. Returns parsed JSON and remaining buffer. */
function parseLspResponse(buffer: string): { message: any; remaining: string } | null {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd < 0) return null;

  const headers = buffer.substring(0, headerEnd);
  const match = headers.match(/Content-Length:\s*(\d+)/i);
  if (!match) return null;

  const contentLength = parseInt(match[1], 10);
  const bodyStart = headerEnd + 4;
  const bodyBytes = Buffer.from(buffer.substring(bodyStart), 'utf-8');
  if (bodyBytes.length < contentLength) return null;

  const body = bodyBytes.subarray(0, contentLength).toString('utf-8');
  const remaining = bodyBytes.subarray(contentLength).toString('utf-8');

  return { message: JSON.parse(body), remaining };
}

/** Collect all LSP messages from output stream until timeout */
function collectMessages(output: PassThrough, count = 1, timeoutMs = 3000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const messages: any[] = [];
    let buffer = '';
    const timer = setTimeout(() => {
      if (messages.length > 0) resolve(messages);
      else reject(new Error(`Timeout waiting for ${count} messages, got ${messages.length}`));
    }, timeoutMs);

    output.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let parsed = parseLspResponse(buffer);
      while (parsed) {
        messages.push(parsed.message);
        buffer = parsed.remaining;
        if (messages.length >= count) {
          clearTimeout(timer);
          resolve(messages);
          return;
        }
        parsed = parseLspResponse(buffer);
      }
    });
  });
}

/** Send a request and get the response */
async function sendRequest(
  input: PassThrough,
  output: PassThrough,
  method: string,
  id: number,
  params?: unknown,
): Promise<any> {
  const promise = collectMessages(output, 1);
  input.write(encodeLsp({ jsonrpc: '2.0', id, method, params }));
  const [response] = await promise;
  return response;
}

/** Send a notification (no response expected) */
function sendNotification(input: PassThrough, method: string, params?: unknown): void {
  input.write(encodeLsp({ jsonrpc: '2.0', method, params }));
}

// =============================================================================
// TESTS
// =============================================================================

describe('LspServer', () => {
  let server: LspServer | undefined;
  let input: PassThrough;
  let output: PassThrough;

  function createTestServer(
    overrides: Partial<LspServerCallbacks> = {},
    capabilities?: import('../transport/types.js').LspCapabilities,
  ): LspServer {
    input = new PassThrough();
    output = new PassThrough();
    const callbacks: LspServerCallbacks = {
      onCompletion: overrides.onCompletion,
      onHover: overrides.onHover,
      onDiagnostics: overrides.onDiagnostics,
      onCodeAction: overrides.onCodeAction,
      onInitialize: overrides.onInitialize,
      onDocumentChange: overrides.onDocumentChange,
      onShutdown: overrides.onShutdown,
    };
    server = new LspServer({ capabilities }, callbacks, input, output);
    return server;
  }

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = undefined;
    }
    input?.destroy();
    output?.destroy();
  });

  test('constructs without error', () => {
    const s = createTestServer();
    expect(s).toBeDefined();
    expect(s.isRunning).toBe(false);
  });

  test('start and stop', async () => {
    const s = createTestServer();
    s.start();
    expect(s.isRunning).toBe(true);
    await s.stop();
    expect(s.isRunning).toBe(false);
  });

  test('initialize returns server capabilities', async () => {
    const s = createTestServer({
      onInitialize: async () => ({ name: 'test-agent', version: '1.0.0' }),
    });
    s.start();

    const response = await sendRequest(input, output, 'initialize', 1, {
      capabilities: {},
    });

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result.serverInfo.name).toBe('test-agent');
    expect(response.result.serverInfo.version).toBe('1.0.0');
    expect(response.result.capabilities.textDocumentSync).toBeDefined();
    expect(response.result.capabilities.completionProvider).toBeDefined();
    expect(response.result.capabilities.hoverProvider).toBe(true);
  });

  test('initialize with default server info', async () => {
    const s = createTestServer();
    s.start();

    const response = await sendRequest(input, output, 'initialize', 1, {
      capabilities: {},
    });

    expect(response.result.serverInfo.name).toBe('soleri-lsp');
    expect(response.result.serverInfo.version).toBe('0.1.0');
  });

  test('initialize respects disabled capabilities', async () => {
    const s = createTestServer({}, { completions: false, hover: false, codeActions: false });
    s.start();

    const response = await sendRequest(input, output, 'initialize', 1, {
      capabilities: {},
    });

    expect(response.result.capabilities.completionProvider).toBeUndefined();
    expect(response.result.capabilities.hoverProvider).toBeUndefined();
    expect(response.result.capabilities.codeActionProvider).toBeUndefined();
    // textDocumentSync always present
    expect(response.result.capabilities.textDocumentSync).toBeDefined();
  });

  test('completion returns items', async () => {
    const items: LspCompletionItem[] = [
      { label: '@pattern', kind: 15, detail: 'Design pattern', insertText: '@pattern' },
      { label: '@antipattern', kind: 15, detail: 'Anti-pattern' },
    ];
    const s = createTestServer({
      onCompletion: async () => items,
    });
    s.start();

    // Must initialize first
    await sendRequest(input, output, 'initialize', 1, { capabilities: {} });

    const response = await sendRequest(input, output, 'textDocument/completion', 2, {
      textDocument: { uri: 'file:///test.ts' },
      position: { line: 0, character: 1 },
    });

    expect(response.id).toBe(2);
    expect(response.result).toHaveLength(2);
    expect(response.result[0].label).toBe('@pattern');
    expect(response.result[1].label).toBe('@antipattern');
  });

  test('completion returns empty when disabled', async () => {
    const s = createTestServer(
      { onCompletion: async () => [{ label: 'should-not-appear' }] },
      { completions: false },
    );
    s.start();

    const response = await sendRequest(input, output, 'textDocument/completion', 1, {
      textDocument: { uri: 'file:///test.ts' },
      position: { line: 0, character: 0 },
    });

    expect(response.result).toEqual([]);
  });

  test('hover returns documentation', async () => {
    const hover: LspHover = {
      contents: { kind: 'markdown', value: '# Pattern\nUse semantic tokens.' },
    };
    const s = createTestServer({
      onHover: async () => hover,
    });
    s.start();

    const response = await sendRequest(input, output, 'textDocument/hover', 1, {
      textDocument: { uri: 'file:///test.ts' },
      position: { line: 5, character: 10 },
    });

    expect(response.result.contents.kind).toBe('markdown');
    expect(response.result.contents.value).toContain('semantic tokens');
  });

  test('hover returns null when no info', async () => {
    const s = createTestServer({
      onHover: async () => null,
    });
    s.start();

    const response = await sendRequest(input, output, 'textDocument/hover', 1, {
      textDocument: { uri: 'file:///test.ts' },
      position: { line: 0, character: 0 },
    });

    expect(response.result).toBeNull();
  });

  test('diagnostics published on document open', async () => {
    const diagnostics: LspDiagnostic[] = [
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        severity: 2,
        source: 'soleri',
        message: 'Hardcoded color detected',
        code: 'no-raw-color',
      },
    ];
    const s = createTestServer({
      onDiagnostics: async () => diagnostics,
    });
    s.start();

    // Send didOpen notification — this triggers diagnostics push
    const promise = collectMessages(output, 1);
    sendNotification(input, 'textDocument/didOpen', {
      textDocument: { uri: 'file:///test.ts', text: 'color: #ff0000;' },
    });

    const [notification] = await promise;
    expect(notification.method).toBe('textDocument/publishDiagnostics');
    expect(notification.params.uri).toBe('file:///test.ts');
    expect(notification.params.diagnostics).toHaveLength(1);
    expect(notification.params.diagnostics[0].message).toBe('Hardcoded color detected');
  });

  test('diagnostics published on document change', async () => {
    const s = createTestServer({
      onDiagnostics: async (_uri, content) => {
        if (content.includes('#')) {
          return [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
              severity: 2,
              message: 'Raw color',
              source: 'soleri',
            },
          ];
        }
        return [];
      },
    });
    s.start();

    const promise = collectMessages(output, 1);
    sendNotification(input, 'textDocument/didChange', {
      textDocument: { uri: 'file:///test.css' },
      contentChanges: [{ text: 'background: #000;' }],
    });

    const [notification] = await promise;
    expect(notification.params.diagnostics).toHaveLength(1);
    expect(notification.params.diagnostics[0].message).toBe('Raw color');
  });

  test('code actions returned when enabled', async () => {
    const actions: LspCodeAction[] = [
      {
        title: 'Replace with semantic token',
        kind: 'quickfix',
        command: { title: 'Fix', command: 'soleri.replaceToken', arguments: ['bg-surface'] },
      },
    ];
    const s = createTestServer({ onCodeAction: async () => actions }, { codeActions: true });
    s.start();

    const response = await sendRequest(input, output, 'textDocument/codeAction', 1, {
      textDocument: { uri: 'file:///test.ts' },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      context: { diagnostics: [] },
    });

    expect(response.result).toHaveLength(1);
    expect(response.result[0].title).toBe('Replace with semantic token');
    expect(response.result[0].command.command).toBe('soleri.replaceToken');
  });

  test('unknown method returns MethodNotFound', async () => {
    const s = createTestServer();
    s.start();

    const response = await sendRequest(input, output, 'custom/unknownMethod', 99);

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32601);
    expect(response.error.message).toContain('Method not found');
  });

  test('shutdown calls callback', async () => {
    const onShutdown = vi.fn(async () => {});
    const s = createTestServer({ onShutdown });
    s.start();

    const response = await sendRequest(input, output, 'shutdown', 1);

    expect(response.result).toBeNull();
    expect(onShutdown).toHaveBeenCalledTimes(1);
  });

  test('exit stops the server', async () => {
    const s = createTestServer();
    s.start();
    expect(s.isRunning).toBe(true);

    sendNotification(input, 'exit');

    // Wait a tick for the notification to be processed
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(s.isRunning).toBe(false);
  });

  test('notify sends notification to client', async () => {
    const s = createTestServer();
    s.start();

    const promise = collectMessages(output, 1);
    s.notify('custom/event', { data: 'test' });

    const [notification] = await promise;
    expect(notification.method).toBe('custom/event');
    expect(notification.params.data).toBe('test');
  });

  test('publishDiagnostics sends proper notification', async () => {
    const s = createTestServer();
    s.start();

    const promise = collectMessages(output, 1);
    s.publishDiagnostics('file:///test.ts', [
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
        severity: 1,
        message: 'Error found',
      },
    ]);

    const [notification] = await promise;
    expect(notification.method).toBe('textDocument/publishDiagnostics');
    expect(notification.params.uri).toBe('file:///test.ts');
    expect(notification.params.diagnostics[0].severity).toBe(1);
  });

  test('handles multiple sequential messages', async () => {
    let callCount = 0;
    const s = createTestServer({
      onCompletion: async () => {
        callCount++;
        return [{ label: `item-${callCount}` }];
      },
    });
    s.start();

    const r1 = await sendRequest(input, output, 'textDocument/completion', 1, {
      textDocument: { uri: 'file:///a.ts' },
      position: { line: 0, character: 0 },
    });
    expect(r1.result[0].label).toBe('item-1');

    const r2 = await sendRequest(input, output, 'textDocument/completion', 2, {
      textDocument: { uri: 'file:///b.ts' },
      position: { line: 0, character: 0 },
    });
    expect(r2.result[0].label).toBe('item-2');
  });

  test('onDocumentChange called on didOpen', async () => {
    const onDocumentChange = vi.fn(async () => {});
    const s = createTestServer({ onDocumentChange }, { diagnostics: false });
    s.start();

    sendNotification(input, 'textDocument/didOpen', {
      textDocument: { uri: 'file:///test.ts', text: 'const x = 1;' },
    });

    await vi.waitFor(() => expect(onDocumentChange).toHaveBeenCalledTimes(1));
    expect(onDocumentChange).toHaveBeenCalledWith('file:///test.ts', expect.any(String));
  });
});
