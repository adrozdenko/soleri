---
title: Capabilities
description: Everything a Soleri agent can do — 160+ operations across vault, brain, planning, orchestration, and more.
---

Every Soleri agent ships with **160+ operations** out of the box. This page shows what your agent can do, grouped by category.

For parameter details on common operations, see the [API Reference](/docs/api-reference/). For CLI commands, see the [CLI Reference](/docs/cli-reference/). For term definitions, see the [Glossary](/docs/glossary/).

## Operation Summary

| Category                                      | Ops          | What it does                                         |
| --------------------------------------------- | ------------ | ---------------------------------------------------- |
| [Search & Vault](#search--vault)              | 16           | Store, search, and manage knowledge entries          |
| [Brain Intelligence](#brain-intelligence)     | 14           | Learning loop, pattern strength, recommendations     |
| [Planning](#planning)                         | 14           | Create plans, grade them, track execution, reconcile |
| [Curator](#curator)                           | 12           | Deduplication, health audits, enrichment             |
| [Control & Identity](#control--identity)      | 8            | Persona, intent routing, operational modes           |
| [Governance](#governance)                     | 5            | Policies, quotas, proposals                          |
| [Loops](#loops)                               | 7            | Iterative validation with convergence detection      |
| [Orchestration](#orchestration)               | 5            | Plan-execute-complete lifecycle                      |
| [Knowledge Capture](#knowledge-capture)       | 4            | Capture patterns and search with feedback            |
| [Cognee Integration](#cognee-integration)     | 5            | Vector search and knowledge graph (optional)         |
| [Project Registry](#project-registry)         | 12           | Multi-project management and linking                 |
| [Cross-Project Memory](#cross-project-memory) | 3            | Global promotion and cross-project search            |
| [Playbooks](#playbooks)                       | 3            | Multi-step validated procedures                      |
| [Admin](#admin)                               | 18           | Health checks, telemetry, diagnostics                |
| [LLM Management](#llm-management)             | 3            | Key pool, circuit breaker, model routing             |
| [Memory](#memory)                             | 4            | Export, import, stats, deletion                      |
| [Domain Facades](#domain-facades)             | 5 per domain | Domain-scoped CRUD + search                          |
| [Agent Ops](#agent-ops)                       | 5            | Health, identity, activation, setup                  |

## Search & Vault

Core knowledge storage and retrieval.

| Op                  | Auth  | Description                                                                     |
| ------------------- | ----- | ------------------------------------------------------------------------------- |
| `search`            | read  | Search across all domains. Ranked by TF-IDF + severity + recency + tag overlap. |
| `vault_stats`       | read  | Entry counts by type, domain, severity.                                         |
| `list_all`          | read  | List entries with optional filters and pagination.                              |
| `register`          | write | Register a project with quota and governance tracking.                          |
| `vault_get`         | read  | Fetch a specific entry by ID.                                                   |
| `vault_update`      | write | Update an existing entry.                                                       |
| `vault_remove`      | admin | Delete an entry.                                                                |
| `vault_bulk_add`    | write | Add multiple entries at once.                                                   |
| `vault_bulk_remove` | admin | Remove multiple entries at once.                                                |
| `vault_tags`        | read  | List all tags in the vault.                                                     |
| `vault_domains`     | read  | List all domains.                                                               |
| `vault_recent`      | read  | Recently added or modified entries.                                             |
| `vault_import`      | write | Import entries from JSON.                                                       |
| `vault_seed`        | write | Seed entries from intelligence data files.                                      |
| `vault_backup`      | read  | Export full vault as JSON.                                                      |
| `vault_age_report`  | read  | Show entry age distribution and decay candidates.                               |

## Brain Intelligence

The learning system that tracks pattern effectiveness.

| Op                         | Auth  | Description                                             |
| -------------------------- | ----- | ------------------------------------------------------- |
| `brain_session_context`    | read  | Current session context and active patterns.            |
| `brain_strengths`          | read  | Pattern strength scores across all entries.             |
| `brain_global_patterns`    | read  | Strongest patterns across all projects.                 |
| `brain_recommend`          | read  | Context-aware recommendations for current task.         |
| `brain_build_intelligence` | write | Rebuild TF-IDF vocabulary and re-score all entries.     |
| `brain_export`             | read  | Export brain state as JSON.                             |
| `brain_import`             | write | Import brain state from JSON.                           |
| `brain_extract_knowledge`  | write | Extract patterns from session history.                  |
| `brain_archive_sessions`   | write | Archive old sessions to free memory.                    |
| `brain_promote_proposals`  | write | Promote proposed entries to active based on confidence. |
| `brain_lifecycle`          | write | Run full lifecycle: extract, promote, archive.          |
| `brain_reset_extracted`    | admin | Reset extraction markers for reprocessing.              |
| `brain_feedback`           | write | Record feedback on a brain recommendation.              |
| `brain_feedback_stats`     | read  | Feedback acceptance/rejection rates.                    |

## Planning

Multi-step task planning with grading and drift detection.

| Op                        | Auth  | Description                                                        |
| ------------------------- | ----- | ------------------------------------------------------------------ |
| `create_plan`             | write | Create a new plan with title, objective, and tasks.                |
| `list_plans`              | read  | List all active plans.                                             |
| `get_plan`                | read  | Get a plan by ID with full details.                                |
| `approve_plan`            | write | Approve a draft plan and start execution.                          |
| `update_task`             | write | Update a task status within an executing plan.                     |
| `complete_plan`           | write | Mark an executing plan as completed.                               |
| `plan_iterate`            | write | Iterate on a draft plan to improve its grade.                      |
| `plan_split`              | write | Split a plan into executable tasks.                                |
| `plan_reconcile`          | write | Compare what was planned vs what happened. Generates drift report. |
| `plan_complete_lifecycle` | write | Extract knowledge from reconciled plan and archive.                |
| `plan_dispatch`           | read  | Generate subagent dispatch instructions from plan tasks.           |
| `plan_review`             | read  | Review a plan against quality criteria.                            |
| `plan_archive`            | write | Archive a completed plan.                                          |
| `plan_stats`              | read  | Planning statistics: total, by status, completion rate.            |

## Curator

Automated knowledge quality management.

| Op                        | Auth  | Description                                            |
| ------------------------- | ----- | ------------------------------------------------------ |
| `curator_status`          | read  | Curator health and configuration.                      |
| `curator_health_audit`    | read  | Full vault health audit — duplicates, staleness, gaps. |
| `curator_entry_history`   | read  | Change history for a specific entry.                   |
| `curator_record_snapshot` | write | Record a point-in-time vault snapshot.                 |
| `curator_queue_stats`     | read  | Pending enrichment and deduplication queue sizes.      |
| `curator_enrich`          | write | Enrich entries with LLM-generated metadata.            |
| `rebuild_index`           | write | Rebuild TF-IDF search index from all vault entries.    |
| `export_vault`            | read  | Export vault entries as JSON or markdown.              |
| `import_vault`            | write | Import vault entries from JSON.                        |
| `merge_duplicates`        | write | Merge identified duplicate entries.                    |
| `tag_normalize`           | write | Normalize tags across all entries.                     |
| `decay_scan`              | read  | Identify entries that haven't been used recently.      |

## Control & Identity

Agent persona and operational mode management.

| Op                   | Auth  | Description                                            |
| -------------------- | ----- | ------------------------------------------------------ |
| `get_identity`       | read  | Current agent identity and guidelines.                 |
| `update_identity`    | write | Update agent name, role, or voice.                     |
| `add_guideline`      | write | Add a behavioral guideline.                            |
| `remove_guideline`   | admin | Remove a guideline.                                    |
| `rollback_identity`  | admin | Rollback to a previous identity version.               |
| `route_intent`       | read  | Classify user intent (build, fix, review, plan, etc.). |
| `morph`              | write | Switch operational mode (build-mode, fix-mode, etc.).  |
| `get_behavior_rules` | read  | Current behavior rules and constraints.                |

## Governance

Policy enforcement and proposal management.

| Op                     | Auth  | Description                                          |
| ---------------------- | ----- | ---------------------------------------------------- |
| `governance_policy`    | read  | View or set governance policies (quotas, retention). |
| `governance_proposals` | read  | List pending governance proposals.                   |
| `governance_stats`     | read  | Governance metrics — approvals, rejections, quotas.  |
| `governance_expire`    | write | Expire stale proposals.                              |
| `governance_dashboard` | read  | Full governance dashboard with all metrics.          |

## Loops

Iterative validation for convergence-driven tasks.

| Op               | Auth  | Description                                    |
| ---------------- | ----- | ---------------------------------------------- |
| `loop_start`     | write | Start a validation loop with mode and target.  |
| `loop_iterate`   | write | Run one iteration and check convergence.       |
| `loop_status`    | read  | Current loop state, iteration count, progress. |
| `loop_cancel`    | write | Cancel an active loop.                         |
| `loop_history`   | read  | Past loop runs with outcomes.                  |
| `loop_is_active` | read  | Check if a loop is currently running.          |
| `loop_complete`  | write | Mark a loop as successfully completed.         |

## Orchestration

High-level plan-execute-complete lifecycle.

| Op                          | Auth  | Description                                                 |
| --------------------------- | ----- | ----------------------------------------------------------- |
| `orchestrate_plan`          | write | Create an orchestrated plan with vault + brain context.     |
| `orchestrate_execute`       | write | Start executing an orchestrated plan.                       |
| `orchestrate_complete`      | write | Complete with epilogue — capture knowledge, record session. |
| `orchestrate_status`        | read  | Current orchestration state.                                |
| `orchestrate_quick_capture` | write | Quick-capture knowledge during orchestration.               |

## Knowledge Capture

Dedicated capture and search-with-feedback ops.

| Op                   | Auth  | Description                                                 |
| -------------------- | ----- | ----------------------------------------------------------- |
| `capture_knowledge`  | write | Capture a pattern or anti-pattern with full metadata.       |
| `capture_quick`      | write | Quick capture — title and description, auto-infer the rest. |
| `search_intelligent` | read  | Semantic search with 6-dimension scoring.                   |
| `search_feedback`    | write | Rate a search result to improve future relevance.           |

## Cognee Integration

Optional vector search and knowledge graph via [Cognee](https://github.com/topoteretes/cognee).

| Op               | Auth  | Description                                    |
| ---------------- | ----- | ---------------------------------------------- |
| `cognee_status`  | read  | Cognee connection status and health.           |
| `cognee_search`  | read  | Vector similarity search across knowledge.     |
| `cognee_add`     | write | Add content to the Cognee knowledge graph.     |
| `cognee_cognify` | write | Process pending content into graph embeddings. |
| `cognee_config`  | write | Configure Cognee connection settings.          |

## Project Registry

Multi-project management and cross-project linking.

| Op                        | Auth  | Description                                      |
| ------------------------- | ----- | ------------------------------------------------ |
| `project_get`             | read  | Get registered project details.                  |
| `project_list`            | read  | List all registered projects.                    |
| `project_unregister`      | admin | Unregister a project.                            |
| `project_get_rules`       | read  | Get project-specific rules.                      |
| `project_list_rules`      | read  | List all rules across projects.                  |
| `project_add_rule`        | write | Add a project rule.                              |
| `project_remove_rule`     | admin | Remove a project rule.                           |
| `project_link`            | write | Link two projects (related, parent/child, fork). |
| `project_unlink`          | write | Remove a project link.                           |
| `project_get_links`       | read  | Get links for a project.                         |
| `project_linked_projects` | read  | List all linked projects with details.           |
| `project_touch`           | write | Update project last-accessed timestamp.          |

## Cross-Project Memory

Share knowledge across project boundaries.

| Op                            | Auth  | Description                                                |
| ----------------------------- | ----- | ---------------------------------------------------------- |
| `memory_promote_to_global`    | write | Promote a pattern to the global pool.                      |
| `memory_configure`            | write | Configure memory settings (extra paths, features).         |
| `memory_cross_project_search` | read  | Search across all linked projects with weighted relevance. |

## Playbooks

Multi-step validated procedures.

| Op                | Auth  | Description                                             |
| ----------------- | ----- | ------------------------------------------------------- |
| `playbook_list`   | read  | List available playbooks, optionally filtered.          |
| `playbook_get`    | read  | Get a playbook with full steps and validation criteria. |
| `playbook_create` | write | Create a new playbook with validated steps.             |

## Admin

System health, telemetry, and diagnostics.

| Op                       | Auth  | Description                                 |
| ------------------------ | ----- | ------------------------------------------- |
| `admin_health`           | read  | System health check.                        |
| `admin_tool_list`        | read  | List all registered facades and operations. |
| `admin_config`           | read  | Current agent configuration.                |
| `admin_vault_size`       | read  | Vault storage size on disk.                 |
| `admin_uptime`           | read  | Agent uptime since last start.              |
| `admin_version`          | read  | Engine and package versions.                |
| `admin_reset_cache`      | admin | Clear all caches.                           |
| `admin_diagnostic`       | read  | Full diagnostic report.                     |
| `admin_telemetry`        | read  | Facade call telemetry.                      |
| `admin_telemetry_recent` | read  | Recent telemetry events.                    |
| `admin_telemetry_reset`  | admin | Reset telemetry counters.                   |
| `admin_permissions`      | read  | Current auth permissions.                   |
| `admin_vault_analytics`  | read  | Vault usage analytics.                      |
| `admin_search_insights`  | read  | Top missed queries, relevance scores.       |
| `admin_module_status`    | read  | Status of each loaded module.               |
| `admin_env`              | read  | Environment variables (sanitized).          |
| `admin_gc`               | admin | Run garbage collection on stale data.       |
| `admin_export_config`    | read  | Export full agent configuration.            |

## LLM Management

Model routing with key pool and circuit breaker.

| Op           | Auth  | Description                                         |
| ------------ | ----- | --------------------------------------------------- |
| `llm_status` | read  | Available LLM providers and health.                 |
| `llm_rotate` | write | Rotate to next API key in pool.                     |
| `llm_call`   | write | Make an LLM call with automatic retry and failover. |

## Memory

Session and export management.

| Op              | Auth  | Description                  |
| --------------- | ----- | ---------------------------- |
| `memory_delete` | admin | Delete a memory entry.       |
| `memory_stats`  | read  | Memory usage statistics.     |
| `memory_export` | read  | Export all memories as JSON. |
| `memory_import` | write | Import memories from JSON.   |

## Domain Facades

Each knowledge domain gets its own facade with 5 operations:

| Op             | Auth  | Description                                        |
| -------------- | ----- | -------------------------------------------------- |
| `get_patterns` | read  | List domain entries filtered by tags and severity. |
| `search`       | read  | Domain-scoped intelligent search.                  |
| `get_entry`    | read  | Fetch a specific entry by ID.                      |
| `capture`      | write | Add a new pattern (with governance gating).        |
| `remove`       | admin | Delete an entry from this domain.                  |

Domains are added with `npx @soleri/cli add-domain <name>`.

## Agent Ops

Agent-specific operations (generated per agent):

| Op                 | Auth  | Description                                              |
| ------------------ | ----- | -------------------------------------------------------- |
| `health`           | read  | Agent health — vault status, persona info.               |
| `identity`         | read  | Returns agent persona details.                           |
| `activate`         | write | Activate agent, seed CLAUDE.md.                          |
| `inject_claude_md` | write | Inject agent config into CLAUDE.md.                      |
| `setup`            | read  | Setup status — CLAUDE.md, hooks, vault, recommendations. |
