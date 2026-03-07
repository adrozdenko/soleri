---
title: 'Cognee Integration'
description: 'Add vector search and knowledge graphs to your agent for deeper, semantic intelligence.'
---

Your agent's default search uses TF-IDF — fast, local, and effective for keyword-based queries. But when your knowledge base grows large or your queries become more conceptual, you might want something deeper. That's where Cognee comes in.

[Cognee](https://github.com/topoteretes/cognee) is an open-source knowledge graph engine. When integrated with your agent, it adds vector similarity search and graph-based knowledge connections on top of your existing vault.

## What Cognee adds

| Feature | Without Cognee | With Cognee |
|---------|---------------|-------------|
| **Search** | TF-IDF keyword matching | TF-IDF + vector similarity |
| **Connections** | Tags and domains | Knowledge graph relationships |
| **Conceptual queries** | Works if keywords match | Finds semantically related entries even without keyword overlap |

Example: without Cognee, searching "how to prevent data leaks" might miss an entry titled "Input Sanitization for Database Queries" because the keywords don't overlap. With Cognee's vector search, the semantic similarity between the concepts surfaces the connection.

## Setting up Cognee

Cognee runs as a separate service — locally or hosted. The simplest setup is local with Docker:

```bash
docker run -p 8000:8000 cognee/cognee:latest
```

Then configure your agent to connect:

> **You:** "Configure Cognee to connect to localhost:8000"
>
> **Agent:** _Cognee configured. Running health check... Available. Latency: 45ms._

### What happens during setup

1. The agent connects to the Cognee service
2. It authenticates (auto-registers a service account for local instances)
3. It creates a dataset in Cognee that maps to your vault
4. Existing vault entries are synced to Cognee for vector indexing

## How it works

Once connected, Cognee works alongside your existing search — not instead of it.

### Adding knowledge

When you capture a new pattern, the agent stores it in the vault (SQLite, local) and also sends the text to Cognee for vector indexing. The vault is always the source of truth; Cognee is an additional search layer.

### Cognify — building the graph

After adding entries, Cognee needs to process them into vector embeddings and graph connections. This is called the "cognify" step:

> **You:** "Run cognify on the vault dataset"
>
> **Agent:** _Processing 47 entries... Done. Knowledge graph updated._

**What happens during cognify:**

1. **Text extraction** — each entry's title, description, tags, and metadata are combined into a text document
2. **Vector embedding** — Cognee generates vector embeddings for each document (using a configured embedding model — local or hosted)
3. **Graph building** — Cognee creates nodes for each entry and edges for semantic relationships between them
4. **Indexing** — the vectors are indexed for fast similarity search

For a vault with ~100 entries, cognify typically takes 10-30 seconds locally, depending on your hardware and embedding model. Larger vaults (500+) may take a few minutes on first run.

The agent handles cognify automatically with debounced scheduling — multiple rapid captures coalesce into a single cognify call, so Cognee isn't overwhelmed by batch operations. You can also trigger it manually after bulk imports.

### Searching

When you search, the agent queries both TF-IDF (local) and Cognee (vector) and merges the results:

> **You:** "Search for patterns about preventing unauthorized access"
>
> **Agent:** _Found 5 results (vault + Cognee):_
>
> 1. **Always Validate Redirect URLs** (vault, critical) — score: 0.94
> 2. **JWT httpOnly Cookie Pattern** (vault, critical) — score: 0.88
> 3. **Input Sanitization for Database Queries** (Cognee, critical) — score: 0.82
> 4. **Rate Limiting on Auth Endpoints** (Cognee, warning) — score: 0.75
> 5. **Session Timeout Policy** (vault, suggestion) — score: 0.61

Results 3 and 4 might not have appeared in a pure keyword search — Cognee found them through semantic similarity.

## When to use Cognee

**Worth it when:**
- Your vault has 100+ entries and keyword search starts missing conceptual connections
- You frequently search with abstract queries ("how to improve reliability") rather than specific terms
- You want graph-based connections between related knowledge

**Not needed when:**
- Your vault is small (under 100 entries) — TF-IDF handles this well
- Your queries are specific ("JWT token storage") — keyword search is fast and accurate
- You want to stay fully local with zero external dependencies

## Staying local

Cognee can run entirely on your machine — no cloud required. The Docker setup uses local vector storage and can work with local LLM models (like Ollama) for embedding generation.

If you use a hosted Cognee instance, your knowledge entries are sent to that service for indexing. The agent requires explicit credentials for non-local endpoints — it won't accidentally send data to a remote service using default credentials.

## Checking status

> **You:** "What's the Cognee status?"
>
> **Agent:** _Cognee: available. URL: localhost:8000. Latency: 32ms. Dataset: vault. Last cognify: 2 hours ago._

If Cognee goes down, your agent continues working normally — searches fall back to vault-only TF-IDF. There's no hard dependency. When Cognee comes back, vector search resumes automatically.

---

_Next: [Team Workflows](/docs/guides/team-workflows/) — how teams share and grow a knowledge base together. For term definitions, see the [Glossary](/docs/glossary/)._
