/**
 * LSP Server Tests — message parsing, initialization, request handling, notifications.
 *
 * Uses PassThrough streams for stdio — no real process I/O.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { LspServer, type LspServerCallbacks } from './lsp-server.js';

// =============================================================================
// HELPERS
// =============================================================================

function encodeLsp(obj: unknown): string {
  const json = JSON.stringify(obj);
  const len = Buffer.byteLength(json, 'utf-8');
  return `Content-Length: ${len}\r\n\r\n${json}`;
}

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
      while (true) {
        const parsed = parseLspResponse(buffer);
        if (!parsed) break;
        messages.push(parsed.message);
        buffer = parsed.remaining;
        if (messages.length >= count) {
          clearTimeout(timer);
          resolve(messages);
          return;
        }
      }
    });
  });
}

function makeServer(
  callbacks: Partial<LspServerCallbacks> = {},
  capabilities?: import('./types.js').LspTransportConfig['capabilities'],
): { server: LspServer; input: PassThrough; output: PassThrough } {
  const input = new PassThrough();
  const output = new PassThrough();
  const server = new LspServer({ capabilities }, callbacks, input, output);
  return { server, input, output };
}

// =============================================================================
// TESTS
// =============================================================================

describe('LspServer', () => {
  let server: LspServer;
  let input: PassThrough;
  let output: PassThrough;

  afterEach(async () => {
    await server?.stop();
    input?.destroy();
    output?.destroy();
  });

  describe('lifecycle', () => {
    it('starts and stops', () => {
      ({ server, input, output } = makeServer());
      expect(server.isRunning).toBe(false);
      server.start();
      expect(server.isRunning).toBe(true);
      server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('start is idempotent', () => {
      ({ server, input, output } = makeServer());
      server.start();
      server.start();
      expect(server.isRunning).toBe(true);
    });

    it('stops when input ends', () => {
      ({ server, input, output } = makeServer());
      server.start();
      input.end();
      // The 'end' listener sets running = false
    });
  });

  describe('initialize', () => {
    it('responds with server capabilities', async () => {
      ({ server, input, output } = makeServer());
      server.start();

      const promise = collectMessages(output, 1);
      input.write(encodeLsp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
      const [msg] = await promise;

      expect(msg.jsonrpc).toBe('2.0');
      expect(msg.id).toBe(1);
      expect(msg.result.capabilities).toBeDefined();
      expect(msg.result.capabilities.textDocumentSync).toBeDefined();
      expect(msg.result.serverInfo.name).toBe('soleri-lsp');
    });

    it('includes completionProvider when enabled', async () => {
      ({ server, input, output } = makeServer({}, { completions: true }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(encodeLsp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
      const [msg] = await promise;

      expect(msg.result.capabilities.completionProvider).toBeDefined();
      expect(msg.result.capabilities.completionProvider.triggerCharacters).toContain('@');
    });

    it('excludes completionProvider when disabled', async () => {
      ({ server, input, output } = makeServer({}, { completions: false }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(encodeLsp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
      const [msg] = await promise;

      expect(msg.result.capabilities.completionProvider).toBeUndefined();
    });

    it('includes hoverProvider when enabled', async () => {
      ({ server, input, output } = makeServer({}, { hover: true }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(encodeLsp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
      const [msg] = await promise;

      expect(msg.result.capabilities.hoverProvider).toBe(true);
    });

    it('includes codeActionProvider when enabled', async () => {
      ({ server, input, output } = makeServer({}, { codeActions: true }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(encodeLsp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
      const [msg] = await promise;

      expect(msg.result.capabilities.codeActionProvider).toBe(true);
    });

    it('calls onInitialize callback', async () => {
      const onInitialize = vi.fn(async () => ({ name: 'test-agent', version: '1.0.0' }));
      ({ server, input, output } = makeServer({ onInitialize }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(encodeLsp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
      const [msg] = await promise;

      expect(onInitialize).toHaveBeenCalled();
      expect(msg.result.serverInfo.name).toBe('test-agent');
      expect(msg.result.serverInfo.version).toBe('1.0.0');
    });
  });

  describe('completion', () => {
    it('returns completion items from callback', async () => {
      const items = [{ label: 'pattern-1', kind: 6 }];
      const onCompletion = vi.fn(async () => items);
      ({ server, input, output } = makeServer({ onCompletion }, { completions: true }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(
        encodeLsp({
          jsonrpc: '2.0',
          id: 2,
          method: 'textDocument/completion',
          params: {
            textDocument: { uri: 'file:///test.ts' },
            position: { line: 0, character: 0 },
          },
        }),
      );
      const [msg] = await promise;

      expect(msg.id).toBe(2);
      expect(msg.result).toEqual(items);
    });

    it('returns empty array when completions disabled', async () => {
      ({ server, input, output } = makeServer({}, { completions: false }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(
        encodeLsp({
          jsonrpc: '2.0',
          id: 2,
          method: 'textDocument/completion',
          params: {
            textDocument: { uri: 'file:///test.ts' },
            position: { line: 0, character: 0 },
          },
        }),
      );
      const [msg] = await promise;

      expect(msg.result).toEqual([]);
    });
  });

  describe('hover', () => {
    it('returns hover info from callback', async () => {
      const hover = { contents: { kind: 'markdown' as const, value: '**pattern**' } };
      const onHover = vi.fn(async () => hover);
      ({ server, input, output } = makeServer({ onHover }, { hover: true }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(
        encodeLsp({
          jsonrpc: '2.0',
          id: 3,
          method: 'textDocument/hover',
          params: {
            textDocument: { uri: 'file:///test.ts' },
            position: { line: 0, character: 5 },
          },
        }),
      );
      const [msg] = await promise;

      expect(msg.id).toBe(3);
      expect(msg.result).toEqual(hover);
    });

    it('returns null when hover disabled', async () => {
      ({ server, input, output } = makeServer({}, { hover: false }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(
        encodeLsp({
          jsonrpc: '2.0',
          id: 3,
          method: 'textDocument/hover',
          params: {
            textDocument: { uri: 'file:///test.ts' },
            position: { line: 0, character: 0 },
          },
        }),
      );
      const [msg] = await promise;

      expect(msg.result).toBeNull();
    });
  });

  describe('code actions', () => {
    it('returns code actions from callback', async () => {
      const actions = [{ title: 'Fix token', kind: 'quickfix' }];
      const onCodeAction = vi.fn(async () => actions);
      ({ server, input, output } = makeServer({ onCodeAction }, { codeActions: true }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(
        encodeLsp({
          jsonrpc: '2.0',
          id: 4,
          method: 'textDocument/codeAction',
          params: {
            textDocument: { uri: 'file:///test.ts' },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            context: { diagnostics: [] },
          },
        }),
      );
      const [msg] = await promise;

      expect(msg.result).toEqual(actions);
    });
  });

  describe('document changes', () => {
    it('calls onDocumentChange for didOpen', async () => {
      const onDocumentChange = vi.fn(async () => {});
      ({ server, input, output } = makeServer({ onDocumentChange }, { diagnostics: false }));
      server.start();

      input.write(
        encodeLsp({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: {
            textDocument: { uri: 'file:///test.ts', text: 'const x = 1;' },
          },
        }),
      );

      await new Promise((r) => setTimeout(r, 100));
      expect(onDocumentChange).toHaveBeenCalledWith('file:///test.ts', 'const x = 1;');
    });

    it('publishes diagnostics on document change when enabled', async () => {
      const diagnostics = [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          severity: 2,
          message: 'Use semantic token',
          source: 'soleri',
        },
      ];
      const onDiagnostics = vi.fn(async () => diagnostics);
      const onDocumentChange = vi.fn(async () => {});
      ({ server, input, output } = makeServer(
        { onDiagnostics, onDocumentChange },
        { diagnostics: true },
      ));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(
        encodeLsp({
          jsonrpc: '2.0',
          method: 'textDocument/didChange',
          params: {
            textDocument: { uri: 'file:///test.ts' },
            contentChanges: [{ text: 'const y = 2;' }],
          },
        }),
      );
      const [msg] = await promise;

      expect(msg.method).toBe('textDocument/publishDiagnostics');
      expect(msg.params.uri).toBe('file:///test.ts');
      expect(msg.params.diagnostics).toEqual(diagnostics);
    });
  });

  describe('shutdown / exit', () => {
    it('calls onShutdown and responds', async () => {
      const onShutdown = vi.fn(async () => {});
      ({ server, input, output } = makeServer({ onShutdown }));
      server.start();

      const promise = collectMessages(output, 1);
      input.write(encodeLsp({ jsonrpc: '2.0', id: 99, method: 'shutdown' }));
      const [msg] = await promise;

      expect(onShutdown).toHaveBeenCalled();
      expect(msg.id).toBe(99);
      expect(msg.result).toBeNull();
    });

    it('stops running on exit notification', async () => {
      ({ server, input, output } = makeServer());
      server.start();
      expect(server.isRunning).toBe(true);

      input.write(encodeLsp({ jsonrpc: '2.0', method: 'exit' }));
      await new Promise((r) => setTimeout(r, 50));
      expect(server.isRunning).toBe(false);
    });
  });

  describe('unknown methods', () => {
    it('responds with MethodNotFound for requests with id', async () => {
      ({ server, input, output } = makeServer());
      server.start();

      const promise = collectMessages(output, 1);
      input.write(encodeLsp({ jsonrpc: '2.0', id: 50, method: 'custom/unknown' }));
      const [msg] = await promise;

      expect(msg.id).toBe(50);
      expect(msg.error).toBeDefined();
      expect(msg.error.code).toBe(-32601);
    });
  });

  describe('notify helper', () => {
    it('sends notification to client', async () => {
      ({ server, input, output } = makeServer());
      server.start();

      const promise = collectMessages(output, 1);
      server.notify('custom/event', { data: 'test' });
      const [msg] = await promise;

      expect(msg.method).toBe('custom/event');
      expect(msg.params).toEqual({ data: 'test' });
    });
  });

  describe('publishDiagnostics helper', () => {
    it('sends diagnostics notification', async () => {
      ({ server, input, output } = makeServer());
      server.start();

      const diags = [
        {
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
          severity: 1,
          message: 'Error',
        },
      ];
      const promise = collectMessages(output, 1);
      server.publishDiagnostics('file:///a.ts', diags);
      const [msg] = await promise;

      expect(msg.method).toBe('textDocument/publishDiagnostics');
      expect(msg.params.uri).toBe('file:///a.ts');
      expect(msg.params.diagnostics).toEqual(diags);
    });
  });

  describe('malformed input', () => {
    it('skips malformed headers gracefully', async () => {
      ({ server, input, output } = makeServer());
      server.start();

      // Write garbage followed by a valid message
      input.write('GARBAGE\r\n\r\n');
      const promise = collectMessages(output, 1);
      input.write(encodeLsp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
      const [msg] = await promise;

      expect(msg.id).toBe(1);
    });
  });
});
