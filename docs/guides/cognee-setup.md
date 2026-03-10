# Cognee Setup and Configuration Guide

Cognee provides vector embeddings and knowledge graph capabilities for Soleri agents. It enables hybrid search — combining SQLite FTS5 full-text search with Cognee's semantic search for more accurate vault queries.

**Cognee is optional.** Everything works without it via FTS5 fallback. When Cognee is unavailable, the agent gracefully degrades to FTS5-only search with no errors.

## Quick Start

### 1. Start Cognee with Docker Compose

```bash
# From the Soleri monorepo root
docker compose -f docker/docker-compose.cognee.yml up -d
```

This starts three services:

| Service | Port | Purpose |
|---------|------|---------|
| `cognee` | 8000 | Cognee API server |
| `pgvector` | 5432 | PostgreSQL with pgvector extension (vector storage) |
| `falkordb` | 6379 | FalkorDB (knowledge graph) |

### 2. Verify It's Running

```bash
# Health check
curl http://localhost:8000/

# Expected: {"message":"Hello, World, I am alive!"}
```

Or from a Soleri agent:

```bash
# Using the CLI
soleri doctor

# Or via the cognee_status op
# Returns: { available: true, url: "http://localhost:8000", latencyMs: <N> }
```

### 3. Configure Your Agent

No configuration needed for local development — defaults work out of the box:

| Setting | Default | Description |
|---------|---------|-------------|
| `COGNEE_URL` | `http://localhost:8000` | Cognee API endpoint |
| `COGNEE_DATASET` | `vault` | Dataset name for vault entries |
| Service email | `soleri-agent@cognee.dev` | Auto-created on first use |
| Service password | `soleri-cognee-local` | Local-only default |

## Environment Variables

For production or remote Cognee instances, set these in your agent's `.env`:

```bash
# Required for remote endpoints
COGNEE_URL=https://cognee.your-domain.com
COGNEE_SERVICE_EMAIL=your-agent@your-domain.com
COGNEE_SERVICE_PASSWORD=your-secure-password

# Required for Cognee's LLM backend (embeddings)
LLM_API_KEY=your-openai-or-ollama-key

# Optional: database credentials (defaults: cognee/cognee)
COGNEE_DB_USER=cognee
COGNEE_DB_PASSWORD=cognee
COGNEE_DB_NAME=cognee
```

**Security note:** Default service credentials (`soleri-agent@cognee.dev`) are only accepted for `localhost`, `127.0.0.1`, and `::1` endpoints. Remote endpoints require explicit credentials.

## How Hybrid Search Works

When a vault search is performed, Soleri queries two sources in parallel:

```
┌─────────────┐     ┌──────────────────┐
│  FTS5 Search │     │  Cognee Search   │
│  (SQLite)    │     │  (Vector + Graph)│
└──────┬───────┘     └────────┬─────────┘
       │                      │
       └──────────┬───────────┘
                  │
          ┌───────▼──────────┐
          │  Score Merging   │
          │  (weighted rank) │
          └───────┬──────────┘
                  │
          ┌───────▼──────────┐
          │  Deduplicated    │
          │  Results         │
          └──────────────────┘
```

### Scoring Weights

Results from both sources are merged using configurable weights in the Brain module:

| Source | Default Weight | Strength |
|--------|---------------|----------|
| FTS5 | 0.4 | Exact keyword matches, fast |
| Cognee CHUNKS | 0.6 | Semantic similarity, handles synonyms |

The Brain can adjust these weights over time based on which source produces better results for your agent's domain.

### Fallback Behavior

| Cognee Status | Behavior |
|---------------|----------|
| Available | Hybrid search (FTS5 + Cognee) |
| Unavailable | FTS5-only (automatic, no errors) |
| Slow (>120s) | Times out gracefully, returns FTS5 results |
| Auth failed | Falls back to unauthenticated requests |

## Data Flow: Vault → Cognee

When vault entries are created or updated, Soleri syncs them to Cognee:

1. **Add** — Entries are uploaded to Cognee as text files via `/api/v1/add`
2. **Cognify** — After a debounce window (default 30s), Cognee processes the entries:
   - Generates vector embeddings
   - Builds knowledge graph relationships
   - Creates summaries and chunks
3. **Search** — Future vault searches include Cognee results

The debounce prevents redundant processing when many entries are ingested rapidly (e.g., during bulk import).

## Verification Steps

### Using `soleri doctor`

The CLI's `doctor` command checks Cognee connectivity:

```bash
soleri doctor
# Output includes:
# ✓ Cognee: available (latency: 45ms)
# or
# ✗ Cognee: unavailable (connection refused) — vault search will use FTS5 only
```

### Using the `cognee_status` Op

From any MCP client connected to your agent:

```json
{
  "facade": "admin",
  "op": "cognee_status"
}
```

Response:
```json
{
  "available": true,
  "url": "http://localhost:8000",
  "latencyMs": 42
}
```

### Manual Health Check

```bash
# Cognee API health
curl http://localhost:8000/

# Check Docker containers
docker compose -f docker/docker-compose.cognee.yml ps

# View Cognee logs
docker compose -f docker/docker-compose.cognee.yml logs cognee
```

## Troubleshooting

### Ollama Cold Start Timeouts

**Symptom:** First search after Cognee restart takes 90+ seconds or times out.

**Cause:** Cognee uses Ollama for embeddings by default. Ollama loads the model into GPU/CPU memory on first request ("cold start").

**Fix:**
- The default search timeout is 120s to accommodate this
- Warm up Cognee after start: `curl -X POST http://localhost:8000/api/v1/search -H 'Content-Type: application/json' -d '{"query":"warmup","search_type":"CHUNKS","datasets":["vault"]}'`
- For faster cold starts, use a smaller embedding model in Cognee's config

### Cognify Pipeline Stuck

**Symptom:** `cognify` returns but search doesn't find recently added entries.

**Cause:** The cognify pipeline (embedding + graph building) is async. Large batches take time.

**Fix:**
- Check pipeline status in Cognee logs: `docker compose -f docker/docker-compose.cognee.yml logs cognee --tail 50`
- Wait for processing to complete (typically 1-5 minutes for 100 entries)
- Re-trigger manually: call the `cognee_cognify` op or `POST /api/v1/cognify`

### Connection Refused

**Symptom:** `cognee_status` returns `{ available: false, error: "fetch failed" }`

**Fix:**
1. Check if containers are running: `docker compose -f docker/docker-compose.cognee.yml ps`
2. Check if pgvector is healthy (Cognee depends on it): `docker compose -f docker/docker-compose.cognee.yml logs pgvector`
3. Restart: `docker compose -f docker/docker-compose.cognee.yml down && docker compose -f docker/docker-compose.cognee.yml up -d`

### Auth Failures with Remote Endpoints

**Symptom:** Search returns empty results, logs show auth errors.

**Fix:**
- Ensure `COGNEE_SERVICE_EMAIL` and `COGNEE_SERVICE_PASSWORD` are set
- Default credentials are blocked for non-localhost URLs (security measure)
- Check that the Cognee instance has `AUTH_REQUIRED=true` and your credentials are registered

### Search Returns No Results

**Checklist:**
1. Is Cognee available? (`cognee_status`)
2. Were entries added? (Check Cognee dataset via API)
3. Was cognify run after adding? (Check debounce — default 30s delay)
4. Is the search type appropriate? (Default: `CHUNKS` for vector similarity)
5. Is the LLM_API_KEY set? (Required for embeddings)

## Configuration Reference

### CogneeConfig (TypeScript)

```typescript
interface CogneeConfig {
  baseUrl: string;           // Default: "http://localhost:8000"
  dataset: string;           // Default: "vault"
  apiToken?: string;         // Pre-set auth token (bypasses auto-login)
  serviceEmail?: string;     // Default: "soleri-agent@cognee.dev"
  servicePassword?: string;  // Default: "soleri-cognee-local"
  timeoutMs: number;         // Default: 30000 (30s)
  searchTimeoutMs: number;   // Default: 120000 (120s, Ollama cold start)
  healthTimeoutMs: number;   // Default: 5000 (5s)
  healthCacheTtlMs: number;  // Default: 60000 (1 min cache)
  cognifyDebounceMs: number; // Default: 30000 (30s debounce)
}
```

### Search Types

| Type | Description | Use When |
|------|-------------|----------|
| `CHUNKS` | Pure vector similarity (default) | General queries |
| `SUMMARIES` | Search over auto-generated summaries | High-level overview queries |
| `CHUNKS_LEXICAL` | Keyword-based search within Cognee | Exact term matching |
| `GRAPH_COMPLETION` | Knowledge graph traversal + LLM | Relationship queries (requires capable LLM) |
| `NATURAL_LANGUAGE` | Full NL understanding | Complex natural language queries |

**Recommendation:** Stick with `CHUNKS` (the default). `GRAPH_COMPLETION` requires a capable LLM (GPT-4 class) — small local models (llama3.2) cause infinite retries and timeouts.

### Docker Compose Services

```yaml
# docker/docker-compose.cognee.yml
services:
  cognee:        # Cognee API (port 8000)
  pgvector:      # PostgreSQL + pgvector (vector storage)
  falkordb:      # FalkorDB (knowledge graph)
```

Persistent volumes: `pgvector_data`, `falkordb_data` — data survives container restarts.
