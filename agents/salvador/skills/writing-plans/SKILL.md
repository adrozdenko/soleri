---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

<!-- Adapted from superpowers (MIT License) -->

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## Before Writing — Search First, Plan Second

**Never write a plan from scratch.** Always search for existing knowledge first.

### 1. Vault First

Check the vault for relevant implementation patterns:

```
salvador_core op:search_intelligent
  params: { query: "<feature being planned>" }
```

Look for:

- **Implementation patterns** — proven approaches for similar features
- **Anti-patterns** — approaches that failed and should be avoided
- **Testing patterns** — how similar features were tested

Also check brain strengths for what's worked:

```
salvador_core op:brain_strengths
```

Browse related knowledge domains for additional context:

```
salvador_core op:vault_domains
salvador_core op:vault_tags
```

### 2. Web Search Second

If the vault doesn't have implementation guidance, search the web:

- **Libraries and tools** — is there a package that does this already?
- **Reference implementations** — how did other projects solve this?
- **API documentation** — official docs for libraries you'll use
- **Known issues** — pitfalls others ran into

### 3. Then Write the Plan

Incorporate vault insights and web findings into the plan. Reference specific vault entries and documentation links when they inform a step. A plan informed by existing knowledge is dramatically better than one written from first principles.

## Create a Tracked Plan

Use the agent's planning system to create a tracked, resumable plan:

```
salvador_core op:create_plan
  params: {
    objective: "<one-sentence goal>",
    scope: { included: [...], excluded: [...] },
    steps: [
      { title: "Step 1 title", description: "details" },
      ...
    ]
  }
```

This makes the plan persistent across sessions — if context compacts or sessions change, the plan survives.

## Grade the Plan

After drafting, grade the plan for quality before presenting to the user:

```
salvador_core op:plan_grade
  params: { planId: "<id from create_plan>" }
```

If the grade is below target, auto-improve:

```
salvador_core op:plan_auto_improve
  params: { planId: "<id>" }
```

This iterates on the plan — filling gaps, adding missing test steps, clarifying ambiguous instructions. Repeat until the grade meets the target:

```
salvador_core op:plan_meets_grade
  params: { planId: "<id>", targetGrade: "A" }
```

### Iterate on Drafts

For complex plans, iterate before finalizing:

```
salvador_core op:plan_iterate
  params: { planId: "<id>", feedback: "<what needs improvement>" }
```

This creates a new version of the plan incorporating the feedback, preserving version history.

## Split into Tasks

Once the plan is approved, split it into trackable tasks:

```
salvador_core op:plan_split
  params: { planId: "<id>" }
```

This generates individual tasks from the plan steps, ready for execution tracking.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**

- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

Each task uses this format:

- Files: Create / Modify / Test paths
- Step 1: Write the failing test (with code)
- Step 2: Run test to verify it fails (with expected output)
- Step 3: Write minimal implementation (with code)
- Step 4: Run test to verify it passes (with expected output)
- Step 5: Commit (with exact git commands)

## Remember

- Exact file paths always
- Complete code in plan (not "add validation")
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## After Plan Approval

Once the user approves the plan, register it for tracking:

```
salvador_core op:approve_plan
  params: { planId: "<id from create_plan>" }
```

Check plan stats for an overview:

```
salvador_core op:plan_stats
```

## Execution Handoff

After saving the plan, offer execution choice:

"Plan complete and saved to `docs/plans/<filename>.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?"

## Agent Tools Reference

| Op                             | When to Use                            |
| ------------------------------ | -------------------------------------- |
| `search_intelligent`           | Find relevant patterns before planning |
| `brain_strengths`              | Check proven approaches                |
| `vault_domains` / `vault_tags` | Browse knowledge landscape             |
| `create_plan`                  | Create tracked, persistent plan        |
| `plan_grade`                   | Grade plan quality                     |
| `plan_auto_improve`            | Auto-fix plan weaknesses               |
| `plan_meets_grade`             | Verify grade target reached            |
| `plan_iterate`                 | Iterate on draft with feedback         |
| `plan_split`                   | Split plan into trackable tasks        |
| `approve_plan`                 | Lock in approved plan                  |
| `plan_stats`                   | Overview of plan metrics               |
