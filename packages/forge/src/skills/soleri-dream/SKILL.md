---
name: soleri-dream
description: >
  Use when the user says "dream", "consolidate memory", "clean up memory",
  "memory cleanup", or "dream status". Runs automatic memory consolidation
  — dedup, archive stale entries, resolve contradictions.
---

# /dream — Automatic Memory Consolidation

Runs a full "dream" pass over the vault: dedup, archive stale entries, resolve
contradictions, and produce a summary report. Inspired by how REM sleep
consolidates biological memory.

**Announce at start:** "Running a dream pass — consolidating vault memory."

## Quick Commands

| Command | What it does |
|---------|-------------|
| `/dream` | Run a full dream pass (forces, bypasses gate) |
| `/dream status` | Show dream state: last dream, sessions since, eligibility |

## Orchestration

### Step 1: Check Dream Status

```
YOUR_AGENT_dream op:dream_status
```

Report current state to user as a table:

| Field | Value |
|-------|-------|
| **Sessions since last dream** | {sessionsSinceLastDream} |
| **Last dream** | {lastDreamAt or "Never"} |
| **Total dreams** | {totalDreams} |
| **Gate eligible** | {gateEligible} |

### Step 2: Run Dream

If user explicitly asked to dream (manual `/dream`), force it:

```
YOUR_AGENT_dream op:dream_run
  params: { force: true }
```

If auto-triggered (session start), respect the gate:

```
YOUR_AGENT_dream op:dream_run
  params: { force: false }
```

If the response contains `skipped: true`, inform the user:
"Dream skipped — {reason}. Use `/dream` to force a run."

### Step 3: Present Dream Report

Format the dream report as a table:

| Metric | Value |
|--------|-------|
| **Duration** | {durationMs}ms |
| **Duplicates found** | {duplicatesFound} |
| **Stale entries archived** | {staleArchived} |
| **Contradictions found** | {contradictionsFound} |
| **Total dreams** | {totalDreams} |
| **Timestamp** | {timestamp} |

### Step 4: Rebuild Brain Intelligence

```
YOUR_AGENT_core op:brain_build_intelligence
```

Rebuild brain intelligence with the freshly consolidated vault data.

### Step 5: Capture to Memory

```
YOUR_AGENT_memory op:session_capture
  params: {
    summary: "Dream pass completed: {duplicatesFound} duplicates, {staleArchived} stale archived, {contradictionsFound} contradictions found"
  }
```

## Gate Logic

Auto-dream triggers automatically on session start when BOTH conditions are met:
- **5+ sessions** since last dream
- **24+ hours** since last dream

Manual `/dream` always runs immediately (force=true).

## Background

Inspired by Claude Code's AutoDream feature and the neuroscience of REM sleep.
During sleep, the brain consolidates short-term memories into long-term storage,
prunes irrelevant connections, and resolves conflicts. The /dream skill does
the same for the vault.
