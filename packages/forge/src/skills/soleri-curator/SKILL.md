---
name: soleri-curator
tier: default
description: 'Triggers: "curator status", "vault health", "how is the vault", "curator health", "check vault quality", "what needs grooming". Quick vault health + grooming recs. Use vault-curate for full maintenance.'
---

# Curator — Vault Health and Quick Grooming

Get a rapid health snapshot of the vault and run targeted grooming on specific entries. Use this for regular check-ins and spot fixes. For deep maintenance (dedup, archive stale, full consolidation) use the `vault-curate` skill.

## When to Use

- Quick "how is the vault doing?" check
- After a few capture sessions to verify entry quality
- Spot-grooming specific entries or domains
- Before starting a big research session

## Orchestration

### Step 1: Health Snapshot

```
YOUR_AGENT_curator op:curator_health
```

Present results as a status table:

| Metric                  | Value              | Status        |
| ----------------------- | ------------------ | ------------- |
| **Total entries**       | {totalEntries}     | —             |
| **Quality score**       | {qualityScore}/100 | {ok/warn/bad} |
| **Stale entries**       | {staleCount}       | —             |
| **Duplicates detected** | {duplicateCount}   | —             |
| **Grooming needed**     | {needsGrooming}    | —             |

If health score < 70 or duplicates > 10, recommend running `vault-curate`.

### Step 2: Curator Status

```
YOUR_AGENT_curator op:curator_status
```

Show last grooming date, entries processed, and any pending actions.

### Step 3: Targeted Grooming (optional)

If specific entries need attention:

```
YOUR_AGENT_curator op:curator_groom
  params: {
    entryIds: ["<id1>", "<id2>"],
    tags: ["<suggested-tag>"]
  }
```

Report how many entries were updated.

## Exit Criteria

Health snapshot presented. If issues found, user is informed with a clear recommendation to run `vault-curate` for full maintenance or `curator_groom` for spot fixes.
