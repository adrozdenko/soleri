---
name: brainstorming
description: 'You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.'
---

<!-- Adapted from superpowers (MIT License) -->

# Brainstorming Ideas Into Designs

## Overview

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Classify intent** — understand what type of work this is
2. **Search vault for prior art** — check if something similar was built, decided, or rejected before
3. **Search web for existing solutions** — don't build what already exists
4. **Explore project context** — check files, docs, recent commits
5. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
6. **Propose 2-3 approaches** — with trade-offs and your recommendation
7. **Present design** — in sections scaled to their complexity, get user approval after each section
8. **Capture design decision** — persist the decision to the vault
9. **Write design doc** — save to `docs/plans/YYYY-MM-DD-<topic>-design.md` and commit
10. **Transition to implementation** — invoke writing-plans skill to create implementation plan

## Step 0: Classify Intent

Before anything else, understand the type of work:

```
salvador_core op:route_intent
  params: { prompt: "<the user's request>" }
```

This returns the intent type (BUILD, FIX, VALIDATE, DESIGN, IMPROVE, DELIVER) and routing guidance. Use this to focus the brainstorming — a FIX intent needs different questions than a BUILD intent.

## Step 1: Search Before Designing — Vault, Then Web

**BEFORE asking any questions or exploring code**, search for existing knowledge. Follow this order:

### Vault First

```
salvador_core op:search_intelligent
  params: { query: "<the feature or idea the user described>" }
```

Look for:

- **Previous designs** — was this discussed or attempted before?
- **Architectural decisions** — are there constraints from past decisions?
- **Patterns** — established approaches in this codebase
- **Anti-patterns** — approaches that were tried and failed

Browse the knowledge landscape for related context:

```
salvador_core op:vault_tags
salvador_core op:vault_domains
```

Check what the brain says about proven patterns in this domain:

```
salvador_core op:brain_strengths
```

Check if other linked projects have solved this:

```
salvador_core op:memory_cross_project_search
  params: { query: "<the feature>", crossProject: true }
```

### Web Search Second

If the vault doesn't have prior art, search the web for:

- **Existing libraries/tools** that solve this problem (don't build what exists)
- **Reference implementations** in similar projects
- **Best practices** and established patterns for this type of feature
- **Known pitfalls** that others have documented

### Present Findings

Present vault + web findings to the user: "Before we design this, here's what I found..." This informs the design conversation and prevents reinventing solutions.

## The Process

**Understanding the idea:**

- Check out the current project state first (files, docs, recent commits)
- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message
- Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why
- **Reference vault patterns** — if the vault has a proven approach, lead with it
- **Reference web findings** — if an existing library solves this, recommend it over custom code

**Presenting the design:**

- Once you understand what you're building, present the design
- Scale each section to its complexity
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing

## After the Design

**Capture the design decision to the vault:**

```
salvador_core op:capture_knowledge
  params: {
    title: "<feature name> — design decision",
    description: "<chosen approach, rationale, rejected alternatives>",
    type: "decision",
    category: "<relevant domain>",
    tags: ["<relevant>", "<tags>", "design-decision"]
  }
```

This ensures future brainstorming sessions can reference what was decided and why.

**Documentation:**

- Write the validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Commit the design document to git

**Implementation:**

- Invoke the writing-plans skill to create a detailed implementation plan
- Do NOT invoke any other skill. writing-plans is the next step.

## Process Flow

**The terminal state is invoking writing-plans.** Do NOT invoke any other implementation skill. The ONLY skill you invoke after brainstorming is writing-plans.

## Key Principles

- **Classify first** — understand intent before diving in
- **Vault first** — don't reinvent what's been decided or solved before
- **Web second** — don't build what already exists as a library
- **One question at a time** — don't overwhelm with multiple questions
- **Multiple choice preferred** — easier to answer than open-ended when possible
- **YAGNI ruthlessly** — remove unnecessary features from all designs
- **Explore alternatives** — always propose 2-3 approaches before settling
- **Incremental validation** — present design, get approval before moving on
- **Capture decisions** — every design decision gets persisted to the vault
- **Cross-project learning** — check if other projects solved this already
- **Be flexible** — go back and clarify when something doesn't make sense

## Agent Tools Reference

| Op                             | When to Use                                  |
| ------------------------------ | -------------------------------------------- |
| `route_intent`                 | Classify the type of work (BUILD, FIX, etc.) |
| `search_intelligent`           | Search vault for prior art                   |
| `vault_tags` / `vault_domains` | Browse knowledge landscape                   |
| `brain_strengths`              | Check proven patterns                        |
| `memory_cross_project_search`  | Check if other projects solved this          |
| `capture_knowledge`            | Persist design decision to vault             |
