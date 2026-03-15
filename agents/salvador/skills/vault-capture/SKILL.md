---
name: vault-capture
description: Use when the user says "capture this", "save to vault", "remember this pattern", "log this anti-pattern", "store this knowledge", "add to vault", "capture what we learned", or wants to persist a pattern, anti-pattern, workflow, or principle to the knowledge base.
---

# Vault Capture — Persist Knowledge

Capture patterns, anti-patterns, workflows, and principles to the vault. Captured knowledge compounds — it informs future vault searches, brain recommendations, and team reviews.

## When to Use

After discovering something worth remembering: a solution that worked, a mistake to avoid, a workflow that proved effective, or a principle that should guide future work.

## Orchestration Sequence

### Step 1: Check for Duplicates

Call `salvador_core op:search_intelligent` with the knowledge title or description. If a similar entry exists, consider updating it instead of creating a duplicate.

```
salvador_core op:search_intelligent
  params: { query: "<knowledge title or description>" }
```

Also run duplicate detection explicitly:

```
salvador_core op:curator_detect_duplicates
```

If duplicates are found, decide: update the existing entry or merge them.

### Step 2: Classify the Knowledge

Determine the entry type:

- **pattern** — Something that works and should be repeated
- **anti-pattern** — Something that fails and should be avoided
- **workflow** — A sequence of steps for a specific task
- **principle** — A guiding rule or heuristic
- **decision** — An architectural or design choice with rationale

Use intent routing to help classify:

```
salvador_core op:route_intent
  params: { prompt: "<description of the knowledge>" }
```

### Step 3: Capture

For quick, single-entry captures:
Call `salvador_core op:capture_knowledge` with:

- **title**: Clear, searchable name
- **description**: What it is and when it applies
- **type**: From Step 2 classification
- **category**: Domain area (e.g., "component-patterns", "api-design", "infrastructure")
- **tags**: Searchable keywords
- **example**: Code snippet or before/after if applicable
- **why**: The reasoning — this is what makes the entry actionable

```
salvador_core op:capture_knowledge
  params: {
    title: "<clear, searchable name>",
    description: "<what it is and when it applies>",
    type: "<pattern|anti-pattern|workflow|principle|decision>",
    category: "<domain area>",
    tags: ["<tag1>", "<tag2>"],
    example: "<code or before/after>",
    why: "<reasoning>"
  }
```

For quick captures:

```
salvador_core op:capture_quick
  params: { title: "<name>", description: "<details>" }
```

### Step 4: Post-Capture Quality

After capturing, run the curator to ensure quality:

**Groom the entry** — normalize tags, fix metadata:

```
salvador_core op:curator_groom
  params: { entryId: "<captured entry id>" }
```

**Enrich the entry** — use LLM to add context, improve description:

```
salvador_core op:curator_enrich
  params: { entryId: "<captured entry id>" }
```

**Check for contradictions** — does this conflict with existing knowledge?

```
salvador_core op:curator_contradictions
```

If contradictions found, resolve them:

```
salvador_core op:curator_resolve_contradiction
  params: { contradictionId: "<id>" }
```

### Step 5: Handle Governance (if enabled)

If governance policy requires review, the capture returns a `proposalId`. The entry is queued for approval.

```
salvador_core op:governance_proposals
  params: { action: "list" }
```

Present pending proposals to the user for approval.

### Step 6: Promote to Global (Optional)

If the knowledge applies across projects (not project-specific):

```
salvador_core op:memory_promote_to_global
  params: { entryId: "<entry id>" }
```

This makes it available in cross-project searches and brain recommendations.

### Step 7: Verify Health

Confirm the capture was stored and vault health is maintained:

```
salvador_core op:admin_health
```

Check vault analytics for overall knowledge quality:

```
salvador_core op:admin_vault_analytics
```

## Exit Criteria

Capture is complete when: the entry is stored (or queued for review), categorized, tagged, groomed, and vault health confirmed. If promoted to global, cross-project availability is verified.

## Agent Tools Reference

| Op                              | When to Use                         |
| ------------------------------- | ----------------------------------- |
| `search_intelligent`            | Check for duplicates before capture |
| `curator_detect_duplicates`     | Explicit duplicate detection        |
| `route_intent`                  | Help classify knowledge type        |
| `capture_knowledge`             | Full-metadata capture               |
| `capture_quick`                 | Fast capture for simple entries     |
| `curator_groom`                 | Normalize tags and metadata         |
| `curator_enrich`                | LLM-powered metadata enrichment     |
| `curator_contradictions`        | Find conflicting entries            |
| `curator_resolve_contradiction` | Resolve conflicts                   |
| `governance_proposals`          | Check/manage approval queue         |
| `memory_promote_to_global`      | Share across projects               |
| `admin_health`                  | Verify system health                |
| `admin_vault_analytics`         | Overall knowledge quality metrics   |
