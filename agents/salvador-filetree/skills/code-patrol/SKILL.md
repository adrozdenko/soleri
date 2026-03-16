---
name: code-patrol
description: Use when the user asks "review this code", "check this against patterns", "code patrol", "does this follow our rules", "validate against vault", "check for anti-patterns", or wants code reviewed not against generic lint rules but against the project's own captured patterns, anti-patterns, and conventions.
---

# Code Patrol — Review Code Against Your Own Knowledge

Review code against the vault's patterns, anti-patterns, and project conventions — not generic lint rules, but YOUR team's captured knowledge applied to new code. Catches violations that no linter knows about.

## When to Use

- Before committing or creating a PR
- "Does this follow our patterns?"
- "Check this code against our rules"
- Code review with institutional knowledge
- After writing implementation code

## The Magic: Project-Specific Code Intelligence

### Step 1: Understand the Code's Domain

Classify what domain this code belongs to:

```
salvador_core op:route_intent
  params: { prompt: "Code review: <brief description of the code>" }
```

Determine which vault domains are relevant:

```
salvador_core op:vault_domains
```

### Step 2: Load Relevant Patterns

Search for patterns in the code's domain:

```
salvador_core op:search_intelligent
  params: { query: "<what this code does>" }
```

Search specifically for anti-patterns to check against:

```
salvador_core op:search
  params: { type: "anti-pattern" }
```

Search for critical rules that must not be violated:

```
salvador_core op:search
  params: { severity: "critical" }
```

Load project-specific rules:

```
salvador_core op:project_list_rules
```

```
salvador_core op:get_behavior_rules
```

Get proven approaches from the brain:

```
salvador_core op:brain_strengths
```

### Step 3: Review the Code

With vault patterns loaded, review the code checking for:

| Check                                  | Source                        | Severity      |
| -------------------------------------- | ----------------------------- | ------------- |
| Violates a critical rule               | `search (severity: critical)` | Must fix      |
| Matches a known anti-pattern           | `search (type: anti-pattern)` | Must fix      |
| Doesn't follow a proven pattern        | `brain_strengths`             | Should fix    |
| Breaks project conventions             | `project_list_rules`          | Should fix    |
| Misses an opportunity to use a pattern | `search_intelligent`          | Could improve |

### Step 4: Present the Review

```
## Code Patrol Report

### Must Fix (Critical)
- **[Rule name]**: [What's wrong and why]
  Vault ref: [entry title] (severity: critical)
  Fix: [How to fix it]

### Should Fix (Warning)
- **[Anti-pattern name]**: [What's wrong]
  Vault ref: [entry title] (type: anti-pattern)
  Better approach: [The pattern to follow]

### Could Improve (Suggestion)
- **[Pattern opportunity]**: [The code works but could benefit from...]
  Vault ref: [entry title] (type: pattern)

### Looks Good
- [What the code does well — patterns it follows correctly]

### Summary
X critical issues, Y warnings, Z suggestions
Patterns followed: [list]
Patterns missed: [list]
```

### Step 5: Learn From the Review

If the review reveals a new pattern or anti-pattern not in the vault, capture it:

```
salvador_core op:capture_quick
  params: {
    title: "<new pattern or anti-pattern discovered>",
    description: "<what it is, when it applies>"
  }
```

If the review reveals a knowledge gap, note it:

```
salvador_core op:capture_knowledge
  params: {
    title: "<missing convention>",
    description: "<this should be documented as a project rule>",
    type: "principle",
    category: "<domain>",
    tags: ["convention", "code-review"]
  }
```

### Step 6: Verify After Fixes

After the user applies fixes, re-run the patrol to confirm clean:

```
salvador_core op:search_intelligent
  params: { query: "<re-check the specific violations>" }
```

Check system health:

```
salvador_core op:admin_health
```

## The Magic

This feels like magic because:

1. It's not ESLint — it catches things like "we decided not to use inheritance here" or "this API pattern caused production issues last month"
2. The rules come from YOUR team's experience, not a generic config file
3. It gets smarter over time — every captured pattern becomes a new check
4. It catches institutional knowledge violations that no static analyzer can

A linter checks syntax. Code patrol checks wisdom.

## Agent Tools Reference

| Op                   | When to Use                                   |
| -------------------- | --------------------------------------------- |
| `route_intent`       | Classify the code's domain                    |
| `vault_domains`      | See which domains are relevant                |
| `search_intelligent` | Find relevant patterns for this code          |
| `search`             | Find anti-patterns and critical rules         |
| `project_list_rules` | Project-specific conventions                  |
| `get_behavior_rules` | Behavioral rules                              |
| `brain_strengths`    | Proven patterns to check against              |
| `capture_quick`      | Capture new patterns discovered during review |
| `capture_knowledge`  | Capture new conventions                       |
| `admin_health`       | Post-review health check                      |
