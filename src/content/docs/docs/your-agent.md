---
title: Your Agent — Practical Guide
description: How to use a Soleri agent day-to-day — vault, brain, memory, capture, playbooks, and the compound knowledge effect.
---

You created an agent. Now what? This guide covers how to use it every day and how it gets smarter over time.

## The Vault

The vault is your agent's long-term memory. It stores **knowledge entries** — patterns, anti-patterns, principles, workflows, and references — organized by domain.

### How Knowledge is Organized

Every entry has:

| Field | Purpose |
|-------|---------|
| **Type** | `pattern`, `anti-pattern`, `principle`, `concept`, `workflow`, `reference`, `rule`, `playbook` |
| **Domain** | Knowledge area — `frontend`, `backend`, `security`, or your custom domains |
| **Severity** | `critical` (must follow), `warning` (should follow), `suggestion` (nice to have) |
| **Tags** | Free-form labels for discovery |
| **Confidence** | Score that tracks how often this knowledge proves useful |

### Searching the Vault

Your agent searches the vault automatically when you ask questions. You can also search explicitly:

```
"Search the vault for authentication patterns"
"Find anti-patterns related to error handling"
"What do we know about database indexing?"
```

Search uses **6-dimension scoring**: TF-IDF text relevance, severity weight, recency, tag overlap, domain match, and path relevance. Critical patterns surface first.

### Capturing Knowledge

When you discover something worth remembering:

```
"Capture this pattern: use optimistic updates for all form submissions"
"Save this anti-pattern: never store JWT tokens in localStorage"
```

You can capture with full detail:

```
"Capture a critical pattern in the security domain:
  Title: Always validate redirect URLs
  Description: Prevent open redirect attacks by validating URLs against an allowlist
  Tags: security, redirects, validation"
```

### Knowledge Lifecycle

Entries move through states:

```
proposed → active → archived
```

- **Proposed** — newly captured, not yet validated
- **Active** — confirmed useful, surfaces in searches
- **Archived** — outdated or superseded, kept for history

## The Brain

The brain is your agent's learning system. It tracks which patterns work, how often they're used, and what recommendations to make.

### How It Learns

Every session feeds the brain:

1. **Pattern tracking** — which vault entries were searched, used, or dismissed
2. **Confidence scoring** — entries that get used gain confidence; unused entries decay
3. **Strength tracking** — patterns proven across multiple sessions are marked as strong

### Recommendations

The brain surfaces recommendations based on context:

```
"What does the brain recommend for this task?"
"Show me pattern strengths"
"What are the strongest patterns across all projects?"
```

Strong patterns surface first in searches. Weak patterns eventually decay.

### Intelligence Building

Periodically, the brain rebuilds its intelligence index:

```
"Rebuild brain intelligence"
```

This re-scores all patterns and updates the TF-IDF vocabulary. Happens automatically, but you can trigger it manually after bulk knowledge imports.

## Memory

Memory provides **cross-session continuity**. When you close Claude Code and open it again, your agent remembers everything.

### Cross-Project Knowledge

Link related projects to share knowledge:

```
"Link this project to my-other-project as related"
```

Then search across all linked projects:

```
"Search across all projects for deployment patterns"
```

### Global Patterns

Promote high-value patterns to the global pool so all your agents benefit:

```
"Promote this pattern to global"
```

Global patterns are available to every agent you create.

## Playbooks

Playbooks are **multi-step validated procedures**. Unlike free-form knowledge, each step has validation criteria so the agent can execute and verify autonomously.

### Using Playbooks

```
"List available playbooks"
"Run the token migration playbook"
"Show me the contrast audit playbook"
```

### Creating Playbooks

```
"Create a playbook called 'Database Migration' with steps:
  1. Backup current schema (validate: backup file exists)
  2. Run migration script (validate: no errors in output)
  3. Verify data integrity (validate: row counts match)
  4. Update documentation (validate: changelog updated)"
```

## Orchestration

For complex tasks, the orchestration system manages the full lifecycle:

```
Plan → Execute → Complete
```

### How It Works

1. **Plan** — the agent creates a step-by-step plan with acceptance criteria
2. **Execute** — each step is tracked, vault is consulted before each step
3. **Complete** — knowledge is captured, session is recorded, brain is updated

You don't need to invoke this manually — it activates automatically for multi-step tasks.

## The Compound Effect

This is what makes Soleri agents different from stateless AI assistants:

| Session | What happens |
|---------|-------------|
| **Session 1** | Agent starts with starter knowledge. You capture 3 patterns. |
| **Session 5** | Agent has 20+ patterns. Searches return relevant results. Brain tracks what works. |
| **Session 20** | Agent has 100+ patterns. Strong patterns surface first. Anti-patterns are flagged automatically. |
| **Session 50** | Agent knows your codebase conventions, your team's decisions, your architecture patterns. It's not generic — it's *yours*. |

The more you use it, the sharper it gets. Knowledge compounds.

## Day-to-Day Tips

1. **Capture as you go** — when you solve a tricky problem, capture the pattern immediately
2. **Search before building** — ask the agent before starting new work; it may already know the answer
3. **Use domains** — organize knowledge by domain so searches stay relevant
4. **Review recommendations** — the brain's suggestions reflect your actual usage patterns
5. **Link projects** — if you work on related codebases, link them for cross-project search
