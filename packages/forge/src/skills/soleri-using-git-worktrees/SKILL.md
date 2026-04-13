---
name: soleri-using-git-worktrees
tier: default
description: 'Triggers: "worktree", "parallel branch", "safe branch", "isolated branch". Protocol for creating, working in, and cleaning up git worktrees.'
---

# Using Git Worktrees

Isolate work into parallel branches without stashing or switching. Use for multi-task plans, risky changes, or parallel execution. Claude Code natively supports `isolation: "worktree"` on sub-agents.

**Announce at start:** "I'm using the using-git-worktrees skill to isolate this work."

## Check Vault for Worktree Patterns

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "worktree parallel execution patterns" }
```

## When to Use

- Plan has 2+ independent tasks that can run in parallel
- Risky or experimental change that should not touch the main working tree
- Long-running task where you need the main branch clean for hotfixes

## Creation Protocol

```bash
# 1. Pre-flight — working tree must be clean
git status
git log origin/main..main              # check for unpushed commits

# 2. Create worktree
git worktree add ../<repo>-<task> -b <branch-name>
cd ../<repo>-<task>

# 3. Bootstrap and baseline
npm install                            # shared .git does NOT share node_modules
npm test                               # must pass before any changes
```

If the working tree is dirty, commit or stash first. If baseline tests fail, stop and investigate.

## Working in a Worktree

- Full working copy — edit, test, commit normally
- Commits are visible across worktrees (shared `.git`)
- `git worktree list` to see all active worktrees

## Cleanup Protocol

```bash
# 1. Safety check — never delete with unpushed/uncommitted work
git log origin/<branch>..<branch>      # unpushed commits?
git diff --stat                        # uncommitted changes?

# 2. Merge or discard
git merge <branch-name>                # from main worktree
# OR: git branch -D <branch-name>     # only if work is abandoned

# 3. Remove and verify
git worktree remove ../<repo>-<task>
git worktree prune
git worktree list                      # confirm removal
```

## Anti-Patterns

- Creating worktrees for single-file changes or one-liner fixes
- Leaving orphan worktrees after tasks complete — always clean up
- Deleting the worktree directory manually instead of `git worktree remove`
- Forgetting `npm install` in new worktree
- Skipping baseline tests before starting work

## Quick Reference

| Action         | Command                                          |
| -------------- | ------------------------------------------------ |
| Create         | `git worktree add ../<name> -b <branch>`         |
| List           | `git worktree list`                              |
| Remove         | `git worktree remove ../<name>`                  |
| Prune          | `git worktree prune`                             |
| Check unpushed | `git log origin/<branch>..<branch>`              |
| Claude Code    | Sub-agent with `isolation: "worktree"` parameter |

**Related skills:** executing-plans, parallel-execute

## Capture Worktree Learnings

```
YOUR_AGENT_core op:capture_quick
  params: { title: "<what was learned>", tags: ["worktree", "parallel-execution"] }
```

## Agent Tools Reference

| Op                   | When to Use                       |
| -------------------- | --------------------------------- |
| `search_intelligent` | Check vault before starting       |
| `capture_quick`      | Fast capture for simple learnings |
