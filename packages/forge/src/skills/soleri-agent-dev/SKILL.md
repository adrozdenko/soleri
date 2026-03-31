---
name: soleri-agent-dev
description: >
  Use when extending the agent itself — adding facades, tools, vault operations,
  brain features, new skills, or modifying agent internals. Triggers on "add a facade",
  "new tool", "extend vault", "add brain feature", "new skill", "add operation",
  "extend agent", or when the work target is the agent's own codebase rather than
  a project the agent assists with. Enforces vault-first knowledge gathering before
  any code reading or planning.
---

# Agent Dev — Vault-First Internal Development

Develop the agent's own internals with the vault as the primary source of truth. The vault knows more about the agent than any code scan or model training data. Always search the vault first, extract maximum context, and only then touch code.

## When to Use

Any time the work target is the agent's own codebase: adding tools, extending facades, modifying vault operations, brain features, skills, or transport. Not for projects that merely _use_ the agent.

## Core Principle

**Vault first. Before code. Before training data. Always.**

The vault is the authoritative source for how the agent works. Do not rely on general knowledge from training data — it is outdated and lacks project-specific decisions. Do not scan the codebase to understand architecture — the vault already has it.

## Orchestration Sequence

### Step 1: Search the Vault (MANDATORY — before anything else)

Before reading any source file, before making any plan, before offering any advice:

```
YOUR_AGENT_core op:search_vault_intelligent
  params: { query: "<description of planned work>", options: { intent: "pattern" } }
```

Search again with architecture-specific terms: the facade name, tool name, or subsystem being modified.

```
YOUR_AGENT_core op:query_vault_knowledge
  params: { type: "workflow", category: "<relevant category>" }
```

If initial results are sparse, search again with broader terms — synonyms, related subsystem names, parent concepts. Exhaust the vault before moving on.

Review all results. Extract file paths, module names, function references, conventions, and constraints. These become the foundation for every step that follows.

### Step 2: Check Brain for Proven Patterns

```
YOUR_AGENT_core op:strengths
  params: { days: 30, minStrength: 60 }
```

```
YOUR_AGENT_core op:recommend
  params: { projectPath: "." }
```

Check if the brain has learned anything relevant from recent sessions.

### Step 3: Targeted Code Reading (Only What Vault Pointed To)

By now the vault has provided architecture context, file paths, and module references. Only read code when the vault describes the subsystem but lacks implementation detail (e.g., method signatures, exact line numbers).

**Read only what the vault pointed to.** Open the specific files referenced in vault results — not the surrounding codebase, not the parent directory, not "let me explore the project structure."

**Fallback: Codebase scan.** Only when vault search returned zero relevant results for the subsystem — meaning the vault genuinely has no knowledge about it — fall back to `Grep` with targeted terms. This is the last resort, not the default.

### Step 4: Plan with Vault Context

Create the implementation plan referencing vault findings explicitly:

- Which patterns apply (cite vault entry titles)
- Which anti-patterns to avoid (cite the specific anti-pattern)
- Which conventions to follow (naming, facade structure, tool registration)

Every plan must trace its decisions back to vault knowledge. If a decision has no vault backing, flag it as a new architectural choice that should be captured after implementation (Step 7).

### Step 5: Implement

Follow the plan. Key conventions for agent internals:

- **Facades**: Thin routing layer — delegate to domain modules. No business logic in facades.
- **Tools**: Follow `op:operation_name` naming, return structured responses.
- **Vault writes**: All writes go through the vault intelligence layer.
- **Tests**: Colocated test files. Run with vitest.
- **Build**: Must compile without errors before considering done.

### Step 6: Validate and Self-Correct

Run the relevant test suite. Rebuild — must complete without errors.

**Self-correction loop:** If tests fail or build breaks, do NOT ask the user what to do. Read the error, trace the cause in the code just written, fix it, and re-run. Repeat until green. The agent owns the code it wrote — if something fails, the agent fixes its own implementation. Only escalate to the user when the failure is outside the agent's control (missing infrastructure, permissions, unclear requirements).

### Step 7: Capture What Was Learned

If this work revealed new architectural knowledge, a useful pattern, or a surprising anti-pattern:

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "<what was learned>",
    description: "<the pattern or anti-pattern>",
    type: "pattern",
    tags: ["<relevant-tags>"]
  }
```

This ensures future sessions benefit from today's discovery — making the vault smarter for the next developer.

## Anti-Patterns to Avoid

- **Code-first exploration**: Reading source files before searching the vault. The vault already has the architecture — scanning code is slower and gives less context.
- **Training-data advice**: Offering general guidance from model training data instead of searching the vault for project-specific knowledge.
- **Skipping vault search**: The vault contains all architecture knowledge. Not searching it means reinventing knowledge that already exists.
- **Planning without vault context**: Plans created without vault knowledge miss conventions, duplicate existing patterns, or violate architectural boundaries.
- **Broad codebase scanning**: Exploring directories and reading files "to understand the project" instead of using vault results as a targeted map.

## Exit Criteria

Development is complete when: vault was searched exhaustively first (Step 1), implementation follows discovered patterns, tests pass, build succeeds, and any new learning is captured back to vault (Step 7).
