---
name: soleri-research-scout
tier: default
description: "Triggers: \"scout\", \"research scout\", \"find new info\", \"what's new\", \"scan the web\". Discovers new info that challenges or updates vault knowledge via web search."
---

# /research-scout — Knowledge Discovery via Vault Branching

Finds new information that challenges or updates existing vault knowledge.
Searches web, Reddit, HN, and Quora for strategies, tools, announcements,
and workflow changes relevant to vault domains.

Findings go to a **scout branch** — never the main vault. Weekly review
promotes the good ones, discards the rest.

**Announce at start:** "Scouting for new intelligence — findings go to the scout branch, not the main vault."

## Two Modes

| Command                  | What it does                                     |
| ------------------------ | ------------------------------------------------ |
| `/research-scout`        | Run a scout pass — search web, capture to branch |
| `/research-scout review` | Review branch findings, promote or discard       |

---

## Mode 1: Scout Pass

### Step 1: Ensure Scout Branch Exists

```
YOUR_AGENT_branching op:vault_branch_list
```

If no branch named `scout-findings` exists, create it:

```
YOUR_AGENT_branching op:vault_branch
  params: { name: "scout-findings" }
```

### Step 2: Identify What to Scout

Pull active domains and recent topics from the vault:

```
YOUR_AGENT_vault op:vault_domains
YOUR_AGENT_vault op:vault_recent params:{ limit: 15 }
YOUR_AGENT_brain op:brain_strengths params:{ limit: 10 }
```

From these, build 3-5 focused search queries based on:

- Active vault domains (e.g., "typescript", "react", "testing")
- Strong brain patterns (what the user works on most)
- Recent capture topics (what's top of mind)

### Step 3: Web Search

For each query, search with year context:

```
WebSearch: "{topic} new tools breaking changes 2026"
WebSearch: "{topic} best practices updated site:reddit.com OR site:news.ycombinator.com"
```

Focus on:

- New tool releases or deprecations
- Breaking changes in dependencies
- Updated best practices that contradict vault patterns
- Workflow patterns gaining traction

### Step 4: Cross-Reference Against Main Vault

For each finding, check if the main vault already knows:

```
YOUR_AGENT_vault op:search_intelligent
  params: { query: "{finding summary}" }
```

Classify:

- **NEW** — vault has nothing on this topic. Worth capturing.
- **UPDATE** — vault has related entry but info is outdated. Capture with link.
- **CONTRADICTS** — finding conflicts with existing vault pattern. High value. Capture with contradiction link.
- **REDUNDANT** — vault already has this. Skip entirely.

**Only keep NEW, UPDATE, and CONTRADICTS.** Discard REDUNDANT.

### Step 5: Validate Before Capture

For each non-redundant finding:

- Verify from at least 2 independent sources
- Check the date — reject anything older than 3 months
- Assess relevance — does this matter for active projects?

**If a finding can't be verified from 2 sources, skip it.**

### Step 6: Capture to Scout Branch

Switch to scout branch, capture, switch back:

```
YOUR_AGENT_branching op:vault_branch_add
  params: {
    branch: "scout-findings",
    entry: {
      title: "{concise finding title}",
      type: "pattern",
      domain: "{relevant domain}",
      description: "{what changed and why it matters}",
      why: "Scout [{date}]: {source URL}. {what it changes or adds}",
      severity: "suggestion",
      tags: ["research-scout", "{domain}", "{source-type}"]
    }
  }
```

If the finding CONTRADICTS an existing main vault entry, note the
contradicted entry ID in the description so the reviewer can link them
during promotion.

### Step 7: Scout Report

Present results:

| #   | Finding | Type        | Domain   | Source | Status                            |
| --- | ------- | ----------- | -------- | ------ | --------------------------------- |
| 1   | {title} | NEW         | {domain} | {url}  | Captured to branch                |
| 2   | {title} | CONTRADICTS | {domain} | {url}  | Captured — contradicts {entry_id} |
| 3   | {title} | REDUNDANT   | {domain} | —      | Skipped                           |

**Summary:** {N} sources searched, {found} findings, {captured} captured to scout branch, {skipped} skipped as redundant.

### Step 8: Session Capture

```
YOUR_AGENT_memory op:session_capture
  params: {
    summary: "Research scout: searched {N} topics, {captured} findings staged to scout-findings branch, {contradictions} contradictions flagged",
    topics: ["{domains searched}"],
    intent: "research"
  }
```

---

## Mode 2: Scout Review (Weekly)

### Step 1: Load Branch Findings

```
YOUR_AGENT_branching op:vault_branch_list
```

List all entries on the `scout-findings` branch.

### Step 2: Triage Each Finding

For each entry on the branch, present to the user:

| Field           | Value                          |
| --------------- | ------------------------------ |
| **Title**       | {title}                        |
| **Domain**      | {domain}                       |
| **Source**      | {from why field}               |
| **Age**         | {days since capture}           |
| **Contradicts** | {entry ID if noted, or "none"} |

Ask: **Promote, Archive, or Skip?**

- **Promote** — merge into main vault via `vault_merge_branch` or manual `capture_knowledge`. If it contradicts an entry, create a `link_entries` with type `contradicts`.
- **Archive** — remove from branch, don't add to main vault.
- **Skip** — leave on branch for next review.

### Step 3: Clean Up Branch

After review, delete the branch and recreate fresh:

```
YOUR_AGENT_branching op:vault_delete_branch
  params: { name: "scout-findings" }
YOUR_AGENT_branching op:vault_branch
  params: { name: "scout-findings" }
```

### Step 4: Report

| Metric       | Value      |
| ------------ | ---------- |
| **Reviewed** | {total}    |
| **Promoted** | {promoted} |
| **Archived** | {archived} |
| **Skipped**  | {skipped}  |

---

## Scheduling

### Nightly scout (3x)

```
/schedule create --name "research-scout-nightly" --cron "0 2,4,6 * * *" --prompt "/research-scout"
```

### Weekly review (Monday 9am)

```
/schedule create --name "research-scout-review" --cron "0 9 * * 1" --prompt "/research-scout review"
```

---

## Quality Gates

- **Max 5 captures per scout run** — if you find more, pick the 5 most impactful
- **2-source minimum** — never capture from a single unverified source
- **3-month freshness** — reject findings older than 90 days
- **Domain relevance** — only scout domains the user actively works in
- **No opinions** — capture facts, tools, and changes, not hot takes
