/**
 * LSP Server — Language Server Protocol transport for editor-native agent integration.
 *
 * Speaks JSON-RPC 2.0 over stdio using the LSP wire format:
 *   Content-Length: <N>\r\n\r\n<JSON payload>
 *
 * Maps agent capabilities to LSP features:
 *   - Completions → vault search suggestions
 *   - Diagnostics → quality gate violations
 *   - Hover → pattern documentation
 *   - Code actions → agent ops
 *
 * Uses only node:readline + node:process (zero deps).
 */

import type { LspTransportConfig, LspCapabilities } from './types.js';

// =============================================================================
// LSP TYPES (subset of the spec needed for transport)
// =============================================================================

/** JSON-RPC 2.0 request */
export interface LspRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

/** JSON-RPC 2.0 notification (no id) */
export interface LspNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

/** JSON-RPC 2.0 response */
export interface LspResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** LSP Position */
export interface LspPosition {
  line: number;
  character: number;
}

/** LSP Range */
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/** LSP Diagnostic */
export interface LspDiagnostic {
  range: LspRange;
  severity?: number; // 1=Error, 2=Warning, 3=Info, 4=Hint
  source?: string;
  message: string;
  code?: string | number;
}

/** LSP Completion Item */
export interface LspCompletionItem {
  label: string;
  kind?: number; // 1=Text, 6=Variable, 15=Snippet, etc.
  detail?: string;
  documentation?: string | { kind: 'markdown' | 'plaintext'; value: string };
  insertText?: string;
}

/** LSP Hover */
export interface LspHover {
  contents: string | { kind: 'markdown' | 'plaintext'; value: string };
  range?: LspRange;
}

/** LSP Code Action */
export interface LspCodeAction {
  title: string;
  kind?: string; // e.g. 'quickfix', 'refactor', 'source'
  diagnostics?: LspDiagnostic[];
  command?: { title: string; command: string; arguments?: unknown[] };
}

// =============================================================================
// CALLBACKS
// =============================================================================

export interface LspServerCallbacks {
  /** Return completions for the given document URI and position. */
  onCompletion?: (uri: string, position: LspPosition) => Promise<LspCompletionItem[]>;
  /** Return hover info for the given document URI and position. */
  onHover?: (uri: string, position: LspPosition) => Promise<LspHover | null>;
  /** Return diagnostics for the given document URI and content. */
  onDiagnostics?: (uri: string, content: string) => Promise<LspDiagnostic[]>;
  /** Return code actions for the given document URI, range, and current diagnostics. */
  onCodeAction?: (
    uri: string,
    range: LspRange,
    diagnostics: LspDiagnostic[],
  ) => Promise<LspCodeAction[]>;
  /** Called when the server is initialized. Return additional server info if desired. */
  onInitialize?: () => Promise<{ name?: string; version?: string }>;
  /** Called when a document is opened or changed. */
  onDocumentChange?: (uri: string, content: string) => Promise<void>;
  /** Called on shutdown. */
  onShutdown?: () => Promise<void>;
}

// =============================================================================
// LSP SERVER
// =============================================================================

export class LspServer {
  private config: LspTransportConfig;
  private callbacks: LspServerCallbacks;
  private capabilities: Required<LspCapabilities>;
  private input: NodeJS.ReadableStream;
  private output: NodeJS.WritableStream;
  private running = false;
  private buffer = '';
  private contentLength = -1;
  private initialized = false;

  constructor(
    config: LspTransportConfig,
    callbacks: LspServerCallbacks,
    input?: NodeJS.ReadableStream,
    output?: NodeJS.WritableStream,
  ) {
    this.config = config;
    this.callbacks = callbacks;
    this.capabilities = {
      completions: config.capabilities?.completions ?? true,
      diagnostics: config.capabilities?.diagnostics ?? true,
      hover: config.capabilities?.hover ?? true,
      codeActions: config.capabilities?.codeActions ?? false,
    };
    this.input = input ?? process.stdin;
    this.output = output ?? process.stdout;
  }

  /** Start listening for LSP messages on stdio. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.input.setEncoding('utf-8');
    this.input.on('data', (chunk: string) => this.onData(chunk));
    this.input.on('end', () => {
      this.running = false;
    });
  }

  /** Stop the server. */
  async stop(): Promise<void> {
    this.running = false;
    this.input.removeAllListeners('data');
    this.input.removeAllListeners('end');
  }

  /** Whether the server is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Send a notification to the client (e.g., diagnostics). */
  notify(method: string, params?: unknown): void {
    this.writeMessage({ jsonrpc: '2.0', method, params });
  }

  /** Push diagnostics for a document. */
  publishDiagnostics(uri: string, diagnostics: LspDiagnostic[]): void {
    this.notify('textDocument/publishDiagnostics', { uri, diagnostics });
  }

  // ─── Message Parsing (LSP wire format) ─────────────────────────────

  private onData(chunk: string): void {
    this.buffer += chunk;
    this.processBuffer();
  }

  private processBuffer(): void {
    while (true) {
      if (this.contentLength < 0) {
        // Looking for headers
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd < 0) return; // incomplete headers

        const headers = this.buffer.substring(0, headerEnd);
        const match = headers.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          // Skip malformed header
          this.buffer = this.buffer.substring(headerEnd + 4);
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.substring(headerEnd + 4);
      }

      // Check if we have the full body
      if (Buffer.byteLength(this.buffer, 'utf-8') < this.contentLength) return;

      // Extract exactly contentLength bytes
      const bodyBytes = Buffer.from(this.buffer, 'utf-8');
      const body = bodyBytes.subarray(0, this.contentLength).toString('utf-8');
      this.buffer = bodyBytes.subarray(this.contentLength).toString('utf-8');
      this.contentLength = -1;

      try {
        const message = JSON.parse(body) as LspRequest | LspNotification;
        this.handleMessage(message).catch(() => {
          // Silently handle errors in message processing
        });
      } catch {
        // Invalid JSON — skip
      }
    }
  }

  // ─── Message Handling ──────────────────────────────────────────────

  private async handleMessage(message: LspRequest | LspNotification): Promise<void> {
    const method = message.method;
    const id = 'id' in message ? message.id : undefined;

    switch (method) {
      case 'initialize':
        await this.handleInitialize(id as number | string);
        break;
      case 'initialized':
        // Client acknowledgement — no response needed
        break;
      case 'shutdown':
        await this.callbacks.onShutdown?.();
        if (id !== undefined) {
          this.respond(id as number | string, null);
        }
        break;
      case 'exit':
        this.running = false;
        break;
      case 'textDocument/completion':
        await this.handleCompletion(id as number | string, message.params);
        break;
      case 'textDocument/hover':
        await this.handleHover(id as number | string, message.params);
        break;
      case 'textDocument/codeAction':
        await this.handleCodeAction(id as number | string, message.params);
        break;
      case 'textDocument/didOpen':
      case 'textDocument/didChange':
        await this.handleDocumentChange(message.params);
        break;
      case 'textDocument/didClose':
        // No-op
        break;
      default:
        // Unknown method — respond with MethodNotFound if it has an id
        if (id !== undefined) {
          this.respondError(id as number | string, -32601, `Method not found: ${method}`);
        }
        break;
    }
  }

  private async handleInitialize(id: number | string): Promise<void> {
    const info = await this.callbacks.onInitialize?.();

    const serverCapabilities: Record<string, unknown> = {};

    if (this.capabilities.completions) {
      serverCapabilities.completionProvider = {
        triggerCharacters: ['@', '/'],
        resolveProvider: false,
      };
    }

    if (this.capabilities.hover) {
      serverCapabilities.hoverProvider = true;
    }

    if (this.capabilities.diagnostics) {
      // Diagnostics are push-based via textDocument/publishDiagnostics
      // We signal support via textDocumentSync
    }

    if (this.capabilities.codeActions) {
      serverCapabilities.codeActionProvider = true;
    }

    // Always support text document sync (needed for diagnostics + change tracking)
    serverCapabilities.textDocumentSync = {
      openClose: true,
      change: 1, // Full content on change
    };

    this.respond(id, {
      capabilities: serverCapabilities,
      serverInfo: {
        name: info?.name ?? 'soleri-lsp',
        version: info?.version ?? '0.1.0',
      },
    });

    this.initialized = true;
  }

  private async handleCompletion(id: number | string, params: unknown): Promise<void> {
    if (!this.capabilities.completions || !this.callbacks.onCompletion) {
      this.respond(id, []);
      return;
    }

    const p = params as {
      textDocument: { uri: string };
      position: LspPosition;
    };

    const items = await this.callbacks.onCompletion(p.textDocument.uri, p.position);
    this.respond(id, items);
  }

  private async handleHover(id: number | string, params: unknown): Promise<void> {
    if (!this.capabilities.hover || !this.callbacks.onHover) {
      this.respond(id, null);
      return;
    }

    const p = params as {
      textDocument: { uri: string };
      position: LspPosition;
    };

    const hover = await this.callbacks.onHover(p.textDocument.uri, p.position);
    this.respond(id, hover);
  }

  private async handleCodeAction(id: number | string, params: unknown): Promise<void> {
    if (!this.capabilities.codeActions || !this.callbacks.onCodeAction) {
      this.respond(id, []);
      return;
    }

    const p = params as {
      textDocument: { uri: string };
      range: LspRange;
      context: { diagnostics: LspDiagnostic[] };
    };

    const actions = await this.callbacks.onCodeAction(
      p.textDocument.uri,
      p.range,
      p.context.diagnostics,
    );
    this.respond(id, actions);
  }

  private async handleDocumentChange(params: unknown): Promise<void> {
    const p = params as {
      textDocument: { uri: string };
      contentChanges?: Array<{ text: string }>;
      // didOpen has text at top level via textDocument
    };

    const uri = p.textDocument.uri;
    const content =
      p.contentChanges?.[0]?.text ?? (p.textDocument as unknown as { text?: string }).text ?? '';

    await this.callbacks.onDocumentChange?.(uri, content);

    // If diagnostics are enabled, compute and push them
    if (this.capabilities.diagnostics && this.callbacks.onDiagnostics && content) {
      const diagnostics = await this.callbacks.onDiagnostics(uri, content);
      this.publishDiagnostics(uri, diagnostics);
    }
  }

  // ─── Response Helpers ──────────────────────────────────────────────

  private respond(id: number | string, result: unknown): void {
    this.writeMessage({ jsonrpc: '2.0', id, result });
  }

  private respondError(id: number | string, code: number, message: string): void {
    this.writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
  }

  private writeMessage(message: unknown): void {
    const json = JSON.stringify(message);
    const contentLength = Buffer.byteLength(json, 'utf-8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    this.output.write(header + json);
  }
}
