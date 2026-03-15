---
name: knowledge-harvest
description: Use when the user says "learn from this", "extract patterns", "harvest knowledge", "ingest this document", "read this and capture", "populate vault from", or points at code, docs, PRs, or any text and wants the agent to automatically extract and capture patterns, anti-patterns, and decisions into the vault.
---

# Knowledge Harvest — Extract Patterns From Anything

Point at code, docs, PRs, architecture decisions, postmortems, or any text — the agent reads it, extracts every pattern, anti-pattern, decision, and principle, then captures them all to the vault. Zero-friction knowledge population.

## When to Use

- "Learn from this file" / "Extract patterns from this codebase"
- "Read our architecture doc and capture everything"
- "Harvest knowledge from this PR"
- "Ingest this post-mortem"
- Populating a fresh vault with existing team knowledge

## The Magic: Automated Knowledge Extraction

### Step 1: Understand the Source

Read the target content (code, docs, etc.) and classify what type of knowledge it contains:

```
salvador_core op:route_intent
  params: { prompt: "Extract knowledge from: <source description>" }
```

### Step 2: Check What's Already Known

Before extracting, search the vault to avoid duplicates:

```
salvador_core op:search_intelligent
  params: { query: "<topic of the source material>" }
```

```
salvador_core op:vault_tags
```

```
salvador_core op:vault_domains
```

This tells you what the vault already covers — focus extraction on gaps.

### Step 3: Extract and Classify

Read through the source material and identify:

| Type             | What to Look For                                       |
| ---------------- | ------------------------------------------------------ |
| **pattern**      | "We always do X because Y" — repeatable approaches     |
| **anti-pattern** | "Don't do X because Y" — known mistakes                |
| **decision**     | "We chose X over Y because Z" — architectural choices  |
| **principle**    | "We believe X" — guiding rules                         |
| **workflow**     | "The process for X is: step 1, step 2..." — procedures |

For each extracted item, determine:

- **Category**: Which domain it belongs to
- **Severity**: critical / warning / suggestion
- **Tags**: Searchable keywords

### Step 4: Batch Capture

For each extracted item, capture to the vault:

```
salvador_core op:capture_knowledge
  params: {
    title: "<clear, searchable name>",
    description: "<what it is, when to apply, why it matters>",
    type: "<pattern|anti-pattern|decision|principle|workflow>",
    category: "<domain>",
    tags: ["<tag1>", "<tag2>"],
    severity: "<critical|warning|suggestion>",
    example: "<code snippet or quote from source>",
    why: "<reasoning>"
  }
```

Present each capture to the user as you go:

```
Captured: api-auth-jwt (pattern, critical)
  → "Use short-lived JWTs for authentication"
  Auto-tags: auth, jwt, security
```

### Step 5: Post-Harvest Quality

After all items captured, run quality checks:

**Detect any duplicates created during harvest:**

```
salvador_core op:curator_detect_duplicates
```

**Groom all new entries — normalize tags, fix metadata:**

```
salvador_core op:curator_groom_all
```

**Enrich entries with additional context:**

```
salvador_core op:curator_enrich
  params: { entryId: "<id>" }
```

**Check for contradictions with existing knowledge:**

```
salvador_core op:curator_contradictions
```

### Step 6: Verify Harvest Results

Check vault health after the harvest:

```
salvador_core op:admin_health
```

```
salvador_core op:admin_vault_analytics
```

Present a summary:

```
## Harvest Complete

Source: [file/doc name]
Extracted: X entries
  - Y patterns
  - Z anti-patterns
  - W decisions
  - V principles

Duplicates found: N (merged/skipped)
Contradictions found: N (flagged for review)
Vault health: OK
```

### Step 7: Promote Universal Patterns (Optional)

If any extracted patterns apply across projects:

```
salvador_core op:memory_promote_to_global
  params: { entryId: "<id>" }
```

## The Magic

This feels like magic because the user points at a 50-page architecture doc and says "learn from this" — and 2 minutes later, the vault has 30 classified, tagged, searchable patterns that inform every future conversation. The agent didn't just read the doc — it understood it, classified it, deduplicated it, and made it permanent.

## Tips for Best Results

- **Start with your team's top 10 decisions** — the ones people keep asking about
- **Feed postmortems** — they're goldmines of anti-patterns
- **Feed architecture decision records (ADRs)** — pure decision captures
- **Feed code review comments** — patterns that reviewers enforce repeatedly
- **Feed onboarding docs** — principles that new team members need to learn

## Agent Tools Reference

| Op                             | When to Use                            |
| ------------------------------ | -------------------------------------- |
| `route_intent`                 | Classify the source material           |
| `search_intelligent`           | Check for existing knowledge           |
| `vault_tags` / `vault_domains` | See what's already covered             |
| `capture_knowledge`            | Capture each extracted item            |
| `curator_detect_duplicates`    | Find duplicates post-harvest           |
| `curator_groom_all`            | Normalize all new entries              |
| `curator_enrich`               | LLM-enrich entries                     |
| `curator_contradictions`       | Find conflicts with existing knowledge |
| `memory_promote_to_global`     | Share universal patterns cross-project |
| `admin_health`                 | Post-harvest health check              |
| `admin_vault_analytics`        | Knowledge quality metrics              |
