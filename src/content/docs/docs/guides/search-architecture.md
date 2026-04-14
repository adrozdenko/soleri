---
title: 'Search Architecture'
description: 'How vault search works: FTS5, hybrid scoring, vector recall, federated tiers, and adaptive weights.'
---

Vault search is a multi-layer pipeline that combines full-text search, sparse TF-IDF scoring, optional dense vector embeddings, and seven weighted relevance signals.

For a quick overview, see [Under the Hood](/docs/guides/under-the-hood/#how-search-works).

## The pipeline

A search query flows through four layers:

```
Query (search_intelligent op)
  → Facade (mode selection, filters)
    → Brain (scoring, hybrid ranking)
      → VaultManager (federated tier search)
        → SQLite FTS5 + optional vector recall
```

Each layer adds precision. FTS5 provides broad recall, the brain provides relevance ranking, and the vault manager federates across multiple knowledge sources.

## Two-pass retrieval

Search supports two modes to keep context lean:

| Mode | Returns | Use case |
| ---- | ------- | -------- |
| `scan` | Lightweight results: title, score, snippet, token estimate | Browsing, triage |
| `full` | Complete entries with score breakdowns | Deep reads, planning |

The recommended workflow is to scan first, pick the top 2-4 results by score, then load only those entries. This avoids flooding context with entries you don't need.

```
"Search for authentication patterns"     → scan (10 lightweight results)
"Load entries auth-jwt-001, auth-002"    → full (2 complete entries)
```

## Layer 1: SQLite FTS5

The vault stores entries in a SQLite database with an FTS5 virtual table:

```sql
CREATE VIRTUAL TABLE entries_fts USING fts5(
  id, title, description, context, tags,
  content='entries', content_rowid='rowid',
  tokenize='porter unicode61'
);
```

Porter stemming reduces words to their root form (`authentication` and `authenticating` both match). Unicode normalization handles accented characters and non-Latin scripts.

### Query transformation

Your natural-language query gets transformed before hitting FTS5:

1. Split on whitespace and punctuation (hyphens, underscores, dots, slashes)
2. Lowercased
3. Non-alphanumeric characters stripped from each term
4. Terms shorter than 2 characters dropped
5. Joined with `OR` for broad matching

Note: stop words are **not** removed at the FTS5 query level. Stop word removal only happens in the TF-IDF tokenizer used by the brain's semantic scoring layer (see [Semantic scoring](#semantic-scoring-tf-idf) below).

A query like "how does JWT validation work" becomes `how OR does OR jwt OR validation OR work`.

### BM25 ranking

FTS5 results are ranked using BM25 with per-field weights:

| Field | Weight | Why |
| ----- | ------ | --- |
| title | 10.0 | Title matches are the strongest signal |
| id | 5.0 | Entry IDs often contain meaningful slugs |
| description | 3.0 | The main content body |
| tags | 2.0 | Tag matches indicate topical relevance |
| context | 1.0 | Context is supplementary |

If BM25 is unavailable (older SQLite builds), search falls back to the default FTS5 rank function.

## Layer 2: VaultManager (federation)

The vault manager searches across multiple tiers, which are separate SQLite databases with different scopes:

| Tier | Scope | Priority weight |
| ---- | ----- | --------------- |
| `agent` | Knowledge specific to this agent | 1.0 (highest) |
| `project` | Shared across agents in a project | 0.8 |
| `team` | Shared across team members | 0.6 |

Each tier is searched independently. Results are then:

1. Weighted by tier priority
2. Deduplicated. If the same entry exists in multiple tiers, the highest-priority version wins
3. Merged into a single result set, sorted by weighted score

This means an agent-level pattern always outranks the same pattern at team level.

## Layer 3: Brain scoring

FTS5 gives us broad recall. The brain turns it into precise relevance ranking.

### Over-fetching

The brain requests 3x the desired limit (or 30 results, whichever is larger) from FTS5. This provides headroom. Many entries that rank well in FTS5 may score poorly on other signals. Over-fetching ensures the final top-N are the best matches across all factors.

### Seven scoring signals

Every result is scored across seven factors:

| Signal | Weight (FTS only) | Weight (hybrid) | How it works |
| ------ | ----------------- | --------------- | ------------ |
| Semantic | 0.35 | 0.20 | TF-IDF cosine similarity between query and entry |
| Vector | 0.00 | 0.15 | Dense embedding cosine similarity |
| Severity | 0.10 | 0.10 | critical = 1.0, warning = 0.7, suggestion = 0.4 |
| Temporal decay | 0.10 | 0.10 | Exponential decay with 365-day half-life |
| Tag overlap | 0.10 | 0.10 | Jaccard similarity between query tags and entry tags |
| Domain match | 0.10 | 0.10 | 1.0 if the query domain matches the entry domain, 0.0 otherwise |
| Graph proximity | 0.15 | 0.15 | Link-graph distance between query-relevant entries and this entry |

The total score is the weighted sum of all factors.

### Semantic scoring (TF-IDF)

The brain maintains a TF-IDF vocabulary across all vault entries:

1. Vocabulary building: tokenizes every entry (title + description + context + tags), computes IDF for each term: `IDF = log((docCount + 1) / (df + 1)) + 1`
2. Query vector: tokenizes the query using the same rules, computes a TF-IDF vector
3. Entry vectors: each entry gets a TF-IDF vector using the same vocabulary
4. Cosine similarity: the dot product of query and entry vectors, normalized by their magnitudes

This is why rare terms are more valuable than common ones. "JWT" carries more weight than "the" because it appears in fewer entries.

### Temporal decay

Entries lose relevance over time:

Without a validity window:

```
decay = exp(-ln(2) * age / halfLife)
```

Half-life is 365 days. An entry scores 1.0 when new, 0.5 after one year, 0.25 after two years.

With a validity window (entries that have `valid_from`/`valid_until` dates):

```
decayZone = totalWindow * 0.25
if remaining > decayZone: decay = 1.0  (first 75% of the window)
else: decay = remaining / decayZone    (linear ramp-down in last 25%)
```

In other words, an entry stays at full strength for the first 75% of its validity window, then linearly drops to zero over the final 25%.

### Adaptive weights

After 30+ feedback entries (excluding `failed` actions, which are system errors), the brain adjusts its scoring weights:

- `accepted` counts as 1.0 positive, `modified` counts as 0.5 positive (user adjusted but didn't dismiss), `dismissed` counts as 0.0
- Accept rate = `(accepted + modified * 0.5) / totalFeedback`
- High accept rate (>50%): increase semantic weight (up to +0.15)
- Low accept rate (<50%): decrease semantic weight (down to -0.15)
- Other weights (severity, temporalDecay, tagOverlap, domainMatch, graphProximity) scale proportionally to maintain a sum of 1.0

This means the search system learns from your usage. If you consistently prefer tag-matched results over text-matched ones, the weights shift accordingly.

### Small corpus guard

If the vault has fewer than 50 FTS results and filtering to the requested limit would discard more than 50% of results, the brain returns all results instead. This prevents over-aggressive filtering on small knowledge bases where every entry matters.

## Layer 4: Vector search (optional)

When an embedding provider is configured, search adds a dense vector recall phase:

### How it works

1. Query embedding: the query is embedded into a dense vector (e.g., 1536 dimensions for OpenAI models)
2. Cosine search: brute-force similarity computation against all stored entry vectors
3. Candidate merging: entries found by vector search but missed by FTS5 are added to the candidate pool
4. Score integration: vector similarity becomes a scoring signal (0.15 weight in hybrid mode)

### Vector storage

Dense vectors are stored as binary float32 blobs in an `entry_vectors` table with `entry_id TEXT PRIMARY KEY`. Each entry stores exactly one vector. If you switch embedding models, the old vector is overwritten via upsert.

### Performance

For vaults under 100K entries, brute-force cosine search completes in approximately 50ms. No approximate nearest-neighbor index is needed at this scale.

### Embedding pipeline

New entries are automatically embedded in batches of 100. Only the title, description, and context fields are embedded (not full entry content). Entries that already have vectors for the active model are skipped.

## Configuring embedding providers

Vector search is optional and off by default. To enable it, you need two things: an `embedding` block in your `agent.yaml`, and the `embedding-enabled` feature flag turned on.

### Supported providers

| Provider | Default model | Dimensions | Default batch size | API key source |
| -------- | ------------- | ---------- | ------------------ | -------------- |
| `openai` | `text-embedding-3-small` | 1536 | 2048 | OpenAI key pool (same keys your LLM uses) |
| `voyage` | `voyage-3.5` | 1024 | 128 | `VOYAGE_API_KEY` env var or explicit `apiKey` |

More providers (like Ollama for local embeddings) can be added, but these two ship today.

### agent.yaml configuration

Add an `embedding` block at the top level of your `agent.yaml`:

```yaml
embedding:
  provider: openai
  model: text-embedding-3-small
```

Or for Voyage AI:

```yaml
embedding:
  provider: voyage
  model: voyage-3.5
```

The full set of options:

| Field | Required | Description |
| ----- | -------- | ----------- |
| `provider` | Yes | `openai` or `voyage` |
| `model` | Yes | Model identifier for the provider |
| `apiKey` | No | Explicit API key (otherwise uses key pool or env var) |
| `baseUrl` | No | Override the API endpoint (useful for proxies or self-hosted instances) |
| `batchSize` | No | Max texts per API call (defaults vary by provider) |
| `inputType` | No | `document` or `query`, relevant for Voyage which optimizes differently for each |

### Environment variables

For OpenAI, the provider uses the same key pool as your LLM calls, so no extra env var is needed if you already have `OPENAI_API_KEY` configured.

For Voyage, set `VOYAGE_API_KEY` in your environment. The provider checks this automatically when no explicit `apiKey` is set in the config.

### How embedding works at runtime

When both the config and feature flag are present, the engine initializes the embedding provider at startup. New vault entries get embedded automatically in batches of 100 (only title, description, and context fields). Entries that already have a vector for the active model are skipped.

If you switch models, old vectors are overwritten via upsert the next time the pipeline runs. If the provider fails to initialize (bad key, network issues), the engine logs a warning and continues without embeddings. The brain's vector weight stays at 0.0, and search falls back to pure FTS5 + TF-IDF scoring.

Both providers handle rate limiting with automatic retry (up to 3 attempts) and key rotation on 429 responses when multiple keys are available in the pool.

## Result format

### Full mode

```typescript
{
  entry: IntelligenceEntry,  // Complete entry object
  score: number,             // Total weighted score
  breakdown: {               // Per-factor scores
    semantic: number,
    vector: number,
    severity: number,
    temporalDecay: number,
    tagOverlap: number,
    domainMatch: number,
    graphProximity: number,
    total: number
  }
}
```

### Scan mode

```typescript
{
  id: string,
  title: string,
  score: number,
  type: string,
  domain: string,
  severity: string,         // 'critical' | 'warning' | 'suggestion'
  tags: string[],
  snippet: string,          // First 120 chars of description
  tokenEstimate: number     // Rough token count (chars / 4)
}
```

## Memory search

Memory entries (session history, captured context) are searched separately using the same FTS5 engine. Memory results are merged with vault results and sorted by score. Memory entries use a fixed score of 0.5 as a baseline.

## Key files

| File | Role |
| ---- | ---- |
| `packages/core/src/runtime/capture-ops.ts` | `search_intelligent` facade op |
| `packages/core/src/brain/brain.ts` | Scoring, TF-IDF, hybrid ranking |
| `packages/core/src/vault/vault-manager.ts` | Federated tier search |
| `packages/core/src/vault/vault-entries.ts` | FTS5 queries, vector cosine search |
| `packages/core/src/persistence/sqlite-provider.ts` | SQLite FTS5 implementation |
| `packages/core/src/vault/vault-schema.ts` | FTS5 table schema |
| `packages/core/src/embeddings/pipeline.ts` | Batch embedding pipeline |

---

_Next: [Security & Privacy](/docs/guides/security/) - understand where your data lives and who can access it._
