---
title: 'Chain Operations'
description: 'How to compose multi-step workflows where each step feeds data to the next, with approval gates that pause execution until you say go.'
---

Chains let you wire multiple ops together into a single workflow. Step 1 runs, its output becomes available to step 2, step 2 runs, and so on. If a step has a gate attached, the chain pauses and waits (for your approval, for a test to pass, for a vault check) before continuing.

Think of a chain as a pipeline. You define the steps up front, pass in some initial input, and the runner handles the rest: dispatching each op, storing intermediate results, resolving variable references, evaluating gates, and persisting state to SQLite so nothing gets lost if the session ends mid-chain.

## Why you'd use a chain

Most agent ops are one-shot: search the vault, create a plan, capture knowledge. Chains are for when you need _several_ of those ops to run in sequence, with data flowing between them, and possibly human checkpoints along the way.

A few concrete scenarios:

- Research a topic in the vault, then feed the results into a plan, then get your approval before the agent starts executing that plan.
- Ingest a URL, extract patterns from the content, run a vault check to make sure the patterns don't conflict with existing knowledge, then capture the ones that pass.
- Run a code review, score it, and only proceed to creating a PR if the score clears a threshold.

Without chains, you'd do this manually step by step. With chains, you describe the whole workflow once and let the runner handle sequencing.

## The 5 ops

| Op | Auth | What it does |
|----|------|-------------|
| `chain_execute` | write | Starts a new chain. Runs steps sequentially until completion, a gate pauses it, or a step fails. |
| `chain_status` | read | Returns the current state of a chain instance: which steps finished, where it paused, what the outputs were. |
| `chain_resume` | write | Resumes a paused chain from where it stopped (after you've addressed whatever the gate was waiting for). |
| `chain_list` | read | Lists all chain instances, most recently updated first. Accepts an optional `limit` (default 20). |
| `chain_step_approve` | write | Approves a gate-paused step and resumes execution from the next step. This is the most common way to continue a paused chain. |

`chain_resume` and `chain_step_approve` do the same thing under the hood. The distinction is semantic: `chain_step_approve` is clearer when you're responding to a user-approval gate, while `chain_resume` is more general.

## Defining a chain

A chain definition has an `id`, an optional `name` and `description`, and an array of `steps`. Each step has:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique identifier for the step within this chain. Used for variable resolution and gate tracking. |
| `op` | yes | The facade op to call (e.g., `search_intelligent`, `create_plan`, `capture_knowledge`). |
| `params` | no | Parameters to pass to the op. Supports `$variable` references (see next section). |
| `output` | no | An alias for the step's result. If set, the result is stored under both the step `id` and this alias in the chain context. |
| `gate` | no | One of `user-approval`, `auto-test`, `vault-check`, or `none`. Controls whether execution pauses after this step. |
| `description` | no | Human-readable note about what this step does. Doesn't affect execution. |

Here's a minimal example:

```json
{
  "id": "research-and-plan",
  "name": "Research then Plan",
  "steps": [
    {
      "id": "research",
      "op": "search_intelligent",
      "params": { "query": "$input.topic" },
      "output": "findings"
    },
    {
      "id": "plan",
      "op": "create_plan",
      "params": {
        "objective": "$input.objective",
        "context": "$findings"
      },
      "gate": "user-approval"
    }
  ]
}
```

This chain searches the vault for a topic, stores the result as `findings`, then creates a plan using those findings. The `user-approval` gate on the second step means the chain pauses after the plan is created, giving you a chance to review it before anything else happens.

## Variable passing between steps

Every chain has a _context_ object that accumulates data as steps run. When the chain starts, the context contains one key: `input`, which holds whatever you passed as the initial input.

As each step completes, its result gets stored in the context under two keys:

1. The step's `id` (always)
2. The step's `output` alias (if you set one)

Subsequent steps can reference these stored values using `$variable` syntax in their params:

| Reference | Resolves to |
|-----------|-------------|
| `$input.topic` | The `topic` field from the initial input you passed to `chain_execute` |
| `$research` | The entire result object from the step with `id: "research"` |
| `$research.items` | The `items` field from that step's result |
| `$findings` | Same as `$research` if the step had `output: "findings"` set |
| `$findings.items[0]` | Does _not_ work. Array indexing isn't supported, only dot-path traversal. |

Variable resolution is recursive. If a param value is an object, its nested values get resolved too. If a param value is an array, each element gets resolved. This means you can build up complex param structures with references scattered throughout.

One thing to watch for: if a `$reference` doesn't resolve (the path doesn't exist in the context), it comes back as `undefined`. The op receiving that param needs to handle that gracefully, or the step will likely fail.

## Gate types

Gates are checkpoints between steps. After a step completes, its gate (if any) decides whether the chain continues, pauses, or fails.

### `user-approval`

Pauses the chain and waits for you to approve. The chain status changes to `paused` and the `pausedAtGate` field records which step is waiting. Call `chain_step_approve` (or `chain_resume`) with the instance ID and chain definition to continue.

This is the gate you'll use most. It's the "let me look at this before you keep going" checkpoint.

### `auto-test`

Checks the step's output for an `error` field. If the result contains `error`, the gate fails and the chain status changes to `failed`. If the result is clean (no `error` field, and not null), the gate passes and execution continues automatically.

This is useful for steps where you want to bail out if something went wrong, without requiring human intervention. The check is simple on purpose: it just looks for an `error` key in the result object.

### `vault-check`

Delegates to a custom gate-check function. If a `gateCheck` callback was provided when the chain was started, the runner calls it with the gate type, step ID, and step result. The callback returns `{ passed: boolean, message?: string }`.

If no `gateCheck` callback was provided, the vault-check gate passes automatically. This makes it safe to define vault-check gates even when running in environments where the custom check isn't wired up.

### `none`

No gate. Execution continues to the next step immediately. This is the default when you don't specify a gate at all, so you rarely need to write it explicitly.

## Running a chain

To start a chain, call `chain_execute` with the chain definition and an optional input object:

```json
{
  "op": "chain_execute",
  "params": {
    "chain": {
      "id": "ingest-and-capture",
      "name": "Ingest URL and Capture Patterns",
      "steps": [
        {
          "id": "ingest",
          "op": "intake_url",
          "params": { "url": "$input.url" },
          "output": "content"
        },
        {
          "id": "extract",
          "op": "knowledge_harvest",
          "params": { "text": "$content.body" },
          "output": "patterns",
          "gate": "auto-test"
        },
        {
          "id": "review",
          "op": "vault_search",
          "params": { "query": "$patterns.summary" },
          "gate": "user-approval",
          "description": "Check for conflicts before capturing"
        },
        {
          "id": "capture",
          "op": "capture_knowledge",
          "params": {
            "title": "$patterns.title",
            "body": "$patterns.body",
            "tags": "$patterns.tags"
          }
        }
      ]
    },
    "input": {
      "url": "https://example.com/article"
    }
  }
}
```

The runner returns a `ChainInstance` object with the current status. If all steps complete without hitting a gate, the status is `completed`. If a user-approval gate fires, the status is `paused`. If a step fails (throws an error or fails an auto-test gate), the status is `failed`.

You can also skip ahead to a specific step with the `startFromStep` parameter. This is useful when you want to re-run part of a chain without starting from scratch:

```json
{
  "op": "chain_execute",
  "params": {
    "chain": { "...same definition..." },
    "input": { "url": "https://example.com/article" },
    "startFromStep": "review"
  }
}
```

## Checking status and listing chains

`chain_status` returns the full instance state for a given instance ID:

```json
{
  "op": "chain_status",
  "params": { "instanceId": "a1b2c3d4e5f6" }
}
```

The response includes:

| Field | What it tells you |
|-------|-------------------|
| `status` | One of `running`, `paused`, `completed`, `failed` |
| `currentStep` | Which step is currently executing (null if done) |
| `pausedAtGate` | Which step triggered the pause (null if not paused) |
| `stepsCompleted` | How many steps finished successfully |
| `totalSteps` | Total number of steps in the chain |
| `stepOutputs` | Array of results from each completed step, including duration and status |
| `context` | The full context object with all resolved variables |

`chain_list` shows all chain instances, most recent first:

```json
{
  "op": "chain_list",
  "params": { "limit": 10 }
}
```

## Error handling and resumption

When a step throws an error, the chain doesn't crash. The runner catches the error, records it in the step output with `status: "failed"`, and sets the chain status to `failed`. The error message is stored in the step result as `{ error: "..." }`.

A failed chain can't be resumed with `chain_resume`. You need to start a new execution. If the first few steps were fine and you just want to re-run from where it broke, use `startFromStep` to skip the successful steps. The catch is that you'll need to provide the input again, and the context from the earlier steps won't be pre-populated (each execution starts fresh).

For user-approval gates, resumption is straightforward. The chain pauses, you inspect the result, and when you're satisfied:

```json
{
  "op": "chain_step_approve",
  "params": {
    "instanceId": "a1b2c3d4e5f6",
    "chain": { "...same chain definition..." }
  }
}
```

The runner picks up from the step _after_ the paused gate and continues executing. You need to pass the chain definition again because the runner needs to know what the remaining steps are (instance state only stores outputs, not the step definitions themselves).

## A complete example

Here's a chain that does a full "research, plan, review, execute" cycle:

```json
{
  "id": "full-feature-workflow",
  "name": "Feature Implementation Workflow",
  "steps": [
    {
      "id": "research",
      "op": "search_intelligent",
      "params": { "query": "$input.feature_description" },
      "output": "vault_context",
      "description": "Search vault for relevant patterns and prior art"
    },
    {
      "id": "recommend",
      "op": "brain_recommend",
      "params": { "context": "$vault_context" },
      "output": "recommendations"
    },
    {
      "id": "plan",
      "op": "create_plan",
      "params": {
        "objective": "$input.feature_description",
        "vault_context": "$vault_context",
        "brain_recs": "$recommendations"
      },
      "output": "the_plan",
      "gate": "user-approval",
      "description": "Review the plan before execution begins"
    },
    {
      "id": "execute",
      "op": "orchestrate_execute",
      "params": { "planId": "$the_plan.planId" },
      "gate": "auto-test",
      "description": "Execute the plan, bail if it errors"
    },
    {
      "id": "capture",
      "op": "orchestrate_complete",
      "params": { "planId": "$the_plan.planId" },
      "description": "Capture learnings from the execution"
    }
  ]
}
```

You'd kick this off with:

```json
{
  "op": "chain_execute",
  "params": {
    "chain": "...the definition above...",
    "input": {
      "feature_description": "Add rate limiting to the public API endpoints"
    }
  }
}
```

The chain would research, get brain recommendations, create a plan, then pause for your approval. After you approve, it executes the plan (with an auto-test gate to catch failures), then captures the learnings. Five ops, one workflow, one approval checkpoint in the middle.

## Persistence

Chain state is persisted to SQLite. Every time a step completes, the runner writes the updated instance to the `chain_instances` table. This means you can close your session, come back later, and the chain will still be there in its paused state. Call `chain_list` to find it, `chain_status` to see where it left off, and `chain_step_approve` to continue.

---

_Previous: [Validation Loops](/docs/guides/loops/). For the full list of agent capabilities, see [Capabilities](/docs/capabilities/)._
