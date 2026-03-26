---
title: Cognee Integration (Removed)
description: Cognee vector search was removed in v9.3. The vault now uses SQLite FTS5 with TF-IDF scoring exclusively.
---

:::caution[Removed Feature]
Cognee integration was removed in Soleri v9.3.0. The vault now uses **SQLite FTS5 with TF-IDF scoring** exclusively — no external services required.

The built-in search combines:
- **FTS5** full-text search with BM25 ranking
- **TF-IDF** term frequency scoring
- **6-dimension hybrid scoring** (semantic, severity, temporal decay, tag overlap, domain match)

This provides fast, accurate search without API keys or external dependencies.
:::

See [Knowledge Base](/docs/guides/knowledge-base/) for how search works.
