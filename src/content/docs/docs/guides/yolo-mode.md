---
title: 'YOLO Mode'
description: 'Skip approval gates while keeping safety guardrails — for rapid prototyping and solo work.'
---

YOLO mode lets your agent execute commands without asking for permission at each step. It skips Claude Code's built-in approval prompts while installing safety hooks that intercept genuinely destructive operations.

## What YOLO mode does

When you launch YOLO mode, two things happen:

1. **Approval gates are skipped** — Claude Code runs with `--dangerously-skip-permissions`, so the agent executes shell commands, file writes, and tool calls without pausing for confirmation.
2. **Safety hooks are installed** — The `yolo-safety` hook pack intercepts destructive commands before they execute.

The result: fast, autonomous execution with a safety net.

## Launching YOLO mode

```bash
npx @soleri/cli yolo
```

This installs the `yolo-safety` hook pack (if not already installed) and launches Claude Code with permissions skipped.

### Options

| Flag        | Effect                                                    |
| ----------- | --------------------------------------------------------- |
| `--dry-run` | Show what would happen without launching Claude           |
| `--project` | Install safety hooks to project `.claude/` instead of `~/.claude/` |

### Dry run

```bash
npx @soleri/cli yolo --dry-run
```

This verifies the safety pack is available, installs hooks if needed, and prints the command that would run — without actually launching Claude.

## Safety guardrails

The `yolo-safety` hook pack composes the `safety` pack (see [Customizing Your Agent](/docs/guides/customizing/) for how hooks work), which installs an anti-deletion hook that runs as a `PreToolUse` lifecycle hook on every Bash command. It intercepts:

| Blocked command         | Why                                            |
| ----------------------- | ---------------------------------------------- |
| `rm -rf`                | Prevents accidental file/directory deletion     |
| `git push --force`      | Prevents force-pushing over remote history      |
| `git reset --hard`      | Prevents discarding uncommitted work            |
| `git clean -f`          | Prevents removing untracked files               |
| `DROP TABLE` / `DROP DATABASE` | Prevents database destruction            |
| `docker rm`             | Prevents container removal                      |

When a destructive command is detected, the hook blocks execution and warns the agent. Files are staged before deletion when possible.

## When to use YOLO mode

**Good fit:**

- Rapid prototyping where you're iterating fast
- Solo work on a personal branch
- Batch operations like migrations or refactors where you trust the agent's judgment
- Environments with version control as a safety net (you can always `git checkout`)

**Not recommended:**

- Production environments
- Shared branches where mistakes affect others
- Tasks involving secrets, credentials, or infrastructure
- When you want to review each step before it happens

## How it interacts with agent planning

YOLO mode only affects Claude Code's permission system — it does not change the agent's [planning behavior](/docs/guides/planning/). The agent still creates plans, searches the vault, and captures knowledge. The difference is that shell commands and file operations execute without the "allow/deny" prompt.

If you also want the agent to skip plan approval gates (the two-gate `approve_plan` / `plan_split` cycle), use the YOLO mode skill in conversation:

> **You:** "Go YOLO on this task"
>
> **Agent:** _YOLO mode activated. Skipping approval gates, safety invariants preserved._

The skill activates autonomous execution at the agent level, while `soleri yolo` activates it at the Claude Code level. They complement each other.

---

_Next: [Validation Loops](/docs/guides/loops/) — let the agent iterate toward quality targets automatically. See also [Customizing Your Agent](/docs/guides/customizing/) for hooks and governance, and the [CLI Reference](/docs/cli-reference/) for the full `soleri yolo` command details._
