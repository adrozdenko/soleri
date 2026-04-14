---
title: 'Entry Linking & Knowledge Graph'
description: 'Connect vault entries into a Zettelkasten with typed links, graph traversal, and automatic link suggestions.'
---

A vault full of isolated entries is a filing cabinet. A vault with links between entries is a knowledge graph. Soleri uses Zettelkasten principles: each entry is atomic (one idea), and entries are connected by typed, directional links that describe how ideas relate to each other.

## Link types

Every link has a type that describes the relationship:

| Type          | Meaning                                               | Example                                                    |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| extends       | Target builds on or refines the source                | "Rate Limiting Strategy" extends "API Security Basics"     |
| supports      | Target provides evidence or foundation for the source | "Load Test Results" supports "Caching Strategy"            |
| contradicts   | Target is an opposing approach or counterpoint         | "Microservices" contradicts "Monolith-First"               |
| sequences     | Source must happen before target                      | "Schema Migration" sequences "Deploy New API Version"      |

`contradicts` links are especially valuable. They surface anti-patterns automatically when you search for a pattern, so you see both sides of a decision.

## Creating links

After capturing two related entries, connect them:

> **You:** "Link the 'Optimistic Updates' entry to 'Error Recovery UX' as extends"
>
> **Agent:** _Linked: Optimistic Updates → Error Recovery UX (extends). Source now has 3 links._

You can add an optional note to explain why the link exists:

> **You:** "Link 'Database Indexing' to 'Query Performance' as supports, note: indexes are the primary lever for read performance"
>
> **Agent:** _Linked with note._

Links are directional (source points to target). But you can always see both outgoing links and incoming backlinks for any entry.

## Viewing links

See all connections for an entry:

> **You:** "Show links for the 'API Security Basics' entry"
>
> **Agent:** _Entry: API Security Basics_
>
> _Outgoing:_
> - extends → Rate Limiting Strategy
> - extends → Authentication Patterns
>
> _Incoming (backlinks):_
> - JWT Best Practices supports → this entry
>
> _Total: 3 links_

## Traversing the graph

The real value of a knowledge graph is traversal: following links to discover connected knowledge you might not have searched for directly.

> **You:** "Traverse from 'API Security Basics' with depth 2"
>
> **Agent:** _Starting from: API Security Basics_
> _Depth: 2 hops_
>
> _Connected entries:_
> 1. Rate Limiting Strategy (1 hop, extends)
> 2. Authentication Patterns (1 hop, extends)
> 3. JWT Best Practices (1 hop, backlink)
> 4. Token Rotation (2 hops, via JWT Best Practices)
> 5. Redis Rate Limiter (2 hops, via Rate Limiting Strategy)
>
> _5 entries found within 2 hops_

Traversal depth goes from 1 to 5 hops. Two hops is the default and usually the sweet spot. It's deep enough to find related context, shallow enough to stay relevant.

## Suggesting links

As your vault grows, you'll miss connections. The agent can find entries that are semantically similar and suggest links:

> **You:** "Suggest links for the 'Database Migration Safety' entry"
>
> **Agent:** _5 link candidates for "Database Migration Safety":_
>
> 1. Rollback Strategy (score: 0.89)
> 2. Zero-Downtime Deploys (score: 0.76)
> 3. Schema Versioning (score: 0.72)
> 4. Feature Flags for Data Changes (score: 0.65)
> 5. Backup Before Destructive Ops (score: 0.58)

Suggestions use FTS5 text similarity. They're fast and don't require an LLM call. Review the list and create links for the ones that make sense.

## Finding orphans

Orphan entries have zero links. They're disconnected from the graph. Periodic orphan checks keep your vault well-connected:

> **You:** "Find orphan entries"
>
> **Agent:** _12 entries with no links:_
>
> 1. CSS Grid vs Flexbox
> 2. Monitoring Alert Fatigue
> 3. Git Bisect Workflow
> ...

For each orphan, either link it to related entries or decide it's standalone knowledge that doesn't need connections.

## Bulk linking

### Backfill links

If you have a vault with many entries but few links, backfill creates links automatically using text similarity:

> **You:** "Backfill links for orphan entries"
>
> **Agent:** _Backfill complete: 34 links created across 12 entries. Threshold: 0.7, max 3 links per entry._

You can control the quality threshold (higher = more selective) and max links per entry. Use `dryRun: true` to preview what would be created before committing.

### Relink vault

For a deeper re-linking pass, `relink_vault` uses an LLM to evaluate entry pairs and create links with reasoning notes:

> **You:** "Relink the vault"
>
> **Agent:** _Relink complete:_
> - 150 entries processed
> - 87 candidates evaluated
> - 42 links created (with notes)
> - 45 pairs skipped (not meaningfully related)
> - Manual links preserved: 23

This is a heavier operation. It calls the LLM for each batch of candidates. Use it when you want high-quality links with explanations, not just similarity scores. Run with `dryRun: true` first to see the scope.

## Graph statistics

Get an overview of your knowledge graph health:

> **You:** "Show link stats"
>
> **Agent:**
> - 156 entries, 203 links, 8 orphans
> - By type: extends (89), supports (67), contradicts (23), sequences (24)
> - Links with notes: 42 (21%)
> - Most connected: "API Security Basics" (12 links)

A healthy vault has few orphans, a mix of link types, and `contradicts` links that surface trade-offs.

## Related guides

- [Building a Knowledge Base](/docs/guides/knowledge-base/) - what to capture before you start linking
- [Vault Branching](/docs/guides/vault-branching/) - experiment with link reorganization on a branch before merging
- [Content Ingestion](/docs/guides/content-ingestion/) - ingested entries benefit from linking to existing knowledge
- [Sync & Export](/docs/guides/vault-sync/) - knowledge packs export entries together with their links
- [Capabilities](/docs/capabilities/) - full list of linking operations
- [API Reference](/docs/api-reference/) - parameter details for `link_entries`, `traverse`, `suggest_links`, `get_orphans`, `backfill_links`, `relink_vault`

---

_Previous: [Vault Branching](/docs/guides/vault-branching/) - experiment with knowledge changes safely. Next: [Content Ingestion](/docs/guides/content-ingestion/) - feed articles and documents into your vault._
