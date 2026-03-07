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
  "tool": "my_agent_core",
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
  "facade": "my_agent_core"
}
```

## Core Facade

The core facade contains all engine operations. Accessible as `<agent_id>_core`.

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

### create_plan

Create a multi-step execution plan.

| Param       | Type   | Required | Description                                |
| ----------- | ------ | -------- | ------------------------------------------ |
| `title`     | string | yes      | Plan title                                 |
| `objective` | string | yes      | What this plan achieves                    |
| `tasks`     | array  | yes      | `[{ title: string, description: string }]` |

### brain_recommend

Get context-aware recommendations.

| Param     | Type   | Required | Description                      |
| --------- | ------ | -------- | -------------------------------- |
| `context` | string | no       | Current task context             |
| `limit`   | number | no       | Max recommendations (default: 5) |

### orchestrate_plan

Create an orchestrated plan with vault + brain context.

| Param         | Type   | Required | Description            |
| ------------- | ------ | -------- | ---------------------- |
| `prompt`      | string | yes      | What needs to be done  |
| `projectPath` | string | yes      | Project directory path |

### playbook_list

List available playbooks.

| Param      | Type   | Required | Description        |
| ---------- | ------ | -------- | ------------------ |
| `category` | string | no       | Filter by category |
| `tag`      | string | no       | Filter by tag      |

### admin_health

No parameters. Returns system health status.

### admin_tool_list

No parameters. Returns all registered facades and their operations.

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

## Agent Facade

Agent-specific operations: `<agent_id>`.

### health

No parameters. Returns agent status and vault summary.

### identity

No parameters. Returns persona details (name, role, voice).

### activate

| Param         | Type   | Required | Description            |
| ------------- | ------ | -------- | ---------------------- |
| `projectPath` | string | yes      | Project to activate in |

### setup

No parameters. Returns setup checklist status.

---

For the complete list of all 160+ operations, see [Capabilities](/docs/capabilities/). For CLI commands, see [CLI Reference](/docs/cli-reference/). For term definitions, see [Glossary](/docs/glossary/).

:::note[Coverage]
This page documents the most commonly used operations. The remaining operations follow the same facade pattern — call with `op` and `params`. Use `admin_tool_list` to discover all available operations and their parameters in your running agent.
:::
