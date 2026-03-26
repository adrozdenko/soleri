---
name: discovery-phase
description: >
  Use for structured exploration before committing to a plan — "I don't know where to start",
  "what are our options", "investigate", "research this", "explore options", "discovery". Ideal
  when requirements are unclear, entering a new domain, or facing architectural decisions. Produces
  a discovery document with options, tradeoffs, and a recommendation.
---

# Discovery Phase

Structured exploration before committing to a plan. Define the question, research prior art, explore the codebase, identify constraints, draft options with tradeoffs, and recommend a path forward.

<HARD-GATE>
Do NOT create a plan, write code, or take any implementation action until the discovery document is complete and the user has reviewed it. Discovery produces knowledge, not artifacts.
</HARD-GATE>

## Checklist

1. **Define the question** — restate what we're exploring as one specific, answerable sentence
2. **Search vault for prior art** — `YOUR_AGENT_core op:search_intelligent params: { query: "<question>", mode: "scan" }`. Also `op:memory_search` with `crossProject: true`.
3. **Explore codebase** — read relevant files, configs, architecture, recent commits
4. **Identify constraints** — hard (must-haves) vs soft (nice-to-haves), unknowns that block a decision
5. **Draft 2-4 options** — each with pros, cons, risk, and effort (S/M/L)
6. **Recommend** — pick one, state the primary reason, note what would change the answer
7. **Capture to vault** — persist the discovery finding
8. **Transition** — hand off to brainstorming or writing-plans skill

## Option Format

For each option:

| Field | Content |
| ----- | ------- |
| **Approach** | One-sentence summary |
| **Pros** | What it gives us |
| **Cons** | What it costs |
| **Risk** | What could go wrong |
| **Effort** | S / M / L |

## After Discovery

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "<topic> — discovery finding",
    description: "<question, options considered, recommendation, rationale>",
    type: "decision",
    category: "<domain>",
    tags: ["discovery", "decision"]
  }
```

Save to `docs/discoveries/YYYY-MM-DD-<topic>.md` and commit. Then transition to the next skill.

## Anti-Patterns

- **Skipping discovery** — jumping to implementation when the problem space is unclear
- **Analysis paralysis** — timebox to 30-60 min; if no clear winner, pick the most reversible option
- **Boiling the ocean** — scope to one question; split compound questions into separate discoveries

## Quick Reference

| Op                   | When to Use                        |
| -------------------- | ---------------------------------- |
| `search_intelligent` | Search vault for prior art         |
| `memory_search`      | Check session history and projects |
| `capture_knowledge`  | Persist discovery finding          |
| `route_intent`       | Classify what comes after          |
