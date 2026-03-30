---
title: 'Vault Branching'
description: 'Experiment with knowledge changes in isolation before merging them into your main vault.'
---

Sometimes you want to try something without committing to it. Vault branching lets you create an isolated copy of your knowledge where you can add, modify, or remove entries — then merge when you're satisfied, or delete the branch if the experiment didn't work out.

## Creating a branch

When you want to experiment — reorganize entries, test a new tagging scheme, or stage changes before a team review:

> **You:** "Create a vault branch called 'security-reorg'"
>
> **Agent:** _Created branch: security-reorg_

The branch starts empty. It doesn't copy your entire vault — it only tracks the changes you make on it.

## Adding changes to a branch

Once you have a branch, you can stage operations on it. Each operation targets a specific entry:

> **You:** "On the security-reorg branch, add a new entry about input sanitization"
>
> **Agent:** _Added operation to security-reorg: add entry 'Input Sanitization Standards'_

You can also modify existing entries or mark them for removal:

> **You:** "On the security-reorg branch, modify the JWT pattern to include token rotation"
>
> **Agent:** _Added operation to security-reorg: modify entry 'JWT Best Practices'_

> **You:** "On the security-reorg branch, remove the outdated CORS entry"
>
> **Agent:** _Added operation to security-reorg: remove entry 'CORS Permissive Config'_

Three operation types are available:

| Action     | What it does                                |
| ---------- | ------------------------------------------- |
| **add**    | Stage a new entry to be created on merge    |
| **modify** | Stage changes to an existing entry          |
| **remove** | Mark an existing entry for deletion on merge |

## Listing branches

See all your active branches and how many operations each one has:

> **You:** "List vault branches"
>
> **Agent:** _2 branches:_
>
> 1. **security-reorg** — 3 operations, not merged
> 2. **q4-cleanup** — 7 operations, not merged

## Merging a branch

When you're happy with the changes, merge them into the main vault:

> **You:** "Merge the security-reorg branch"
>
> **Agent:** _Merged security-reorg into main vault. 1 entry added, 1 modified, 1 removed._

On conflict — when a branch modifies an entry that was also changed in the main vault — the branch version wins. This keeps the merge predictable: what you staged is what you get.

Merging requires admin-level access. If your agent has access controls configured, only admins can merge.

## Deleting a branch

If you decide to discard the experiment:

> **You:** "Delete the q4-cleanup branch"
>
> **Agent:** _Deleted branch: q4-cleanup (7 operations discarded)_

Deleting a branch removes all staged operations. It does not affect the main vault.

## When to use branching

- **Knowledge reorganization** — restructure domains or tags without risking your live vault
- **Team collaboration** — one person stages changes, another reviews before merge
- **Bulk imports** — stage a large batch of entries on a branch, review them, then merge
- **Rollback safety** — if something goes wrong during a complex edit, the main vault is untouched

Branching is lightweight. Create branches freely — they cost almost nothing until merged.

## Related guides

- [Building a Knowledge Base](/docs/guides/knowledge-base/) — learn what to capture before you branch
- [Entry Linking & Knowledge Graph](/docs/guides/entry-linking/) — connect entries with typed links (links are preserved across branches)
- [Knowledge Review Workflow](/docs/guides/knowledge-review/) — combine branching with review for team quality control
- [Capabilities](/docs/capabilities/) — full list of vault branching operations
- [API Reference](/docs/api-reference/) — parameter details for `vault_branch`, `vault_branch_list`, `vault_merge_branch`

---

_Previous: [Cross-Project Knowledge](/docs/guides/cross-project-knowledge/) — share patterns across projects. Next: [Entry Linking & Knowledge Graph](/docs/guides/entry-linking/) — connect your entries into a Zettelkasten._
