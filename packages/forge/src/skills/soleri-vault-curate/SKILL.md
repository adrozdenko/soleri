---
name: soleri-vault-curate
description: >
  Use when the user says "clean vault", "deduplicate vault", "groom knowledge",
  "merge patterns", or "vault maintenance". Maintains vault quality through
  deduplication, grooming, and contradiction detection.
---

# Vault Curate — Knowledge Maintenance

Maintain vault quality through deduplication, grooming, contradiction detection, and consolidation. A well-curated vault produces better search results and brain recommendations.

## When to Use

Periodically (weekly or after heavy capture sessions), when search quality degrades, when vault health shows warnings, or when the user explicitly requests maintenance.

## Orchestration Sequence

### Step 1: Health Assessment

```
YOUR_AGENT_core op:knowledge_health
```

```
YOUR_AGENT_core op:get_vault_analytics
```

Present the health summary to the user before proceeding: total entries, quality scores, staleness, coverage gaps.

### Step 2: Detect Duplicates

```
YOUR_AGENT_core op:curator_detect_duplicates
```

This finds entries with overlapping titles, descriptions, or content. Review the duplicate pairs — some may be intentional (different contexts) while others are true duplicates.

For true duplicates:

```
YOUR_AGENT_core op:merge_patterns
  params: { patternIds: ["<id1>", "<id2>"] }
```

Preserve the best content from each.

### Step 3: Find Contradictions

```
YOUR_AGENT_core op:curator_contradictions
```

Contradictions erode trust in vault search results. For each contradiction: decide which entry is correct (check dates, context, evidence), then archive or update the incorrect one.

### Step 4: Groom Entries

```
YOUR_AGENT_core op:curator_groom_all
```

Runs tag enrichment and metadata cleanup across all entries. This improves searchability and categorization.

For targeted grooming of specific entries:

```
YOUR_AGENT_core op:curator_groom
  params: { entryIds: ["<id>"], tags: ["<tag>"] }
```

### Step 5: Full Consolidation

```
YOUR_AGENT_core op:curator_consolidate
```

Runs the complete pipeline: dedup + archive stale entries + resolve contradictions. This is the heavy-duty cleanup.

### Step 6: Knowledge Reorganization

```
YOUR_AGENT_core op:knowledge_reorganize
  params: { mode: "preview" }
```

Preview first, then run again with `mode: "apply"` if the preview looks good.

### Step 7: Rebuild Brain Intelligence

```
YOUR_AGENT_core op:brain_build_intelligence
```

Rebuild brain intelligence after vault has been cleaned/reorganized.

### Step 8: Verify Results

```
YOUR_AGENT_core op:knowledge_health
```

Compare with Step 1 metrics. Vault health should improve: fewer duplicates, no contradictions, better coverage.

## Exit Criteria

Curation is complete when: duplicates merged, contradictions resolved, entries groomed, and health metrics improved compared to Step 1 baseline.
