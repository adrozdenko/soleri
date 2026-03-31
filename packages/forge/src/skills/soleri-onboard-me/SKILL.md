---
name: soleri-onboard-me
description: >
  Use when the user says "onboard me", "I'm new here", "project overview",
  or "what should I know about this codebase". Provides a structured tour
  of everything the vault knows about this project.
---

# Onboard Me — Instant Project Intelligence

Structured tour of everything the vault knows about this project. Decisions, patterns, anti-patterns, conventions — all in one walkthrough.

## Steps

### 1. Project Overview

```
YOUR_AGENT_core op:identity
YOUR_AGENT_core op:project_get
YOUR_AGENT_core op:project_list_rules
YOUR_AGENT_core op:get_behavior_rules
```

### 2. Knowledge Landscape

```
YOUR_AGENT_core op:vault_domains
YOUR_AGENT_core op:vault_tags
YOUR_AGENT_core op:admin_vault_size
```

### 3. Critical Knowledge

```
YOUR_AGENT_core op:search
  params: { severity: "critical" }
```

### 4. Key Decisions

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "architectural decision design choice" }
```

### 5. Strongest Patterns

```
YOUR_AGENT_core op:brain_strengths
```

### 6. Anti-Patterns to Avoid

```
YOUR_AGENT_core op:search
  params: { type: "anti-pattern" }
```

### 7. Cross-Project Context

```
YOUR_AGENT_core op:project_linked_projects
YOUR_AGENT_core op:brain_global_patterns
```

### 8. Knowledge Gaps

```
YOUR_AGENT_core op:admin_search_insights
YOUR_AGENT_core op:vault_age_report
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

### Record Onboarding

```
YOUR_AGENT_core op:capture_knowledge
  params: { title: "Onboarding completed for <project>", description: "<key takeaways and knowledge gaps identified>", type: "workflow", tags: ["onboarding", "<project>"] }
```

Record what was covered and what gaps remain for future onboarding.

## Common Mistakes

- Dumping all vault entries instead of curating the most important ones
- Skipping anti-patterns (newcomers need to know what NOT to do)
- Not surfacing knowledge gaps (newcomers should know where documentation is thin)

## Quick Reference

| Op                                          | When to Use                   |
| ------------------------------------------- | ----------------------------- |
| `identity` / `project_get`                  | Project overview              |
| `project_list_rules` / `get_behavior_rules` | Conventions                   |
| `vault_domains` / `vault_tags`              | Knowledge landscape           |
| `search` (severity/type filters)            | Critical rules, anti-patterns |
| `search_intelligent`                        | Key decisions                 |
| `brain_strengths`                           | Proven patterns               |
| `brain_global_patterns`                     | Cross-project patterns        |
| `admin_search_insights`                     | Knowledge gaps                |
| `capture_knowledge`                         | Record onboarding completion  |
