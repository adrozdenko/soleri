---
title: Transports
description: How to connect your agent to different clients — stdio, HTTP/SSE, WebSocket, and LSP.
---

Soleri agents communicate through **transports** — the layer between your agent's facades and the outside world. The engine logic stays the same; the transport determines how clients connect.

## Available Transports

| Transport | Protocol | Use case | Client |
|-----------|----------|----------|--------|
| **stdio** | MCP over stdin/stdout | your AI editor, Cursor | AI editors |
| **HTTP/SSE** | REST + Server-Sent Events | Web dashboards, REST APIs | Any HTTP client |
| **WebSocket** | Bidirectional streaming | Real-time apps, Telegram bots | WebSocket clients |
| **LSP** | Language Server Protocol | VS Code, Neovim | Editor extensions |

## stdio (Default)

The default transport. Your agent runs as a child process; the editor communicates over stdin/stdout using the Model Context Protocol.

```json
{
  "mcpServers": {
    "my-agent": {
      "command": "node",
      "args": ["./my-agent/dist/index.js"]
    }
  }
}
```

No configuration needed — this is what `npm run build` and `soleri dev` produce.

## HTTP/SSE

For web integrations and REST API access. The HTTP transport serves a standard HTTP server with JSON-RPC endpoints and Server-Sent Events for streaming.

```typescript
import { HttpMcpServer } from '@soleri/core';

const server = new HttpMcpServer(
  {
    port: 3100,
    host: '127.0.0.1',
    corsOrigins: ['http://localhost:3000'],
    authToken: process.env.AUTH_TOKEN,
  },
  {
    onInitialize: async (req, res) => { /* MCP initialize */ },
    onRequest: async (req, res) => { /* MCP tool calls */ },
    onSSE: async (req, res) => { /* SSE streaming */ },
    onDelete: async (req, res) => { /* Session cleanup */ },
  },
);

await server.start();
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check — returns 200 if running |
| POST | `/mcp` | Yes | MCP JSON-RPC tool calls |
| GET | `/mcp/sse` | Yes | Server-Sent Events stream |
| DELETE | `/mcp/session` | Yes | Close a session |

### Authentication

Pass a Bearer token in the `Authorization` header:

```
Authorization: Bearer <your-token>
```

The health endpoint (`/health`) does not require authentication.

### Stats

```typescript
const stats = server.getStats();
// { sessions: number, uptime: number }
```

### Shutdown

```typescript
await server.stop(); // Closes all connections and stops listening
```

## WebSocket

For bidirectional streaming — real-time applications, chat interfaces, Telegram bots.

```typescript
import { WsMcpServer } from '@soleri/core';

const ws = new WsMcpServer(
  {
    authToken: process.env.WS_AUTH_TOKEN,
    heartbeatInterval: 30_000,   // Ping every 30s (0 to disable)
    maxMessageSize: 1_048_576,   // 1MB max message
  },
  {
    onConnect: async (socket) => { /* New connection */ },
    onMessage: async (socket, data) => { /* Incoming message */ },
    onClose: (socket) => { /* Connection closed */ },
  },
);

await ws.start(3200, '127.0.0.1');
```

### Stats

```typescript
const stats = ws.getStats();
// { connections: number, uptime: number }
```

### Shutdown

```typescript
await ws.stop(); // Closes all WebSocket connections
```

## LSP

For editor-native integration via the Language Server Protocol. Useful for VS Code extensions and Neovim plugins.

```typescript
import { LspServer } from '@soleri/core';
```

The LSP transport maps Soleri operations to LSP methods, enabling code actions, diagnostics, and hover information powered by vault knowledge.

## Session Management

All network transports (HTTP, WebSocket) use `SessionManager` for client session tracking.

```typescript
import { SessionManager } from '@soleri/core';

const sessions = new SessionManager({
  ttl: 3_600_000, // 1 hour session TTL
});

// Generate and track sessions
const id = sessions.generateId();
const session = sessions.add(id, socket, metadata);

// Query sessions
sessions.get(id);        // Get by ID
sessions.listIds();      // All session IDs
sessions.size;           // Active count

// Cleanup
sessions.remove(id);     // Remove one
sessions.close();        // Remove all + stop reaper
```

**Automatic reaping:** Expired sessions are cleaned up automatically based on the TTL. The reaper runs periodically and removes sessions that haven't been accessed within the TTL window.

**Unique IDs:** `generateId()` produces cryptographically random session identifiers.

## Rate Limiting

All network transports support per-client rate limiting via `RateLimiter`.

```typescript
import { RateLimiter } from '@soleri/core';

const limiter = new RateLimiter(
  100,       // Max requests per window
  60_000,    // Window size in ms (1 minute)
);

// Check before processing a request
const result = limiter.check(clientId);
if (!result.allowed) {
  // result.retryAfterMs tells the client when to retry
  return respond(429, { retryAfter: result.retryAfterMs });
}
// result.remaining — requests left in this window

// Management
limiter.reset(clientId);  // Reset a specific client
limiter.clear();          // Reset all clients
```

**Per-client tracking:** Each client ID (IP address, session ID, or API key) gets its own counter. Hitting the limit for one client doesn't affect others.

## Choosing a Transport

| Scenario | Transport | Why |
|----------|-----------|-----|
| your AI editor / Cursor | stdio | Native MCP support, zero config |
| Web dashboard | HTTP/SSE | Standard REST, SSE for live updates |
| Telegram bot | WebSocket | Bidirectional, persistent connections |
| VS Code extension | LSP | Editor-native integration |
| Multiple clients | HTTP or WebSocket | Session management + rate limiting |
| Internal microservice | HTTP | Standard API patterns |

You can run multiple transports simultaneously — the same agent instance can serve stdio for your AI editor and HTTP for a web dashboard.

---

_Next: [Under the Hood](/docs/guides/under-the-hood/) — how the vault, brain, and memory actually work._
