---
title: API Reference
description: Every facade operation with parameters, auth levels, and usage examples.
---

:::note
This page will be auto-generated from Zod schemas in a future release ([v5.6.0 milestone](https://github.com/adrozdenko/soleri/milestone/30)). For now, it covers the most commonly used operations with their parameters.
:::

## How Facades Work

Every Soleri agent exposes operations through **facades** — single MCP tool entry points that dispatch to operations via the `op` parameter.

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
| Vault       | `<id>_vault`       | 66     |
| Admin       | `<id>_admin`       | 56     |
| Chat        | `<id>_chat`        | 41     |
| Plan        | `<id>_plan`        | 32     |
| Orchestrate | `<id>_orchestrate` | 26     |
| Brain       | `<id>_brain`       | 23     |
| Memory      | `<id>_memory`      | 15     |
| Curator     | `<id>_curator`     | 13     |
| Control     | `<id>_control`     | 13     |
| Cognee      | `<id>_cognee`      | 11     |
| Loop        | `<id>_loop`        | 9      |
| Agency      | `<id>_agency`      | 8      |
| Context     | `<id>_context`     | 3      |
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

Semantic search with 6-dimension scoring.

| Param     | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| `query`   | string | yes      | Search query                                   |
| `options` | object | no       | Filter options (domain, type, severity, limit) |

### vault_branch

Create a named vault branch for experimentation.

| Param        | Type   | Required | Description    |
| ------------ | ------ | -------- | -------------- |
| `branchName` | string | yes      | Branch name    |
| `createdBy`  | string | no       | Who created it |

### intake_ingest_book

Ingest a PDF book into vault knowledge.

| Param             | Type     | Required | Description                       |
| ----------------- | -------- | -------- | --------------------------------- |
| `pdfPath`         | string   | yes      | Path to PDF file                  |
| `title`           | string   | yes      | Book title                        |
| `author`          | string   | yes      | Book author                       |
| `targetScope`     | enum     | no       | `global` or `project`             |
| `focusCategories` | string[] | no       | Categories to focus extraction on |
| `chunkPageSize`   | number   | no       | Pages per chunk                   |
| `dryRun`          | boolean  | no       | Preview without importing         |

### obsidian_sync

Bidirectional sync with Obsidian.

| Param               | Type    | Required | Description                        |
| ------------------- | ------- | -------- | ---------------------------------- |
| `projectPath`       | string  | yes      | Project directory                  |
| `obsidianVaultPath` | string  | yes      | Path to Obsidian vault             |
| `direction`         | enum    | no       | `push`, `pull`, or `bidirectional` |
| `dryRun`            | boolean | no       | Preview without changes            |

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

Design-before-code brainstorming with domain awareness.

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

Extract patterns from session history.

| Param     | Type    | Required | Description                           |
| --------- | ------- | -------- | ------------------------------------- |
| `limit`   | number  | no       | Max sessions to analyze               |
| `since`   | string  | no       | ISO date — only analyze after this    |
| `persist` | boolean | no       | Whether to persist extracted patterns |

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

---

## Context Facade

### context_extract_entities

Extract named entities from a prompt.

| Param    | Type   | Required | Description       |
| -------- | ------ | -------- | ----------------- |
| `prompt` | string | yes      | Prompt to analyze |

Returns: files, functions, domains, actions, technologies, patterns.

### context_retrieve_knowledge

Retrieve relevant knowledge from vault, Cognee, and brain.

| Param    | Type   | Required | Description      |
| -------- | ------ | -------- | ---------------- |
| `prompt` | string | yes      | Query to search  |
| `domain` | string | no       | Filter by domain |

### context_analyze

Full context analysis — combines entity extraction and knowledge retrieval.

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

For the complete list of all 200+ operations, see [Capabilities](/docs/capabilities/). For CLI commands, see [CLI Reference](/docs/cli-reference/). For term definitions, see [Glossary](/docs/glossary/).

:::note[Coverage]
This page documents the most commonly used operations. The remaining operations follow the same facade pattern — call with `op` and `params`. Use `admin_tool_list` to discover all available operations and their parameters in your running agent.
:::
