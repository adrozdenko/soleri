---
title: 'Security & Privacy'
description: 'Where your data lives, what your agent can access, and why your knowledge stays yours.'
---

Your agent runs on your machine. Your knowledge stays on your machine. This page explains exactly what that means.

## Everything runs locally

Your Soleri agent is a Node.js process that runs on your computer. It doesn't connect to any cloud service, doesn't send telemetry, and doesn't phone home. The only network calls happen if you explicitly configure optional integrations like LLM providers.

Out of the box: **zero network calls.**

## Where your data lives

All agent data is stored in local files within your agent's directory:

| Data              | Storage           | Format                                  |
| ----------------- | ----------------- | --------------------------------------- |
| Knowledge entries | SQLite database   | `.db` file with FTS5                    |
| Brain state       | JSON file         | Strength scores, sessions, TF-IDF index |
| Plans             | JSON file         | Plan history, reconciliation reports    |
| Configuration     | TypeScript + JSON | Agent identity, domains, settings       |

These are regular files on your filesystem. You can back them up, version-control them, inspect them, or delete them. There's no hidden state, no external database, no cloud sync.

## The agent can only respond to tool calls

Your agent doesn't have autonomous access to your system. It's an MCP tool server — it sits and waits for your AI editor to call its tools. It cannot:

- Read files on your machine (unless your AI editor passes file content to a tool)
- Execute commands or scripts
- Make network requests (unless you configure external integrations)
- Access other applications or processes
- Modify your codebase directly

The agent receives data through tool parameters and returns data through tool responses. That's the entire interaction surface.

## Auth levels

Every operation in your agent has an auth level that controls who can call it:

| Level     | Can do                                  | Examples                                                 |
| --------- | --------------------------------------- | -------------------------------------------------------- |
| **read**  | Query data, run searches, view stats    | `search`, `vault_stats`, `brain_recommend`               |
| **write** | Add or modify data                      | `capture_knowledge`, `create_plan`, `approve_plan`       |
| **admin** | Delete data, reset state, manage config | `vault_remove`, `admin_reset_cache`, `rollback_identity` |

These levels are enforced at the tool registration layer. A read-only tool cannot modify vault data, regardless of what parameters are passed.

## Governance prevents runaway growth

The governance system protects your vault from growing without bounds:

- **Capture quotas** — limits on how many entries can be added per time period
- **Proposal gates** — new entries can be held for review before becoming active
- **Duplicate detection** — prevents the same knowledge from being captured twice
- **Decay scanning** — identifies and flags unused entries

This means a long your AI editor session that captures 50 patterns won't silently fill your vault with noise. The governance layer evaluates each capture and may reject, defer, or merge entries that don't meet quality thresholds.

## What happens when you share the agent

Your agent's vault file is portable. If you share the SQLite database and brain state with a colleague, they get a copy of all your captured knowledge. This is by design — teams can share knowledge bases.

But sharing is explicit. There's no automatic sync, no shared server, no cloud repository. You decide what to share and how.

If you version-control your agent (including its data files), the knowledge base becomes part of your project history. Team members who clone the repo get the same agent with the same knowledge.

## Optional integrations

One optional feature does make network calls when configured:

### LLM providers

If you enable LLM-powered features (curator enrichment, knowledge extraction), the agent calls the configured LLM provider (Anthropic, OpenAI, etc.) with the specific text being processed. API keys are stored locally in your agent's configuration.

Both are opt-in. Neither is required for core functionality. The vault, brain, planning, and all 350+ operations work without any external service.

## Summary

| Question                     | Answer                                             |
| ---------------------------- | -------------------------------------------------- |
| Where is my data stored?     | Local files in your agent directory                |
| Does the agent phone home?   | No — zero network calls by default                 |
| Can the agent read my files? | No — it only receives data through tool parameters |
| Can the agent run commands?  | No — it only responds to MCP tool calls            |
| Is there telemetry?          | No                                                 |
| Can I inspect the data?      | Yes — SQLite and JSON files, standard formats      |
| Can I delete everything?     | Yes — delete the agent directory and it's gone     |
| Is sharing automatic?        | No — you explicitly choose what to share           |

## Reporting security issues

If you discover a security vulnerability, please report it to [hello@soleri.ai](mailto:hello@soleri.ai). Do not open a public GitHub issue for security vulnerabilities.

---

_Back to [Getting Started](/docs/getting-started/). See [Customizing Your Agent](/docs/guides/customizing/) for governance policies and hook configuration, or explore [Capabilities](/docs/capabilities/) for the full list of operations._
