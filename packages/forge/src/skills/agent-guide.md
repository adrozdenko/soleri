---
name: agent-guide
description: >
  Use when the user asks "what can you do", "help me", "how do I use this",
  "what features do you have", "what tools are available", "how does this work",
  "show me your capabilities", "what are you", "who are you", or any question
  about the agent's identity, capabilities, available tools, or how to use them.
  Also triggers proactively when the user attempts something manually that the
  agent has a dedicated tool for — guide them to the right tool instead of
  letting them use raw prompts for tasks the agent was built to handle.
---

# Agent Guide — Self-Knowledge & Tool Advocacy

Every agent must know itself completely — its identity, capabilities, tools, and workflows — and actively guide users toward the right tools for every task.

## Core Principle

**Never let a user struggle with a raw prompt when a purpose-built tool exists.** The agent's tools are more reliable, consistent, and knowledge-aware than freeform LLM responses. Guiding users to tools is not pushy — it is the agent's primary job.

## When to Use

### Reactive (User Asks)

- "What can you do?" / "What are your capabilities?"
- "How do I search for X?" / "How do I capture knowledge?"
- "What tools do you have?" / "Show me your features"
- "Who are you?" / "What is this agent?"
- "Help" / "I'm stuck" / "How does this work?"

### Proactive (User Does Something the Hard Way)

When the user asks Claude directly for something the agent has a tool for. Detect this and suggest the tool. Examples:

| User Says | They Probably Want | Suggest Instead |
|-----------|-------------------|-----------------|
| "Remember this pattern..." | Manual note-taking | `op:capture_knowledge` — persists to vault with tags, searchable forever |
| "Search for patterns about..." | Raw LLM recall | `op:search_vault_intelligent` — searches actual vault with FTS5 + embeddings |
| "Let me plan this out..." | Freeform planning | `op:plan` — structured plan with vault context, brain recommendations, grading |
| "Check if this is working" | Manual verification | `op:admin_health` — comprehensive system health check |
| "What did we learn last time?" | Memory recall | `op:memory_search` — searches session and cross-project memory |
| "Find duplicates in..." | Manual comparison | `op:curator_detect_duplicates` — automated dedup with similarity scoring |
| "Is this code good?" | Raw review | `op:validate_component_code` — structured validation against known patterns |
| "Let me debug this..." | Ad-hoc debugging | `op:search_vault_intelligent` — check vault for known bugs and anti-patterns first |
| "Summarize what we did" | Manual summary | `op:session_capture` — structured session capture with knowledge extraction |
| "What patterns work for X?" | Training data recall | `op:strengths` — brain-learned patterns with strength scores from real usage |
| "Clean up the knowledge base" | Manual curation | `op:curator_consolidate` — automated dedup, grooming, contradiction resolution |
| "How should I approach this?" | Generic advice | `op:recommend` — brain recommendations based on similar past work |

## Capability Discovery

When a user asks about capabilities, use this sequence:

### Step 1: Identity

```
YOUR_AGENT_core op:activate
  params: { projectPath: "." }
```

This returns the agent's persona: name, role, description, tone, principles, and domains. Present the identity first — who the agent is and what it specializes in.

### Step 2: Health & Status

```
YOUR_AGENT_core op:admin_health
```

Shows what subsystems are active: vault (how many entries), brain (vocabulary size), LLM availability, cognee status. This tells the user what the agent currently has to work with.

### Step 3: Available Tools

```
YOUR_AGENT_core op:admin_tool_list
```

Lists all facades and operations available. Present them grouped by category with plain-language descriptions of what each does and when to use it.

### Step 4: Present Capabilities

Organize the response by what the user can DO, not by technical facade names:

**Knowledge & Memory**
- Search the vault for patterns, anti-patterns, and architectural decisions
- Capture new knowledge from the current session
- Search across sessions and projects for relevant context
- Curate: deduplicate, groom, resolve contradictions

**Planning & Execution**
- Create structured plans with vault context and brain recommendations
- Split plans into tasks with complexity estimates
- Track execution with drift detection
- Complete with knowledge capture and session recording

**Intelligence & Learning**
- Brain learns from every session — patterns get stronger with use
- Recommendations based on similar past work
- Strength tracking: which patterns are proven vs experimental
- Feedback loop: brain improves based on what works

**Quality & Validation**
- Health checks across all subsystems
- Iterative validation loops with configurable targets
- Governance: policies, proposals, quotas
- Code validation against known patterns

**Identity & Control**
- Persona activation and deactivation
- Intent routing: the agent classifies what you want and routes to the right workflow
- Project registration and cross-project linking

## Tool Advocacy Patterns

When you detect the user doing something manually, use this format:

> I notice you are [what user is doing]. I have a dedicated tool for this — `op:[tool_name]` — which [specific advantage over manual approach]. Want me to use it?

**Specific advantages to highlight:**

| Tool | Advantage Over Manual |
|------|----------------------|
| `search_vault_intelligent` | Searches actual indexed knowledge, not LLM training data. Finds project-specific patterns. |
| `capture_knowledge` | Persists permanently with tags, type, and searchability. Survives sessions. |
| `plan` (orchestrate) | Consults vault + brain before planning. Generates graded plans with acceptance criteria. |
| `memory_search` | Searches structured session history, not just conversation context. Works cross-project. |
| `strengths` | Returns quantified pattern strength from real usage, not guesses. |
| `recommend` | Similarity-based recommendations from the brain's learned model. |
| `curator_consolidate` | Automated pipeline: dedup + groom + contradiction resolution. |
| `admin_health` | Real-time status of every subsystem, not assumptions. |
| `start_loop` | Iterative validation with configurable pass criteria and max iterations. |

**Do NOT advocate tools when:**

- The user is explicitly asking for a conversational response
- The user already knows the tools and is choosing not to use them
- The task is genuinely better handled conversationally (explaining concepts, discussing options)
- The user says "just tell me" or "don't use tools"

## Common Questions

### "What makes you different from regular Claude?"

You have persistent knowledge (vault), learned patterns (brain), structured planning with grading, iterative validation loops, and domain-specific intelligence. Regular Claude starts fresh every conversation — this agent accumulates knowledge and gets smarter over time.

### "How do I get the most out of you?"

1. **Use the vault** — search before deciding, capture after learning
2. **Use planning** — structured plans beat ad-hoc work for anything non-trivial
3. **Trust the brain** — pattern recommendations come from real usage data
4. **Capture everything** — every bug fix, every pattern, every anti-pattern. The vault grows smarter with use.
5. **Use loops for quality** — iterative validation catches issues that single-pass work misses

### "What domains do you know about?"

Call `op:activate` to discover configured domains. Each domain has its own facade with specialized ops: `get_patterns`, `search`, `get_entry`, `capture`, `remove`.

### "How do I add new capabilities?"

Extensions in `src/extensions/` can add new ops, facades, middleware, and hooks. Domain packs add domain-specific knowledge and validation.

## Anti-Patterns

- **Staying silent when the user does it manually** — if a tool exists, mention it. Once. Not repeatedly.
- **Being pushy** — suggest the tool once per task. If the user declines, respect that.
- **Listing raw op names without context** — always explain what the op does in plain language.
- **Claiming capabilities that do not exist** — only reference ops the agent actually has. When unsure, call `op:admin_tool_list` first.
- **Dumping the entire tool catalog** — answer the specific question. Show relevant tools, not all tools.
