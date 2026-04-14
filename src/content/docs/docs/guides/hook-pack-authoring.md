---
title: 'Creating Hook Packs'
description: 'Build custom hook packs that enforce quality gates, automate cleanup, and inject context into your agent workflow.'
---

Hook packs are reusable bundles of quality gates. Each pack installs one or more lifecycle hooks that fire automatically during agent sessions. Block destructive commands, lint files on every edit, clean up stale worktrees, or inject context before the agent acts.

For installing existing packs, see [Customizing Your Agent](/docs/guides/customizing/). For knowledge and skill packs, see [Creating Packs](/docs/guides/pack-authoring/).

## What hook packs do

A hook pack plugs into the agent lifecycle. When specific events happen (a tool is about to run, a session starts, context is about to compact), your pack's scripts fire. They can:

- Block an operation and explain why (safety nets)
- Inject context into the agent's next response (reminders, lint results)
- Run side effects silently (cleanup, logging, metrics)

The agent sees the output. If a script prints nothing and exits 0, the operation proceeds normally. If it prints JSON with `"continue": false`, the operation gets blocked.

## Anatomy of a hook pack

A hook pack is a directory with a `manifest.json` and optional shell scripts:

```
my-pack/
├── manifest.json           # Required — pack metadata + hook definitions
└── scripts/                # Optional — shell scripts referenced by lifecycleHooks
    ├── check-something.sh
    └── cleanup.sh
```

The manifest declares what the pack does. Scripts do the actual work. Some packs don't need scripts at all, they just compose other packs together.

## Two kinds of hooks

### Rule-based hooks (hookify files)

These are the simpler kind. They install as `hookify.<name>.local.md` files into `~/.claude/`. Each file contains rules the agent follows, like "don't use `any` types" or "always use semantic HTML elements."

Rule-based hooks don't run shell commands. They work through the agent's instruction set. Declare them in the `hooks` array:

```json
{
  "name": "a11y",
  "version": "1.0.0",
  "description": "Accessibility enforcement",
  "hooks": ["semantic-html", "focus-ring-required", "ux-touch-targets"]
}
```

The installer looks for `hookify.semantic-html.local.md`, `hookify.focus-ring-required.local.md`, etc. in the pack directory and copies them to `~/.claude/`.

### Script-based hooks (lifecycle hooks)

These run shell scripts or Node.js scripts at specific lifecycle events. The scripts receive JSON payloads on stdin and can respond with JSON on stdout.

Script-based hooks use two manifest fields: `scripts` (what to install) and `lifecycleHooks` (when to run them):

```json
{
  "name": "oxlint",
  "version": "1.0.0",
  "description": "Run oxlint on edited files after every Edit/Write",
  "hooks": [],
  "scripts": [
    {
      "name": "oxlint-on-edit",
      "file": "oxlint-on-edit.sh",
      "targetDir": "hooks"
    }
  ],
  "lifecycleHooks": [
    {
      "event": "PreToolUse",
      "matcher": "Edit|Write",
      "type": "command",
      "command": "sh ~/.claude/hooks/oxlint-on-edit.sh",
      "timeout": 5000,
      "statusMessage": "Linting..."
    }
  ]
}
```

Most packs you build will be script-based.

## manifest.json reference

Here's every field the manifest supports:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Pack identifier (kebab-case) |
| `version` | string | No | Semver version string |
| `description` | string | Yes | What the pack does |
| `hooks` | string[] | Yes | Rule-based hook names (can be empty `[]`) |
| `scripts` | object[] | No | Scripts to install |
| `lifecycleHooks` | object[] | No | Lifecycle hook registrations |
| `composedFrom` | string[] | No | Names of sub-packs this pack bundles |
| `scaffoldDefault` | boolean | No | Include in new agent scaffolds |
| `actionLevel` | string | No | `"remind"`, `"warn"`, or `"block"` |
| `source` | string | No | Set by the registry: `"built-in"` or `"local"` |

### scripts entries

Each entry in the `scripts` array describes a file to copy:

```json
{
  "name": "my-script",        // Identifier for the script
  "file": "my-script.sh",     // Filename in the scripts/ directory
  "targetDir": "hooks"        // Destination subdirectory under ~/.claude/
}
```

The installer copies `scripts/my-script.sh` to `~/.claude/hooks/my-script.sh` and marks it executable.

### lifecycleHooks entries

Each entry in `lifecycleHooks` registers a hook in `~/.claude/settings.json`:

```json
{
  "event": "PreToolUse",              // When to fire
  "matcher": "Bash",                  // Which tools trigger it (empty string = all)
  "type": "command",                  // Always "command"
  "command": "sh ~/.claude/hooks/my-script.sh",  // What to run
  "timeout": 10,                      // Max milliseconds before timeout
  "statusMessage": "Checking..."      // Shown in the status bar while running
}
```

The `timeout` is in milliseconds. Keep it low for hooks that run on every tool use (10ms for simple checks, up to 5000ms for linters that need to spawn processes). SessionStart hooks can take longer since they only run once.

## Lifecycle hook events

These are the events your hooks can listen to:

| Event | When it fires | Matcher applies? | Common use |
|-------|--------------|-------------------|------------|
| `SessionStart` | Agent session begins | No | Cleanup, environment setup, mode activation |
| `PreToolUse` | Before a tool runs | Yes | Safety checks, lint, context injection |
| `PostToolUse` | After a tool completes | Yes | Cleanup, follow-up actions, branch pruning |
| `UserPromptSubmit` | User sends a message | No | Tracking, mode persistence |
| `PreCompact` | Before context compaction | No | State capture, session saves |
| `Notification` | On notification events | No | Tracking, alerting |
| `Stop` | Agent session ends | No | Final cleanup, reporting |

A single pack can register multiple lifecycle hooks across different events. The `worktree-cleanup` pack, for example, uses `SessionStart` to prune stale worktrees and `PostToolUse:Agent` to clean up orphaned branches:

```json
{
  "lifecycleHooks": [
    {
      "event": "SessionStart",
      "matcher": "",
      "type": "command",
      "command": "sh ~/.claude/hooks/clean-worktrees.sh",
      "timeout": 10000,
      "statusMessage": "Cleaning stale worktrees..."
    },
    {
      "event": "PostToolUse",
      "matcher": "Agent",
      "type": "command",
      "command": "sh ~/.claude/hooks/clean-worktree-branches.sh",
      "timeout": 10000,
      "statusMessage": "Cleaning orphaned worktree branches..."
    }
  ]
}
```

## Matchers

The `matcher` field controls which tools trigger a `PreToolUse` or `PostToolUse` hook. Leave it as an empty string for events that don't use tool matching (`SessionStart`, `UserPromptSubmit`, `PreCompact`, `Stop`).

Common matcher values:

| Matcher | What it catches |
|---------|----------------|
| `"Bash"` | Shell command execution |
| `"Edit\|Write"` | File modifications |
| `"Edit"` | Only Edit tool calls |
| `"Write"` | Only Write tool calls |
| `"Agent"` | Subagent invocations |
| `""` | Everything (all tools, or event-level hooks with no tool filter) |

Use the pipe character (`|`) to match multiple tools: `"Edit|Write"` fires on both. The matcher is compared against the tool name in the incoming JSON payload.

## Writing hook scripts

Hook scripts receive a JSON payload on stdin and communicate back through stdout and exit codes.

### Input

For `PreToolUse` and `PostToolUse`, the payload looks like:

```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "old_string": "...",
    "new_string": "..."
  }
}
```

For `Bash` tool calls, `tool_input.command` contains the shell command about to run.

For `SessionStart`, `PreCompact`, and `Stop`, the payload is simpler (session metadata).

### Output

Scripts communicate intent through JSON on stdout:

**Block an operation:**
```json
{ "continue": false, "stopReason": "BLOCKED: reason here" }
```

**Allow but inject context:**
```json
{ "continue": true, "message": "Reminder: check accessibility" }
```

**Silent pass (no output):** just exit 0 with no stdout. The operation proceeds normally.

### Exit codes

- **Exit 0** means the hook ran successfully. The agent reads whatever JSON you printed (if any).
- **Non-zero exit** means the hook errored. The operation still proceeds, but the error may show up in logs. Don't use non-zero exits to block operations; use `"continue": false` in your JSON output instead.

### Script conventions

Stick to POSIX sh for maximum compatibility. Here's a solid template:

```sh
#!/bin/sh
# My Hook — what it does
# Soleri Hook Pack: my-pack
# Dependencies: jq (optional but recommended)
# POSIX sh compatible.

set -eu

INPUT=$(cat)

# Extract data from the payload
if command -v jq >/dev/null 2>&1; then
    FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
else
    FILE=$(printf '%s' "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

# Bail if we couldn't parse
[ -n "${FILE:-}" ] || exit 0

# Your logic here...

# To block:
# jq -n '{ continue: false, stopReason: "BLOCKED: your reason" }'

# To inject context:
# printf 'Some message the agent will see\n'

exit 0
```

A few things to note:
- Always fall back gracefully if `jq` is missing (grep-based parsing works for simple cases)
- Always `exit 0` at the end, even when you don't match
- Skip files that don't apply to your hook (wrong extension, generated paths, node_modules)
- Keep scripts fast. They run on every matching tool call

### Real example: oxlint on edit

Here's the actual oxlint hook script, which runs the linter on every edited file:

```sh
#!/bin/sh
set -eu

INPUT=$(cat)

# Extract the edited file path
if command -v jq >/dev/null 2>&1; then
    FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
else
    FILE=$(printf '%s' "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

[ -n "${FILE:-}" ] || exit 0

# Only lint TypeScript / JavaScript sources
case "$FILE" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
    *) exit 0 ;;
esac

# Skip generated / vendored files
case "$FILE" in
    */node_modules/*|*/dist/*|*/build/*|*/.next/*|*/coverage/*) exit 0 ;;
esac

[ -f "$FILE" ] || exit 0

ROOT=$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null || echo "")
[ -n "$ROOT" ] || exit 0

OUTPUT=$(cd "$ROOT" && npx --no-install oxlint "$FILE" 2>&1 || true)

if printf '%s' "$OUTPUT" | grep -qE 'Found [1-9][0-9]* (warning|error)'; then
    printf 'oxlint findings in %s:\n%s\n' "$FILE" "$OUTPUT"
fi

exit 0
```

When the linter finds issues, it prints them. The agent sees the output and can fix the problems. When the file is clean, the script stays silent.

## scaffoldDefault

Set `"scaffoldDefault": true` if your pack should be included automatically when someone scaffolds a new agent with `soleri create`. Use this for packs that provide universally useful behavior (like worktree cleanup).

Most packs should leave this out or set it to `false`. Users can always install your pack with `soleri hooks add-pack <name>`.

```json
{
  "name": "worktree-cleanup",
  "version": "1.0.0",
  "description": "Auto-cleans stale worktrees on session start",
  "scaffoldDefault": true,
  ...
}
```

## composedFrom

A composed pack bundles other packs together. Instead of defining its own hooks or scripts, it lists sub-packs by name. When the composed pack is installed, all sub-packs get installed. When it's removed, all sub-packs get removed.

The built-in `full` pack is a composed pack:

```json
{
  "name": "full",
  "version": "1.0.0",
  "description": "Complete quality suite — all hooks",
  "hooks": [
    "no-any-types",
    "no-console-log",
    "no-important",
    "no-inline-styles",
    "semantic-html",
    "focus-ring-required",
    "ux-touch-targets",
    "no-ai-attribution"
  ],
  "composedFrom": [
    "typescript-safety",
    "a11y",
    "css-discipline",
    "clean-commits",
    "safety",
    "yolo-safety"
  ]
}
```

The `hooks` array lists all the hookify files that come from the sub-packs combined. The `composedFrom` array lists the sub-packs. The installer resolves everything recursively, so a composed pack can contain other composed packs.

Use composed packs when you want to offer a "batteries included" option that bundles several focused packs.

## Graduated enforcement

Hook packs that use the converter system support action levels that you can promote or demote over time:

| Level | Behavior | When to use |
|-------|----------|-------------|
| `remind` | Injects context, does not block | Getting the team used to a new rule |
| `warn` | Injects a warning, does not block | Team is aware, building habit |
| `block` | Stops the operation entirely | Hard enforcement |

Set the initial level with `actionLevel` in the manifest, then promote or demote:

```bash
npx @soleri/cli hooks promote my-pack    # remind → warn → block
npx @soleri/cli hooks demote my-pack     # block → warn → remind
```

## Testing your pack

Run validation tests against your hook pack:

```bash
npx @soleri/cli hooks test <pack-name>
```

The test runner generates 15 fixtures (5 matching, 10 non-matching) based on your pack's event and matcher, pipes them through your script, and checks for false positives and false negatives.

```
Testing my-pack (15 fixtures)
Results: 15/15 passed
All fixtures passed — zero false positives
```

If you get false positives (script fires when it shouldn't) or false negatives (script stays silent when it should fire), refine your matching logic.

## Where packs live

Hook packs are discovered from two locations:

| Location | Source label | Priority |
|----------|-------------|----------|
| `.soleri/hook-packs/<name>/` (project) | `local` | Higher |
| Built-in packs (shipped with the CLI) | `built-in` | Lower |

Local packs override built-in ones with the same name. This lets you customize a built-in pack for your project without forking the CLI.

## Example: build a custom pack from scratch

Let's build a pack that blocks `console.log` statements from being written to production files.

### 1. Create the directory structure

```
no-console-prod/
├── manifest.json
└── scripts/
    └── no-console-prod.sh
```

### 2. Write the manifest

```json
{
  "name": "no-console-prod",
  "version": "1.0.0",
  "description": "Block console.log in production source files",
  "hooks": [],
  "scripts": [
    {
      "name": "no-console-prod",
      "file": "no-console-prod.sh",
      "targetDir": "hooks"
    }
  ],
  "lifecycleHooks": [
    {
      "event": "PreToolUse",
      "matcher": "Edit|Write",
      "type": "command",
      "command": "sh ~/.claude/hooks/no-console-prod.sh",
      "timeout": 10,
      "statusMessage": "Checking for console.log..."
    }
  ],
  "scaffoldDefault": false
}
```

### 3. Write the script

```sh
#!/bin/sh
# no-console-prod — blocks Edit/Write that introduce console.log in src/
# Soleri Hook Pack: no-console-prod
# Dependencies: jq (optional)
# POSIX sh compatible.

set -eu

INPUT=$(cat)

# Extract the new content being written
if command -v jq >/dev/null 2>&1; then
    FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
    NEW_STRING=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty' 2>/dev/null || true)
else
    FILE=$(printf '%s' "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4)
    NEW_STRING=""
fi

[ -n "${FILE:-}" ] || exit 0

# Only check source files
case "$FILE" in
    */src/*.ts|*/src/*.tsx|*/src/*.js|*/src/*.jsx) ;;
    *) exit 0 ;;
esac

# Skip test files
case "$FILE" in
    *.test.*|*.spec.*|*__tests__*) exit 0 ;;
esac

# Check if the new content contains console.log
if [ -n "$NEW_STRING" ]; then
    if printf '%s' "$NEW_STRING" | grep -q 'console\.log'; then
        jq -n '{
          continue: false,
          stopReason: "BLOCKED: console.log detected in production source file. Use a proper logger instead, or remove the debug statement."
        }'
        exit 0
    fi
fi

exit 0
```

### 4. Place the pack

For a local project pack, put the directory at:

```
.soleri/hook-packs/no-console-prod/
```

### 5. Install and test

```bash
npx @soleri/cli hooks add-pack no-console-prod
npx @soleri/cli hooks test no-console-prod
```

### 6. Use the convert shortcut

If your pack follows the standard pattern (one script, one event, one action), the CLI can generate the scaffold for you:

```bash
npx @soleri/cli hooks convert no-console-prod \
  --event PreToolUse \
  --matcher "Edit|Write" \
  --action block \
  --message "console.log detected in production source file" \
  --project
```

This generates both the manifest and a starter script in `.soleri/hook-packs/no-console-prod/`.

---

_Next: [Creating Packs](/docs/guides/pack-authoring/) for knowledge and skill packs, [Customizing Your Agent](/docs/guides/customizing/) for installing hooks, and [CLI Reference](/docs/cli-reference/) for all `soleri hooks` subcommands._
