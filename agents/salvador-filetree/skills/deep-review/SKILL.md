---
name: deep-review
description: >
  Use for in-depth code review beyond linting — architecture fitness, code smells, solution quality,
  optimization opportunities. Triggers on "deep review", "review this code", "is this well architected",
  "code smells", "review this module", "architecture review", "is this the right approach",
  "optimization review". Works on any codebase. For vault-specific knowledge quality, use vault-smells instead.
---

# Deep Review — Architecture, Smells & Solution Quality

Multi-pass code review that goes beyond surface lint. Analyzes structural health, code smells, architectural fitness, and solution quality. Works on any codebase — vault context is optional enrichment, not a requirement.

## Input

The user provides a **target**: file, module, directory, PR diff, or function. If unclear, ask.

## The Three Passes

### Pass 1: Structural Analysis & Code Smells

**Metrics** (gather by reading the code):
- File length and function count
- Cyclomatic complexity (nesting depth, branch count)
- Dependency count — imports from how many modules?
- Export surface area — how much is public vs. should be internal?

**Structural Smells:**
- **God file/class** — too many responsibilities, >300 lines with mixed concerns
- **Long parameter lists** — function takes 5+ params (should be an object/config)
- **Deep nesting** — 4+ levels of if/for/try/catch
- **Shotgun surgery** — changing this code requires touching 5+ other files
- **Primitive obsession** — passing raw strings/numbers instead of domain types
- **Boolean blindness** — functions with multiple boolean params (`fn(true, false, true)`)

**Duplication Smells:**
- Copy-paste with slight variations
- Repeated conditional logic — same if-chain in 3+ places
- Parallel structures that always change together

**Temporal Smells** (check git history):
- Files that always change together but live in different modules → missing abstraction
- Functions that get patched repeatedly → wrong abstraction
- High churn files → instability signal

```
git log --format=format: --name-only --since="3 months ago" <target-path> | sort | uniq -c | sort -rn | head -20
```

Present findings before moving to Pass 2.

### Pass 2: Architectural Fitness

**Dependency Direction:**
- Do dependencies flow in the right direction? (Outer layers depend on inner, not reverse)
- Are there circular dependencies?
- Does the code reach across module boundaries it shouldn't?

**Abstraction Level:**
- Is this the right level of abstraction for the problem?
- Over-engineered? (abstraction for one use case, premature generalization)
- Under-engineered? (inline logic that should be extracted)

**Cohesion & Coupling:**
- Does everything in this module belong together? (high cohesion)
- Is the module tangled with others? (low coupling desired)
- Feature envy — does a function touch another module's internals more than its own?

**Vault Context** (optional — only if vault is connected):

```
salvador_core op:search_intelligent
  params: { query: "<module name> architecture pattern" }
```

If vault has relevant patterns, check alignment. If not, skip — this pass works without vault.

### Pass 3: Solution Quality Assessment

**Simplification:**
- Is there a simpler way to achieve the same result?
- Could any abstraction be removed without loss?
- Are there standard library/framework features that replace custom code?

**Edge Cases:**
- What inputs would break this?
- Are error paths handled or just the happy path?
- What happens with empty/null/undefined inputs?
- Concurrency: race conditions, shared mutable state?

**Performance:**
- Any O(n²) or worse hidden in loops?
- Unnecessary allocations, copies, or serialization?
- N+1 query patterns?
- Unbounded growth (arrays/maps that grow without limit)?

**Evolutionary Fitness:**
- How does this code age? Easy to modify in 6 months?
- Does it create "gravity" — attracting more complexity over time?
- Are extension points in the right places?

## Presenting the Report

```
## Deep Review: [target name]

### Structural Health
| Metric | Value | Verdict |
|--------|-------|---------|
| Lines | X | OK / ⚠️ Large |
| Functions | X | OK / ⚠️ Many |
| Max nesting | X | OK / ⚠️ Deep |
| Dependencies | X | OK / ⚠️ Heavy |
| Export surface | X public / Y total | OK / ⚠️ Wide |

### Code Smells
| Smell | Location | Severity | Detail |
|-------|----------|----------|--------|
| God file | file.ts | ⚠️ | 450 lines, 3 mixed concerns |
| Feature envy | fn() → other module | ⚠️ | Reaches into X internals |
| Deep nesting | line 120-180 | 💡 | 5 levels, consider early returns |

### Architecture
| Aspect | Assessment |
|--------|------------|
| Dependency direction | ✅ Clean / ⚠️ Reverse dep on X |
| Abstraction level | ✅ Right / ⚠️ Over/Under |
| Cohesion | ✅ High / ⚠️ Mixed concerns |
| Coupling | ✅ Low / ⚠️ Tight with X |

### Solution Quality
| Area | Finding |
|------|---------|
| Simplification | [opportunity or "none found"] |
| Edge cases | [gaps found or "well covered"] |
| Performance | [concerns or "no issues"] |
| Evolutionary fitness | [assessment] |

### Recommendations
| Priority | Action | Impact |
|----------|--------|--------|
| 1 | [most impactful] | High |
| 2 | [second] | Medium |
```

## Severity Scale

| Level | Meaning |
|-------|---------|
| ✅ | Clean — no action needed |
| 💡 | Info — worth knowing, low priority |
| ⚠️ | Warning — should fix, causes friction |
| 🔴 | Critical — fix before shipping, causes bugs or blocks scaling |

## Capturing Learnings (Optional)

If the review uncovers a pattern or anti-pattern worth remembering:

```
salvador_core op:capture_knowledge
  params: {
    title: "<pattern name>",
    description: "<what was found, why it matters>",
    type: "pattern" | "anti-pattern",
    category: "architecture",
    tags: ["code-review", "<specific-tag>"]
  }
```

Only capture if genuinely reusable — not every review finding is vault-worthy.

## Common Mistakes

- Reviewing without reading the full file first (missing context)
- Reporting every minor style issue as a "smell" (noise kills signal)
- Suggesting rewrites when the code is adequate (perfect is the enemy of good)
- Skipping git history (temporal smells are the most actionable)
- Treating all smells as equal severity (prioritize by impact)

## Quick Reference

| Pass | Focus | Key Activities |
|------|-------|----------------|
| 1. Structural | Metrics + Smells | Read code, check complexity, find smells, check git history |
| 2. Architecture | Fitness | Dependency direction, abstraction level, cohesion/coupling |
| 3. Solution | Quality | Simplification, edge cases, performance, evolution |
