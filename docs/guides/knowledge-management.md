# Knowledge Management Guide

Your agent learns from every session. This guide explains how to feed it, train it, and keep it sharp.

## The Rhythm

Every session follows the same cycle:

```
Search → Work → Capture → Curate → Dream → Repeat
```

1. **Search** the vault before making decisions
2. **Work** on the task — the agent uses vault knowledge automatically
3. **Capture** what you learned (patterns, anti-patterns, decisions)
4. **Curate** periodically — groom, deduplicate, resolve contradictions
5. **Dream** automatically — after 5+ sessions, the engine consolidates memory in the background

The more you capture, the smarter the next session gets. The dream cycle ensures memory stays clean as sessions accumulate.

## Starting a Session

On session start, call:

```
{agent}_core op:session_start params:{ projectPath: "." }
```

This starts a session for the project and loads context. The agent responds with a **session briefing** — recent captures, active plans, brain recommendations, and health warnings.

If the briefing is empty, you're in cold start. Start capturing.

## Searching Knowledge

Always search before deciding. The vault has patterns, anti-patterns, and rules from past sessions.

### Quick search

```
{agent}_vault op:search params:{ query: "error handling patterns", mode: "scan" }
```

`mode: "scan"` returns lightweight results (title + score + snippet). Fast and cheap on context.

### Load full entries

After scanning, load the ones that matter:

```
{agent}_vault op:load_entries params:{ ids: ["pattern-001", "pattern-002"] }
```

This is the **two-pass pattern**: scan first, load only what's relevant. Saves 60-80% context tokens.

### Brain recommendations

The brain surfaces patterns it thinks are relevant based on your recent work:

```
{agent}_brain op:recommend params:{ limit: 5 }
```

Recommendations improve with every feedback signal. If a recommendation helped, the brain learns. If you dismissed it, the brain learns that too.

## Capturing Knowledge

After learning something — a pattern, a gotcha, a decision — capture it:

### Standard capture

```
{agent}_vault op:capture_knowledge params:{
  title: "Always validate webhook signatures",
  type: "pattern",
  domain: "security",
  description: "Webhook endpoints must verify the signature header before processing. Without this, any attacker can send fake events.",
  severity: "critical",
  tags: ["webhooks", "security", "validation"],
  why: "Discovered during payment integration — unsigned webhooks caused duplicate charges."
}
```

Good entries have: a clear title, a "why" explanation, tags for discovery, and severity for prioritization.

### Quick capture

For rapid notes during work:

```
{agent}_vault op:capture_quick params:{
  title: "React useEffect cleanup prevents memory leaks",
  domain: "frontend"
}
```

Quick captures get auto-enriched later by the curator.

### What to capture

| Capture this                    | Skip this                       |
| ------------------------------- | ------------------------------- |
| Non-obvious gotchas             | Things the type checker catches |
| Patterns that worked            | One-time config changes         |
| Anti-patterns that burned you   | Values already in files         |
| Architectural decisions and why | Solved-and-done fixes           |
| Cross-cutting concerns          | Ephemeral task details          |

**Rule of thumb**: if you'd explain it to a new team member, capture it.

## Training the Brain

The brain learns from four signals:

1. **Usage** — patterns you search for and reference get stronger
2. **Feedback** — explicit "this helped" / "this was wrong" signals
3. **Spread** — patterns used across multiple projects get promoted
4. **Recency** — recently used patterns rank higher

### Give feedback

After the brain recommends something useful:

```
{agent}_brain op:feedback params:{
  entryId: "pattern-001",
  action: "accepted",
  confidence: 0.9
}
```

Actions: `accepted` (helped), `dismissed` (not relevant), `modified` (partially useful).

### Check pattern strengths

See what the brain considers strong vs weak:

```
{agent}_brain op:strengths params:{ limit: 10 }
```

Returns patterns with 4-signal strength scores. Patterns below 0.3 are candidates for review or removal.

### Build intelligence

Periodically run the full learning pipeline:

```
{agent}_brain op:build_intelligence
```

This recomputes: strength scores, global pattern registry, domain profiles. Takes a few seconds.

## The Learning Radar

The radar automatically detects learning moments from your sessions:

- **Corrections** — you told the agent it was wrong
- **Search misses** — vault search returned nothing useful
- **Workarounds** — you did something the hard way (vault had no pattern for it)
- **Repeated questions** — you asked the same thing across sessions

### Review radar candidates

```
{agent}_brain op:radar_candidates
```

Returns proposed captures with confidence scores. High confidence (>0.8) are auto-captured. Medium (0.4-0.8) are queued for your review.

### Approve or dismiss

```
{agent}_brain op:radar_approve params:{ candidateId: "radar-001" }
{agent}_brain op:radar_dismiss params:{ candidateId: "radar-002" }
```

Approved candidates become vault entries. Dismissed ones train the radar to be less noisy.

## Curating Knowledge

Vaults grow. Without curation, they get noisy — duplicates, contradictions, stale entries. Curate monthly or when vault health drops.

### Health check

```
{agent}_curator op:curator_health_audit
```

Returns a score (0-100) and recommendations. Below 70 means the vault needs attention.

### Detect duplicates

```
{agent}_curator op:curator_detect_duplicates
```

Uses TF-IDF cosine similarity to find entries that say the same thing differently. Review and merge.

### Find contradictions

```
{agent}_curator op:curator_contradictions
```

Finds pattern/anti-pattern pairs that contradict each other. Resolve or dismiss:

```
{agent}_curator op:curator_resolve_contradiction params:{
  id: 42,
  resolution: "keep_both",
  reason: "They apply to different contexts — pattern for APIs, anti-pattern for event handlers."
}
```

### Groom all

Run the full grooming pipeline:

```
{agent}_curator op:curator_groom_all
```

Normalizes tags, trims whitespace, fixes severity levels, updates content hashes.

### Consolidate

For deep cleanup — removes confirmed duplicates and archives stale entries:

```
{agent}_curator op:curator_consolidate params:{ dryRun: true }
```

Always dry-run first. Review what would be removed, then run with `dryRun: false`.

## Dream — Automatic Memory Consolidation

The dream module runs the full curator pipeline automatically, so you don't have to remember to curate manually. Inspired by how the brain consolidates memories during REM sleep.

### How it works

Every `session_start` increments a dream counter. When two conditions are met, the engine auto-dreams in the background:

- **5+ sessions** since last dream
- **24+ hours** since last dream

The dream pass runs: dedup, archive stale entries (>90 days), detect contradictions — then resets the counter.

### Manual dream

Force a dream anytime with the `/dream` skill or directly:

```
{agent}_dream op:dream_run params:{ force: true }
```

### Check dream status

```
{agent}_dream op:dream_status
```

Returns: sessions since last dream, last dream timestamp, total dreams, gate eligibility.

### Check gate conditions

```
{agent}_dream op:dream_check_gate
```

Returns whether auto-dream would trigger on the next session start.

### Dream report

After a dream run, you get:

| Metric | Description |
| --- | --- |
| `duplicatesFound` | Entries removed as duplicates |
| `staleArchived` | Entries archived (unchanged >90 days) |
| `contradictionsFound` | Pattern/anti-pattern conflicts detected |
| `durationMs` | How long the dream took |
| `totalDreams` | Lifetime dream count |

### When to force a dream

- After a heavy capture session (10+ new entries)
- Before a major planning session (clean vault = better recommendations)
- When vault health score drops below 70
- After importing external knowledge (`ingest_url`, `ingest_batch`)

## Linking Knowledge (Zettelkasten)

Entries are more valuable when connected. The vault supports bidirectional links:

### Auto-suggest links

```
{agent}_vault op:suggest_links params:{ entryId: "pattern-001", limit: 5 }
```

Returns related entries with suggested link types (related, contradicts, sequences, refines).

### Create links

```
{agent}_vault op:link_entries params:{
  sourceId: "pattern-001",
  targetId: "anti-pattern-002",
  type: "contradicts",
  reason: "Same domain, opposite advice"
}
```

### Traverse the graph

```
{agent}_vault op:traverse params:{ entryId: "pattern-001", depth: 2 }
```

Returns all entries within 2 hops. Useful for understanding a topic's full context.

### Find orphans

```
{agent}_vault op:get_orphans
```

Entries with zero links. Good candidates for linking or removal.

## Session Memory

The agent remembers across sessions. Session capture preserves context:

### Capture session summary

```
{agent}_memory op:session_capture params:{
  summary: "Implemented webhook signature verification for Stripe integration.",
  intent: "fix",
  decisions: ["Used HMAC-SHA256 for signature verification", "Added replay protection with timestamp check"],
  nextSteps: ["Add unit tests for edge cases", "Document webhook setup in README"]
}
```

### Search past sessions

```
{agent}_memory op:memory_search params:{ query: "webhook", crossProject: true }
```

`crossProject: true` searches across all registered projects — useful for patterns that apply everywhere.

### Promote to global

If a pattern applies to all your projects:

```
{agent}_memory op:promote_to_global params:{ memoryId: "mem-001" }
```

Global patterns appear in every project's brain recommendations.

## Synthesizing Knowledge

Turn vault knowledge into readable output:

```
{agent}_brain op:synthesize params:{
  query: "What do we know about error handling?",
  format: "brief",
  audience: "technical"
}
```

Formats: `brief` (2-3 paragraphs), `outline` (structured bullet points), `talking-points` (for presentations), `post-draft` (blog post format).

## Governance

Control what gets captured and how:

```
{agent}_control op:governance_policy params:{ op: "get" }
```

Presets: `strict` (all captures reviewed), `moderate` (auto-capture high confidence, review medium), `permissive` (auto-capture everything).

Set a preset:

```
{agent}_control op:governance_policy params:{ op: "apply_preset", preset: "moderate" }
```

## Quick Reference

### Every session

| When            | Op                      | Why                          |
| --------------- | ----------------------- | ---------------------------- |
| Start           | `register`              | Load project context         |
| Start (auto)    | `dream_check_gate`      | Auto-dream if gate conditions met |
| Before deciding | `search` or `recommend` | Check existing knowledge     |
| After learning  | `capture_knowledge`     | Persist the insight          |
| End of session  | `session_capture`       | Save session context         |

### Weekly

| When            | Op                     | Why                  |
| --------------- | ---------------------- | -------------------- |
| Monday          | `curator_health_audit` | Check vault quality  |
| When score < 70 | `curator_groom_all`    | Clean up entries     |
| After grooming  | `build_intelligence`   | Rebuild brain scores |

### Automatic (every 5+ sessions / 24h)

| When | Op | Why |
| --- | --- | --- |
| Session start | `dream_run` (auto) | Consolidate memory in background |
| On demand | `dream_run` (force) | Force cleanup before heavy work |
| Check status | `dream_status` | See when last dream ran |

### Monthly

| When           | Op                              | Why                     |
| -------------- | ------------------------------- | ----------------------- |
| First of month | `curator_detect_duplicates`     | Find redundancy         |
| After dedup    | `curator_consolidate` (dry-run) | Plan cleanup            |
| After review   | `curator_consolidate` (real)    | Execute cleanup         |
| After cleanup  | `radar_candidates`              | Review pending captures |

## Vector Embeddings

Soleri supports dense vector embeddings for semantic search. When enabled, vault search combines keyword matching (FTS5) with vector similarity for more accurate results.

### Setup

1. Sign up at [voyageai.com](https://voyageai.com) for an API key (200M free tokens included)
2. Set the environment variable:
   ```bash
   export VOYAGE_API_KEY=your-key-here
   ```
3. Enable embeddings via feature flag:
   ```bash
   export SOLERI_FLAG_EMBEDDING_ENABLED=true
   ```

### How it works

Soleri uses Voyage AI's `voyage-3.5` model (1024 dimensions) for dense vector embeddings.

- New vault entries are automatically embedded on ingest (best-effort, non-blocking)
- Search uses hybrid FTS5 + vector scoring -- both keywords and semantic similarity
- The brain auto-adapts: when embeddings are available, vector weight activates at 0.15

You don't need to change how you search. The vault detects whether embeddings exist and blends them into results automatically.

### Backfill existing entries

Entries created before embeddings were enabled won't have vectors. Use `embed_rebuild` to backfill:

```
{agent}_embedding op:embed_rebuild
```

This embeds all vault entries that don't have vectors yet. It's idempotent -- safe to run multiple times.

Check progress:

```
{agent}_embedding op:embed_status
```

### Cost

Voyage AI gives 200M free tokens per account. The math works out well:

- Average vault entry is ~200 tokens
- A vault with 1,000 entries costs ~200K tokens to fully embed
- That's 0.1% of the free tier

For most users, the free tier is more than enough. You'd need roughly 1M vault entries to exhaust it.
