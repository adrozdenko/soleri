---
title: Capabilities
description: Everything a Soleri agent can do — 350+ operations across 22 facades covering vault, brain, planning, orchestration, and more.
---

Every Soleri agent ships with **350+ operations** across **22 engine modules** out of the box. This page shows what your agent can do, grouped by facade.

For parameter details on common operations, see the [API Reference](/docs/api-reference/). For CLI commands, see the [CLI Reference](/docs/cli-reference/). For term definitions, see the [Glossary](/docs/glossary/).

## Facade Summary

| Facade                            | Ops          | What it does                                             |
| --------------------------------- | ------------ | -------------------------------------------------------- |
| [Vault](#vault)                   | 26           | Store, search, capture, and manage knowledge             |
| [Admin](#admin)                   | 56           | Health checks, telemetry, plugins, packs, accounts       |
| [Chat](#chat)                     | 41           | Session management, auth, voice, browser, notifications  |
| [Plan](#plan)                     | 32           | Plans, grading, verification, evidence, reconciliation   |
| [Brain](#brain)                   | 30           | Learning loop, pattern strength, recommendations, radar  |
| [Orchestrate](#orchestrate)       | 26           | Lifecycle, projects, playbooks                           |
| [Memory](#memory)                 | 15           | Cross-session, cross-project, export/import              |
| [Agency](#agency)                 | 15           | Proactive intelligence, file watching, pattern surfacing |
| [Curator](#curator)               | 13           | Deduplication, health audits, enrichment, contradictions |
| [Control](#control)               | 13           | Persona, intent routing, modes, governance               |
| [Archive](#archive)               | 12           | Archival, lifecycle, temporal, knowledge maintenance      |
| [Operator](#operator)             | 10           | Operator profile learning, signals, adaptation           |
| [Loop](#loop)                     | 9            | Iterative validation with convergence detection          |
| [Links](#links)                   | 9            | Zettelkasten linking, traversal, orphan detection        |
| [Sync](#sync)                     | 8            | Git sync, Obsidian sync, pack synchronization            |
| [Intake](#intake)                 | 7            | Content ingestion — books, URLs, text, batch import      |
| [Tier](#tier)                     | 7            | Multi-vault tiers — connect sources, search across       |
| [Branching](#branching)           | 5            | Vault branching — create, list, merge, delete            |
| [Review](#review)                 | 5            | Knowledge review workflow — submit, approve, reject      |
| [Context](#context)               | 3            | Entity extraction, knowledge retrieval, analysis         |
| [Embedding](#embedding)           | 3            | Embedding status, batch rebuild, single-entry embedding  |
| [Dream](#dream)                   | 3            | Memory consolidation, vault cleanup, maintenance         |
| [Domain Facades](#domain-facades) | 5 per domain | Domain-scoped CRUD + search                              |

## Vault

Core knowledge storage, retrieval, capture, and sharing scope. Archival, sync, review, linking, branching, tier, and intake ops have moved to dedicated facades — see [Archive](#archive), [Sync](#sync), [Review](#review), [Links](#links), [Branching](#branching), [Tier](#tier), and [Intake](#intake). Backward-compatible stubs remain on the vault facade for existing agents.

### Search & CRUD

| Op                  | Auth  | Description                                                                     |
| ------------------- | ----- | ------------------------------------------------------------------------------- |
| `search`            | read  | Search with two-pass retrieval. `mode:"scan"` for lightweight, `mode:"full"` for complete. |
| `load_entries`      | read  | Two-pass retrieval pass 2 — load full entries by IDs from a previous scan.      |
| `vault_stats`       | read  | Entry counts by type, domain, severity.                                         |
| `list_all`          | read  | List entries with optional filters and pagination.                              |
| `vault_get`         | read  | Fetch a specific entry by ID.                                                   |
| `vault_update`      | write | Update an existing entry.                                                       |
| `vault_remove`      | admin | Delete an entry.                                                                |
| `vault_bulk_add`    | write | Add multiple entries at once.                                                   |
| `vault_bulk_remove` | admin | Remove multiple entries at once.                                                |
| `vault_tags`        | read  | List all tags in the vault.                                                     |
| `vault_domains`     | read  | List all domains.                                                               |
| `vault_recent`      | read  | Recently added or modified entries.                                             |
| `export`            | read  | Export vault entries as JSON intelligence bundles.                               |

### Knowledge Capture

| Op                   | Auth  | Description                                                 |
| -------------------- | ----- | ----------------------------------------------------------- |
| `capture_knowledge`  | write | Capture a pattern or anti-pattern with full metadata.       |
| `capture_quick`      | write | Quick capture — title and description, auto-infer the rest. |
| `capture_enriched`   | write | Capture with LLM-enriched metadata (auto-tags, severity).   |
| `search_intelligent` | read  | Semantic search with 6-dimension scoring.                   |
| `search_feedback`    | write | Rate a search result to improve future relevance.           |

### Import & Dedup

| Op                     | Auth  | Description                                 |
| ---------------------- | ----- | ------------------------------------------- |
| `vault_import`         | write | Import entries from JSON.                   |
| `vault_seed`           | write | Seed entries from intelligence data files.  |
| `vault_seed_canonical` | write | Seed canonical entries from markdown files. |
| `vault_content_hash`   | read  | Content hash for an entry (dedup key).      |
| `vault_dedup_status`   | read  | Deduplication status across vault.          |

### Sharing & Scoping

| Op                    | Auth  | Description                                                |
| --------------------- | ----- | ---------------------------------------------------------- |
| `vault_detect_scope`  | read  | Detect whether an entry is agent, project, or team scoped. |
| `vault_list_by_scope` | read  | List entries filtered by scope.                            |
| `vault_set_scope`     | write | Change an entry's scope.                                   |

## Admin

System health, telemetry, plugins, packs, accounts, and diagnostics.

### Core Admin

| Op                            | Auth  | Description                                 |
| ----------------------------- | ----- | ------------------------------------------- |
| `admin_health`                | read  | System health check.                        |
| `admin_tool_list`             | read  | List all registered facades and operations. |
| `admin_config`                | read  | Current agent configuration.                |
| `admin_vault_size`            | read  | Vault storage size on disk.                 |
| `admin_uptime`                | read  | Agent uptime since last start.              |
| `admin_version`               | read  | Engine and package versions.                |
| `admin_reset_cache`           | admin | Clear all caches.                           |
| `admin_diagnostic`            | read  | Full diagnostic report.                     |
| `admin_permissions`           | read  | Current auth permissions.                   |
| `admin_module_status`         | read  | Status of each loaded module.               |
| `admin_env`                   | read  | Environment variables (sanitized).          |
| `admin_gc`                    | admin | Run garbage collection on stale data.       |
| `admin_export_config`         | read  | Export full agent configuration.            |
| `admin_validate_instructions` | read  | Validate instruction files for quality.     |
| `admin_persistence_info`      | read  | Session store persistence status.           |
| `admin_setup_check`           | read  | Check setup completion status.              |
| `admin_setup_run`             | admin | Run global setup (hooks, CLAUDE.md).        |
| `admin_hot_reload`            | admin | Hot-reload agent configuration.             |
| `admin_subsystem_health`      | read  | Per-subsystem health status.                |
| `admin_health_snapshot`       | read  | Point-in-time health snapshot.              |

### Telemetry

| Op                       | Auth  | Description                           |
| ------------------------ | ----- | ------------------------------------- |
| `admin_telemetry`        | read  | Facade call telemetry.                |
| `admin_telemetry_recent` | read  | Recent telemetry events.              |
| `admin_telemetry_reset`  | admin | Reset telemetry counters.             |
| `admin_vault_analytics`  | read  | Vault usage analytics.                |
| `admin_search_insights`  | read  | Top missed queries, relevance scores. |
| `telemetry_errors`       | read  | Error telemetry data.                 |
| `telemetry_slow_ops`     | read  | Slow operation telemetry.             |

### LLM Management

| Op                      | Auth  | Description                                         |
| ----------------------- | ----- | --------------------------------------------------- |
| `llm_status`            | read  | Available LLM providers and health.                 |
| `llm_rotate`            | write | Rotate to next API key in pool.                     |
| `llm_call`              | write | Make an LLM call with automatic retry and failover. |
| `render_prompt`         | read  | Render a prompt template with variables.            |
| `list_templates`        | read  | List available prompt templates.                    |
| `admin_key_pool_status` | read  | Key pool status (size, active key, circuit state).  |

### Plugins

| Op                    | Auth  | Description                           |
| --------------------- | ----- | ------------------------------------- |
| `plugin_list`         | read  | List all registered plugins.          |
| `plugin_status`       | read  | Detailed status of a specific plugin. |
| `plugin_load`         | write | Load a plugin dynamically.            |
| `plugin_activate`     | write | Activate a loaded plugin.             |
| `plugin_deactivate`   | write | Deactivate a plugin.                  |
| `admin_list_plugins`  | read  | List plugins with metadata.           |
| `admin_plugin_status` | read  | Plugin health and configuration.      |

### Knowledge Packs

| Op               | Auth  | Description                                  |
| ---------------- | ----- | -------------------------------------------- |
| `pack_list`      | read  | List available knowledge packs.              |
| `pack_install`   | write | Install a knowledge pack.                    |
| `pack_uninstall` | write | Uninstall a knowledge pack.                  |
| `pack_validate`  | read  | Validate a knowledge pack before installing. |

### Accounts & Tokens

| Op                     | Auth  | Description                                        |
| ---------------------- | ----- | -------------------------------------------------- |
| `admin_add_account`    | admin | Add an API account profile with encrypted storage. |
| `admin_remove_account` | admin | Remove an API account profile.                     |
| `admin_rotate_account` | admin | Rotate to a different API account.                 |
| `admin_list_accounts`  | admin | List all account profiles (keys never exposed).    |
| `admin_account_status` | read  | Current active account status.                     |
| `admin_create_token`   | admin | Create a named API token with role-based access.   |
| `admin_revoke_token`   | admin | Revoke an API token.                               |
| `admin_list_tokens`    | admin | List all tokens (names and roles only).            |

### Feature Flags

| Op                 | Auth  | Description                |
| ------------------ | ----- | -------------------------- |
| `admin_list_flags` | read  | List all feature flags.    |
| `admin_get_flag`   | read  | Get a specific flag value. |
| `admin_set_flag`   | admin | Set a feature flag.        |

## Chat

Session management, authentication, response chunking, MCP bridge, voice, notifications, browser isolation, and message queue for chat transports (Telegram, web, etc.).

### Sessions

| Op                    | Auth  | Description                          |
| --------------------- | ----- | ------------------------------------ |
| `chat_session_init`   | write | Initialize chat session management.  |
| `chat_session_get`    | read  | Get or create a chat session by ID.  |
| `chat_session_append` | write | Append a message to a session.       |
| `chat_session_clear`  | write | Clear message history for a session. |
| `chat_session_delete` | write | Delete a session entirely.           |
| `chat_session_list`   | read  | List all session IDs.                |

### Response Chunking

| Op                    | Auth | Description                                           |
| --------------------- | ---- | ----------------------------------------------------- |
| `chat_chunk_response` | read | Split a long response into chunks for chat platforms. |

### Authentication

| Op                       | Auth  | Description                              |
| ------------------------ | ----- | ---------------------------------------- |
| `chat_auth_init`         | write | Initialize chat authentication.          |
| `chat_auth_check`        | read  | Check if a user is authenticated.        |
| `chat_auth_authenticate` | write | Authenticate a user with a passphrase.   |
| `chat_auth_revoke`       | write | Revoke authentication for a user.        |
| `chat_auth_status`       | read  | Auth status — enabled, user count, list. |

### MCP Bridge

| Op                     | Auth  | Description                                    |
| ---------------------- | ----- | ---------------------------------------------- |
| `chat_bridge_init`     | write | Initialize the MCP tool bridge.                |
| `chat_bridge_register` | write | Register a tool with the bridge.               |
| `chat_bridge_list`     | read  | List registered bridge tools.                  |
| `chat_bridge_execute`  | write | Execute a registered tool via the bridge.      |
| `chat_compress_output` | read  | Compress verbose tool output for chat display. |

### Task Cancellation

| Op                   | Auth  | Description                               |
| -------------------- | ----- | ----------------------------------------- |
| `chat_cancel_create` | write | Create an AbortSignal for a chat task.    |
| `chat_cancel_stop`   | write | Cancel the running task for a chat.       |
| `chat_cancel_status` | read  | Cancellation status — running tasks info. |

### Self-Update

| Op                    | Auth  | Description                                       |
| --------------------- | ----- | ------------------------------------------------- |
| `chat_update_init`    | write | Initialize the self-update manager.               |
| `chat_update_request` | write | Request a restart (self-update, rebuild, manual). |
| `chat_update_confirm` | write | Clear restart context after successful startup.   |

### File Handling

| Op                        | Auth  | Description                                         |
| ------------------------- | ----- | --------------------------------------------------- |
| `chat_file_detect_intent` | read  | Detect intent for a file — vision, text, or intake. |
| `chat_file_build_content` | read  | Build multimodal content from a file.               |
| `chat_file_cleanup`       | write | Clean up temp files older than threshold.           |

### Notifications

| Op                   | Auth  | Description                          |
| -------------------- | ----- | ------------------------------------ |
| `chat_notify_init`   | write | Initialize the notification engine.  |
| `chat_notify_start`  | write | Start the notification polling loop. |
| `chat_notify_stop`   | write | Stop the notification polling loop.  |
| `chat_notify_poll`   | write | Run all notification checks once.    |
| `chat_notify_status` | read  | Notification engine status.          |

### Voice

| Op                      | Auth  | Description                                   |
| ----------------------- | ----- | --------------------------------------------- |
| `chat_voice_transcribe` | write | Transcribe audio using OpenAI Whisper.        |
| `chat_voice_synthesize` | write | Synthesize speech from text using OpenAI TTS. |

### Message Queue

| Op                 | Auth  | Description                                       |
| ------------------ | ----- | ------------------------------------------------- |
| `chat_queue_init`  | write | Initialize disk-based message queue.              |
| `chat_queue_inbox` | read  | Read pending messages from inbox.                 |
| `chat_queue_reply` | write | Send a reply to a queued message.                 |
| `chat_queue_drain` | write | Drain outbox — read and remove pending responses. |

### Browser Session

| Op                     | Auth  | Description                                       |
| ---------------------- | ----- | ------------------------------------------------- |
| `chat_browser_init`    | write | Initialize per-chat Playwright browser isolation. |
| `chat_browser_acquire` | write | Get or create a browser session for a chat.       |
| `chat_browser_release` | write | Release a browser session.                        |
| `chat_browser_status`  | read  | Browser session status — active sessions info.    |

## Plan

Multi-step task planning with grading, verification, evidence, and drift detection.

### Core Planning

| Op                | Auth  | Description                                             |
| ----------------- | ----- | ------------------------------------------------------- |
| `create_plan`     | write | Create a new plan with title, objective, and tasks.     |
| `list_plans`      | read  | List all active plans.                                  |
| `get_plan`        | read  | Get a plan by ID with full details.                     |
| `approve_plan`    | write | Approve a draft plan (2-gate system: plan then tasks).  |
| `update_task`     | write | Update a task status within an executing plan.          |
| `complete_plan`   | write | Mark an executing plan as completed.                    |
| `plan_iterate`    | write | Iterate on a draft plan to improve its grade.           |
| `plan_split`      | write | Split a plan into executable tasks.                     |
| `plan_brainstorm` | write | Design-before-code brainstorming with domain awareness. |

### Reconciliation

| Op                        | Auth  | Description                                                        |
| ------------------------- | ----- | ------------------------------------------------------------------ |
| `plan_reconcile`          | write | Compare what was planned vs what happened. Generates drift report. |
| `plan_auto_reconcile`     | write | Automated reconciliation with fast-path option.                    |
| `plan_complete_lifecycle` | write | Extract knowledge from reconciled plan and archive.                |

### Grading

| Op                   | Auth  | Description                                          |
| -------------------- | ----- | ---------------------------------------------------- |
| `plan_grade`         | read  | Grade a plan against quality criteria.               |
| `plan_check_history` | read  | View grading check history for a plan.               |
| `plan_latest_check`  | read  | Get the most recent grading check.                   |
| `plan_meets_grade`   | read  | Check if a plan meets a target grade.                |
| `plan_auto_improve`  | write | Automatically improve a plan to meet a target grade. |

### Verification & Evidence

| Op                         | Auth  | Description                                              |
| -------------------------- | ----- | -------------------------------------------------------- |
| `plan_submit_evidence`     | write | Submit evidence (test output, etc.) for task acceptance. |
| `plan_submit_deliverable`  | write | Submit a deliverable for a task.                         |
| `plan_verify_task`         | read  | Verify task completion — checks evidence + reviews.      |
| `plan_verify_deliverables` | read  | Verify all deliverables for a task.                      |
| `plan_verify_plan`         | read  | Verify full plan completion — all tasks verified.        |
| `plan_validate`            | write | Run post-execution validation checks.                    |

### Review

| Op                    | Auth  | Description                             |
| --------------------- | ----- | --------------------------------------- |
| `plan_review`         | read  | Review a plan against quality criteria. |
| `plan_review_spec`    | write | Stage 1: spec compliance review.        |
| `plan_review_quality` | write | Stage 2: code quality review.           |
| `plan_review_outcome` | write | Record outcome of a review.             |

### Execution & Metrics

| Op                         | Auth  | Description                                  |
| -------------------------- | ----- | -------------------------------------------- |
| `plan_dispatch`            | read  | Generate subagent dispatch instructions.     |
| `plan_record_task_metrics` | write | Record execution metrics for a task.         |
| `plan_execution_metrics`   | read  | Get execution metrics for a plan.            |
| `plan_stats`               | read  | Planning statistics: total, by status, rate. |
| `plan_archive`             | write | Archive a completed plan.                    |

## Orchestrate

High-level plan-execute-complete lifecycle, project management, and playbooks.

### Lifecycle

| Op                          | Auth  | Description                                                 |
| --------------------------- | ----- | ----------------------------------------------------------- |
| `register`                  | write | Register a project with the orchestrator.                   |
| `orchestrate_plan`          | write | Create an orchestrated plan with vault + brain context.     |
| `orchestrate_execute`       | write | Start executing an orchestrated plan.                       |
| `orchestrate_complete`      | write | Complete with epilogue — evidence report, fix-trail quality signals, knowledge capture, session record. |
| `orchestrate_status`        | read  | Current orchestration state.                                |
| `orchestrate_quick_capture` | write | Quick-capture knowledge during orchestration.               |

### Project Registry

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

### Playbooks

Multi-step validated procedures stored in the vault.

| Op                  | Auth  | Description                                             |
| ------------------- | ----- | ------------------------------------------------------- |
| `playbook_list`     | read  | List available playbooks, optionally filtered.          |
| `playbook_get`      | read  | Get a playbook with full steps and validation criteria. |
| `playbook_create`   | write | Create a new playbook with validated steps.             |
| `playbook_start`    | write | Start executing a playbook.                             |
| `playbook_step`     | write | Execute the next step in a running playbook.            |
| `playbook_complete` | write | Complete a running playbook.                            |
| `playbook_match`    | read  | Find playbooks that match a given context.              |
| `playbook_seed`     | write | Seed playbooks from template data.                      |

## Brain

The learning system that tracks pattern effectiveness, with a built-in learning radar and knowledge synthesizer.

### Intelligence Pipeline

| Op                         | Auth  | Description                                                                     |
| -------------------------- | ----- | ------------------------------------------------------------------------------- |
| `brain_session_context`    | read  | Current session context and active patterns.                                    |
| `brain_strengths`          | read  | Pattern strength scores — 4-signal scoring: usage, spread, success, recency.    |
| `brain_global_patterns`    | read  | Cross-domain pattern registry — patterns appearing across multiple domains.     |
| `brain_recommend`          | read  | Context-aware recommendations for current task with domain and source matching. |
| `brain_build_intelligence` | write | Run full intelligence pipeline: strengths, global registry, domain profiles.    |
| `brain_export`             | read  | Export all brain intelligence data as JSON.                                     |
| `brain_import`             | write | Import brain intelligence data from a previous export.                          |
| `brain_stats`              | read  | Comprehensive brain statistics including intelligence pipeline stats.           |
| `brain_decay_report`       | read  | Temporal decay scores — reveals expiring, active, or expired entries.           |
| `llm_status`               | read  | LLM provider availability, key pool status, model routing config.              |

### Sessions & Knowledge Extraction

| Op                         | Auth  | Description                                                     |
| -------------------------- | ----- | --------------------------------------------------------------- |
| `brain_lifecycle`          | write | Start or end a brain session — tracks tools, files, plan context. |
| `brain_extract_knowledge`  | write | Extract knowledge proposals from a session using 6 heuristic rules. |
| `brain_archive_sessions`   | write | Archive completed sessions older than N days.                   |
| `brain_promote_proposals`  | write | Promote knowledge proposals to vault entries (governance-gated). |
| `brain_reset_extracted`    | write | Reset extraction status on sessions for re-extraction.          |
| `session_list`             | read  | List brain sessions with filters: domain, active, extracted.    |
| `session_get`              | read  | Get a specific brain session by ID.                             |
| `session_quality`          | read  | 4-dimension quality score: completeness, artifacts, tools, outcome. |
| `session_replay`           | read  | Replay a session — data, quality score, proposals, duration.    |

### Feedback

| Op                    | Auth  | Description                                                                 |
| --------------------- | ----- | --------------------------------------------------------------------------- |
| `record_feedback`     | write | Record feedback on a search result — accepted or dismissed.                 |
| `brain_feedback`      | write | Enhanced feedback with typed actions, source tracking, confidence, duration. |
| `brain_feedback_stats` | read  | Feedback statistics — counts by action/source, acceptance rate.             |
| `rebuild_vocabulary`  | write | Force rebuild the TF-IDF vocabulary from all vault entries.                 |

### Learning Radar

Detects patterns from corrections, search misses, and workarounds. Auto-captures high-confidence signals, queues medium for review.

| Op                 | Auth  | Description                                                           |
| ------------------ | ----- | --------------------------------------------------------------------- |
| `radar_analyze`    | write | Analyze a learning signal — routes by confidence to capture or queue. |
| `radar_candidates` | read  | Get pending radar candidates queued for review.                       |
| `radar_approve`    | write | Approve a pending candidate — captures it to vault.                   |
| `radar_dismiss`    | write | Dismiss one or more candidates — single ID or array.                  |
| `radar_flush`      | write | Auto-capture all pending candidates above a confidence threshold.     |
| `radar_stats`      | read  | Radar statistics — analyzed, captured, queued, dismissed, gaps.       |

### Knowledge Synthesis

| Op           | Auth | Description                                                                      |
| ------------ | ---- | -------------------------------------------------------------------------------- |
| `synthesize` | read | Synthesize vault knowledge into briefs, outlines, talking points, or post drafts. |

## Memory

Cross-session, cross-project knowledge persistence.

| Op                            | Auth  | Description                                                  |
| ----------------------------- | ----- | ------------------------------------------------------------ |
| `memory_search`               | read  | Search across memory sources (patterns, sessions, identity). |
| `memory_capture`              | write | Capture a memory entry.                                      |
| `memory_list`                 | read  | List memory entries.                                         |
| `session_capture`             | write | Capture current session context.                             |
| `memory_by_project`           | read  | List memories for a specific project.                        |
| `memory_deduplicate`          | write | Deduplicate memory entries.                                  |
| `memory_delete`               | admin | Delete a memory entry.                                       |
| `memory_export`               | read  | Export all memories as JSON.                                 |
| `memory_import`               | write | Import memories from JSON.                                   |
| `memory_prune`                | write | Prune old or low-value memories.                             |
| `memory_stats`                | read  | Memory usage statistics.                                     |
| `memory_topics`               | read  | Extract topic clusters from memories.                        |
| `memory_configure`            | write | Configure memory settings (extra paths, features).           |
| `memory_cross_project_search` | read  | Search across all linked projects with weighted relevance.   |
| `memory_promote_to_global`    | write | Promote a pattern to the global pool.                        |

## Curator

Automated knowledge quality management.

| Op                              | Auth  | Description                                               |
| ------------------------------- | ----- | --------------------------------------------------------- |
| `curator_status`                | read  | Curator health and configuration.                         |
| `curator_health_audit`          | read  | Full vault health audit — duplicates, staleness, gaps.    |
| `curator_detect_duplicates`     | write | Detect duplicate entries in the vault.                    |
| `curator_contradictions`        | read  | Detect pattern vs anti-pattern conflicts.                 |
| `curator_resolve_contradiction` | write | Resolve a detected contradiction.                         |
| `curator_hybrid_contradictions` | read  | Detect contradictions using hybrid (FTS + vector) search. |
| `curator_groom`                 | write | Groom specific entries with updated tags.                 |
| `curator_groom_all`             | write | Groom all entries in a project vault.                     |
| `curator_consolidate`           | write | Run full consolidation (dedup, archive, contradictions).  |
| `curator_enrich`                | write | Enrich entries with LLM-generated metadata.               |
| `curator_entry_history`         | read  | Change history for a specific entry.                      |
| `curator_record_snapshot`       | write | Record a point-in-time vault snapshot.                    |
| `curator_queue_stats`           | read  | Pending enrichment and deduplication queue sizes.         |

## Control

Agent persona, intent routing, operational modes, and governance.

### Identity

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

### Governance

| Op                     | Auth  | Description                                          |
| ---------------------- | ----- | ---------------------------------------------------- |
| `governance_policy`    | read  | View or set governance policies (quotas, retention). |
| `governance_proposals` | read  | List pending governance proposals.                   |
| `governance_stats`     | read  | Governance metrics — approvals, rejections, quotas.  |
| `governance_expire`    | write | Expire stale proposals.                              |
| `governance_dashboard` | read  | Full governance dashboard with all metrics.          |

## Loop

Iterative validation for convergence-driven tasks.

| Op                   | Auth  | Description                                    |
| -------------------- | ----- | ---------------------------------------------- |
| `loop_start`         | write | Start a validation loop with mode and target.  |
| `loop_iterate`       | write | Run one iteration and check convergence.       |
| `loop_iterate_gate`  | write | Gate check — should iteration continue?        |
| `loop_status`        | read  | Current loop state, iteration count, progress. |
| `loop_cancel`        | write | Cancel an active loop.                         |
| `loop_history`       | read  | Past loop runs with outcomes.                  |
| `loop_is_active`     | read  | Check if a loop is currently running.          |
| `loop_complete`      | write | Mark a loop as successfully completed.         |
| `loop_anomaly_check` | read  | Check for anomalies in loop iteration data.    |

## Agency

Proactive file watching, pattern surfacing, warning detection, and proactive intelligence. When enabled, your agent monitors file changes and surfaces relevant vault patterns without being asked.

### Core

| Op                        | Auth  | Description                                               |
| ------------------------- | ----- | --------------------------------------------------------- |
| `agency_enable`           | write | Enable agency mode — starts proactive file watching.      |
| `agency_disable`          | write | Disable agency mode — stops watching and clears state.    |
| `agency_status`           | read  | Agency status — enabled, watching, detectors, pending.    |
| `agency_config`           | write | Update watch paths, extensions, debounce, thresholds.     |
| `agency_scan_file`        | read  | Manually scan a file for warnings.                        |
| `agency_warnings`         | read  | Get all pending warnings from recent file scans.          |
| `agency_surface_patterns` | read  | Surface vault patterns relevant to a file change.         |
| `agency_clarify`          | read  | Generate clarification question when intent is ambiguous. |

### Proactive Intelligence

| Op                          | Auth  | Description                                                                   |
| --------------------------- | ----- | ----------------------------------------------------------------------------- |
| `agency_suggestions`        | read  | Evaluate suggestion rules and return triggered proactive suggestions.         |
| `agency_rich_clarify`       | read  | Structured clarification questions with urgency, options, and implications.   |
| `agency_suppress_warning`   | write | Suppress a warning by ID — prevents it from appearing in pending warnings.    |
| `agency_unsuppress_warning` | write | Remove suppression for a warning.                                             |
| `agency_dismiss_pattern`    | write | Dismiss a surfaced pattern for 24h — prevents re-surfacing.                   |
| `agency_notifications`      | read  | Drain pending notifications — returns and clears the notification queue.      |
| `agency_full_status`        | read  | Full status including suggestions, suppressions, dismissals, and notifications. |

## Context

Entity extraction, knowledge retrieval, and context analysis. Used internally by the orchestrator and available for direct use.

| Op                           | Auth | Description                                                                |
| ---------------------------- | ---- | -------------------------------------------------------------------------- |
| `context_extract_entities`   | read | Extract named entities from a prompt — files, functions, domains, actions. |
| `context_retrieve_knowledge` | read | Retrieve relevant knowledge from vault (FTS) and brain.                    |
| `context_analyze`            | read | Full context analysis — entities, knowledge, confidence, domains.          |

## Archive

Vault archival, lifecycle management, temporal metadata, and knowledge maintenance. These ops were previously part of the Vault facade and are still accessible there for backward compatibility. See [Sync & Export](/docs/guides/vault-sync/) for sync workflows.

### Archival & Backup

| Op               | Auth  | Description                                                     |
| ---------------- | ----- | --------------------------------------------------------------- |
| `vault_archive`  | write | Archive entries older than N days to the archive table.          |
| `vault_restore`  | write | Restore an archived entry back to the active entries table.      |
| `vault_optimize` | write | Optimize vault database — VACUUM, ANALYZE, FTS index rebuild.   |
| `vault_backup`   | read  | Export the full vault as a JSON bundle for backup or transfer.   |

### Temporal

| Op                    | Auth  | Description                                              |
| --------------------- | ----- | -------------------------------------------------------- |
| `vault_age_report`    | read  | Entry age distribution — today, week, month, quarter.    |
| `vault_set_temporal`  | write | Set valid_from and valid_until timestamps on an entry.   |
| `vault_find_expiring` | read  | Find entries expiring within a given number of days.     |
| `vault_find_expired`  | read  | List expired entries (valid_until in the past).          |

### Knowledge Lifecycle

| Op                     | Auth  | Description                                                  |
| ---------------------- | ----- | ------------------------------------------------------------ |
| `knowledge_audit`      | read  | Audit vault quality — coverage gaps, staleness, tag health.  |
| `knowledge_health`     | read  | Health metrics — freshness, staleness, contradiction signals. |
| `knowledge_merge`      | write | Merge two similar entries — keeps best metadata from both.   |
| `knowledge_reorganize` | write | Re-categorize entries — rename domains/tags. Dry-run by default. |

## Operator

Operator profile learning — tracks personality, preferences, expertise, and communication style across sessions. Builds an adaptive profile from accumulated signals. See [Operator Learning](/docs/guides/operator-learning/) for how the profile evolves.

| Op                       | Auth  | Description                                                  |
| ------------------------ | ----- | ------------------------------------------------------------ |
| `profile_get`            | read  | Get the full operator profile or a specific section.         |
| `profile_update_section` | write | Update a specific profile section with new data.             |
| `profile_correct`        | write | Correct a profile section — takes a snapshot before overwriting. |
| `profile_delete`         | admin | Delete the operator profile (takes a snapshot first).        |
| `profile_export`         | read  | Export the operator profile as markdown or JSON.             |
| `signal_accumulate`      | write | Accumulate operator signals for later synthesis.             |
| `signal_list`            | read  | List operator signals with optional type/processed filters.  |
| `signal_stats`           | read  | Signal statistics — counts by type, unprocessed total.       |
| `synthesis_check`        | read  | Check if a synthesis pass is due based on thresholds.        |
| `profile_snapshot`       | write | Create a versioned snapshot of the current profile.          |

## Sync

Git synchronization, Obsidian bidirectional sync, and shareable pack import/export. These ops were previously part of the Vault facade. See [Sync & Export](/docs/guides/vault-sync/) for usage guides.

### Git Sync

| Op               | Auth  | Description                                                       |
| ---------------- | ----- | ----------------------------------------------------------------- |
| `vault_git_push` | write | Push vault entries to a git-tracked directory as JSON files.       |
| `vault_git_pull` | write | Pull entries from a git directory into vault with conflict resolution. |
| `vault_git_sync` | write | Bidirectional sync — push vault entries, pull git-only entries.    |

### Obsidian Sync

| Op                | Auth  | Description                                                |
| ----------------- | ----- | ---------------------------------------------------------- |
| `obsidian_export` | read  | Export vault entries to Obsidian-compatible markdown.       |
| `obsidian_import` | write | Import Obsidian markdown files with YAML frontmatter.      |
| `obsidian_sync`   | write | Bidirectional sync with Obsidian (push, pull, or both).    |

### Pack Sync

| Op                  | Auth  | Description                                                         |
| ------------------- | ----- | ------------------------------------------------------------------- |
| `vault_export_pack` | read  | Export vault entries as a shareable intelligence pack with links.    |
| `vault_import_pack` | write | Import an intelligence pack with content-hash dedup and link import. |

## Review

Knowledge review workflow — team review with submit, approve, reject lifecycle. These ops were previously part of the Vault facade. See [Knowledge Review Workflow](/docs/guides/knowledge-review/) for the full review process.

| Op                      | Auth  | Description                                          |
| ----------------------- | ----- | ---------------------------------------------------- |
| `vault_submit_review`   | write | Submit a vault entry for team review.                |
| `vault_approve`         | admin | Approve a pending entry (pending_review to approved). |
| `vault_reject`          | admin | Reject a pending entry with a comment.               |
| `vault_pending_reviews` | read  | List all entries pending team review.                |
| `vault_review_stats`    | read  | Review workflow statistics — counts by status.       |

## Intake

Content ingestion — PDF books, URLs, raw text, and batch import. Extracts knowledge items via LLM classification and stores them in the vault with deduplication. See [Content Ingestion](/docs/guides/content-ingestion/) for usage examples.

### Book/PDF Ingestion

| Op                   | Auth  | Description                                                |
| -------------------- | ----- | ---------------------------------------------------------- |
| `intake_ingest_book` | write | Ingest a PDF book — parse, chunk, create a resumable job.  |
| `intake_process`     | write | Process pending chunks — extract, classify via LLM, dedup. |
| `intake_status`      | read  | Get job status or list all intake jobs.                    |
| `intake_preview`     | read  | Preview extraction for a page range before full intake.    |

### Text & URL Ingestion

| Op             | Auth  | Description                                                        |
| -------------- | ----- | ------------------------------------------------------------------ |
| `ingest_url`   | write | Fetch a URL, extract text, classify via LLM, dedup, and store.    |
| `ingest_text`  | write | Ingest raw text (article, transcript, notes) — classify and store. |
| `ingest_batch` | write | Ingest multiple text items in one call with per-item metadata.     |

## Links

Zettelkasten entry linking — create typed links, traverse the knowledge graph, find orphans, and auto-link entries using FTS or LLM evaluation. See [Entry Linking & Knowledge Graph](/docs/guides/entry-linking/) for the linking model.

| Op               | Auth  | Description                                                           |
| ---------------- | ----- | --------------------------------------------------------------------- |
| `link_entries`    | write | Create a typed link between two entries (supports, contradicts, extends, sequences). |
| `unlink_entries`  | write | Remove a link between two entries.                                    |
| `get_links`       | read  | Get all links for an entry (outgoing + incoming backlinks).           |
| `traverse`        | read  | Walk the link graph from an entry up to N hops deep (1-5).           |
| `suggest_links`   | read  | Find semantically similar entries as link candidates via FTS5.        |
| `get_orphans`     | read  | Find entries with zero links (orphan detection).                     |
| `relink_vault`    | write | Smart re-linking — LLM-evaluated batch linking with reasoning notes. |
| `backfill_links`  | write | Generate links for orphan entries using FTS5 suggestions.            |
| `link_stats`      | read  | Graph statistics — total links, by type, most connected, orphans.    |

## Branching

Vault branching — experiment with knowledge changes without affecting the main vault. Create branches, add operations, review, and merge. See [Vault Branching](/docs/guides/vault-branching/) for workflows.

| Op                    | Auth  | Description                                          |
| --------------------- | ----- | ---------------------------------------------------- |
| `vault_branch`        | write | Create a named vault branch for experimentation.     |
| `vault_branch_add`    | write | Add an operation (add/modify/remove) to a branch.    |
| `vault_branch_list`   | read  | List all branches with entry counts and merge status. |
| `vault_merge_branch`  | admin | Merge a branch into the main vault.                  |
| `vault_delete_branch` | admin | Delete a branch and all its operations.              |

## Tier

Multi-vault tiers — connect external knowledge bases, search across all sources with priority-weighted cascading.

### Vault Tiers

| Op                 | Auth  | Description                                                  |
| ------------------ | ----- | ------------------------------------------------------------ |
| `vault_connect`    | admin | Connect an additional vault tier (project or team).          |
| `vault_disconnect` | admin | Disconnect a vault tier (cannot disconnect agent tier).      |
| `vault_tiers`      | read  | List all vault tiers with connection status and entry counts. |
| `vault_search_all` | read  | Search across all connected tiers with priority weighting.   |

### Named Sources

| Op                        | Auth  | Description                                              |
| ------------------------- | ----- | -------------------------------------------------------- |
| `vault_connect_source`    | admin | Connect a named vault source with configurable priority. |
| `vault_disconnect_source` | admin | Disconnect a named vault source.                         |
| `vault_list_sources`      | read  | List all connected sources with their priorities.        |

## Embedding

Embedding management — check status, rebuild embeddings in batch, or embed individual entries. Powers the vault's vector search layer.

| Op                   | Auth  | Description                                                    |
| -------------------- | ----- | -------------------------------------------------------------- |
| `embedding_status`   | read  | Embedding index status — total entries, embedded count, gaps.  |
| `embedding_rebuild`  | write | Batch rebuild embeddings for all entries or only those missing one.        |
| `embedding_embed`    | write | Generate embedding for a single vault entry.                   |

## Dream

Automatic memory consolidation, vault cleanup, and maintenance. Runs background processes that deduplicate, archive stale entries, and resolve contradictions.

| Op              | Auth  | Description                                                  |
| --------------- | ----- | ------------------------------------------------------------ |
| `dream_run`     | write | Run a dream cycle — consolidation, dedup, archive, cleanup.  |
| `dream_status`  | read  | Dream status — last run, next scheduled, entries processed.  |
| `dream_history` | read  | History of past dream cycles with outcomes.                  |

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
