---
name: soleri-vault-smells
description: >
  Use when the user says "vault quality", "vault analysis", "knowledge quality",
  "knowledge debt", "stale patterns", or "find contradictions". Deep knowledge
  quality analysis beyond operational health checks.
---

# Vault Smells — Knowledge Quality Deep Analysis

Detects structural problems in the knowledge base that degrade decision quality over time. Goes beyond operational health (is the DB up?) into knowledge integrity (is the knowledge trustworthy?).

## Smell Categories

### 1. Contradiction Smells

Entries that give conflicting guidance. The most dangerous smell — leads to inconsistent decisions.

```
salvador_core op:curator_contradictions
```

**What to look for:**

- Two patterns that recommend opposite approaches for the same situation
- An anti-pattern that contradicts an active pattern
- Entries from different time periods with conflicting advice (the older one may be stale)

**Resolution:** Present contradictions to user. One must win — archive the loser or scope them to different contexts.

### 2. Staleness Smells

Knowledge that was true once but may not be anymore.

```
salvador_core op:vault_age_report
```

**Indicators:**

- Entries >60 days without access or update
- Patterns referencing APIs, libraries, or versions that have changed
- Entries tagged with technologies the project no longer uses
- Confidence scores that haven't been reinforced by brain feedback

**Action:** Flag for review. Don't auto-delete — stale doesn't mean wrong.

### 3. Orphan Smells

Entries with no connections to the rest of the knowledge graph.

```
salvador_core op:admin_vault_analytics
salvador_core op:curator_detect_duplicates
```

**Indicators:**

- Entries with zero inbound or outbound links
- Entries never returned in search results (check search insights)
- Entries with no tags or only generic tags
- Entries that were captured but never groomed

**Why it matters:** Orphans don't surface when needed. They're knowledge that exists but can't be found. In a Zettelkasten, an unlinked note is a dead note.

**Action:** Link, merge, or archive. Every entry should connect to at least one other.

### 4. Duplication Smells

Multiple entries covering the same ground with slight variations.

```
salvador_core op:curator_detect_duplicates
```

**Indicators:**

- High similarity scores between entries
- Same tags and category but different titles
- Entries captured in different sessions about the same topic
- Parallel entries — one as pattern, one as anti-pattern for the same concept

**Action:** Merge the best parts into one authoritative entry. Archive the rest.

### 5. Shallow Entry Smells

Entries that exist but lack substance — captured in a hurry, never enriched.

```
salvador_core op:curator_health_audit
```

**Indicators:**

- Description under 50 characters
- No examples or context
- Missing "why" — only states "what" without rationale
- No tags beyond the auto-generated ones
- Quality score below 40

**Action:** Enrich with context, examples, and rationale — or archive if no longer relevant.

### 6. Category Drift Smells

The taxonomy has grown inconsistent over time.

```
salvador_core op:vault_domains
salvador_core op:vault_tags
```

**Indicators:**

- Near-duplicate categories (e.g., "error-handling" and "errors" and "exception-handling")
- Categories with only 1-2 entries (too granular)
- Tags used inconsistently (same concept, different tag names)
- Entries mis-categorized (architecture pattern filed under "testing")

**Action:** Normalize with `op:curator_groom_all`. Merge overlapping categories.

### 7. Confidence Decay Smells

Brain patterns losing strength without reinforcement.

```
salvador_core op:brain_strengths
```

**Indicators:**

- Patterns with high initial strength that have decayed below 0.3
- Patterns that were strong but haven't received positive feedback in >30 days
- Patterns with mixed feedback (both positive and negative) — unresolved

**Action:** Review with user. Reinforce valid patterns, retire invalid ones.

### 8. Knowledge Gap Smells

Areas where the vault _should_ have knowledge but doesn't.

```
salvador_core op:admin_search_insights
```

**Indicators:**

- Repeated search queries that return no results
- Domains the project uses but vault has no entries for
- Anti-patterns captured without corresponding patterns (what to do instead?)
- Patterns without linked anti-patterns (what to avoid?)

**Action:** Create targeted entries to fill gaps. Use knowledge-harvest skill on relevant docs/code.

## Running the Analysis

### Step 1: Gather Data

```
salvador_core op:admin_health
salvador_core op:admin_vault_analytics
salvador_core op:curator_health_audit
salvador_core op:curator_contradictions
salvador_core op:curator_detect_duplicates
salvador_core op:vault_age_report
salvador_core op:vault_domains
salvador_core op:vault_tags
salvador_core op:brain_strengths
salvador_core op:admin_search_insights
```

### Step 2: Classify Smells

For each smell category, assess severity:

| Severity    | Meaning                                    |
| ----------- | ------------------------------------------ |
| 🟢 Clean    | No issues in this category                 |
| 🟡 Minor    | 1-3 instances, low impact                  |
| 🟠 Moderate | Multiple instances, degrading quality      |
| 🔴 Critical | Widespread, actively causing bad decisions |

### Step 3: Present the Report

```
## Vault Smell Report

### Overview
| Metric | Value |
|--------|-------|
| Total entries | X |
| Overall health score | X/100 |
| Smells found | X across Y categories |

### Smell Summary
| Category | Severity | Count | Impact |
|----------|----------|-------|--------|
| Contradictions | 🔴/🟠/🟡/🟢 | X | Inconsistent decisions |
| Staleness | 🔴/🟠/🟡/🟢 | X | Outdated guidance |
| Orphans | 🔴/🟠/🟡/🟢 | X | Un-findable knowledge |
| Duplicates | 🔴/🟠/🟡/🟢 | X | Noise, conflicting versions |
| Shallow entries | 🔴/🟠/🟡/🟢 | X | Low-value knowledge |
| Category drift | 🔴/🟠/🟡/🟢 | X | Poor discoverability |
| Confidence decay | 🔴/🟠/🟡/🟢 | X | Unreliable recommendations |
| Knowledge gaps | 🔴/🟠/🟡/🟢 | X | Blind spots |

### Critical Findings
[Top 3 most impactful issues with specific entries/examples]

### Recommended Actions
| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | [most impactful fix] | Low/Med/High | High |
| 2 | [second] | Low/Med/High | Med |
| 3 | [third] | Low/Med/High | Med |

### Trend (if prior reports exist)
| Metric | Last Check | Now | Direction |
|--------|-----------|-----|-----------|
| Health score | X | Y | ↑/↓/→ |
| Smell count | X | Y | ↑/↓/→ |
```

### Step 4: Fix (with user approval)

Do NOT auto-fix. Present findings, get approval, then:

- Contradictions → `op:curator_resolve_contradiction`
- Duplicates → `op:curator_groom` (merge)
- Orphans → link or archive
- Shallow entries → enrich or archive
- Category drift → `op:curator_groom_all` (normalize)
- Gaps → `op:capture_knowledge` (fill)

After fixes: `op:brain_build_intelligence` to rebuild with clean data.

## Common Mistakes

- Auto-fixing without presenting findings first (user may disagree)
- Treating all smells as equally urgent (contradictions >> orphans)
- Deleting stale entries without checking if they're still valid
- Running this too frequently (monthly is usually enough)
- Not rebuilding brain intelligence after major cleanup

## Quick Reference

| Smell            | Detection Op                   | Fix Op                          |
| ---------------- | ------------------------------ | ------------------------------- |
| Contradictions   | `curator_contradictions`       | `curator_resolve_contradiction` |
| Staleness        | `vault_age_report`             | Review + archive/update         |
| Orphans          | `admin_vault_analytics`        | Link or archive                 |
| Duplicates       | `curator_detect_duplicates`    | `curator_groom` (merge)         |
| Shallow entries  | `curator_health_audit`         | Enrich or archive               |
| Category drift   | `vault_domains` + `vault_tags` | `curator_groom_all`             |
| Confidence decay | `brain_strengths`              | Reinforce or retire             |
| Knowledge gaps   | `admin_search_insights`        | `capture_knowledge`             |

**Related skills:** health-check (operational status), vault-curate (active cleanup), knowledge-harvest (fill gaps)
