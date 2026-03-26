/**
 * WebSocket MCP Server — RFC 6455 implementation using only node:http + node:crypto.
 *
 * Provides bidirectional JSON-RPC 2.0 communication over WebSocket.
 * Can run standalone or share an HTTP server with HttpMcpServer via upgrade handler.
 *
 * Features:
 *   - RFC 6455 handshake (Sec-WebSocket-Key / Accept)
 *   - Text frame encode/decode (opcode 0x1) with masking support
 *   - Ping/pong heartbeat (configurable interval, default 30s)
 *   - Bearer token auth on upgrade request
 *   - Session management via shared SessionManager
 *   - Max message size enforcement (default 1MB)
 *   - Clean close handshake (opcode 0x8)
 */

import { createHash } from 'node:crypto';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WsTransportConfig } from './types.js';
import { validateBearerToken } from './token-auth.js';
import { SessionManager, type Session } from './session-manager.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** RFC 6455 magic GUID for Sec-WebSocket-Accept */
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB5A4085CE3';

const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_MAX_MESSAGE_SIZE = 1_048_576; // 1 MB

// Frame opcodes
const OPCODE_TEXT = 0x01;
const OPCODE_CLOSE = 0x08;
const OPCODE_PING = 0x09;
const OPCODE_PONG = 0x0a;

// =============================================================================
// TYPES
// =============================================================================

export interface WsConnection {
  /** Session associated with this connection */
  session: Session;
  /** The underlying TCP socket */
  socket: Duplex;
  /** Whether the connection is alive (for heartbeat) */
  alive: boolean;
}

export interface WsServerCallbacks {
  /** Called when a new WebSocket connection is established. Must create session. */
  onConnect: (conn: WsConnection) => Promise<void>;
  /** Called when a text message is received. */
  onMessage: (conn: WsConnection, data: unknown) => Promise<void>;
  /** Called when a connection is closed. */
  onClose: (conn: WsConnection) => void;
  /** Optional: called on errors. */
  onError?: (conn: WsConnection, error: Error) => void;
}

export interface WsServerStats {
  connections: number;
  uptime: number;
}

// =============================================================================
// WEBSOCKET SERVER
// =============================================================================

export class WsMcpServer {
  private server: Server | undefined;
  private ownServer = false; // true if we created the server ourselves
  private sessions: SessionManager;
  private config: WsTransportConfig;
  private callbacks: WsServerCallbacks;
  private connections = new Map<string, WsConnection>();
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private startedAt = 0;

  constructor(config: WsTransportConfig, callbacks: WsServerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.sessions = new SessionManager({
      ttl: config.sessionTTL,
      reaperInterval: config.reaperInterval,
    });
  }

  /** Get the session manager. */
  get sessionManager(): SessionManager {
    return this.sessions;
  }

  /**
   * Attach to an existing HTTP server as an upgrade handler.
   * Call this instead of start() when sharing a server with HttpMcpServer.
   */
  attachTo(server: Server): void {
    this.startedAt = Date.now();
    this.server = server;
    this.ownServer = false;
    server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });
    this.sessions.startReaper();
    this.startHeartbeat();
  }

  /** Start a standalone WebSocket server. */
  async start(port: number, host = '127.0.0.1'): Promise<void> {
    this.startedAt = Date.now();
    this.server = createServer((_req, res) => {
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('Upgrade Required');
    });
    this.ownServer = true;

    this.server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, host, () => resolve());
    });

    this.sessions.startReaper();
    this.startHeartbeat();
  }

  /** Stop the server and close all connections. */
  async stop(): Promise<void> {
    this.stopHeartbeat();
    this.sessions.close();

    // Close all WebSocket connections
    for (const conn of this.connections.values()) {
      this.sendClose(conn.socket, 1001, 'Server shutting down');
      conn.socket.destroy();
    }
    this.connections.clear();

    if (this.ownServer && this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err) => (err ? reject(err) : resolve()));
      });
      this.server = undefined;
    }
  }

  /** Get server stats. */
  getStats(): WsServerStats {
    return {
      connections: this.connections.size,
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
    };
  }

  /** Send a text message to a specific connection. */
  send(sessionId: string, data: unknown): boolean {
    const conn = this.connections.get(sessionId);
    if (!conn) return false;
    this.sendText(conn.socket, JSON.stringify(data));
    return true;
  }

  /** Broadcast a text message to all connections. */
  broadcast(data: unknown): number {
    const text = JSON.stringify(data);
    let count = 0;
    for (const conn of this.connections.values()) {
      this.sendText(conn.socket, text);
      count++;
    }
    return count;
  }

  // ─── Upgrade Handling ──────────────────────────────────────────────

  private handleUpgrade(req: IncomingMessage, socket: Duplex, _head: Buffer): void {
    // Validate WebSocket upgrade headers
    const upgradeHeader = req.headers.upgrade;
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }

    const wsKey = req.headers['sec-websocket-key'];
    if (!wsKey) {
      socket.destroy();
      return;
    }

    // Auth: extract token from query string or Authorization header
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const queryToken = url.searchParams.get('token');
    const authHeader = req.headers.authorization;
    const tokenValid = queryToken
      ? queryToken === this.config.authToken
      : validateBearerToken(authHeader, this.config.authToken);

    if (!tokenValid) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Complete WebSocket handshake
    const acceptKey = createHash('sha1')
      .update(wsKey + WS_MAGIC)
      .digest('base64');

    const sessionId = this.sessions.generateId();

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        `mcp-session-id: ${sessionId}\r\n` +
        '\r\n',
    );

    // Create session and connection
    const session = this.sessions.add(sessionId, socket, null);
    const conn: WsConnection = { session, socket, alive: true };
    this.connections.set(sessionId, conn);

    // Set up frame reader
    const maxSize = this.config.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
    const maxBufferSize = maxSize; // raw buffer limit matches max message size (1 MB default)
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Guard against unbounded buffer growth (e.g. slow-drip DoS with no complete frames)
      if (buffer.length > maxBufferSize) {
        this.sendClose(socket, 1009, 'Buffer exceeded max size');
        socket.destroy();
        return;
      }

      // Process all complete frames in the buffer
      while (buffer.length >= 2) {
        const frame = this.parseFrame(buffer);
        if (!frame) break; // incomplete frame

        buffer = buffer.subarray(frame.totalLength);

        if (frame.opcode === OPCODE_TEXT) {
          if (frame.payload.length > maxSize) {
            this.sendClose(socket, 1009, 'Message too large');
            socket.destroy();
            return;
          }
          const text = frame.payload.toString('utf-8');
          try {
            const parsed: unknown = JSON.parse(text);
            this.callbacks.onMessage(conn, parsed).catch((err) => {
              this.callbacks.onError?.(conn, err instanceof Error ? err : new Error(String(err)));
            });
          } catch {
            // Invalid JSON — ignore or notify
            this.callbacks.onError?.(conn, new Error('Invalid JSON received'));
          }
        } else if (frame.opcode === OPCODE_PING) {
          this.sendPong(socket, frame.payload);
        } else if (frame.opcode === OPCODE_PONG) {
          conn.alive = true;
        } else if (frame.opcode === OPCODE_CLOSE) {
          this.sendClose(socket, 1000, '');
          socket.destroy();
        }
      }
    });

    // Cleanup on disconnect — guard against double-fire from close+end+error
    let cleaned = false;
    const cleanup = (err?: Error) => {
      if (cleaned) return;
      cleaned = true;
      this.connections.delete(sessionId);
      this.sessions.remove(sessionId);
      if (err) this.callbacks.onError?.(conn, err);
      this.callbacks.onClose(conn);
    };

    socket.on('close', () => cleanup());
    socket.on('end', () => cleanup());
    socket.on('error', (err) => cleanup(err));

    // Notify callback
    this.callbacks.onConnect(conn).catch((err) => {
      this.callbacks.onError?.(conn, err instanceof Error ? err : new Error(String(err)));
    });
  }

  // ─── Frame Parsing (RFC 6455) ──────────────────────────────────────

  private parseFrame(buf: Buffer): { opcode: number; payload: Buffer; totalLength: number } | null {
    if (buf.length < 2) return null;

    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let payloadLength = buf[1] & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (buf.length < 4) return null;
      payloadLength = buf.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (buf.length < 10) return null;
      // Read as 64-bit, but JS numbers are limited to 2^53
      payloadLength = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }

    const maskSize = masked ? 4 : 0;
    const totalLength = offset + maskSize + payloadLength;
    if (buf.length < totalLength) return null;

    let payload: Buffer;
    if (masked) {
      const mask = buf.subarray(offset, offset + 4);
      payload = Buffer.alloc(payloadLength);
      for (let i = 0; i < payloadLength; i++) {
        payload[i] = buf[offset + 4 + i] ^ mask[i & 3];
      }
    } else {
      payload = buf.subarray(offset, offset + payloadLength);
    }

    return { opcode, payload, totalLength };
  }

  // ─── Frame Encoding ────────────────────────────────────────────────

  private encodeFrame(opcode: number, payload: Buffer): Buffer {
    const len = payload.length;
    let header: Buffer;

    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode; // FIN + opcode
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    return Buffer.concat([header, payload]);
  }

  private sendText(socket: Duplex, text: string): void {
    const payload = Buffer.from(text, 'utf-8');
    const frame = this.encodeFrame(OPCODE_TEXT, payload);
    socket.write(frame);
  }

  private sendPong(socket: Duplex, payload: Buffer): void {
    const frame = this.encodeFrame(OPCODE_PONG, payload);
    socket.write(frame);
  }

  private sendClose(socket: Duplex, code: number, reason: string): void {
    const reasonBuf = Buffer.from(reason, 'utf-8');
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    const frame = this.encodeFrame(OPCODE_CLOSE, payload);
    socket.write(frame);
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────

  private startHeartbeat(): void {
    const interval = this.config.heartbeatInterval ?? DEFAULT_HEARTBEAT_MS;
    if (interval <= 0) return;

    this.heartbeatTimer = setInterval(() => {
      for (const [id, conn] of this.connections) {
        if (!conn.alive) {
          // No pong received since last ping — dead connection
          this.sendClose(conn.socket, 1001, 'Heartbeat timeout');
          conn.socket.destroy();
          this.connections.delete(id);
          this.sessions.remove(id);
          this.callbacks.onClose(conn);
          continue;
        }
        conn.alive = false;
        const ping = this.encodeFrame(OPCODE_PING, Buffer.alloc(0));
        conn.socket.write(ping);
      }
    }, interval);

    if (
      this.heartbeatTimer &&
      typeof this.heartbeatTimer === 'object' &&
      'unref' in this.heartbeatTimer
    ) {
      (this.heartbeatTimer as NodeJS.Timeout).unref();
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}
