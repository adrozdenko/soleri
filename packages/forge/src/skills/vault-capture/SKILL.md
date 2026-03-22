---
name: vault-capture
description: >
  Use to capture a SINGLE known pattern, anti-pattern, workflow, decision, or principle to the
  vault. Triggers on "save this", "capture this", "remember this pattern", "add to vault". The
  user already knows what to capture. For bulk extraction from documents, code, or PRs, use
  knowledge-harvest instead.
---

# Vault Capture — Persist Knowledge

Capture patterns, anti-patterns, workflows, and principles to the vault. Captured knowledge compounds — it informs future searches, brain recommendations, and team reviews.

## Steps

### 1. Check for Duplicates

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<knowledge title or description>" }
YOUR_AGENT_core op:curator_detect_duplicates
```

If similar entry exists, update it instead of creating a duplicate.

### 2. Classify the Knowledge

| Type | Description |
|------|-------------|
| **pattern** | Works and should be repeated |
| **anti-pattern** | Fails and should be avoided |
| **workflow** | Steps for a specific task |
| **principle** | Guiding rule or heuristic |
| **decision** | Architectural choice with rationale |

### 3. Capture

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "<clear, searchable name>",
    description: "<what it is and when it applies>",
    type: "<pattern|anti-pattern|workflow|principle|decision>",
    category: "<domain>",
    tags: ["<tag1>", "<tag2>"],
    example: "<code or before/after>",
    why: "<reasoning>"
  }
```

For quick captures: `YOUR_AGENT_core op:capture_quick params: { title: "<name>", description: "<details>" }`

### 4. Post-Capture Quality

- `op:curator_groom params: { entryId: "<id>" }` — normalize tags
- `op:curator_enrich params: { entryId: "<id>" }` — LLM enrichment
- `op:curator_contradictions` — check for conflicts

### 5. Governance (if enabled)

If capture returns a `proposalId`, entry is queued: `op:governance_proposals params: { action: "list" }`.

### 6. Promote to Global (Optional)

For cross-project knowledge: `op:memory_promote_to_global params: { entryId: "<id>" }`.

### 7. Verify

`op:admin_health` and `op:admin_vault_analytics` to confirm storage and quality.

## Common Mistakes

- Not checking for duplicates before capturing
- Missing the `why` field (makes entries not actionable)
- Skipping post-capture grooming (tags stay unnormalized)

## Quick Reference

| Op | When to Use |
|----|-------------|
| `search_intelligent` | Check for duplicates |
| `capture_knowledge` / `capture_quick` | Persist to vault |
| `curator_groom` / `curator_enrich` | Post-capture quality |
| `curator_contradictions` | Find conflicts |
| `memory_promote_to_global` | Share cross-project |
| `admin_health` | Verify health |
