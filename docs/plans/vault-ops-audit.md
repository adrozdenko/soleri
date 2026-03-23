# Vault Ops Audit — Complete Mapping

**Issue:** #298 (child of #297)
**Date:** 2026-03-21
**Status:** Analysis complete — no code changes

## Summary

**Total ops: 76** across 6 source files.

| Source File                | Op Count               |
| -------------------------- | ---------------------- |
| `vault-facade.ts` (inline) | 22                     |
| `capture-ops.ts`           | 4                      |
| `intake-ops.ts`            | 7                      |
| `vault-linking-ops.ts`     | 9                      |
| `vault-sharing-ops.ts`     | 13                     |
| `vault-extra-ops.ts`       | 25                     |
| **Total**                  | **76**                 |
| **Deduplicated**           | **76** (no duplicates) |

## Target Facade Definitions

| Facade    | Responsibility                                                  |
| --------- | --------------------------------------------------------------- |
| `vault`   | Core CRUD (search, get, list, capture, stats)                   |
| `intake`  | Ingestion pipelines (book/PDF, URL, text, batch)                |
| `links`   | Zettelkasten linking (link, unlink, traverse, suggest, orphans) |
| `sync`    | Sharing & sync (obsidian, git, export/import packs)             |
| `review`  | Knowledge review workflows (submit, approve, reject, pending)   |
| `archive` | Archival, maintenance, temporal, optimization, content hashing  |

## Complete Mapping Table

### vault-facade.ts — 22 inline ops

| #   | Op Name                   | Category    | Target Facade | Notes                                              |
| --- | ------------------------- | ----------- | ------------- | -------------------------------------------------- |
| 1   | `search`                  | Search      | `vault`       | Two-pass (scan/full), uses brain.intelligentSearch |
| 2   | `load_entries`            | Search      | `vault`       | Two-pass retrieval pass 2                          |
| 3   | `vault_stats`             | Read        | `vault`       | Entry counts by type/domain/severity               |
| 4   | `list_all`                | Read        | `vault`       | Filtered listing with verbose option               |
| 5   | `export`                  | Export      | `sync`        | Export as JSON intelligence bundles                |
| 6   | `capture_enriched`        | Capture     | `vault`       | LLM-enriched capture with auto-tagging             |
| 7   | `vault_connect`           | Multi-vault | `vault`       | Connect a vault tier (project/team)                |
| 8   | `vault_disconnect`        | Multi-vault | `vault`       | Disconnect a vault tier                            |
| 9   | `vault_tiers`             | Multi-vault | `vault`       | List vault tiers with status                       |
| 10  | `vault_search_all`        | Multi-vault | `vault`       | Search across all connected tiers                  |
| 11  | `vault_connect_source`    | Multi-vault | `vault`       | Connect named vault source with priority           |
| 12  | `vault_disconnect_source` | Multi-vault | `vault`       | Disconnect named vault source                      |
| 13  | `vault_list_sources`      | Multi-vault | `vault`       | List dynamically connected sources                 |
| 14  | `vault_branch`            | Branching   | `archive`     | Create a vault branch for experimentation          |
| 15  | `vault_branch_add`        | Branching   | `archive`     | Add operation to a branch                          |
| 16  | `vault_branch_list`       | Branching   | `archive`     | List all branches                                  |
| 17  | `vault_merge_branch`      | Branching   | `archive`     | Merge branch into main vault                       |
| 18  | `vault_delete_branch`     | Branching   | `archive`     | Delete a branch                                    |
| 19  | `obsidian_export`         | Sync        | `sync`        | Export to Obsidian markdown                        |
| 20  | `obsidian_import`         | Sync        | `sync`        | Import from Obsidian markdown                      |
| 21  | `obsidian_sync`           | Sync        | `sync`        | Bidirectional Obsidian sync                        |

> **Note:** Op count is 21 inline, plus the 5 satellite spreads `...createVaultExtraOps()`, `...createCaptureOps()`, `...createIntakeOps()`, `...createVaultSharingOps()`, `...createVaultLinkingOps()` — giving 21 + 4 + 7 + 13 + 9 + 25 = **76** total (but the inline count is 21, and the facade file registers all 76).

**Correction:** The inline file defines 21 ops directly, plus spreads in the 5 satellite files. Total = 21 + 4 + 7 + 9 + 13 + 25 = **79**. Let me recount.

**Recount:**

- vault-facade.ts inline: `search`, `load_entries`, `vault_stats`, `list_all`, `export`, `capture_enriched`, `vault_connect`, `vault_disconnect`, `vault_tiers`, `vault_search_all`, `vault_connect_source`, `vault_disconnect_source`, `vault_list_sources`, `vault_branch`, `vault_branch_add`, `vault_branch_list`, `vault_merge_branch`, `vault_delete_branch`, `obsidian_export`, `obsidian_import`, `obsidian_sync` = **21**
- capture-ops.ts: `capture_knowledge`, `capture_quick`, `search_intelligent`, `search_feedback` = **4**
- intake-ops.ts: `intake_ingest_book`, `intake_process`, `intake_status`, `intake_preview`, `ingest_url`, `ingest_text`, `ingest_batch` = **7**
- vault-linking-ops.ts: `link_entries`, `unlink_entries`, `get_links`, `traverse`, `suggest_links`, `get_orphans`, `relink_vault`, `backfill_links`, `link_stats` = **9**
- vault-sharing-ops.ts: `vault_detect_scope`, `vault_set_scope`, `vault_list_by_scope`, `vault_export_pack`, `vault_import_pack`, `vault_git_push`, `vault_git_pull`, `vault_git_sync`, `vault_submit_review`, `vault_approve`, `vault_reject`, `vault_pending_reviews`, `vault_review_stats` = **13**
- vault-extra-ops.ts: `vault_get`, `vault_update`, `vault_remove`, `vault_bulk_add`, `vault_bulk_remove`, `vault_tags`, `vault_domains`, `vault_recent`, `vault_import`, `vault_seed`, `vault_backup`, `vault_age_report`, `vault_seed_canonical`, `knowledge_audit`, `knowledge_health`, `knowledge_merge`, `knowledge_reorganize`, `vault_set_temporal`, `vault_find_expiring`, `vault_find_expired`, `vault_archive`, `vault_restore`, `vault_optimize`, `vault_content_hash`, `vault_dedup_status` = **25**

**Actual total: 21 + 4 + 7 + 9 + 13 + 25 = 79**

---

## Revised Summary

**Total ops: 79** across 6 source files.

| Source File                | Op Count |
| -------------------------- | -------- |
| `vault-facade.ts` (inline) | 21       |
| `capture-ops.ts`           | 4        |
| `intake-ops.ts`            | 7        |
| `vault-linking-ops.ts`     | 9        |
| `vault-sharing-ops.ts`     | 13       |
| `vault-extra-ops.ts`       | 25       |
| **Total**                  | **79**   |

---

## Full Mapping by Target Facade

### `vault` — Core CRUD, search, capture, multi-vault (19 ops)

| #   | Op Name                   | Source File        | Description                                                  |
| --- | ------------------------- | ------------------ | ------------------------------------------------------------ |
| 1   | `search`                  | vault-facade.ts    | Two-pass search (scan/full mode) via brain.intelligentSearch |
| 2   | `load_entries`            | vault-facade.ts    | Load full entries by IDs (pass 2 of two-pass)                |
| 3   | `vault_stats`             | vault-facade.ts    | Entry counts by type/domain/severity                         |
| 4   | `list_all`                | vault-facade.ts    | Filtered listing with verbose option                         |
| 5   | `capture_enriched`        | vault-facade.ts    | LLM-enriched capture with auto-tagging                       |
| 6   | `vault_connect`           | vault-facade.ts    | Connect a vault tier (project/team)                          |
| 7   | `vault_disconnect`        | vault-facade.ts    | Disconnect a vault tier                                      |
| 8   | `vault_tiers`             | vault-facade.ts    | List vault tiers with status                                 |
| 9   | `vault_search_all`        | vault-facade.ts    | Search across all connected tiers                            |
| 10  | `vault_connect_source`    | vault-facade.ts    | Connect named vault source with priority                     |
| 11  | `vault_disconnect_source` | vault-facade.ts    | Disconnect named vault source                                |
| 12  | `vault_list_sources`      | vault-facade.ts    | List dynamically connected sources                           |
| 13  | `capture_knowledge`       | capture-ops.ts     | Batch capture with governance gating + auto-enrichment       |
| 14  | `capture_quick`           | capture-ops.ts     | Quick single-entry capture                                   |
| 15  | `search_intelligent`      | capture-ops.ts     | Project-scoped intelligent search (FTS + TF-IDF + memory)    |
| 16  | `search_feedback`         | capture-ops.ts     | Record search result feedback for brain learning             |
| 17  | `vault_get`               | vault-extra-ops.ts | Get single entry by ID                                       |
| 18  | `vault_update`            | vault-extra-ops.ts | Partial update of an entry                                   |
| 19  | `vault_remove`            | vault-extra-ops.ts | Remove single entry by ID                                    |

### `intake` — Ingestion pipelines (7 ops)

| #   | Op Name              | Source File   | Description                                    |
| --- | -------------------- | ------------- | ---------------------------------------------- |
| 1   | `intake_ingest_book` | intake-ops.ts | Ingest PDF book — parse, hash, chunk           |
| 2   | `intake_process`     | intake-ops.ts | Process pending chunks for a job               |
| 3   | `intake_status`      | intake-ops.ts | Get job status or list all jobs                |
| 4   | `intake_preview`     | intake-ops.ts | Preview extraction without storing             |
| 5   | `ingest_url`         | intake-ops.ts | Fetch URL, classify, dedup, store              |
| 6   | `ingest_text`        | intake-ops.ts | Ingest raw text (articles, transcripts, notes) |
| 7   | `ingest_batch`       | intake-ops.ts | Batch ingest multiple text items               |

### `links` — Zettelkasten linking (9 ops)

| #   | Op Name          | Source File          | Description                                       |
| --- | ---------------- | -------------------- | ------------------------------------------------- |
| 1   | `link_entries`   | vault-linking-ops.ts | Create typed link between two entries             |
| 2   | `unlink_entries` | vault-linking-ops.ts | Remove a link                                     |
| 3   | `get_links`      | vault-linking-ops.ts | Get outgoing + incoming backlinks for an entry    |
| 4   | `traverse`       | vault-linking-ops.ts | Walk link graph up to N hops                      |
| 5   | `suggest_links`  | vault-linking-ops.ts | FTS5-based link candidate suggestions             |
| 6   | `get_orphans`    | vault-linking-ops.ts | Find entries with zero links                      |
| 7   | `relink_vault`   | vault-linking-ops.ts | LLM-evaluated batch re-linking                    |
| 8   | `backfill_links` | vault-linking-ops.ts | FTS5-based link backfill for orphans              |
| 9   | `link_stats`     | vault-linking-ops.ts | Graph statistics (total, by type, most connected) |

### `sync` — Sharing, export, import, Obsidian, git (10 ops)

| #   | Op Name              | Source File          | Description                               |
| --- | -------------------- | -------------------- | ----------------------------------------- |
| 1   | `export`             | vault-facade.ts      | Export vault as JSON intelligence bundles |
| 2   | `obsidian_export`    | vault-facade.ts      | Export to Obsidian-compatible markdown    |
| 3   | `obsidian_import`    | vault-facade.ts      | Import from Obsidian markdown             |
| 4   | `obsidian_sync`      | vault-facade.ts      | Bidirectional Obsidian sync               |
| 5   | `vault_export_pack`  | vault-sharing-ops.ts | Export as shareable intelligence pack     |
| 6   | `vault_import_pack`  | vault-sharing-ops.ts | Import intelligence pack with dedup       |
| 7   | `vault_git_push`     | vault-sharing-ops.ts | Push vault entries to git directory       |
| 8   | `vault_git_pull`     | vault-sharing-ops.ts | Pull entries from git directory           |
| 9   | `vault_git_sync`     | vault-sharing-ops.ts | Bidirectional vault/git sync              |
| 10  | `vault_detect_scope` | vault-sharing-ops.ts | Auto-detect scope tier for an entry       |

### `review` — Knowledge review workflows (7 ops)

| #   | Op Name                 | Source File          | Description                         |
| --- | ----------------------- | -------------------- | ----------------------------------- |
| 1   | `vault_submit_review`   | vault-sharing-ops.ts | Submit entry for team review        |
| 2   | `vault_approve`         | vault-sharing-ops.ts | Approve a pending entry             |
| 3   | `vault_reject`          | vault-sharing-ops.ts | Reject a pending entry              |
| 4   | `vault_pending_reviews` | vault-sharing-ops.ts | List entries pending review         |
| 5   | `vault_review_stats`    | vault-sharing-ops.ts | Review workflow statistics          |
| 6   | `vault_set_scope`       | vault-sharing-ops.ts | Manually set scope tier             |
| 7   | `vault_list_by_scope`   | vault-sharing-ops.ts | List entries filtered by scope tier |

### `archive` — Archival, maintenance, branching, temporal, analytics (27 ops)

| #   | Op Name                | Source File        | Description                                    |
| --- | ---------------------- | ------------------ | ---------------------------------------------- |
| 1   | `vault_branch`         | vault-facade.ts    | Create vault branch                            |
| 2   | `vault_branch_add`     | vault-facade.ts    | Add operation to branch                        |
| 3   | `vault_branch_list`    | vault-facade.ts    | List all branches                              |
| 4   | `vault_merge_branch`   | vault-facade.ts    | Merge branch into main vault                   |
| 5   | `vault_delete_branch`  | vault-facade.ts    | Delete a branch                                |
| 6   | `vault_bulk_add`       | vault-extra-ops.ts | Bulk add entries (upsert)                      |
| 7   | `vault_bulk_remove`    | vault-extra-ops.ts | Bulk remove entries by IDs                     |
| 8   | `vault_tags`           | vault-extra-ops.ts | List all unique tags with counts               |
| 9   | `vault_domains`        | vault-extra-ops.ts | List all domains with counts                   |
| 10  | `vault_recent`         | vault-extra-ops.ts | Recently added/updated entries                 |
| 11  | `vault_import`         | vault-extra-ops.ts | Import entries from JSON bundle                |
| 12  | `vault_seed`           | vault-extra-ops.ts | Seed vault from intelligence data              |
| 13  | `vault_backup`         | vault-extra-ops.ts | Export full vault as JSON backup               |
| 14  | `vault_age_report`     | vault-extra-ops.ts | Entry age distribution                         |
| 15  | `vault_seed_canonical` | vault-extra-ops.ts | Seed from markdown files with YAML frontmatter |
| 16  | `knowledge_audit`      | vault-extra-ops.ts | Vault quality audit                            |
| 17  | `knowledge_health`     | vault-extra-ops.ts | Knowledge base health metrics                  |
| 18  | `knowledge_merge`      | vault-extra-ops.ts | Merge two similar entries                      |
| 19  | `knowledge_reorganize` | vault-extra-ops.ts | Re-categorize entries (retag, domain rename)   |
| 20  | `vault_set_temporal`   | vault-extra-ops.ts | Set bi-temporal validity windows               |
| 21  | `vault_find_expiring`  | vault-extra-ops.ts | Find entries expiring within N days            |
| 22  | `vault_find_expired`   | vault-extra-ops.ts | List expired entries                           |
| 23  | `vault_archive`        | vault-extra-ops.ts | Archive old entries to archive table           |
| 24  | `vault_restore`        | vault-extra-ops.ts | Restore archived entry                         |
| 25  | `vault_optimize`       | vault-extra-ops.ts | VACUUM + ANALYZE + FTS rebuild                 |
| 26  | `vault_content_hash`   | vault-extra-ops.ts | Compute content hash without inserting         |
| 27  | `vault_dedup_status`   | vault-extra-ops.ts | Content hash coverage and dedup stats          |

**Verification: 19 + 7 + 9 + 10 + 7 + 27 = 79** (all ops accounted for)

---

## Ops That Don't Fit Cleanly (Flagged for Discussion)

| Op Name                 | Current Mapping | Alternative                 | Reason                                                            |
| ----------------------- | --------------- | --------------------------- | ----------------------------------------------------------------- |
| `vault_detect_scope`    | `sync`          | `vault` or `review`         | Scope detection is a utility — could live in core vault or review |
| `vault_set_scope`       | `review`        | `vault`                     | Scope setting is metadata CRUD, not strictly review               |
| `vault_list_by_scope`   | `review`        | `vault`                     | Filtered listing — could be a core vault op                       |
| `capture_enriched`      | `vault`         | standalone `capture` facade | Overlaps with `capture_knowledge` — both do enriched capture      |
| `export`                | `sync`          | `vault`                     | Simple JSON export — could stay in core vault                     |
| `vault_import`          | `archive`       | `sync`                      | JSON import overlaps with `vault_import_pack`                     |
| `vault_seed`            | `archive`       | `vault`                     | Seeding is closer to CRUD than archival                           |
| `vault_backup`          | `archive`       | `sync`                      | Backup/export is arguably sync                                    |
| `vault_bulk_add`        | `archive`       | `vault`                     | Bulk CRUD could live in core vault                                |
| `vault_bulk_remove`     | `archive`       | `vault`                     | Bulk CRUD could live in core vault                                |
| `vault_tags`            | `archive`       | `vault`                     | Discovery/read op — fits core vault                               |
| `vault_domains`         | `archive`       | `vault`                     | Discovery/read op — fits core vault                               |
| `vault_recent`          | `archive`       | `vault`                     | Discovery/read op — fits core vault                               |
| `vault_branch*` (5 ops) | `archive`       | standalone `branch` facade  | Branching is a distinct feature, could have its own facade        |

### Recommendation

The `archive` facade is overloaded at 27 ops. Consider splitting further:

1. **`vault`** — absorb discovery ops (`vault_tags`, `vault_domains`, `vault_recent`), bulk CRUD (`vault_bulk_add`, `vault_bulk_remove`), and `vault_seed`/`vault_backup` → brings vault to ~27 ops
2. **`branch`** — split branching into its own facade (5 ops)
3. **`maintenance`** — rename `archive` to `maintenance` for clarity, keep temporal + archival + audit + hash ops (~17 ops)

---

## Internal Dependency Notes

| Op                     | Calls internally                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `search`               | `brain.scanSearch()` or `brain.intelligentSearch()`                                                                                        |
| `capture_enriched`     | `brain.enrichAndCapture()`, falls back to `vault.add()`                                                                                    |
| `capture_knowledge`    | `governance.evaluateCapture()`, `brain.enrichAndCapture()`, `linkManager.suggestLinks()`, `linkManager.addLink()`, `syncEntryToMarkdown()` |
| `capture_quick`        | `governance.evaluateCapture()`, `brain.enrichAndCapture()`, `syncEntryToMarkdown()`                                                        |
| `search_intelligent`   | `brain.intelligentSearch()`, `vault.searchMemories()`                                                                                      |
| `search_feedback`      | `brain.recordFeedback()`                                                                                                                   |
| `relink_vault`         | `linkManager.getLinks()`, `linkManager.getBacklinks()`, `llmClient.complete()`, raw SQL on vault_links                                     |
| `backfill_links`       | `linkManager.backfillLinks()`                                                                                                              |
| `vault_export_pack`    | `vault.list()`, `LinkManager.getAllLinksForEntries()`                                                                                      |
| `vault_import_pack`    | `vault.seedDedup()`, `LinkManager.addLink()`                                                                                               |
| `vault_git_push`       | `GitVaultSync.syncAll()`, `vault.exportAll()`                                                                                              |
| `vault_git_pull`       | `GitVaultSync.pull()`                                                                                                                      |
| `vault_git_sync`       | `GitVaultSync.sync()`                                                                                                                      |
| `knowledge_merge`      | `vault.get()`, `vault.update()`, `vault.remove()`                                                                                          |
| `knowledge_health`     | `vault.stats()`, `vault.getTags()`, `vault.getDomains()`, `vault.getAgeReport()`, raw SQL                                                  |
| `vault_seed_canonical` | `vault.seed()` + markdown parsing                                                                                                          |
| `intake_*` ops         | `pipeline.*()` methods (IntakePipeline)                                                                                                    |
| `ingest_*` ops         | `textIngester.*()` methods (TextIngester)                                                                                                  |
| `obsidian_*` ops       | `ObsidianSync` class                                                                                                                       |

### Cross-facade dependencies to watch during split

- `capture_knowledge` depends on `linkManager` (links facade) — will need shared runtime access
- `vault_export_pack` depends on `LinkManager` — creates new instance from vault provider
- `vault_import_pack` depends on `LinkManager` — creates new instance from vault provider
- `relink_vault` depends on `llmClient` — needs LLM for evaluation
- `capture_enriched` depends on `brain` — needs brain.enrichAndCapture
- All capture ops depend on `governance` — governance gating

---

## Source File Paths

All paths relative to `packages/core/src/runtime/`:

- `facades/vault-facade.ts` — 21 inline ops + 5 satellite spreads
- `capture-ops.ts` — 4 ops (capture + search)
- `intake-ops.ts` — 7 ops (book/PDF + text/URL ingestion)
- `vault-linking-ops.ts` — 9 ops (Zettelkasten linking)
- `vault-sharing-ops.ts` — 13 ops (scoping + packs + git + review)
- `vault-extra-ops.ts` — 25 ops (CRUD + bulk + discovery + import/export + analytics + temporal + archival + hashing)
