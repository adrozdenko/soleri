---
title: API Reference
description: Facade operations with parameters, auth levels, and usage examples across all 22 engine modules.
---

:::note
This page will be auto-generated from Zod schemas in a future release. For now, it covers the most commonly used operations with their parameters.
:::

## How Facades Work

Every Soleri agent exposes operations through **facades**: single MCP tool entry points that dispatch to operations via the `op` parameter.

```json
{
  "tool": "my_agent_vault",
  "input": {
    "op": "search",
    "params": {
      "query": "authentication patterns",
      "domain": "security",
      "limit": 5
    }
  }
}
```

Every response follows the same envelope:

```json
{
  "success": true,
  "data": { ... },
  "op": "search",
  "facade": "my_agent_vault"
}
```

### Facade Names

Each agent gets facades named `<agent_id>_<facade>`:

| Facade      | Tool name          | Ops    |
| ----------- | ------------------ | ------ |
| Vault       | `<id>_vault`       | 26     |
| Admin       | `<id>_admin`       | 57     |
| Chat        | `<id>_chat`        | 41     |
| Plan        | `<id>_plan`        | 37     |
| Brain       | `<id>_brain`       | 30     |
| Orchestrate | `<id>_orchestrate` | 29     |
| Memory      | `<id>_memory`      | 15     |
| Agency      | `<id>_agency`      | 15     |
| Curator     | `<id>_curator`     | 14     |
| Control     | `<id>_control`     | 15     |
| Archive     | `<id>_archive`     | 12     |
| Operator    | `<id>_operator`    | 10     |
| Loop        | `<id>_loop`        | 9      |
| Links       | `<id>_links`       | 9      |
| Sync        | `<id>_sync`        | 8      |
| Intake      | `<id>_intake`      | 7      |
| Tier        | `<id>_tier`        | 7      |
| Branching   | `<id>_branching`   | 5      |
| Review      | `<id>_review`      | 5      |
| Context     | `<id>_context`     | 3      |
| Embedding   | `<id>_embedding`   | 3      |
| Dream       | `<id>_dream`       | 3      |
| Domain      | `<id>_<domain>`    | 5 each |

---

## Vault Facade

### search

Search across all knowledge domains.

| Param      | Type     | Required | Description                                   |
| ---------- | -------- | -------- | --------------------------------------------- |
| `query`    | string   | yes      | Search query text                             |
| `domain`   | string   | no       | Restrict to a specific domain                 |
| `type`     | enum     | no       | `pattern`, `anti-pattern`, `rule`, `playbook` |
| `severity` | enum     | no       | `critical`, `warning`, `suggestion`           |
| `tags`     | string[] | no       | Filter by tags                                |
| `limit`    | number   | no       | Max results (default: 10)                     |

### capture_quick

Quick-capture a knowledge entry with minimal input.

| Param         | Type     | Required | Description                             |
| ------------- | -------- | -------- | --------------------------------------- |
| `title`       | string   | yes      | Entry title                             |
| `description` | string   | yes      | What this pattern/anti-pattern is about |
| `type`        | enum     | no       | Default: `pattern`                      |
| `domain`      | string   | no       | Knowledge domain                        |
| `severity`    | enum     | no       | Default: `suggestion`                   |
| `tags`        | string[] | no       | Free-form tags                          |

### capture_knowledge

Full knowledge capture with all metadata.

| Param         | Type     | Required | Description       |
| ------------- | -------- | -------- | ----------------- |
| `title`       | string   | yes      | Entry title       |
| `description` | string   | yes      | Full description  |
| `type`        | enum     | yes      | Entry type        |
| `domain`      | string   | no       | Knowledge domain  |
| `severity`    | enum     | no       | Severity level    |
| `tags`        | string[] | no       | Tags              |
| `category`    | string   | no       | Category grouping |
| `example`     | string   | no       | Code example      |
| `why`         | string   | no       | Rationale         |
| `context`     | string   | no       | When this applies |

### search_intelligent

Semantic search with 6-dimension scoring (recency, relevance, severity, usage, etc.).

| Param     | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| `query`   | string | yes      | Search query                                   |
| `options` | object | no       | Filter options (domain, type, severity, limit) |

### vault_branch

Create a named vault branch to experiment without affecting the main vault.

| Param        | Type   | Required | Description    |
| ------------ | ------ | -------- | -------------- |
| `branchName` | string | yes      | Branch name    |
| `createdBy`  | string | no       | Who created it |

---

## Plan Facade

### create_plan

Create a multi-step execution plan.

| Param       | Type   | Required | Description                                |
| ----------- | ------ | -------- | ------------------------------------------ |
| `title`     | string | yes      | Plan title                                 |
| `objective` | string | yes      | What this plan achieves                    |
| `tasks`     | array  | yes      | `[{ title: string, description: string }]` |

### plan_brainstorm

Design-before-code brainstorming, domain-aware.

| Param       | Type   | Required | Description                                            |
| ----------- | ------ | -------- | ------------------------------------------------------ |
| `objective` | string | yes      | What you're brainstorming                              |
| `scope`     | string | no       | Scope description                                      |
| `intent`    | enum   | no       | `BUILD`, `FIX`, `REVIEW`, `PLAN`, `IMPROVE`, `DELIVER` |

### plan_grade

Grade a plan against quality criteria.

| Param         | Type   | Required | Description            |
| ------------- | ------ | -------- | ---------------------- |
| `planCheckId` | string | yes      | Plan check ID to grade |

### plan_submit_evidence

Submit evidence for task acceptance criteria.

| Param         | Type   | Required | Description                                      |
| ------------- | ------ | -------- | ------------------------------------------------ |
| `taskCheckId` | string | yes      | Task check ID                                    |
| `evidence`    | array  | yes      | `[{ criterion, evidence, command?, satisfied }]` |

### chain_execute

Start a composable chain workflow. See [Chain Operations](/docs/guides/chain-operations/) for the full guide.

| Param        | Type   | Required | Description                                |
| ------------ | ------ | -------- | ------------------------------------------ |
| `definition` | object | yes      | Chain definition with steps and gates      |
| `input`      | object | no       | Initial input variables for the first step |

### chain_step_approve

Approve a step waiting at a user-approval gate.

| Param     | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| `chainId` | string | yes      | Chain instance ID  |
| `stepId`  | string | yes      | Step ID to approve |

---

## Brain Facade

### brain_recommend

Get context-aware recommendations.

| Param     | Type   | Required | Description                      |
| --------- | ------ | -------- | -------------------------------- |
| `context` | string | no       | Current task context             |
| `limit`   | number | no       | Max recommendations (default: 5) |

### record_feedback

Record feedback to the learning system.

| Param        | Type    | Required | Description                         |
| ------------ | ------- | -------- | ----------------------------------- |
| `type`       | string  | yes      | Feedback type                       |
| `source`     | string  | no       | Feedback source                     |
| `accepted`   | boolean | no       | Whether the recommendation was used |
| `confidence` | number  | no       | Confidence level (0-1)              |

### brain_extract_knowledge

Extract patterns from a session using 6 heuristic extraction rules.

| Param       | Type   | Required | Description                 |
| ----------- | ------ | -------- | --------------------------- |
| `sessionId` | string | yes      | Session ID to extract from  |

### radar_analyze

Analyze a learning signal. Auto-captures, queues, or logs it depending on confidence level.

| Param           | Type   | Required | Description                                                                       |
| --------------- | ------ | -------- | --------------------------------------------------------------------------------- |
| `type`          | enum   | yes      | `correction`, `search_miss`, `explicit_capture`, `pattern_success`, `workaround`, `repeated_question` |
| `title`         | string | yes      | Short title for the detected pattern                                              |
| `description`   | string | yes      | What was learned and why                                                          |
| `suggestedType` | enum   | no       | `pattern` or `anti-pattern`                                                       |
| `confidence`    | number | no       | Override confidence (0-1)                                                         |
| `sourceQuery`   | string | no       | Original query that triggered the signal                                          |
| `context`       | string | no       | Additional context                                                                |

### synthesize

Synthesize vault knowledge into structured content.

| Param        | Type   | Required | Description                                        |
| ------------ | ------ | -------- | -------------------------------------------------- |
| `query`      | string | yes      | Topic to synthesize about                          |
| `format`     | enum   | yes      | `brief`, `outline`, `talking-points`, `post-draft` |
| `maxEntries` | number | no       | Max vault entries to consult (default: 10)         |
| `audience`   | enum   | no       | `technical`, `executive`, `general` (default)      |

---

## Orchestrate Facade

### orchestrate_plan

Create an orchestrated plan with vault + brain context.

| Param         | Type   | Required | Description            |
| ------------- | ------ | -------- | ---------------------- |
| `prompt`      | string | yes      | What needs to be done  |
| `projectPath` | string | yes      | Project directory path |

### playbook_start

Start executing a playbook.

| Param        | Type   | Required | Description          |
| ------------ | ------ | -------- | -------------------- |
| `playbookId` | string | yes      | Playbook ID to start |

### playbook_match

Find playbooks that match a context.

| Param     | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| `context` | string | yes      | Context to match against |

### skill_step_start

Create a skill step tracker for structured execution.

| Param       | Type   | Required | Description                                                        |
| ----------- | ------ | -------- | ------------------------------------------------------------------ |
| `skillName` | string | yes      | Name of the skill being tracked                                    |
| `steps`     | array  | yes      | `[{ id: string, description: string, evidence: "tool_called" \| "file_exists" }]` |

### skill_step_advance

Record evidence for current step and advance to the next one.

| Param      | Type    | Required | Description                         |
| ---------- | ------- | -------- | ----------------------------------- |
| `runId`    | string  | yes      | Run ID from skill_step_start        |
| `stepId`   | string  | yes      | Step ID to record evidence for      |
| `evidence` | string  | yes      | Evidence value (tool name or path)  |
| `verified` | boolean | no       | Whether evidence is verified (default: true) |

---

## Chat Facade

### chat_session_init

Initialize chat session management.

| Param                 | Type   | Required | Description                          |
| --------------------- | ------ | -------- | ------------------------------------ |
| `storageDir`          | string | yes      | Directory for session persistence    |
| `ttlMs`               | number | no       | Session TTL in ms (default: 2 hours) |
| `compactionThreshold` | number | no       | Messages before auto-compaction      |
| `compactionKeep`      | number | no       | Messages to keep after compaction    |

### chat_session_append

Append a message to a session.

| Param        | Type   | Required | Description                              |
| ------------ | ------ | -------- | ---------------------------------------- |
| `sessionId`  | string | yes      | Session ID                               |
| `storageDir` | string | yes      | Storage directory                        |
| `role`       | enum   | yes      | `user`, `assistant`, `system`, or `tool` |
| `content`    | string | yes      | Message content                          |

### chat_auth_init

Initialize chat authentication.

| Param          | Type               | Required | Description           |
| -------------- | ------------------ | -------- | --------------------- |
| `storagePath`  | string             | yes      | Path for auth storage |
| `passphrase`   | string             | no       | Auth passphrase       |
| `allowedUsers` | (string\|number)[] | no       | Allowed user IDs      |

### chat_voice_transcribe

Transcribe audio using OpenAI Whisper.

| Param          | Type   | Required | Description          |
| -------------- | ------ | -------- | -------------------- |
| `audioBase64`  | string | yes      | Base64-encoded audio |
| `openaiApiKey` | string | yes      | OpenAI API key       |
| `filename`     | string | no       | Original filename    |

---

## Agency Facade

### agency_enable

Enable proactive file watching.

| Param         | Type   | Required | Description                          |
| ------------- | ------ | -------- | ------------------------------------ |
| `projectPath` | string | no       | Project root to watch (default: `.`) |

### agency_config

Update agency configuration.

| Param                  | Type     | Required | Description                         |
| ---------------------- | -------- | -------- | ----------------------------------- |
| `watchPaths`           | string[] | no       | Directories to watch                |
| `ignorePatterns`       | string[] | no       | Glob patterns to ignore             |
| `extensions`           | string[] | no       | File extensions to watch            |
| `debounceMs`           | number   | no       | Debounce interval                   |
| `minPatternConfidence` | number   | no       | Min confidence to surface a pattern |
| `cooldownMs`           | number   | no       | Cooldown between alerts             |

### agency_scan_file

Manually scan a file for warnings.

| Param      | Type   | Required | Description          |
| ---------- | ------ | -------- | -------------------- |
| `filePath` | string | yes      | Path to file to scan |

### agency_clarify

Generate clarification for ambiguous intent.

| Param        | Type   | Required | Description                     |
| ------------ | ------ | -------- | ------------------------------- |
| `prompt`     | string | yes      | The user prompt to analyze      |
| `confidence` | number | yes      | Current intent confidence (0-1) |

### agency_suggestions

Evaluate suggestion rules and return triggered proactive suggestions.

No parameters required.

### agency_suppress_warning

Suppress a warning by ID.

| Param       | Type   | Required | Description            |
| ----------- | ------ | -------- | ---------------------- |
| `warningId` | string | yes      | Warning ID to suppress |

---

## Archive Facade

### vault_archive

Archive entries older than N days.

| Param          | Type   | Required | Description                        |
| -------------- | ------ | -------- | ---------------------------------- |
| `olderThanDays`| number | yes      | Archive entries older than N days   |
| `reason`       | string | no       | Reason for archiving               |

### vault_restore

Restore an archived entry back to the active table.

| Param | Type   | Required | Description                      |
| ----- | ------ | -------- | -------------------------------- |
| `id`  | string | yes      | ID of the archived entry         |

### knowledge_merge

Merge two similar entries, keeping the best metadata from both.

| Param      | Type   | Required | Description               |
| ---------- | ------ | -------- | ------------------------- |
| `keepId`   | string | yes      | Entry to keep             |
| `removeId` | string | yes      | Duplicate entry to remove |

### knowledge_reorganize

Re-categorize entries by renaming domains/tags. Dry-run by default.

| Param         | Type    | Required | Description                                      |
| ------------- | ------- | -------- | ------------------------------------------------ |
| `dryRun`      | boolean | no       | Preview without changes (default: true)          |
| `retagRules`  | array   | no       | `[{ from: string, to?: string }]` tag rules     |
| `domainRules` | array   | no       | `[{ from: string, to: string }]` domain rules   |

---

## Operator Facade

### profile_get

Get the full operator profile or a specific section.

| Param     | Type | Required | Description                                                                       |
| --------- | ---- | -------- | --------------------------------------------------------------------------------- |
| `section` | enum | no       | `identity`, `cognition`, `communication`, `workingRules`, `trustModel`, `tasteProfile`, `growthEdges`, `technicalContext` |

### signal_accumulate

Accumulate operator signals that get synthesized into the profile later.

| Param     | Type  | Required | Description                                                    |
| --------- | ----- | -------- | -------------------------------------------------------------- |
| `signals` | array | yes      | `[{ id, signalType, data, timestamp, sessionId, confidence }]` |

### synthesis_check

Check if a synthesis pass is due based on signal/session thresholds. No parameters required.

### profile_export

Export the operator profile as markdown or JSON.

| Param    | Type | Required | Description                    |
| -------- | ---- | -------- | ------------------------------ |
| `format` | enum | no       | `markdown` or `json` (default) |

---

## Sync Facade

### vault_git_push

Push vault entries to a git-tracked directory.

| Param         | Type   | Required | Description                      |
| ------------- | ------ | -------- | -------------------------------- |
| `repoDir`     | string | yes      | Path to git-tracked directory    |
| `authorName`  | string | no       | Git author name                  |
| `authorEmail` | string | no       | Git author email                 |

### vault_git_pull

Pull entries from a git directory into the vault.

| Param        | Type   | Required | Description                                    |
| ------------ | ------ | -------- | ---------------------------------------------- |
| `repoDir`    | string | yes      | Path to git-tracked directory                  |
| `onConflict` | enum   | no       | `git` (default) or `vault` conflict resolution |

### vault_export_pack

Export vault entries as a shareable pack.

| Param        | Type     | Required | Description                              |
| ------------ | -------- | -------- | ---------------------------------------- |
| `name`       | string   | no       | Pack name (default: agent ID)            |
| `version`    | string   | no       | Pack version (default: 1.0.0)            |
| `tier`       | enum     | no       | `agent`, `project`, or `team`            |
| `domain`     | string   | no       | Filter by domain                         |
| `tags`       | string[] | no       | Filter by tags                           |
| `excludeIds` | string[] | no       | Entry IDs to exclude                     |

### vault_import_pack

Import an intelligence pack with dedup.

| Param     | Type  | Required | Description                               |
| --------- | ----- | -------- | ----------------------------------------- |
| `bundles` | array | yes      | Array of IntelligenceBundle objects        |
| `tier`    | enum  | no       | Force all imports to this tier             |

---

## Review Facade

### vault_submit_review

Submit a vault entry for team review.

| Param         | Type   | Required | Description            |
| ------------- | ------ | -------- | ---------------------- |
| `entryId`     | string | yes      | Entry ID to submit     |
| `submittedBy` | string | no       | Name/ID of submitter   |

### vault_approve

Approve a pending vault entry.

| Param        | Type   | Required | Description        |
| ------------ | ------ | -------- | ------------------ |
| `entryId`    | string | yes      | Entry ID           |
| `reviewedBy` | string | no       | Name/ID of reviewer|
| `comment`    | string | no       | Review comment     |

### vault_reject

Reject a pending vault entry.

| Param        | Type   | Required | Description          |
| ------------ | ------ | -------- | -------------------- |
| `entryId`    | string | yes      | Entry ID             |
| `reviewedBy` | string | no       | Name/ID of reviewer  |
| `comment`    | string | no       | Reason for rejection |

---

## Intake Facade

### ingest_url

Fetch a URL, extract its text, classify it via LLM, and store the result.

| Param    | Type     | Required | Description                   |
| -------- | -------- | -------- | ----------------------------- |
| `url`    | string   | yes      | URL to fetch and ingest       |
| `domain` | string   | no       | Knowledge domain              |
| `tags`   | string[] | no       | Additional tags               |

### ingest_text

Ingest raw text, classify it via LLM, and store.

| Param        | Type     | Required | Description                                       |
| ------------ | -------- | -------- | ------------------------------------------------- |
| `text`       | string   | yes      | Text content to ingest                            |
| `title`      | string   | yes      | Title for the source material                     |
| `sourceType` | enum     | no       | `article`, `transcript`, `notes`, `documentation` |
| `url`        | string   | no       | Source URL if available                            |
| `author`     | string   | no       | Author of the source material                     |
| `domain`     | string   | no       | Knowledge domain                                  |
| `tags`       | string[] | no       | Additional tags                                   |

### ingest_batch

Ingest multiple text items in one call.

| Param   | Type  | Required | Description                                               |
| ------- | ----- | -------- | --------------------------------------------------------- |
| `items` | array | yes      | `[{ text, title, sourceType?, url?, author?, domain?, tags? }]` |

---

## Links Facade

### link_entries

Create a typed link between two vault entries.

| Param      | Type   | Required | Description                                      |
| ---------- | ------ | -------- | ------------------------------------------------ |
| `sourceId` | string | yes      | Source entry ID                                  |
| `targetId` | string | yes      | Target entry ID                                  |
| `linkType` | enum   | yes      | `supports`, `contradicts`, `extends`, `sequences`|
| `note`     | string | no       | Context for the link                             |

### traverse

Walk the link graph from an entry up to N hops deep.

| Param     | Type   | Required | Description                 |
| --------- | ------ | -------- | --------------------------- |
| `entryId` | string | yes      | Starting entry ID           |
| `depth`   | number | no       | Max hops, 1-5 (default: 2) |

### suggest_links

Find semantically similar entries as link candidates.

| Param     | Type   | Required | Description                  |
| --------- | ------ | -------- | ---------------------------- |
| `entryId` | string | yes      | Entry to find candidates for |
| `limit`   | number | no       | Max suggestions (default: 5) |

### get_orphans

Find entries with zero links.

| Param   | Type   | Required | Description                  |
| ------- | ------ | -------- | ---------------------------- |
| `limit` | number | no       | Max orphans (default: 20)    |

### relink_vault

Re-link vault entries using LLM evaluation to find connections.

| Param       | Type    | Required | Description                             |
| ----------- | ------- | -------- | --------------------------------------- |
| `batchSize` | number  | no       | Pairs per LLM call (default: 10)       |
| `limit`     | number  | no       | Max entries to process (0 = all)        |
| `dryRun`    | boolean | no       | Preview without changes (default: false)|

---

## Branching Facade

### vault_branch

Create a named vault branch.

| Param  | Type   | Required | Description       |
| ------ | ------ | -------- | ----------------- |
| `name` | string | yes      | Unique branch name|

### vault_branch_add

Add an operation to a branch.

| Param        | Type   | Required | Description                        |
| ------------ | ------ | -------- | ---------------------------------- |
| `branchName` | string | yes      | Branch name                        |
| `entryId`    | string | yes      | Entry ID                           |
| `action`     | enum   | yes      | `add`, `modify`, or `remove`       |
| `entryData`  | object | no       | Full entry data (for add/modify)   |

### vault_merge_branch

Merge a branch into the main vault.

| Param        | Type   | Required | Description    |
| ------------ | ------ | -------- | -------------- |
| `branchName` | string | yes      | Branch to merge|

Auth: `admin`

---

## Tier Facade

### vault_connect

Connect an additional vault tier.

| Param  | Type   | Required | Description                |
| ------ | ------ | -------- | -------------------------- |
| `tier` | enum   | yes      | `project` or `team`        |
| `path` | string | yes      | Path to SQLite database    |

Auth: `admin`

### vault_search_all

Search across all connected vault tiers.

| Param   | Type   | Required | Description             |
| ------- | ------ | -------- | ----------------------- |
| `query` | string | yes      | Search query            |
| `limit` | number | no       | Max results (default: 20)|

### vault_connect_source

Connect a named vault source with priority.

| Param      | Type   | Required | Description                      |
| ---------- | ------ | -------- | -------------------------------- |
| `name`     | string | yes      | Unique name for the connection   |
| `path`     | string | yes      | Path to SQLite database          |
| `priority` | number | no       | Search priority 0-2 (default: 0.5)|

Auth: `admin`

---

## Context Facade

### context_extract_entities

Extract named entities from a prompt.

| Param    | Type   | Required | Description       |
| -------- | ------ | -------- | ----------------- |
| `prompt` | string | yes      | Prompt to analyze |

Returns: files, functions, domains, actions, technologies, patterns.

### context_retrieve_knowledge

Retrieve relevant knowledge from vault and brain.

| Param    | Type   | Required | Description      |
| -------- | ------ | -------- | ---------------- |
| `prompt` | string | yes      | Query to search  |
| `domain` | string | no       | Filter by domain |

### context_analyze

Full context analysis: combines entity extraction and knowledge retrieval in one call.

| Param    | Type   | Required | Description          |
| -------- | ------ | -------- | -------------------- |
| `prompt` | string | yes      | Prompt to analyze    |
| `domain` | string | no       | Optional domain hint |

---

## Domain Facades

Each domain gets its own facade: `<agent_id>_<domain>`.

### get_patterns

| Param      | Type     | Required | Description        |
| ---------- | -------- | -------- | ------------------ |
| `tags`     | string[] | no       | Filter by tags     |
| `severity` | enum     | no       | Filter by severity |
| `limit`    | number   | no       | Max results        |

### search

| Param   | Type   | Required | Description  |
| ------- | ------ | -------- | ------------ |
| `query` | string | yes      | Search query |
| `limit` | number | no       | Max results  |

### get_entry

| Param | Type   | Required | Description |
| ----- | ------ | -------- | ----------- |
| `id`  | string | yes      | Entry ID    |

### capture

| Param         | Type     | Required | Description                     |
| ------------- | -------- | -------- | ------------------------------- |
| `title`       | string   | yes      | Entry title                     |
| `description` | string   | yes      | Entry description               |
| `type`        | enum     | no       | Entry type (default: `pattern`) |
| `severity`    | enum     | no       | Severity level                  |
| `tags`        | string[] | no       | Tags                            |

### remove

| Param | Type   | Required | Description        |
| ----- | ------ | -------- | ------------------ |
| `id`  | string | yes      | Entry ID to remove |

Auth: `admin`

---

The complete list of all 360+ operations across 22 facades is at [Capabilities](/docs/capabilities/). CLI commands are at [CLI Reference](/docs/cli-reference/), and term definitions at [Glossary](/docs/glossary/).

:::note[Coverage]
This page covers the most commonly used operations. Everything else follows the same pattern: call with `op` and `params`. Use `admin_tool_list` to discover all available operations and their parameters in a running agent.
:::
