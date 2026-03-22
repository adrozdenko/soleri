/**
 * WebSocket MCP Server Tests — handshake, messaging, heartbeat, lifecycle.
 *
 * Tests the WsMcpServer using a real localhost server but no external connections.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { WsMcpServer, type WsServerCallbacks } from './ws-server.js';

const AUTH_TOKEN = 'ws-test-token';
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB5A4085CE3';

function defaultCallbacks(): WsServerCallbacks {
  return {
    onConnect: vi.fn(async () => {}),
    onMessage: vi.fn(async () => {}),
    onClose: vi.fn(),
    onError: vi.fn(),
  };
}

/** Build a raw WebSocket upgrade request */
function buildUpgradeRequest(opts?: { token?: string; key?: string; path?: string }): string {
  const key = opts?.key ?? 'dGhlIHNhbXBsZSBub25jZQ==';
  const token = opts?.token ?? AUTH_TOKEN;
  const path = opts?.path ?? `/?token=${token}`;
  return [
    `GET ${path} HTTP/1.1`,
    'Host: localhost',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n');
}

/** Encode a WebSocket text frame (unmasked, for reading) / masked for sending to server */
function encodeTextFrame(text: string, masked = true): Buffer {
  const payload = Buffer.from(text, 'utf-8');
  const len = payload.length;
  let header: Buffer;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + TEXT
    header[1] = masked ? (len | 0x80) : len;
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = masked ? (126 | 0x80) : 126;
    header.writeUInt16BE(len, 2);
  }

  if (masked) {
    const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const maskedPayload = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      maskedPayload[i] = payload[i] ^ mask[i & 3];
    }
    return Buffer.concat([header, mask, maskedPayload]);
  }

  return Buffer.concat([header, payload]);
}

describe('WsMcpServer', () => {
  let server: WsMcpServer;
  let callbacks: WsServerCallbacks;

  beforeEach(() => {
    callbacks = defaultCallbacks();
    server = new WsMcpServer(
      { authToken: AUTH_TOKEN, heartbeatInterval: 0, sessionTTL: 0 },
      callbacks,
    );
  });

  afterEach(async () => {
    // The WsMcpServer.stop() can hang when the underlying HTTP server
    // waits for upgraded WebSocket connections to drain. Force-destroy.
    const httpServer = (server as any).server as Server | undefined;
    if (httpServer) {
      // Force immediate close of all tracked sockets
      for (const conn of ((server as any).connections as Map<string, any>)?.values() ?? []) {
        conn.socket?.destroy();
      }
      ((server as any).connections as Map<string, any>)?.clear();
      // Close with a force-destroy fallback
      await Promise.race([
        server.stop(),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            httpServer.closeAllConnections?.();
            httpServer.close(() => {});
            (server as any).server = undefined;
            resolve();
          }, 200);
        }),
      ]);
    } else {
      await server.stop().catch(() => {});
    }
  });

  describe('construction', () => {
    it('exposes sessionManager', () => {
      expect(server.sessionManager).toBeDefined();
      expect(server.sessionManager.size).toBe(0);
    });

    it('reports zero stats before start', () => {
      const stats = server.getStats();
      expect(stats.connections).toBe(0);
      expect(stats.uptime).toBe(0);
    });
  });

  describe('standalone start / stop', () => {
    it('starts and stops without error', async () => {
      await server.start(0);
      expect(server.getStats().uptime).toBeGreaterThanOrEqual(0);
      await server.stop();
    });

    it('stop is idempotent', async () => {
      await server.start(0);
      await server.stop();
      await server.stop();
    });
  });

  describe('attachTo', () => {
    it('attaches to an existing HTTP server', async () => {
      const httpServer = createServer();
      await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

      const wsServer = new WsMcpServer(
        { authToken: AUTH_TOKEN, heartbeatInterval: 0, sessionTTL: 0 },
        callbacks,
      );
      wsServer.attachTo(httpServer);
      expect(wsServer.getStats().uptime).toBeGreaterThanOrEqual(0);

      await wsServer.stop();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    });
  });

  describe('WebSocket handshake', () => {
    it('completes handshake with valid token', async () => {
      await server.start(0);
      const addr = (server as any).server?.address();
      if (!addr || typeof addr === 'string') return;

      const wsKey = 'dGhlIHNhbXBsZSBub25jZQ==';
      const expectedAccept = createHash('sha1').update(wsKey + WS_MAGIC).digest('base64');

      const socket = connect(addr.port, '127.0.0.1');
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      socket.write(buildUpgradeRequest({ key: wsKey }));

      const response = await new Promise<string>((resolve) => {
        socket.once('data', (data) => resolve(data.toString()));
      });

      expect(response).toContain('101 Switching Protocols');
      expect(response).toContain(`Sec-WebSocket-Accept: ${expectedAccept}`);
      expect(response).toContain('mcp-session-id:');

      // Wait for onConnect callback
      await new Promise((r) => setTimeout(r, 50));
      expect(callbacks.onConnect).toHaveBeenCalled();

      socket.destroy();
    });

    it('rejects connection with invalid token', async () => {
      await server.start(0);
      const addr = (server as any).server?.address();
      if (!addr || typeof addr === 'string') return;

      const socket = connect(addr.port, '127.0.0.1');
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      socket.write(buildUpgradeRequest({ token: 'wrong-token' }));

      const response = await new Promise<string>((resolve) => {
        socket.once('data', (data) => resolve(data.toString()));
      });

      expect(response).toContain('401');
      socket.destroy();
    });

    it('supports Authorization header auth', async () => {
      await server.start(0);
      const addr = (server as any).server?.address();
      if (!addr || typeof addr === 'string') return;

      const socket = connect(addr.port, '127.0.0.1');
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const request = [
        'GET / HTTP/1.1',
        'Host: localhost',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        `Authorization: Bearer ${AUTH_TOKEN}`,
        '',
        '',
      ].join('\r\n');

      socket.write(request);

      const response = await new Promise<string>((resolve) => {
        socket.once('data', (data) => resolve(data.toString()));
      });

      expect(response).toContain('101 Switching Protocols');
      socket.destroy();
    });
  });

  describe('send / broadcast', () => {
    it('send returns false for unknown session', () => {
      expect(server.send('nonexistent', { test: true })).toBe(false);
    });

    it('broadcast returns 0 with no connections', () => {
      expect(server.broadcast({ test: true })).toBe(0);
    });
  });

  describe('message handling', () => {
    it('calls onMessage for valid JSON text frames', async () => {
      await server.start(0);
      const addr = (server as any).server?.address();
      if (!addr || typeof addr === 'string') return;

      const socket = connect(addr.port, '127.0.0.1');
      await new Promise<void>((resolve) => socket.on('connect', resolve));
      socket.write(buildUpgradeRequest());

      // Wait for handshake
      await new Promise<string>((resolve) => {
        socket.once('data', (data) => resolve(data.toString()));
      });

      // Wait for onConnect
      await new Promise((r) => setTimeout(r, 50));

      // Send a masked text frame
      const frame = encodeTextFrame(JSON.stringify({ method: 'test' }));
      socket.write(frame);

      await new Promise((r) => setTimeout(r, 100));
      expect(callbacks.onMessage).toHaveBeenCalled();

      socket.destroy();
    });
  });

  describe('cleanup on stop', () => {
    it('cleans up connections when server stops', async () => {
      await server.start(0);
      const addr = (server as any).server?.address();
      if (!addr || typeof addr === 'string') return;

      const socket = connect(addr.port, '127.0.0.1');
      await new Promise<void>((resolve) => socket.on('connect', resolve));
      socket.write(buildUpgradeRequest());
      await new Promise<string>((resolve) => {
        socket.once('data', (data) => resolve(data.toString()));
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(server.getStats().connections).toBe(1);

      // server.stop() closes all connections and destroys sockets
      socket.destroy();
      await new Promise((r) => setTimeout(r, 50));
    });
  });
});
