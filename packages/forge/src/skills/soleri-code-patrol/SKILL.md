---
name: soleri-code-patrol
tier: default
description: 'Triggers: "check against patterns", "pattern compliance", "convention check", "review against vault", "institutional review". Reviews code against vault patterns/conventions. Use deep-review for general quality/architecture.'
---

# Code Patrol — Review Code Against Your Own Knowledge

Review code against vault patterns, anti-patterns, and project conventions. Catches violations that no linter knows about.

## Steps

### 1. Understand the Code's Domain

```
YOUR_AGENT_core op:route_intent
  params: { prompt: "Code review: <brief description>" }
YOUR_AGENT_core op:vault_domains
```

### 2. Load Relevant Patterns

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<what this code does>" }
YOUR_AGENT_core op:search
  params: { type: "anti-pattern" }
YOUR_AGENT_core op:search
  params: { severity: "critical" }
YOUR_AGENT_core op:project_list_rules
YOUR_AGENT_core op:brain_strengths
```

### 3. Review the Code

| Check                         | Source                        | Severity      |
| ----------------------------- | ----------------------------- | ------------- |
| Violates critical rule        | `search (severity: critical)` | Must fix      |
| Matches known anti-pattern    | `search (type: anti-pattern)` | Must fix      |
| Doesn't follow proven pattern | `brain_strengths`             | Should fix    |
| Breaks project conventions    | `project_list_rules`          | Should fix    |
| Misses pattern opportunity    | `search_intelligent`          | Could improve |

### 4. Present the Review

```
## Code Patrol Report

### Must Fix (Critical)
- **[Rule name]**: [What's wrong]
  Vault ref: [entry title] | Fix: [How]

### Should Fix (Warning)
- **[Anti-pattern]**: [What's wrong]
  Better approach: [The pattern to follow]

### Could Improve (Suggestion)
- **[Pattern opportunity]**: [Could benefit from...]

### Summary
X critical, Y warnings, Z suggestions
```

### 5. Learn From the Review

If review reveals new patterns or gaps not in vault, capture with `capture_quick` or `capture_knowledge`.

### 6. Verify After Fixes

Re-run patrol after user applies fixes. Check `admin_health`.

## Common Mistakes

- Reviewing only against generic lint rules instead of vault knowledge
- Not loading anti-patterns before reviewing
- Skipping the capture step when a new pattern is discovered

## Quick Reference

| Op                                          | When to Use                           |
| ------------------------------------------- | ------------------------------------- |
| `route_intent`                              | Classify code domain                  |
| `search_intelligent`                        | Find relevant patterns                |
| `search`                                    | Find anti-patterns and critical rules |
| `project_list_rules` / `get_behavior_rules` | Project conventions                   |
| `brain_strengths`                           | Proven patterns                       |
| `capture_quick` / `capture_knowledge`       | Capture new discoveries               |
