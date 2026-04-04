---
name: soleri-deliver-and-ship
tier: default
description: >
  Use when the user says "ship it", "pre-PR check", "delivery checklist", "is this ready",
  "final review", or "ready to deploy". Runs pre-delivery quality gates
  to ensure nothing ships without passing stability and code quality checks.
  For mid-workflow verification (not shipping), use verification-before-completion instead.
---

# Deliver & Ship — Quality Gate Runner

Run all pre-delivery quality gates before shipping. This ensures nothing leaves without passing stability checks, knowledge capture, and code quality verification.

## When to Use

When work is considered "done" and ready to be committed, PR'd, or deployed. This is the last checkpoint before code leaves the developer's hands.

## Orchestration Sequence

### Step 1: Code Quality

Run the project's linter, formatter, and type checker on all modified files:

1. Check for lint/format scripts in `package.json` (or equivalent)
2. Run `typecheck` / `tsc --noEmit` if TypeScript
3. Run any project-specific quality gates (clippy for Rust, mypy for Python, etc.)

Any type error or lint failure is a blocker.

### Step 2: Test Suite

Run the full test suite to catch regressions:

```
YOUR_AGENT_core op:admin_health
```

Verify the agent itself is healthy, then run project tests. All tests must pass.

### Step 3: Stability Assessment

Classify the changes as safe or breaking:

- **Safe**: Internal refactors, bug fixes, additive features (new exports, new ops)
- **Breaking**: Removed exports, changed signatures, renamed public APIs, schema migrations
- Breaking changes need migration guidance in the commit/PR description

### Step 4: Knowledge Audit

Check if patterns discovered during this work session should be captured before shipping:

```
YOUR_AGENT_core op:memory_search
  params: { query: "current session" }
```

```
YOUR_AGENT_core op:brain_stats
```

Look for:

- Bug fixes that reveal an anti-pattern worth capturing
- New patterns that should be in the vault for next time
- Architectural decisions that need documenting

Uncaptured knowledge is lost knowledge. If something should be captured:

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "<what was learned>",
    description: "<the pattern or anti-pattern>",
    type: "pattern",
    tags: ["<relevant-tags>"]
  }
```

### Step 5: Commit Quality

Verify commit messages follow conventional commits:

- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for refactors
- `chore:` for maintenance
- No AI attribution (blocked by engine rules)

### Step 6: Delivery Report

Present a checklist:

- [ ] Code quality: pass/fail (Step 1)
- [ ] Tests: pass/fail (Step 2)
- [ ] Stability: safe change / breaking change (Step 3)
- [ ] Knowledge: captured / needs capture (Step 4)
- [ ] Commits: clean / needs cleanup (Step 5)

All items must pass before recommending "ship it."

## Domain-Specific Gates

Agents with domain-specific facades may add extra gates. For example:

- **Design system agents**: token validation, contrast checks, accessibility audit
- **API agents**: schema validation, backward compatibility checks
- **Security agents**: dependency audit, secret scanning

These are additive — they don't replace the generic gates above.

## Exit Criteria

Delivery is approved when all gates pass. If any gate fails, report the failure and recommend fixes before shipping. Never approve delivery with blocking issues.

## Agent Tools Reference

| Op                  | When to Use                            |
| ------------------- | -------------------------------------- |
| `admin_health`      | Verify agent/system health             |
| `memory_search`     | Check for uncaptured session knowledge |
| `brain_stats`       | Review learning state                  |
| `capture_knowledge` | Persist patterns before shipping       |
| `capture_quick`     | Fast capture for simple learnings      |
