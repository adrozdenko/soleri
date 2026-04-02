---
name: soleri-vault-capture
description: >
  Use when the user says "save this", "capture this", "remember this pattern",
  "add to vault", "vault capture", or when persisting learnings from a work
  session. Validated capture with tier scoping, duplicate detection, and
  abstraction review. For bulk extraction from documents, code, or PRs, use
  knowledge-harvest instead.
---

# Vault Capture — Validated Knowledge Persistence

Capture knowledge to the vault with mandatory validation before persistence. Every item goes through tier classification, duplicate detection, and abstraction review. Nothing lands in the vault without conscious scoping.

## When to Use

- End of a work session — collecting learnings
- After a significant decision, pattern discovery, or anti-pattern identification
- When multiple items need capturing from a conversation
- User says "capture this", "save to vault", "remember this"

## Steps

### 1. Extract Candidate Items

Review the conversation or user request. For each piece of knowledge, extract:

- **Title** — clear, searchable name
- **Description** — what it is, when it applies, why it matters
- **Why** — reasoning behind the pattern (makes entries actionable)
- **Type** — pattern | anti-pattern | workflow | principle | decision | rule | reference
- **Domain** — architecture, design, components, process, testing, etc.
- **Tags** — 3-5 searchable keywords

### 2. Tier Classification (MANDATORY)

For EACH item, apply the three-question test:

| Question                                           | If YES           |
| -------------------------------------------------- | ---------------- |
| Would any developer on ANY project benefit?        | **agent** tier   |
| Would this apply to OTHER projects this team owns? | **team** tier    |
| Is this specific to THIS codebase only?            | **project** tier |

Decision tree:

```
Universal? (WCAG, UX laws, language patterns)
  → YES → agent
  → NO → Shared across team projects? (design system, workflow conventions)
    → YES → team
    → NO → project (component rules, token policies, architectural decisions)
```

**When in doubt: prefer project over agent.** Too specific is safer than too general.

### 3. Duplicate Detection

For each item, search the vault:

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<item title and key terms>" }
```

Check results:

- **Score > 0.5** — likely duplicate. Update the existing entry instead of creating new.
- **Score 0.3-0.5** — possible overlap. Review existing entry: update or capture as new.
- **Score < 0.3** — no duplicate. Proceed with capture.

For batch scans: `YOUR_AGENT_core op:curator_detect_duplicates`

### 4. Abstraction Level Check

Validate each item is at the right level:

| Too Specific (skip)                        | Just Right (capture)                                           | Too General (skip)             |
| ------------------------------------------ | -------------------------------------------------------------- | ------------------------------ |
| "Line 42 of FileUpload.tsx needs a Button" | "Components must use Button atom for all interactive elements" | "Use design system components" |
| "Changed bg-red-500 to error token"        | "No raw Tailwind colors — use semantic tokens"                 | "Use semantic colors"          |
| "Fixed timeout in GuidedCodeBlock"         | "setTimeout in useEffect must return clearTimeout cleanup"     | "Clean up side effects"        |

Ask: "Would this help someone who hasn't read today's conversation?" If NO — too specific, skip it.

### 5. Present Review Table

Before capturing, present ALL items to the user:

```
## Capture Review

| # | Title | Type | Tier | Duplicate? | Abstraction | Action |
|---|-------|------|------|------------|-------------|--------|
| 1 | [title] | pattern | project | No match | Good | Capture |
| 2 | [title] | anti-pattern | agent | Similar: [id] (0.45) | Good | Update existing |
| 3 | [title] | workflow | project | No match | Too specific | Skip |
```

**Wait for user approval.** Do NOT proceed without explicit confirmation.

### 6. Execute Approved Captures

For each approved item:

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    entries: [{
      title: "<title>",
      description: "<description>",
      type: "<type>",
      domain: "<domain>",
      severity: "<critical|warning|suggestion>",
      tags: ["<tag1>", "<tag2>"],
      why: "<reasoning>"
    }]
  }
```

For quick single captures: `YOUR_AGENT_core op:capture_quick params: { title: "<name>", description: "<details>" }`

### 7. Post-Capture Quality

For each captured entry:

- `YOUR_AGENT_core op:curator_groom params: { entryId: "<id>" }` — normalize tags
- `YOUR_AGENT_core op:curator_enrich params: { entryId: "<id>" }` — LLM enrichment
- `YOUR_AGENT_core op:curator_contradictions` — check for conflicts with existing entries

### 8. Verify and Fix Tiers (MANDATORY)

After capture, check EVERY response. Auto-detection frequently assigns "agent" tier with LOW confidence to project-specific knowledge.

```
YOUR_AGENT_core op:vault_set_scope
  params: { id: "<entry-id>", tier: "<correct-tier>" }
```

### 9. Governance (if enabled)

If capture returns a `proposalId`, entry is queued for review:

```
YOUR_AGENT_core op:governance_proposals
  params: { action: "list" }
```

### 10. Promote to Global (optional)

For cross-project knowledge worth sharing:

```
YOUR_AGENT_core op:memory_promote_to_global
  params: { entryId: "<id>" }
```

### 11. Report

After all captures:

```
## Captured

| # | Title | ID | Tier | Type | Links |
|---|-------|----|------|------|-------|
| 1 | [title] | [id] | project | pattern | 3 auto-linked |

Skipped: [count] (too specific / duplicate)
Updated: [count] (merged into existing)
```

Verify with `YOUR_AGENT_core op:admin_health` and `YOUR_AGENT_core op:admin_vault_analytics`.

## Anti-patterns

- Capturing code fixes as knowledge (that's what git is for)
- Capturing temporary state (active plan, current task)
- Capturing things already in CLAUDE.md (duplication)
- Using "agent" tier for anything mentioning project-specific names
- Batch-capturing without showing the review table first
- Skipping tier verification after capture

## Common Mistakes

- Not checking for duplicates before capturing
- Missing the `why` field (makes entries not actionable)
- Skipping post-capture grooming (tags stay unnormalized)
- Letting auto-detection assign wrong tier without correction
- Capturing implementation details that belong in git, not vault

## Agent Tools Reference

| Op                                       | When to Use                          |
| ---------------------------------------- | ------------------------------------ |
| `search_intelligent`                     | Duplicate detection before capture   |
| `curator_detect_duplicates`              | Batch duplicate scan                 |
| `capture_knowledge`                      | Persist after approval               |
| `capture_quick`                          | Fast capture for simple items        |
| `curator_groom` / `curator_enrich`       | Post-capture quality                 |
| `curator_contradictions`                 | Find conflicts with existing entries |
| `vault_set_scope`                        | Fix tier after capture               |
| `governance_proposals`                   | Check governance queue               |
| `memory_promote_to_global`               | Share cross-project                  |
| `admin_health` / `admin_vault_analytics` | Verify health after capture          |
