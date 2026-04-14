---
title: 'Transport Security'
description: 'Rate limiting, token authentication, and session management for HTTP/SSE and WebSocket transports.'
---

When you expose your agent over HTTP or WebSocket, you're opening a network socket. That means you need authentication, rate limiting, and session lifecycle management. All three are built into the transport layer and enabled by default. This guide explains how they work and how to tune them.

## Token authentication

Every request to `/mcp` (HTTP) or every WebSocket upgrade must carry a valid bearer token. The health endpoint (`/health`) is the only exception.

### Where tokens come from

The token auth system checks two places, in order:

1. An environment variable named `{AGENT_ID}_HTTP_TOKEN` (with hyphens converted to underscores, uppercased). For an agent called `my-agent`, that's `MY_AGENT_HTTP_TOKEN`.
2. A file at `~/.{agentId}/http-token`.

If neither exists, `getOrGenerateToken()` creates a random 32-byte hex token (64 characters), writes it to `~/.{agentId}/http-token` with `0600` permissions, and returns it. This happens automatically when your server starts.

### Sending the token

For HTTP, pass a standard `Authorization` header:

```
Authorization: Bearer <your-token>
```

For WebSocket, you have two options:

```
// Option 1: Authorization header (programmatic clients)
Authorization: Bearer <your-token>

// Option 2: query parameter (browser clients)
ws://localhost:3200/mcp?token=<your-token>
```

The query parameter exists because browsers can't set headers on WebSocket upgrades.

### How validation works

Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks. Even on a length mismatch, the code performs a constant-time comparison (against itself) so that an attacker can't learn the token length from response timing.

Failed auth returns `401 Unauthorized` for HTTP, or destroys the socket immediately for WebSocket.

### Generating tokens manually

```typescript
import { generateToken, saveToken, loadToken } from '@soleri/core';

// Generate a fresh 32-byte hex token
const token = generateToken();

// Save it for a specific agent
saveToken('my-agent', token);

// Load it back (checks env var first, then file)
const loaded = loadToken('my-agent');
```

Or use the convenience function that handles the "get existing or create new" flow:

```typescript
import { getOrGenerateToken } from '@soleri/core';

const token = getOrGenerateToken('my-agent');
```

## Rate limiting

The rate limiter uses a sliding window algorithm. Each client (identified by session ID or IP address) gets a separate counter. Hitting the limit for one client does not affect others.

### Defaults

| Setting | Default | Description |
| --- | --- | --- |
| `rateLimit` | 100 | Maximum requests per window |
| `rateLimitWindow` | 60,000 ms (1 minute) | Window size |

So out of the box, each client can make 100 requests per minute. The 101st request within that window gets a `429 Too Many Requests` response with a `Retry-After` header telling the client how many seconds to wait.

### How the sliding window works

Every time a request comes in, the limiter records a timestamp for that client key. When checking a new request, it filters out timestamps older than the window and counts what's left. If the count exceeds `maxRequests`, the request is rejected.

The client key is determined by priority: the `mcp-session-id` header if present, otherwise the client's IP address (respecting `X-Forwarded-For` for reverse proxies).

The limiter runs a lightweight cleanup pass every 100 checks to prune stale entries and keep memory bounded.

### Using the rate limiter directly

If you're building a custom transport or middleware, you can use `RateLimiter` standalone:

```typescript
import { RateLimiter } from '@soleri/core';

const limiter = new RateLimiter(50, 30_000); // 50 req per 30 seconds

const result = limiter.check('client-123');
if (!result.allowed) {
  // result.retryAfterMs - how long the client should wait
  // result.remaining - always 0 when rejected
  res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));
  res.writeHead(429);
  res.end();
  return;
}

// result.remaining - requests left in this window

// Reset a specific client
limiter.reset('client-123');

// Inspect state without consuming a request
const state = limiter.getKeyState('client-123');
// { requestCount: number, remaining: number }
```

## Session management

Both HTTP and WebSocket transports track connected clients through `SessionManager`. Each client gets a session with a cryptographically random UUID, a creation timestamp, and references to its transport and server objects.

### Session lifecycle

1. A client connects (HTTP initialize request, or WebSocket upgrade).
2. The server creates a session via `sessionManager.add(id, transport, server)`.
3. Subsequent requests include the session ID in the `mcp-session-id` header (HTTP) or are associated with the socket (WebSocket).
4. The session expires after the TTL, or the client explicitly closes it (DELETE `/mcp` for HTTP, close frame for WebSocket).

### TTL and the reaper

Sessions don't live forever. The reaper is a background timer that periodically scans for expired sessions and removes them.

| Setting | Default | Description |
| --- | --- | --- |
| `sessionTTL` | 3,600,000 ms (1 hour) | How long a session can live |
| `reaperInterval` | 60,000 ms (1 minute) | How often the reaper runs |

Set `sessionTTL` to `0` to disable automatic reaping entirely. The reaper timer is `unref()`'d so it won't prevent your process from exiting.

When a session is reaped, an optional `onReap` callback fires, letting you clean up associated resources (close SSE streams, release locks, etc.).

### Using SessionManager directly

```typescript
import { SessionManager } from '@soleri/core';

const sessions = new SessionManager({
  ttl: 1_800_000,        // 30 minute sessions
  reaperInterval: 30_000, // check every 30 seconds
  onReap: (session) => {
    console.log(`Session ${session.id} expired`);
  },
});

sessions.startReaper();

// Create a session
const id = sessions.generateId();
const session = sessions.add(id, transport, server);

// Look up
sessions.get(id);        // Session | undefined
sessions.size;           // number of active sessions
sessions.listIds();      // string[]

// Remove
sessions.remove(id);     // true if it existed

// Shut down
sessions.close();        // clears all sessions, stops reaper
```

## WebSocket-specific protections

The WebSocket transport has a few extra safety measures on top of auth and sessions.

### Heartbeat (ping/pong)

The server sends a ping frame at a configurable interval (default: 30 seconds). If the client doesn't respond with a pong before the next ping, the connection is considered dead and gets closed with code `1001`.

This prevents zombie connections from accumulating after network drops.

| Setting | Default | Description |
| --- | --- | --- |
| `heartbeatInterval` | 30,000 ms | Ping interval. Set to 0 to disable. |

### Message size limits

Messages larger than `maxMessageSize` (default: 1 MB) are rejected. The socket also enforces a buffer size limit to guard against slow-drip DoS attacks where an attacker sends data too slowly to ever complete a frame.

| Setting | Default | Description |
| --- | --- | --- |
| `maxMessageSize` | 1,048,576 bytes (1 MB) | Max payload per message |

### Close handshake

The server implements the RFC 6455 close handshake. When a client sends a close frame, the server responds with its own close frame before destroying the socket. On server shutdown, all connections receive a `1001 Server shutting down` close frame.

## HTTP-specific protections

### Body size and timeout

The HTTP server enforces a 10 MB maximum request body and a 30-second read timeout. If either limit is exceeded, the request is terminated.

### CORS

CORS is controlled by the `corsOrigins` array. When an incoming request's `Origin` header matches one of the allowed origins, the server sets the appropriate `Access-Control-Allow-*` headers. An empty array means no CORS headers are sent.

```typescript
corsOrigins: ['http://localhost:3000', 'https://dashboard.example.com']
```

The exposed headers include `mcp-session-id` so browser clients can read session IDs from responses.

## Configuration reference

Here's the full set of security-related config for both transports:

### HttpTransportConfig

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `authToken` | string | (required) | Bearer token for all `/mcp` routes |
| `rateLimit` | number | 100 | Max requests per window per client |
| `rateLimitWindow` | number | 60,000 | Window size in ms |
| `sessionTTL` | number | 3,600,000 | Session TTL in ms (0 to disable) |
| `reaperInterval` | number | 60,000 | Reaper check interval in ms |
| `corsOrigins` | string[] | [] | Allowed CORS origins |

### WsTransportConfig

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `authToken` | string | (required) | Bearer token for upgrade requests |
| `heartbeatInterval` | number | 30,000 | Ping interval in ms (0 to disable) |
| `maxMessageSize` | number | 1,048,576 | Max message payload in bytes |
| `sessionTTL` | number | 3,600,000 | Session TTL in ms (0 to disable) |
| `reaperInterval` | number | 60,000 | Reaper check interval in ms |

## Putting it all together

Here's a production-ish setup with both transports running against the same token:

```typescript
import {
  HttpMcpServer,
  WsMcpServer,
  getOrGenerateToken,
} from '@soleri/core';

const token = getOrGenerateToken('my-agent');

const http = new HttpMcpServer(
  {
    port: 3100,
    host: '127.0.0.1',
    authToken: token,
    corsOrigins: ['https://dashboard.example.com'],
    rateLimit: 200,
    rateLimitWindow: 60_000,
    sessionTTL: 7_200_000,  // 2 hour sessions
  },
  { onInitialize, onRequest, onSSE, onDelete },
);

const ws = new WsMcpServer(
  {
    authToken: token,
    heartbeatInterval: 15_000,  // faster heartbeat
    maxMessageSize: 2 * 1024 * 1024,  // 2 MB messages
    sessionTTL: 7_200_000,
  },
  { onConnect, onMessage, onClose },
);

await http.start();
ws.attachTo(http); // share the HTTP server for WebSocket upgrades
```

A few things to note about this setup:

The token is auto-generated on first run and persisted to `~/.my-agent/http-token`. Both transports use the same token, so a single credential works for HTTP and WebSocket clients. You can also override it by setting `MY_AGENT_HTTP_TOKEN` in your environment.

The WebSocket server is attached to the HTTP server instead of running standalone. This means both transports share a single port: HTTP requests go to the normal handler, and WebSocket upgrade requests get routed to the WS handler.

Session TTLs are set to 2 hours and the rate limit is bumped to 200 requests per minute, which is reasonable for a dashboard that polls frequently.

---

_See also: [Transports](/docs/guides/transports/) for transport setup basics, [Security & Privacy](/docs/guides/security/) for the overall security model._
