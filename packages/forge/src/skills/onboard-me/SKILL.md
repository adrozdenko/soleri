---
name: onboard-me
description: Use when someone is new to the project and needs a structured introduction to its knowledge, patterns, decisions, and conventions.
---

# Onboard Me — Instant Project Intelligence

Structured tour of everything the vault knows about this project. Decisions, patterns, anti-patterns, conventions — all in one walkthrough.

## Steps

### 1. Project Overview

```
ernesto_core op:identity
ernesto_core op:project_get
ernesto_core op:project_list_rules
ernesto_core op:get_behavior_rules
```

### 2. Knowledge Landscape

```
ernesto_core op:vault_domains
ernesto_core op:vault_tags
ernesto_core op:admin_vault_size
```

### 3. Critical Knowledge

```
ernesto_core op:search
  params: { severity: "critical" }
```

### 4. Key Decisions

```
ernesto_core op:search_intelligent
  params: { query: "architectural decision design choice" }
```

### 5. Strongest Patterns

```
ernesto_core op:brain_strengths
```

### 6. Anti-Patterns to Avoid

```
ernesto_core op:search
  params: { type: "anti-pattern" }
```

### 7. Cross-Project Context

```
ernesto_core op:project_linked_projects
ernesto_core op:brain_global_patterns
```

### 8. Knowledge Gaps

```
ernesto_core op:admin_search_insights
ernesto_core op:vault_age_report
```

## Presenting the Onboarding

```
## Welcome to [Project Name]

**Domains:** [list] | **Vault:** X entries across Y domains

### Critical Rules (Must Follow)
[Non-negotiable conventions]

### Key Decisions
[Top architectural decisions with rationale]

### Proven Patterns (Do This)
[Brain-strength patterns]

### Anti-Patterns (Don't Do This)
[Known mistakes]

### Project Conventions
[Rules, naming conventions]

### Related Projects
[Linked projects and shared patterns]

### Knowledge Gaps
[Areas not well-documented — ask the team]
```

**Tip:** Use vault-navigator to search topics as you work. Use second-opinion before architectural decisions.

## Common Mistakes

- Dumping all vault entries instead of curating the most important ones
- Skipping anti-patterns (newcomers need to know what NOT to do)
- Not surfacing knowledge gaps (newcomers should know where documentation is thin)

## Quick Reference

| Op | When to Use |
|----|-------------|
| `identity` / `project_get` | Project overview |
| `project_list_rules` / `get_behavior_rules` | Conventions |
| `vault_domains` / `vault_tags` | Knowledge landscape |
| `search` (severity/type filters) | Critical rules, anti-patterns |
| `search_intelligent` | Key decisions |
| `brain_strengths` | Proven patterns |
| `brain_global_patterns` | Cross-project patterns |
| `admin_search_insights` | Knowledge gaps |
