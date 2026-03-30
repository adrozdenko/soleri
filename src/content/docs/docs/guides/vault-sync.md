---
title: 'Sync & Export'
description: 'Back up your vault to git, sync with Obsidian, and share knowledge as portable packs.'
---

Your vault lives in a SQLite database — fast and reliable, but not something you can browse in a file manager or push to GitHub as-is. The sync layer bridges this gap: it exports vault entries to git-friendly JSON files, syncs bidirectionally with Obsidian markdown, and packages knowledge into shareable packs.

## Git sync

### Pushing to git

Export your entire vault to a git-tracked directory. Each entry becomes a JSON file organized into domain subdirectories:

> **You:** "Push the vault to ~/vault-backup"
>
> **Agent:** _Pushed 156 entries to ~/vault-backup. Directory structure:_
>
> ```
> vault-backup/
>   security/
>     jwt-best-practices.json
>     input-sanitization.json
>   infrastructure/
>     k8s-resource-limits.json
>     database-migration-safety.json
> ```

If the directory is a git repo, the push creates files that you can commit, review in diffs, and share with your team.

You can specify git author details for auto-commits:

> **You:** "Push vault to ~/vault-backup with author 'Alex' and email 'alex@team.com'"

### Pulling from git

Import entries from a git-tracked directory back into the vault:

> **You:** "Pull vault from ~/vault-backup"
>
> **Agent:** _Pulled 12 new entries, 3 updated, 141 unchanged._

When an entry exists in both the vault and the git directory, you control which version wins:

| Conflict mode | Behavior                                |
| ------------- | --------------------------------------- |
| **git**       | Git version overwrites vault (default)  |
| **vault**     | Vault version is kept, git is ignored   |

> **You:** "Pull from ~/vault-backup, keep vault versions on conflict"
>
> **Agent:** _Pulled with vault-wins conflict resolution. 12 new entries, 0 overwrites._

### Bidirectional sync

For a full two-way sync — push vault entries to git and pull git-only entries into the vault in one step:

> **You:** "Sync vault with ~/vault-backup"
>
> **Agent:** _Bidirectional sync complete: 3 entries pushed, 2 entries pulled, 1 conflict resolved (git wins)._

## Obsidian sync

If you use [Obsidian](https://obsidian.md/) for note-taking, you can sync your vault with an Obsidian directory. Entries become markdown files with YAML frontmatter — fully compatible with Obsidian's linking and search.

### Exporting to Obsidian

> **You:** "Export vault to my Obsidian vault at ~/obsidian-notes/soleri"
>
> **Agent:** _Exported 156 entries as markdown. Domain subdirectories created._

Each file gets YAML frontmatter with title, type, domain, severity, and tags — metadata that Obsidian can use for search and Dataview queries.

You can filter what gets exported:

> **You:** "Export only security and infrastructure entries to Obsidian"
>
> **Agent:** _Exported 42 entries (filtered by domain: security, infrastructure)._

Use `dryRun: true` to preview what would be exported without writing files.

### Importing from Obsidian

Bring Obsidian notes into your vault. The agent reads YAML frontmatter to extract title, type, domain, and tags:

> **You:** "Import from ~/obsidian-notes/patterns into the vault"
>
> **Agent:** _Imported 8 entries from Obsidian markdown files._

For files without frontmatter, you can set defaults:

> **You:** "Import from Obsidian, default type: pattern, default domain: frontend"

### Bidirectional Obsidian sync

Combine push and pull in one operation:

> **You:** "Sync vault with Obsidian at ~/obsidian-notes/soleri"
>
> **Agent:** _Bidirectional sync: 5 entries pushed, 2 entries pulled._

Three sync modes are available:

| Mode              | Direction                          |
| ----------------- | ---------------------------------- |
| **push**          | Vault to Obsidian only             |
| **pull**          | Obsidian to vault only             |
| **bidirectional** | Both directions (default)          |

## Knowledge packs

Packs are portable bundles of knowledge — entries and their links, packaged for sharing.

### Exporting a pack

Create a shareable pack from your vault:

> **You:** "Export a knowledge pack for the security domain"
>
> **Agent:** _Exported pack: 23 entries, 31 links, 1 domain (security). Version 1.0.0._

Filter by domain, tags, or scope tier:

> **You:** "Export a pack of all team-tier entries"
>
> **Agent:** _Exported: 45 entries across 3 domains, 52 links._

Packs include Zettelkasten links between exported entries — the knowledge graph structure travels with the content.

### Importing a pack

Import a pack into your vault. Content-hash deduplication prevents duplicates:

> **You:** "Import this knowledge pack"
>
> **Agent:** _Imported: 18 new entries, 5 duplicates skipped, 24 links created._

You can force all imported entries to a specific scope tier:

> **You:** "Import the pack at team tier"

## When to use each sync method

| Goal                                    | Method            |
| --------------------------------------- | ----------------- |
| Version-control your vault              | Git push/pull     |
| Team backup and collaboration           | Git bidirectional |
| Browse knowledge in a note-taking app   | Obsidian export   |
| Bring personal notes into the vault     | Obsidian import   |
| Share knowledge between agents/projects | Pack export/import|

All sync methods are safe to run repeatedly — deduplication and conflict resolution prevent data loss.

## Related guides

- [Vault Branching](/docs/guides/vault-branching/) — stage changes on a branch, then sync the merged result to git
- [Entry Linking & Knowledge Graph](/docs/guides/entry-linking/) — knowledge packs preserve Zettelkasten links between entries
- [Cross-Project Knowledge](/docs/guides/cross-project-knowledge/) — share knowledge across projects using packs or git sync
- [Team Workflows](/docs/guides/team-workflows/) — git sync enables team-wide vault collaboration
- [Capabilities](/docs/capabilities/) — full list of sync and export operations
- [API Reference](/docs/api-reference/) — parameter details for `vault_git_push`, `vault_git_pull`, `obsidian_sync`

---

_Previous: [Knowledge Review Workflow](/docs/guides/knowledge-review/) — team quality control for vault entries._
