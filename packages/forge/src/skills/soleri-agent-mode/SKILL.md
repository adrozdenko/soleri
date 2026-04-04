---
name: soleri-agent-mode
tier: default
description: >
  Use when the user addresses the agent directly ("AgentName, ...", "Hey AgentName"),
  asks about available commands ("what commands do I have", "what can you do with MCP"),
  uses vague agent-mode language ("save this", "remember this", "search for patterns",
  "orchestrate this"), or when intent is ambiguous and needs routing to the right
  facade + op. Also triggers on "how does this agent know", "command reference".
---

# Agent Mode — Intent Routing & Command Reference

This skill governs how to interpret natural language directed at this agent and route it to the correct facade + op. Use it when a phrase is ambiguous, when the user addresses the agent directly, or when surfacing the command reference.

## Routing Protocol (MANDATORY)

Before executing any agent op, apply this 3-step protocol:

**Step 1 — Semantic parse**
Identify the verb + object in the user's message:
- Verb: what action? (search, save, plan, execute, remember, check, show, run, fix)
- Object: what is it about? (vault, brain, memory, plan, session, health, pattern)

**Step 2 — Confirm via route_intent (when ambiguous)**
```
YOUR_AGENT_control op:route_intent
  params: { input: "<user's phrase>", context: "<current task context>" }
```
Use this when the phrase matches 2+ intents. Skip it for obvious, unambiguous commands.

**Step 3 — Execute the mapped op**
Use the NL → Op table below to select facade + op. Pass `projectPath: "."` wherever required.

---

## Natural Language → Facade + Op Mapping

### Search & Recall

| What the user says | Facade | Op | Notes |
|--------------------|--------|----|-------|
| "search for X" / "find patterns on X" | `YOUR_AGENT_vault` | `search_intelligent` | mode: "scan" first |
| "what do we know about X" | `YOUR_AGENT_vault` | `search_intelligent` | mode: "full" if specific |
| "recall X" / "remember X from before" | `YOUR_AGENT_memory` | `memory_search` | crossProject if broad |
| "what patterns are strong" | `YOUR_AGENT_brain` | `brain_strengths` | days: 30 default |
| "recommend something" / "what should I do" | `YOUR_AGENT_brain` | `brain_recommend` | |
| "show me vault entries about X" | `YOUR_AGENT_vault` | `load_entries` | after scan |
| "what's in the vault" | `YOUR_AGENT_vault` | `vault_stats` | |

### Save & Capture

| What the user says | Facade | Op | Notes |
|--------------------|--------|----|-------|
| "save this" / "capture this" (detailed pattern) | `YOUR_AGENT_vault` | `capture_knowledge` | full structured entry |
| "quick save" / "jot this down" | `YOUR_AGENT_vault` | `capture_quick` | lightweight, fast |
| "remember this for the session" | `YOUR_AGENT_memory` | `memory_capture` | session-scoped |
| "save the session" / "log what we did" | `YOUR_AGENT_memory` | `session_capture` | end-of-session |
| "ingest this URL" / "add this article" | `YOUR_AGENT_vault` | `ingest_url` | external content |
| "ingest this text" | `YOUR_AGENT_vault` | `ingest_text` | raw text |

### Planning

| What the user says | Facade | Op | Notes |
|--------------------|--------|----|-------|
| "create a plan" / "plan this" | `YOUR_AGENT_plan` | `create_plan` | MANDATORY before code |
| "approve the plan" / "looks good" | `YOUR_AGENT_plan` | `approve_plan` | Gate 1 |
| "split the plan" / "break it into tasks" | `YOUR_AGENT_plan` | `plan_split` | Gate 2 |
| "check plan drift" / "what changed" | `YOUR_AGENT_plan` | `plan_reconcile` | post-execution |
| "complete the plan" / "close it out" | `YOUR_AGENT_plan` | `plan_complete_lifecycle` | final step |
| "list active plans" | `YOUR_AGENT_plan` | `chain_list` | |

### Orchestration

| What the user says | Facade | Op | Notes |
|--------------------|--------|----|-------|
| "orchestrate this" / "AgentName, orchestrate X" | `YOUR_AGENT_orchestrate` | `orchestrate_plan` | vault+brain+plan in one call |
| "execute the plan" / "start executing" | `YOUR_AGENT_orchestrate` | `orchestrate_execute` | tracks progress |
| "finish up" / "wrap the session" | `YOUR_AGENT_orchestrate` | `orchestrate_complete` | epilogue: vault + session |

### Brain & Learning

| What the user says | Facade | Op | Notes |
|--------------------|--------|----|-------|
| "what has the brain learned" / "brain stats" | `YOUR_AGENT_brain` | `brain_stats` | |
| "give feedback on that" | `YOUR_AGENT_brain` | `brain_feedback` | reinforcement signal |
| "what patterns are failing" | `YOUR_AGENT_brain` | `brain_decay_report` | |
| "radar analysis" / "spot patterns" | `YOUR_AGENT_brain` | `radar_analyze` | |
| "show radar candidates" | `YOUR_AGENT_brain` | `radar_candidates` | |

### Health & Admin

| What the user says | Facade | Op | Notes |
|--------------------|--------|----|-------|
| "health check" / "is everything working" | `YOUR_AGENT_admin` | `admin_health` | |
| "list all tools" / "what tools do you have" | `YOUR_AGENT_admin` | `admin_tool_list` | |
| "session briefing" / "catch me up" | `YOUR_AGENT_admin` | `session_briefing` | |
| "diagnose X" | `YOUR_AGENT_admin` | `admin_diagnostic` | |
| "run routing accuracy" | `YOUR_AGENT_control` | `routing_accuracy` | |

### Vault Maintenance

| What the user says | Facade | Op | Notes |
|--------------------|--------|----|-------|
| "clean the vault" / "groom" | `YOUR_AGENT_curator` | `curator_groom` | |
| "find duplicates" | `YOUR_AGENT_curator` | `curator_detect_duplicates` | |
| "vault health audit" | `YOUR_AGENT_curator` | `curator_health_audit` | |
| "archive old entries" | `YOUR_AGENT_vault` | `vault_archive` | |
| "push vault to git" / "sync vault" | `YOUR_AGENT_vault` | `vault_git_push` | |

### Identity & Control

| What the user says | Facade | Op | Notes |
|--------------------|--------|----|-------|
| "Hello, AgentName!" / activate | `YOUR_AGENT_core` | `activate` | params: projectPath |
| "Goodbye, AgentName!" / deactivate | `YOUR_AGENT_core` | `activate` | params: deactivate: true |
| "who are you" / "what mode is this" | `YOUR_AGENT_core` | `identity` | |
| "register this project" | `YOUR_AGENT_core` | `register` | params: projectPath |
| "route this intent" | `YOUR_AGENT_control` | `route_intent` | |
| "switch mode" / "morph to X" | `YOUR_AGENT_control` | `morph` | |
| "what are the behavior rules" | `YOUR_AGENT_control` | `get_behavior_rules` | |

---

## Disambiguation Matrix

These phrases are ambiguous — resolve using context signals:

| Phrase | Context signal | Route to |
|--------|---------------|----------|
| "save this" | Detailed explanation, pattern discussion | `vault.capture_knowledge` |
| "save this" | Quick note, side comment | `vault.capture_quick` |
| "save this" | "For this session only" | `memory.memory_capture` |
| "remember this" | Repeatable rule or pattern | `vault.capture_knowledge` |
| "remember this" | Session-scoped fact | `memory.memory_capture` |
| "search for X" | Broad/exploratory | `vault.search_intelligent` mode:scan |
| "search for X" | Specific known entry | `vault.search_intelligent` mode:full |
| "search for X" | Across past sessions | `memory.memory_search` crossProject:true |
| "check this" | Code/PR in context | → `deep-review` skill |
| "check this" | System health | `admin.admin_health` |
| "plan this" | Work task | `orchestrate.orchestrate_plan` |
| "plan this" | User wants to see plan first | `plan.create_plan` |

**Resolution rule:** When still ambiguous after checking context signals, ask one clarifying question before routing. Never guess and execute a write op.

---

## "AgentName, orchestrate X" — Full Flow

When the user says "AgentName, orchestrate [task description]":

1. **`YOUR_AGENT_orchestrate op:orchestrate_plan`** — vault lookup + brain recommendations + structured plan in one call
2. Present the plan using the standard Plan Presentation format (Plan ID, Check ID, Grade, Status)
3. Wait for Gate 1 approval: "approve" / "yes" / "looks good"
4. **`YOUR_AGENT_plan op:plan_split`** — decompose into tasks
5. Wait for Gate 2 approval
6. **`YOUR_AGENT_orchestrate op:orchestrate_execute`** — track execution per task
7. **`YOUR_AGENT_orchestrate op:orchestrate_complete`** — epilogue: vault capture + session record

Never skip Gate 1 or Gate 2. Never proceed past a gate without explicit user approval.

---

## Anti-Patterns

- **Guessing a write op** — if "save this" is ambiguous, ask before writing to vault
- **Skipping route_intent for ambiguous phrases** — use it to confirm, not as a formality
- **Executing orchestrate_plan without showing the plan** — always present before Gate 1
- **Using memory_capture for reusable patterns** — session memory ≠ vault knowledge
- **Ignoring the two-pass vault search** — scan first, load only top 2-4 results
