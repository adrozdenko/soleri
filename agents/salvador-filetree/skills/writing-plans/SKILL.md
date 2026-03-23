---
name: writing-plans
description: >
  Use when the user has clear requirements or a spec and needs a structured implementation plan —
  "create a plan", "break this down", "plan the implementation". Requirements are already known.
  For open-ended exploration when requirements are unclear, use brainstorming instead.
---

# Writing Plans

Write implementation plans assuming the engineer has zero codebase context. Document everything: which files to touch, code, testing, expected output. Bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## Before Writing — Search First

### 1. Vault First

```
salvador_core op:search_intelligent
  params: { query: "<feature being planned>" }
salvador_core op:brain_strengths
salvador_core op:vault_domains
salvador_core op:vault_tags
```

### 2. Web Search Second

If vault lacks guidance: libraries, reference implementations, API docs, known pitfalls.

### 3. Then Write the Plan

Incorporate vault insights and web findings. Reference specific entries.

## Create a Tracked Plan

```
salvador_core op:create_plan
  params: {
    objective: "<one-sentence goal>",
    scope: { included: [...], excluded: [...] },
    steps: [{ title: "Step 1", description: "details" }, ...]
  }
```

## Grade and Improve

```
salvador_core op:plan_grade params: { planId: "<id>" }
salvador_core op:plan_auto_improve params: { planId: "<id>" }
salvador_core op:plan_meets_grade params: { planId: "<id>", targetGrade: "A" }
```

Iterate with: `op:plan_iterate params: { planId: "<id>", feedback: "<improvement>" }`

## Split into Tasks

After approval: `salvador_core op:plan_split params: { planId: "<id>" }`

## Task Granularity

Each step is one action (2-5 minutes): write failing test, run it, implement, run tests, commit.

## Plan Document Header

```markdown
# [Feature] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** [One sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [Key technologies]
```

## Task Structure

- Files: Create / Modify / Test paths
- Steps: Write failing test (code) -> verify fail (expected output) -> implement (code) -> verify pass (expected output) -> commit (exact commands)

## After Approval

```
salvador_core op:approve_plan params: { planId: "<id>" }
```

Offer execution choice: subagent-driven (this session) or parallel session with executing-plans.

## Common Mistakes

- Writing plans from scratch without searching vault first
- Vague steps like "add validation" instead of exact code
- Missing test steps in the plan
- Not grading the plan before presenting to user

## Quick Reference

| Op                                 | When to Use                   |
| ---------------------------------- | ----------------------------- |
| `search_intelligent`               | Find patterns before planning |
| `brain_strengths`                  | Proven approaches             |
| `create_plan`                      | Create tracked plan           |
| `plan_grade` / `plan_auto_improve` | Grade and improve             |
| `plan_iterate`                     | Iterate with feedback         |
| `plan_split`                       | Split into tasks              |
| `approve_plan`                     | Lock in approved plan         |
