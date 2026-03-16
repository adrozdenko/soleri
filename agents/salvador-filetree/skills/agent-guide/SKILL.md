---
name: agent-guide
description: >
  Use when the user asks "what can you do", "help me", "how do I use this",
  "what features do you have", "what tools are available", "how does this work",
  "show me your capabilities", "what are you", "who are you", or any question
  about the agent's identity, capabilities, available tools, or how to use them.
  Not needed for proactive tool suggestions — those are handled by engine rules.
---

# Agent Guide — Capability Discovery

Help users understand what this agent can do, how to use it effectively, and what makes it different from a raw LLM. This skill handles the deep discovery flow — proactive tool suggestions during normal work are handled by the engine rules (Tool Advocacy section).

## When to Use

- "What can you do?" / "What are your capabilities?"
- "How do I search for X?" / "How do I capture knowledge?"
- "What tools do you have?" / "Show me your features"
- "Who are you?" / "What is this agent?"
- "Help" / "I'm stuck" / "How does this work?"
- First-time users, onboarding, or anyone unfamiliar with the agent

## Capability Discovery Sequence

### Step 1: Identity

```
salvador_core op:activate
  params: { projectPath: "." }
```

This returns the agent's persona: name, role, description, tone, principles, and domains. Present the identity first — who the agent is and what it specializes in.

### Step 2: Health & Status

```
salvador_core op:admin_health
```

Shows what subsystems are active: vault (how many entries), brain (vocabulary size), LLM availability, cognee status. This tells the user what the agent currently has to work with.

### Step 3: Available Tools

```
salvador_core op:admin_tool_list
```

Lists all facades and operations. Present them grouped by category with plain-language descriptions.

### Step 4: Present by What Users Can DO

Organize capabilities by user goals, not technical names:

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

**Identity & Control**
- Persona activation and deactivation
- Intent routing: the agent classifies what you want and routes to the right workflow
- Project registration and cross-project linking

**Domain Knowledge** (varies by agent)
- Each domain has: `get_patterns`, `search`, `get_entry`, `capture`, `remove`
- Call `op:activate` to discover which domains are configured

## Common Questions

### "What makes you different from regular Claude?"

You have persistent knowledge (vault), learned patterns (brain), structured planning with grading, iterative validation loops, and domain-specific intelligence. Regular Claude starts fresh every conversation — this agent accumulates knowledge and gets smarter over time.

### "How do I get the most out of you?"

1. **Use the vault** — search before deciding, capture after learning
2. **Use planning** — structured plans beat ad-hoc work for anything non-trivial
3. **Trust the brain** — pattern recommendations come from real usage data
4. **Capture everything** — every bug fix, every pattern, every anti-pattern. The vault grows smarter with use.
5. **Use loops for quality** — iterative validation catches issues that single-pass work misses

### "How do I add new capabilities?"

Extensions in `src/extensions/` can add new ops, facades, middleware, and hooks. Domain packs add domain-specific knowledge and validation.

## Anti-Patterns

- **Listing raw op names without context** — always explain what the op does in plain language
- **Claiming capabilities that do not exist** — only reference ops the agent actually has. When unsure, call `op:admin_tool_list` first
- **Dumping the entire tool catalog** — answer the specific question, show relevant tools, not all tools
- **Repeating what the user already knows** — if they ask about a specific feature, answer that, don't give the full tour
