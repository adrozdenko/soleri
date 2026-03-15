---
name: second-opinion
description: Use when the user asks "should I", "what do you think about", "which approach", "compare options", "what would you recommend", "pros and cons", "trade-offs", or faces any technical decision and wants an informed recommendation backed by vault knowledge, brain patterns, and web research.
---

# Second Opinion — Decision Support From All Sources

Before making any technical decision, get an informed recommendation that synthesizes vault knowledge, brain patterns, cross-project experience, and web research. Never decide in a vacuum.

## When to Use

- "Should I use Redis or Memcached?"
- "What's the best way to handle auth?"
- "Which testing framework?"
- "Microservices or monolith?"
- Any fork-in-the-road technical decision

## The Magic: Multi-Source Decision Intelligence

### Step 1: Understand the Decision

Classify the intent to understand what kind of decision this is:

```
salvador_core op:route_intent
  params: { prompt: "<user's question>" }
```

### Step 2: Search All Knowledge Sources (in order)

**Vault — has this been decided before?**

```
salvador_core op:search_intelligent
  params: { query: "<the decision or options being considered>" }
```

Look specifically for:

- Previous decisions on this topic (type: "decision")
- Patterns that favor one approach
- Anti-patterns that warn against an approach

**Brain — what's proven to work?**

```
salvador_core op:brain_strengths
```

```
salvador_core op:brain_recommend
  params: { projectName: "<current project>" }
```

**Cross-project — what did other projects choose?**

```
salvador_core op:memory_cross_project_search
  params: { query: "<the decision topic>", crossProject: true }
```

**Memory — any relevant context from past sessions?**

```
salvador_core op:memory_search
  params: { query: "<decision topic>" }
```

**Web — what does the broader community say?**
Search the web for:

- Comparison articles (X vs Y for [use case])
- Benchmarks and performance data
- Community consensus on best practices
- Known limitations and gotchas

### Step 3: Synthesize and Present

Format the recommendation as a decision brief:

```
## Decision: [Question]

### What the Vault Says
[Existing decisions, patterns, and anti-patterns from vault]

### What the Brain Recommends
[Proven patterns, cross-project insights]

### What the Web Says
[Community consensus, benchmarks, comparison data]

### Options Analysis

| Criteria | Option A | Option B | Option C |
|----------|----------|----------|----------|
| [criteria 1] | ... | ... | ... |
| [criteria 2] | ... | ... | ... |
| Vault support | [existing patterns?] | [existing patterns?] | — |
| Brain confidence | [strength score] | [strength score] | — |

### Recommendation
[Clear recommendation with reasoning]

### Risks
[What could go wrong with the recommended approach]
```

### Step 4: Capture the Decision

Once the user decides, capture it to the vault for future reference:

```
salvador_core op:capture_knowledge
  params: {
    title: "<decision title>",
    description: "<chosen option, rationale, rejected alternatives and why>",
    type: "decision",
    category: "<relevant domain>",
    tags: ["<option-a>", "<option-b>", "decision", "<domain>"]
  }
```

This is critical — the next person who faces the same decision will find it in the vault.

## The Magic

This feels like magic because the user asks "should I use X?" and instead of a generic AI opinion, they get:

1. What their own project decided before (vault)
2. What's proven to work across projects (brain)
3. What other linked projects chose (cross-project)
4. What the broader community recommends (web)
5. A synthesized recommendation with trade-offs
6. The decision captured for the next person who asks

It's like having a senior architect who remembers every decision ever made.

## Agent Tools Reference

| Op                            | When to Use                          |
| ----------------------------- | ------------------------------------ |
| `route_intent`                | Classify the decision type           |
| `search_intelligent`          | Find previous decisions and patterns |
| `brain_strengths`             | Proven approaches                    |
| `brain_recommend`             | Project-specific recommendations     |
| `memory_cross_project_search` | What other projects decided          |
| `memory_search`               | Session context for this decision    |
| `capture_knowledge`           | Persist the final decision           |
