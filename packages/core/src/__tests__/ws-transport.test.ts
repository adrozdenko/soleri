/**
 * WebSocket Transport Tests — ws-server.ts
 *
 * Tests the RFC 6455 WebSocket server using raw TCP sockets (no ws dependency).
 */

import { describe, test, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { connect, type Socket } from 'node:net';
import { WsMcpServer, type WsConnection, type WsServerCallbacks } from '../transport/index.js';

// =============================================================================
// HELPERS — raw WebSocket client using TCP
// =============================================================================

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB5A4085CE3';

/** Perform a WebSocket handshake and return the raw socket + session ID */
async function wsConnect(
  port: number,
  token: string,
  host = '127.0.0.1',
): Promise<{ socket: Socket; sessionId: string }> {
  return new Promise((resolve, reject) => {
    const key = Buffer.from('test-key-1234567').toString('base64');
    const socket = connect(port, host, () => {
      socket.write(
        'GET / HTTP/1.1\r\n' +
          `Host: ${host}:${port}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\n` +
          'Sec-WebSocket-Version: 13\r\n' +
          `Authorization: Bearer ${token}\r\n` +
          '\r\n',
      );
    });

    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      if (buffer.includes('\r\n\r\n')) {
        socket.removeListener('data', onData);

        // Verify handshake
        if (!buffer.startsWith('HTTP/1.1 101')) {
          reject(new Error(`Handshake failed: ${buffer.split('\r\n')[0]}`));
          socket.destroy();
          return;
        }

        // Verify Sec-WebSocket-Accept
        const expectedAccept = createHash('sha1')
          .update(key + WS_MAGIC)
          .digest('base64');
        if (!buffer.includes(`Sec-WebSocket-Accept: ${expectedAccept}`)) {
          reject(new Error('Invalid Sec-WebSocket-Accept'));
          socket.destroy();
          return;
        }

        // Extract session ID
        const sessionMatch = buffer.match(/mcp-session-id:\s*(.+)\r\n/);
        const sessionId = sessionMatch?.[1] ?? '';

        resolve({ socket, sessionId });
      }
    };

    socket.on('data', onData);
    socket.on('error', reject);
    setTimeout(() => reject(new Error('Handshake timeout')), 5000);
  });
}

/** Encode a WebSocket text frame (client-to-server, masked per RFC 6455) */
function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf-8');
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]); // fixed mask for testing
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text
    header[1] = 0x80 | len; // masked + length
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  // Mask payload
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ mask[i & 3];
  }

  return Buffer.concat([header, mask, masked]);
}

/** Decode a server-to-client WebSocket text frame (unmasked) */
function decodeTextFrame(buf: Buffer): string | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  if (opcode !== 0x01) return null; // not text

  let payloadLength = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buf.length < 4) return null;
    payloadLength = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buf.length < 10) return null;
    payloadLength = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  if (buf.length < offset + payloadLength) return null;
  return buf.subarray(offset, offset + payloadLength).toString('utf-8');
}

/** Read a text frame from the socket */
function readFrame(socket: Socket, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Read timeout')), timeoutMs);

    const onData = (chunk: Buffer) => {
      clearTimeout(timer);
      socket.removeListener('data', onData);
      const text = decodeTextFrame(chunk);
      if (text !== null) {
        resolve(text);
      } else {
        reject(new Error(`Non-text frame received: opcode=0x${(chunk[0] & 0x0f).toString(16)}`));
      }
    };

    socket.on('data', onData);
  });
}

/** Send a WebSocket close frame (client-to-server, masked) */
function sendCloseFrame(socket: Socket, code = 1000): void {
  const payload = Buffer.alloc(2);
  payload.writeUInt16BE(code, 0);
  const mask = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ mask[i & 3];
  }
  const header = Buffer.alloc(2);
  header[0] = 0x80 | 0x08; // FIN + close
  header[1] = 0x80 | payload.length; // masked + length
  socket.write(Buffer.concat([header, mask, masked]));
}

// =============================================================================
// TESTS
// =============================================================================

describe('WsMcpServer', () => {
  let server: WsMcpServer | undefined;
  let sockets: Socket[] = [];

  afterEach(async () => {
    for (const s of sockets) {
      s.destroy();
    }
    sockets = [];
    if (server) {
      await server.stop();
      server = undefined;
    }
  });

  function createServer(
    overrides: Partial<WsServerCallbacks> = {},
    config: Partial<import('../transport/types.js').WsTransportConfig> = {},
  ): WsMcpServer {
    const callbacks: WsServerCallbacks = {
      onConnect: overrides.onConnect ?? vi.fn(async () => {}),
      onMessage: overrides.onMessage ?? vi.fn(async () => {}),
      onClose: overrides.onClose ?? vi.fn(),
      onError: overrides.onError ?? vi.fn(),
    };
    server = new WsMcpServer(
      { authToken: 'test-ws-token', heartbeatInterval: 0, ...config },
      callbacks,
    );
    return server;
  }

  test('constructs without error', () => {
    const s = createServer();
    expect(s).toBeDefined();
    expect(s.sessionManager).toBeDefined();
  });

  test('getStats returns defaults before start', () => {
    const s = createServer();
    const stats = s.getStats();
    expect(stats.connections).toBe(0);
    expect(stats.uptime).toBe(0);
  });

  test('start and stop lifecycle', async () => {
    const s = createServer();
    await s.start(0);
    const stats = s.getStats();
    expect(stats.uptime).toBeGreaterThan(0);
    await s.stop();
    server = undefined;
  });

  test('rejects connection without auth', async () => {
    const s = createServer();
    await s.start(0);

    const addr = (s as any).server?.address();
    const port = addr?.port;

    await expect(
      new Promise<void>((resolve, reject) => {
        const key = Buffer.from('test-key-1234567').toString('base64');
        const sock = connect(port, '127.0.0.1', () => {
          sock.write(
            'GET / HTTP/1.1\r\n' +
              'Host: 127.0.0.1\r\n' +
              'Upgrade: websocket\r\n' +
              'Connection: Upgrade\r\n' +
              `Sec-WebSocket-Key: ${key}\r\n` +
              'Sec-WebSocket-Version: 13\r\n' +
              '\r\n', // no auth
          );
        });

        let buf = '';
        sock.on('data', (chunk) => {
          buf += chunk.toString();
          if (buf.includes('401')) {
            sock.destroy();
            reject(new Error('401'));
          }
        });
        sock.on('close', () => {
          if (buf.includes('401')) reject(new Error('401'));
          else resolve();
        });
        sock.on('error', reject);
        setTimeout(() => {
          sock.destroy();
          reject(new Error('timeout'));
        }, 3000);
      }),
    ).rejects.toThrow('401');
  });

  test('accepts connection with valid auth', async () => {
    const onConnect = vi.fn(async () => {});
    const s = createServer({ onConnect });
    await s.start(0);

    const addr = (s as any).server?.address();
    const { socket, sessionId } = await wsConnect(addr.port, 'test-ws-token');
    sockets.push(socket);

    expect(sessionId).toBeTruthy();
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // Wait for onConnect to be called
    await vi.waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1));

    expect(s.getStats().connections).toBe(1);
  });

  test('receives JSON-RPC message', async () => {
    const messages: unknown[] = [];
    const onMessage = vi.fn(async (_conn: WsConnection, data: unknown) => {
      messages.push(data);
    });
    const s = createServer({ onMessage });
    await s.start(0);

    const addr = (s as any).server?.address();
    const { socket } = await wsConnect(addr.port, 'test-ws-token');
    sockets.push(socket);

    // Wait for connection
    await vi.waitFor(() => expect(s.getStats().connections).toBe(1));

    // Send a JSON-RPC message
    const msg = { jsonrpc: '2.0', method: 'initialize', id: 1 };
    socket.write(encodeTextFrame(JSON.stringify(msg)));

    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(messages[0]).toEqual(msg);
  });

  test('sends message to specific connection', async () => {
    const onConnect = vi.fn(async () => {});
    const s = createServer({ onConnect });
    await s.start(0);

    const addr = (s as any).server?.address();
    const { socket, sessionId } = await wsConnect(addr.port, 'test-ws-token');
    sockets.push(socket);

    await vi.waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1));

    // Server sends a message
    const sent = s.send(sessionId, { jsonrpc: '2.0', method: 'notification', params: {} });
    expect(sent).toBe(true);

    const received = await readFrame(socket);
    const parsed = JSON.parse(received);
    expect(parsed.method).toBe('notification');
  });

  test('send returns false for unknown session', () => {
    const s = createServer();
    expect(s.send('nonexistent', { data: 1 })).toBe(false);
  });

  test('broadcasts to all connections', async () => {
    const onConnect = vi.fn(async () => {});
    const s = createServer({ onConnect });
    await s.start(0);

    const addr = (s as any).server?.address();
    const conn1 = await wsConnect(addr.port, 'test-ws-token');
    const conn2 = await wsConnect(addr.port, 'test-ws-token');
    sockets.push(conn1.socket, conn2.socket);

    await vi.waitFor(() => expect(onConnect).toHaveBeenCalledTimes(2));

    const count = s.broadcast({ jsonrpc: '2.0', method: 'update', params: {} });
    expect(count).toBe(2);

    const [msg1, msg2] = await Promise.all([readFrame(conn1.socket), readFrame(conn2.socket)]);
    expect(JSON.parse(msg1).method).toBe('update');
    expect(JSON.parse(msg2).method).toBe('update');
  });

  test('handles connection close', async () => {
    const onClose = vi.fn();
    const s = createServer({ onClose });
    await s.start(0);

    const addr = (s as any).server?.address();
    const { socket } = await wsConnect(addr.port, 'test-ws-token');
    sockets.push(socket);

    await vi.waitFor(() => expect(s.getStats().connections).toBe(1));

    // Send a proper close frame
    sendCloseFrame(socket);

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(s.getStats().connections).toBe(0);
  });

  test('handles invalid JSON gracefully', async () => {
    const onError = vi.fn();
    const s = createServer({ onError });
    await s.start(0);

    const addr = (s as any).server?.address();
    const { socket } = await wsConnect(addr.port, 'test-ws-token');
    sockets.push(socket);

    await vi.waitFor(() => expect(s.getStats().connections).toBe(1));

    // Send invalid JSON
    socket.write(encodeTextFrame('not-json{{{'));

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][1].message).toBe('Invalid JSON received');
  });

  test('multiple sessions tracked independently', async () => {
    const onConnect = vi.fn(async () => {});
    const s = createServer({ onConnect });
    await s.start(0);

    const addr = (s as any).server?.address();
    const conn1 = await wsConnect(addr.port, 'test-ws-token');
    const conn2 = await wsConnect(addr.port, 'test-ws-token');
    sockets.push(conn1.socket, conn2.socket);

    expect(conn1.sessionId).not.toBe(conn2.sessionId);

    await vi.waitFor(() => expect(s.getStats().connections).toBe(2));

    // Close one via close frame
    sendCloseFrame(conn1.socket);
    await vi.waitFor(() => expect(s.getStats().connections).toBe(1));

    // Other still works
    const sent = s.send(conn2.sessionId, { alive: true });
    expect(sent).toBe(true);
  });

  test('rejects non-websocket upgrade', async () => {
    const s = createServer();
    await s.start(0);

    const addr = (s as any).server?.address();
    const port = addr?.port;

    // Send a regular HTTP request — should get 426
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(426);
  });

  test('stop closes all connections', async () => {
    const onClose = vi.fn();
    const s = createServer({ onClose });
    await s.start(0);

    const addr = (s as any).server?.address();
    const { socket } = await wsConnect(addr.port, 'test-ws-token');
    sockets.push(socket);

    await vi.waitFor(() => expect(s.getStats().connections).toBe(1));

    await s.stop();
    server = undefined;

    // Connection count should be 0
    expect(s.getStats().connections).toBe(0);
  });

  test('auth via query param token', async () => {
    const onConnect = vi.fn(async () => {});
    const s = createServer({ onConnect });
    await s.start(0);

    const addr = (s as any).server?.address();
    const port = addr.port;
    const key = Buffer.from('test-key-query123').toString('base64');

    const result = await new Promise<string>((resolve, reject) => {
      const sock = connect(port, '127.0.0.1', () => {
        sock.write(
          'GET /?token=test-ws-token HTTP/1.1\r\n' +
            'Host: 127.0.0.1\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Key: ${key}\r\n` +
            'Sec-WebSocket-Version: 13\r\n' +
            '\r\n',
        );
      });
      sockets.push(sock);

      let buf = '';
      sock.on('data', (chunk) => {
        buf += chunk.toString();
        if (buf.includes('\r\n\r\n')) {
          resolve(buf.split('\r\n')[0]);
        }
      });
      sock.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    expect(result).toContain('101');
    await vi.waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1));
  });
});
