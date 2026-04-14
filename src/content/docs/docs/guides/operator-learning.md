---
title: 'Operator Learning'
description: 'How your agent learns about you: tracking expertise, corrections, interests, and work patterns over time.'
---

Your agent builds a profile of you as you work together. This isn't surveillance, it's adaptation. The agent learns your expertise levels, remembers your corrections, notes your interests, and observes your work patterns. Over time, it calibrates its responses to match how you think and work.

## How it works

Operator learning happens automatically during `orchestrate_complete`, the step that runs at the end of every task (see [The Agent Workflow](/docs/guides/workflow/) for the full task lifecycle). This step also runs git-based evidence collection, tracks fix iterations per task, and records quality signals to the brain (clean first-try tasks strengthen patterns, high-rework tasks flag anti-patterns). The agent fills an `operatorSignals` field with observations from the session:

| Signal type     | What it captures                                              | Example                                                |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| **Expertise**   | Topics where you demonstrated knowledge or needed explanation | "React hooks: expert", "Kubernetes: learning"          |
| **Corrections** | Times you told the agent to change behavior                   | "Don't use semicolons in TypeScript" (exact quote)     |
| **Interests**   | Personal context you shared (hobbies, background, culture)    | "Enjoys jazz", "Background in architecture"            |
| **Patterns**    | Work habits: batching, scoping, pacing, communication style   | "Prefers small PRs", "Reviews plans before approving"  |

The agent stores facts, not assumptions. "User asked about React hooks" is stored; "User doesn't know React" is not.

## The operator profile

Signals accumulate into a structured profile with eight sections:

| Section              | What it holds                                                  |
| -------------------- | -------------------------------------------------------------- |
| **Identity**         | Name, role, team context                                       |
| **Cognition**        | How you think: detail-oriented vs. big-picture, pace           |
| **Communication**    | Preferred response style: concise vs. detailed, tone           |
| **Working Rules**    | Corrections and behavioral overrides you have given            |
| **Trust Model**      | What the agent can do autonomously vs. what needs confirmation |
| **Taste Profile**    | Aesthetic and technical preferences                            |
| **Growth Edges**     | Areas where you are actively learning                          |
| **Technical Context**| Languages, frameworks, tools you use                           |

Each section includes evidence: the specific observations that informed it, with timestamps and confidence scores.

## Viewing your profile

Ask the agent to show your profile:

> **You:** "Show me my operator profile"
>
> **Agent:** _Here is your profile..._

Or query a specific section:

> **You:** "What do you know about my expertise?"

The agent uses the `profile_get` operation to retrieve the full profile or a specific section.

## Synthesis

Signals don't update the profile in real time. They accumulate in a buffer. When enough signals have collected (based on session count and signal thresholds), the agent runs a synthesis pass that processes unprocessed signals and updates the profile sections.

You can check if a synthesis is due:

> **You:** "Is a synthesis check due?"

The agent calls `synthesis_check` to determine whether the signal buffer has reached the threshold.

## Corrections

When you correct the agent ("don't do X", "always use Y"), the correction is captured as a signal with your exact words. Corrections are classified as global (applies everywhere) or project-specific (applies only to the current project).

Corrections flow into the **Working Rules** section of your profile and influence future behavior without you having to repeat yourself. You can also codify persistent rules via [Customizing Your Agent](/docs/guides/customizing/).

## Privacy

The agent declines to store health, medical, political, religious, sexual, financial, or legal content. It never announces that it is learning about you, and it never asks for confirmation before storing signals. The learning is silent and factual.

## Exporting your profile

Export your profile for review:

> **You:** "Export my operator profile as markdown"

The agent calls `profile_export` and returns the profile in markdown or JSON format, including evidence trails for each section.

## Snapshots and corrections

The profile is versioned. Before any correction overwrites a section, a snapshot is taken automatically, so you can always trace how the profile evolved over time.

To manually correct a section:

> **You:** "Correct my communication profile: I prefer extremely concise responses, no explanations unless I ask."

The agent uses `profile_correct` to take a snapshot and then overwrite the section with your correction.

---

_Next: [Customizing Your Agent](/docs/guides/customizing/) — shape identity, domains, hooks, and governance. See also [The Agent Workflow](/docs/guides/workflow/) for the full task lifecycle, and [Knowledge Base](/docs/guides/knowledge-base/) for how the vault stores what the agent learns._
