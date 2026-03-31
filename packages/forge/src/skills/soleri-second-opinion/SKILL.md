---
name: soleri-second-opinion
description: Use when facing a technical decision, comparing approaches, or needing an informed recommendation backed by vault knowledge, brain patterns, and web research.
---

# Second Opinion — Decision Support From All Sources

Get an informed recommendation that synthesizes vault knowledge, brain patterns, cross-project experience, and web research before making any technical decision.

## Steps

### 1. Understand the Decision

```
YOUR_AGENT_core op:route_intent
  params: { prompt: "<user's question>" }
```

### 2. Search All Knowledge Sources

**Vault** — previous decisions, patterns, anti-patterns:

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<the decision or options>" }
```

**Brain** — proven approaches:

```
YOUR_AGENT_core op:brain_strengths
YOUR_AGENT_core op:brain_recommend
  params: { projectName: "<current project>" }
```

**Cross-project** — what other projects chose:

```
YOUR_AGENT_core op:memory_cross_project_search
  params: { query: "<topic>", crossProject: true }
```

**Web** — community consensus, benchmarks, comparison articles.

### 3. Synthesize and Present

```
## Decision: [Question]

### What the Vault Says
[Existing decisions, patterns, anti-patterns]

### What the Brain Recommends
[Proven patterns, cross-project insights]

### What the Web Says
[Community consensus, benchmarks]

### Options Analysis
| Criteria | Option A | Option B |
|----------|----------|----------|
| [criteria] | ... | ... |
| Vault support | [patterns?] | [patterns?] |

### Recommendation
[Clear recommendation with reasoning]

### Risks
[What could go wrong]
```

### 4. Capture the Decision

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "<decision title>",
    description: "<chosen option, rationale, rejected alternatives>",
    type: "decision",
    category: "<domain>",
    tags: ["decision"]
  }
```

## Common Mistakes

- Giving a generic AI opinion instead of searching vault/brain first
- Not capturing the final decision (next person faces the same question blind)
- Skipping cross-project search (another project may have solved this)

## Quick Reference

| Op                                    | When to Use             |
| ------------------------------------- | ----------------------- |
| `route_intent`                        | Classify decision type  |
| `search_intelligent`                  | Find previous decisions |
| `brain_strengths` / `brain_recommend` | Proven approaches       |
| `memory_cross_project_search`         | Other projects' choices |
| `memory_search`                       | Session context         |
| `capture_knowledge`                   | Persist the decision    |
