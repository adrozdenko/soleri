---
name: onboard-me
description: Use when the user says "onboard me", "I'm new here", "what should I know", "project overview", "show me the ropes", "knowledge tour", "what are the rules", "how does this project work", or is new to the project and needs a structured introduction to its knowledge, patterns, decisions, and conventions.
---

# Onboard Me — Instant Project Intelligence

Give any newcomer a structured tour of everything the vault knows about this project. Decisions, patterns, anti-patterns, principles, conventions — all in one guided walkthrough. Turns months of tribal knowledge into a 5-minute briefing.

## When to Use

- New team member joining the project
- Switching context to a project you haven't touched in a while
- "What should I know before I start?"
- "What are the rules here?"

## The Magic: Structured Knowledge Tour

### Step 1: Project Overview

Get the project identity and registration:

```
salvador_core op:identity
```

```
salvador_core op:project_get
```

Get project-specific rules and conventions:

```
salvador_core op:project_list_rules
```

Get behavior rules:

```
salvador_core op:get_behavior_rules
```

### Step 2: Knowledge Landscape

Show what the vault knows, organized by domain:

```
salvador_core op:vault_domains
```

```
salvador_core op:vault_tags
```

```
salvador_core op:admin_vault_size
```

Present: "This project has X entries across Y domains, covering Z tags."

### Step 3: Critical Knowledge

Search for the most important entries — critical severity first:

```
salvador_core op:search
  params: { severity: "critical" }
```

These are the "must know" items — rules that cannot be violated.

### Step 4: Key Decisions

Search for architectural and design decisions:

```
salvador_core op:search_intelligent
  params: { query: "architectural decision design choice" }
```

Present the top decisions with their rationale — this is the "why" behind the codebase.

### Step 5: Strongest Patterns

Show what the brain has validated as proven approaches:

```
salvador_core op:brain_strengths
```

These are the "how" — patterns that have been used successfully and should be followed.

### Step 6: Anti-Patterns to Avoid

Search for anti-patterns — things that went wrong and shouldn't be repeated:

```
salvador_core op:search
  params: { type: "anti-pattern" }
```

Present as a "don't do this" list with the reasoning.

### Step 7: Cross-Project Context

Check if this project is linked to others:

```
salvador_core op:project_linked_projects
```

If linked, show what patterns are shared:

```
salvador_core op:brain_global_patterns
```

### Step 8: Knowledge Gaps

Show what's NOT in the vault — areas where the newcomer should ask questions:

```
salvador_core op:admin_search_insights
```

```
salvador_core op:vault_age_report
```

## Presenting the Onboarding

```
## Welcome to [Project Name]

**Role:** [project description]
**Domains:** [list of knowledge domains]
**Vault:** X entries across Y domains

---

### Critical Rules (Must Follow)
[Critical severity entries — non-negotiable conventions]

### Key Decisions
[Top architectural decisions with rationale]
"We chose X over Y because Z"

### Proven Patterns (Do This)
[Top brain-strength patterns — the project's best practices]

### Anti-Patterns (Don't Do This)
[Known mistakes — save yourself the debugging]

### Project Conventions
[Project rules, behavior rules, naming conventions]

### Related Projects
[Linked projects and shared patterns]

### Knowledge Gaps
[Areas not well-documented — ask the team about these]

---

**Tip:** Use `/vault-navigator` to search for specific topics as you work.
Use `/second-opinion` before making any architectural decision.
```

## The Magic

This feels like magic because a new team member says "onboard me" and instantly gets:

1. Every critical rule they must follow
2. Every architectural decision and why it was made
3. Proven patterns to follow
4. Anti-patterns to avoid
5. What's shared with other projects
6. Where the knowledge gaps are

No other onboarding tool does this — it's not a static wiki, it's a living knowledge base that grows with the project.

## Agent Tools Reference

| Op                             | When to Use                             |
| ------------------------------ | --------------------------------------- |
| `identity`                     | Project persona and description         |
| `project_get`                  | Project registration details            |
| `project_list_rules`           | Project-specific rules                  |
| `get_behavior_rules`           | Behavioral conventions                  |
| `vault_domains` / `vault_tags` | Knowledge landscape                     |
| `admin_vault_size`             | How much knowledge exists               |
| `search`                       | Find critical entries and anti-patterns |
| `search_intelligent`           | Find decisions and patterns             |
| `brain_strengths`              | Proven approaches                       |
| `brain_global_patterns`        | Cross-project patterns                  |
| `project_linked_projects`      | Related projects                        |
| `admin_search_insights`        | What's not in the vault                 |
| `vault_age_report`             | Stale knowledge areas                   |
