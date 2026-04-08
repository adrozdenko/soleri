---
name: soleri-brainstorming
description: >
  Use when the user says "I want to build something", "let's think about",
  "what if we", "creative exploration", or "ideate". For open-ended creative
  exploration when requirements are NOT yet clear.
---

# Brainstorming Ideas Into Designs

Turn ideas into fully formed designs through collaborative dialogue. Understand project context, ask questions one at a time, present a design, get approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Checklist

Complete in order:

1. **Classify intent** — `archie_core op:route_intent`
2. **Search vault for prior art** — `archie_core op:search_intelligent`
3. **Search web for existing solutions** — don't build what already exists
4. **Explore project context** — check files, docs, recent commits
5. **Ask clarifying questions** — one at a time, purpose/constraints/success criteria
6. **Propose 2-3 approaches** — with trade-offs and your recommendation
7. **Present design** — in sections scaled to complexity, get approval after each
8. **Capture design decision** — persist to vault
9. **Write design doc** — save to `docs/plans/YYYY-MM-DD-<topic>-design.md` and commit
10. **Transition** — invoke writing-plans skill (the ONLY next skill)

## Search Before Designing

### Vault First

```
archie_core op:search_intelligent
  params: { query: "<the feature or idea>" }
```

Also check: `op:vault_tags`, `op:vault_domains`, `op:brain_strengths`, `op:memory_cross_project_search` with `crossProject: true`.

### Web Search Second

If vault has no prior art, search web for existing libraries, reference implementations, best practices, known pitfalls.

Present findings: "Before we design this, here's what I found..."

## The Process

- **Understanding**: Check project state, ask one question per message, prefer multiple choice
- **Exploring**: Propose 2-3 approaches, lead with recommendation, reference vault patterns and web findings
- **Presenting**: Scale each section to complexity, ask after each section, cover architecture/components/data flow/error handling/testing

## After the Design

**Capture the decision:**

```
archie_core op:capture_knowledge
  params: {
    title: "<feature> — design decision",
    description: "<chosen approach, rationale, rejected alternatives>",
    type: "decision",
    category: "<domain>",
    tags: ["design-decision"]
  }
```

Write validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md` and commit. Then invoke writing-plans.

## Common Mistakes

- Skipping vault search and reinventing solved problems
- Jumping to implementation without design approval
- Asking multiple questions per message (overwhelming)
- Treating "simple" projects as too simple to need a design

## Quick Reference

| Op                             | When to Use                |
| ------------------------------ | -------------------------- |
| `route_intent`                 | Classify work type         |
| `search_intelligent`           | Search vault for prior art |
| `vault_tags` / `vault_domains` | Browse knowledge landscape |
| `brain_strengths`              | Check proven patterns      |
| `memory_cross_project_search`  | Check other projects       |
| `capture_knowledge`            | Persist design decision    |
