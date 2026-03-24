---
title: Cognee Integration
description: Optional vector search and knowledge graph via Cognee — setup, sync, and hybrid search.
---

Soleri integrates with [Cognee](https://github.com/topoteretes/cognee), an open-source knowledge graph engine, for optional vector similarity search alongside the built-in SQLite FTS5 text search.

## What Cognee adds

Without Cognee, vault search uses **TF-IDF** (term frequency–inverse document frequency) over SQLite FTS5. This works well for keyword matches but misses semantic similarity — "auth" won't match "authentication."

With Cognee enabled, vault entries are:

1. **Vectorized** — converted to embeddings for semantic similarity search
2. **Graph-connected** — linked as nodes in a knowledge graph with typed edges
3. **Hybrid-ranked** — search results combine FTS5 keyword score with vector cosine similarity

## Prerequisites

- A running Cognee instance (Docker or local)
- Default endpoint: `http://localhost:8000`

## Setup

Enable Cognee in your `agent.yaml`:

```yaml
engine:
  cognee: true
```

Or configure the endpoint explicitly:

```yaml
engine:
  cognee: true
  cogneeUrl: http://localhost:8000
```

Run `npx @soleri/cli dev` — the engine connects to Cognee on startup and begins syncing vault entries.

## How sync works

Vault entries sync to Cognee automatically:

- **On capture** — new entries are queued for Cognee processing (debounced)
- **On demand** — `cognee_sync_drain` processes the pending queue immediately
- **Reconciliation** — `cognee_sync_reconcile` compares vault and Cognee state, fixing drift

Check sync status:

```
"What's the Cognee status?"
"Show Cognee sync status"
```

## Operations

| Op | Auth | Description |
|----|------|-------------|
| `cognee_status` | read | Connection status and health |
| `cognee_search` | read | Vector similarity search |
| `cognee_add` | write | Add content to the knowledge graph |
| `cognee_cognify` | write | Process pending content into embeddings |
| `cognee_config` | write | Configure connection settings |
| `cognee_get_node` | read | Get a node by ID with connections |
| `cognee_graph_stats` | read | Node/edge counts by type |
| `cognee_export_status` | read | Last export timestamp |
| `cognee_sync_drain` | write | Drain pending sync queue |
| `cognee_sync_reconcile` | write | Reconcile vault and Cognee state |
| `cognee_sync_status` | read | Sync queue status |

See [Capabilities — Cognee](/docs/capabilities/#cognee) for full details.

## Graceful degradation

If Cognee is unavailable:

- Vault search falls back to FTS5-only (no vector component)
- Sync queue accumulates — entries are processed when Cognee comes back
- No errors are thrown — the engine logs a warning and continues

This means Cognee is always **optional**. Your agent works without it; Cognee makes search smarter when available.

## Troubleshooting

**Cognee shows as unavailable:**
- Check that Cognee is running: `curl http://localhost:8000/health`
- Verify the configured URL matches your Cognee instance
- Restart Cognee if needed: `docker restart <container-id>`

**Entries not appearing in vector search:**
- Run "Drain Cognee sync queue" to process pending entries
- Check `cognee_sync_status` for queue size and last sync time
- Run `cognee_sync_reconcile` to fix state drift

---

_Back to [Under the Hood](/docs/guides/under-the-hood/) or see [Capabilities — Cognee](/docs/capabilities/#cognee) for all operations._
