---
title: 'Memory Sync'
description: 'Sync vault knowledge to your editor native memory files so it loads into context automatically, no MCP calls needed.'
---

Your agent stores knowledge in a vault database. That works great when MCP tools are available, but there's a catch: the vault requires a tool call to read. Every time the agent needs a piece of knowledge, it has to stop and call a search op. That costs tokens, adds latency, and sometimes the agent just forgets to look.

Memory sync solves this by copying the most important vault entries into your editor's native memory system. Claude Code has `MEMORY.md` files that load automatically at the start of every conversation. OpenCode has a similar context mechanism. Once vault knowledge lives in those files, it's part of the agent's context from the first message, with zero tool calls.

## How it works

Sync is one-directional: vault to host. The vault is always the source of truth. The host memory files are a hot cache, nothing more. If you edit a synced entry in `MEMORY.md` directly, the next sync will overwrite your changes.

Here's what happens during a sync:

1. The sync strategy pulls memories and user-facing vault entries, scores them by type priority and recency, then picks the top N (default 50).
2. The adapter writes those entries to your editor's native memory format.
3. A `.sync-manifest.json` file tracks what was synced, with content hashes for each entry. On the next sync, unchanged entries are skipped and stale entries (ones that no longer exist in the vault) are cleaned up.

The scoring system prioritizes in this order: user preferences first (score 100), then session summaries (80), then lessons and feedback (60). Within each tier, recent entries get a bonus that decays over 30 days. Archived entries and anything older than 90 days (configurable) gets filtered out entirely.

Vault entries tagged `user-facing` also get synced, but anti-patterns are excluded. Anti-patterns are internal rules for the engine, not something you need loaded into every conversation.

## Supported editors

### Claude Code

The Claude Code adapter writes individual markdown files to `~/.claude/projects/{project-hash}/memory/`. Each synced entry becomes its own file with YAML frontmatter:

```markdown
---
name: Always use conventional commits
description: Use feat:, fix:, chore: prefixes.
type: reference
source: vault-sync
sourceId: ve-abc123
---

Use feat:, fix:, chore: prefixes for all commit messages.
```

It also appends a "Synced from Vault" section to your `MEMORY.md` index file with links to each entry. The adapter is careful to preserve anything you've written in `MEMORY.md` above that section. Your manual entries stay untouched.

The index respects a line budget (default 180 lines) so it never blows past Claude Code's limit. If your manual content takes up most of the budget, fewer synced entries get indexed.

### OpenCode

OpenCode doesn't have per-file memory like Claude Code, so the adapter takes a simpler approach. It writes a single consolidated file at `.opencode/memory/soleri-context.md` with all synced entries grouped by type (User, Feedback, Project, Reference). The file includes frontmatter with the sync timestamp and entry count.

The adapter creates the `.opencode/memory/` directory if it doesn't exist, but it requires the `.opencode/` directory to already be present (meaning you've initialized OpenCode in the project).

## Configuration

Sync has three ops, all available through the memory facade:

| Op | What it does |
| --- | --- |
| `memory_sync_to_host` | Run the sync. Vault entries get written to host memory files. |
| `memory_sync_status` | Check what's currently synced, when the last sync ran, and whether there's drift between vault and host. |
| `memory_sync_clear` | Remove all synced entries from the host. Vault data is not touched. |

All three ops accept an optional `host` parameter (`claude-code` or `opencode`). If you don't specify it, the adapter auto-detects which editor you're running in.

### Manual sync

Just ask your agent:

> **You:** "Sync vault to host memory"
>
> **Agent:** _Synced 23 entries to Claude Code memory. 5 skipped (unchanged), 2 removed (stale)._

You can preview what would happen without writing anything:

> **You:** "Dry run memory sync"
>
> **Agent:** _Would sync 23 entries to ~/.claude/projects/-Users-you-project/memory/_

### Automatic sync

If you want sync to happen automatically at the end of every session, set `memorySyncAutoEnabled: true` in your agent's runtime config:

```typescript
const runtime = await createAgentRuntime({
  agentId: 'my-agent',
  memorySyncAutoEnabled: true,
  // ... other config
});
```

When enabled, the Stop hook appends a `memory_sync_to_host` call after the session capture. It's fire-and-forget: if the sync fails for any reason (directory missing, permissions, etc.), the error is silently ignored so it never blocks session teardown.

### Tuning the sync

The `memory_sync_to_host` op accepts overrides for two key settings:

| Parameter | Default | What it controls |
| --- | --- | --- |
| `maxEntries` | 50 | Maximum number of entries to sync |
| `staleDays` | 90 | Entries older than this get filtered out |

The index line budget (`maxIndexLines`) defaults to 180 and is set in the sync config, not passed per-call. This keeps the synced section of `MEMORY.md` well under Claude Code's 200-line soft limit.

## What gets synced vs. what stays local

Not everything in the vault ends up in host memory. The sync strategy is intentionally selective.

| Synced | Not synced |
| --- | --- |
| User preferences | Anti-patterns |
| Session summaries | Archived entries |
| Lessons and feedback | Entries older than `staleDays` |
| Vault entries tagged `user-facing` | Internal engine rules |
| | Entries without the `user-facing` tag |

The thinking here: host memory should contain things that improve the agent's behavior _from the start_ of a conversation. User preferences ("I prefer TypeScript", "use conventional commits") are high value. Anti-patterns and internal rules are things the engine handles on its own through enforcement hooks, so duplicating them in memory would just waste context tokens.

## Drift detection

Over time, vault and host memory can drift apart. Maybe you deleted a vault entry, or a memory aged past the stale cutoff. The `memory_sync_status` op checks for this:

> **You:** "Check memory sync status"
>
> **Agent:** _Last synced 2 hours ago. 23 entries synced, 2 stale (source no longer in vault). Drift detected._

Running a fresh sync resolves the drift by removing stale files and updating the manifest.

## Related guides

- [Sync & Export](/docs/guides/vault-sync/) -- back up your vault to git, sync with Obsidian
- [Cross-Project Knowledge](/docs/guides/cross-project-knowledge/) -- share patterns across projects
- [Under the Hood](/docs/guides/under-the-hood/) -- how the enforcement and adapter layers work
