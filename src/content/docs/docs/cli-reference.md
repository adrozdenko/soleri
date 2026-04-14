---
title: CLI Reference
description: Every Soleri CLI command with usage, options, and examples.
---

The Soleri CLI (`@soleri/cli`) is how you create, develop, and maintain agents.

## Install

The CLI is available via npx (no install needed) or as a dev dependency:

```bash
npx @soleri/cli <command>
```

## Commands

### create

Scaffold a new agent project.

```bash
npx @soleri/cli create [name]
```

**Options:**

| Flag                       | Description                                                   |
| -------------------------- | ------------------------------------------------------------- |
| `[name]`                   | Agent name (prompted if omitted)                              |
| `-c, --config <path>`      | Path to JSON config file (skip interactive prompts)           |
| `--setup-target <target>`  | Editor target: `claude`, `opencode`, `codex`, `both`, `all`  |
| `-y, --yes`                | Skip confirmation prompts (use with `--config` for fully non-interactive) |
| `--dir <path>`             | Parent directory for the agent (default: current directory)   |
| `--filetree`               | Create a file-tree agent (v7, no TypeScript, no build step, default)  |
| `--legacy`                 | Create a legacy TypeScript agent (v6, requires npm install + build)   |
| `--no-git`                 | Skip git repository initialization                            |

If you skip the flags, the interactive wizard walks you through agent name, role, domains, persona voice, hook packs, and git remote setup.

**Example:**

```bash
npx @soleri/cli create sentinel
# or use the npm create shorthand:
npm create soleri sentinel

# Non-interactive with config file:
npx @soleri/cli create --config agent.json -y

# Quick defaults (Italian Craftsperson persona):
npx @soleri/cli create my-agent -y

# File-tree agent for OpenCode:
npx @soleri/cli create my-agent --setup-target opencode
```

---

### list

Show agents in a directory.

```bash
npx @soleri/cli list [dir]
```

Scans for agent projects and shows their ID, domains, and build status.

---

### dev

Run the agent locally in dev mode with auto-rebuild.

```bash
npx @soleri/cli dev
```

Starts the MCP server via stdio transport, watches for file changes, and restarts when you save.

---

### test

Run agent test suite.

```bash
npx @soleri/cli test [options]
```

**Options:**

| Flag         | Description                  |
| ------------ | ---------------------------- |
| `--watch`    | Re-run tests on file changes |
| `--coverage` | Generate coverage report     |

Uses vitest under the hood. For monorepo-level E2E tests, run `npm run test:e2e` from the project root. See [Testing](/docs/guides/testing/) for more.

---

### add-domain

Add a knowledge domain to your agent.

```bash
npx @soleri/cli add-domain <domain>
```

Creates a domain facade with 5 ops (`get_patterns`, `search`, `get_entry`, `capture`, `remove`) and regenerates the facade registry.

**Example:**

```bash
npx @soleri/cli add-domain security
npx @soleri/cli add-domain infrastructure
```

---

### install-knowledge

Import a knowledge bundle into the agent's vault.

```bash
npx @soleri/cli install-knowledge <pack>
```

Takes a local path, directory, or npm package name. npm packages resolve as `@soleri/knowledge-{name}`.

**Options:**

| Flag            | Description                              |
| --------------- | ---------------------------------------- |
| `--no-facades`  | Skip facade generation for new domains   |

**Example:**

```bash
npx @soleri/cli install-knowledge ./bundles/react-patterns
npx @soleri/cli install-knowledge react-hooks
```

---

### doctor

System health check.

```bash
npx @soleri/cli doctor
```

Checks Node.js version, npm status, agent context, vault health, and CLAUDE.md status. Gives you fix recommendations if anything looks off.

---

### install

Register your agent as an MCP server in your AI editor.

```bash
npx @soleri/cli install [dir]
```

**Arguments:**

| Argument | Description                                                        |
| -------- | ------------------------------------------------------------------ |
| `[dir]`  | Agent directory or agent name (checks `~/.soleri/<name>` first, then cwd) |

**Options:**

| Flag                | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `--target <target>` | Registration target: `claude`, `opencode`, `codex`, `both`, `all` (default: `claude`) |
| `--verify`          | Verify the install chain (config, engine, agent.yaml)           |

Also creates a global launcher script so you can invoke the agent by name from any directory.

**Example:**

```bash
npx @soleri/cli install
npx @soleri/cli install ernesto --target all
npx @soleri/cli install ./my-agent --target opencode
```

---

### uninstall

Remove the agent's MCP server registration, or nuke everything with `--full`.

```bash
npx @soleri/cli uninstall [dir]
```

**Arguments:**

| Argument | Description                          |
| -------- | ------------------------------------ |
| `[dir]`  | Agent directory (defaults to cwd)    |

**Options:**

| Flag                | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `--target <target>` | Registration target: `claude`, `opencode`, `codex`, `both`, `all` (default: `all`) |
| `--full`            | Remove all agent artifacts (project, data, configs, permissions, launcher) |
| `--dry-run`         | Show what would be removed without making changes                     |
| `--force`           | Skip confirmation prompt                                              |

**Example:**

```bash
npx @soleri/cli uninstall
npx @soleri/cli uninstall --target claude
npx @soleri/cli uninstall --full --dry-run
npx @soleri/cli uninstall ./my-agent --full --force
```

---

### agent

Agent lifecycle management.

```bash
npx @soleri/cli agent <subcommand>
```

**Subcommands:**

| Subcommand     | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `status`       | Show agent health: version, packs, vault, and update availability        |
| `update`       | Update agent engine to latest compatible version                         |
| `refresh`      | Regenerate CLAUDE.md, _engine.md, and sync skills from latest templates  |
| `diff`         | Show drift between agent templates and latest engine templates           |
| `capabilities` | List all capabilities declared by installed packs                        |
| `validate`     | Validate flow capability requirements against installed packs            |
| `migrate`      | Move agent data from `~/.{agentId}/` to `~/.soleri/{agentId}/`          |

**`agent status` options:**

| Flag     | Description      |
| -------- | ---------------- |
| `--json` | Output as JSON   |

**`agent update` options:**

| Flag        | Description                                 |
| ----------- | ------------------------------------------- |
| `--check`   | Show what would change without updating     |
| `--dry-run` | Preview migration steps                     |

**`agent refresh` options:**

| Flag             | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `--dry-run`      | Preview what would change without writing             |
| `--skip-skills`  | Skip skill sync (only regenerate activation files)   |

**`agent migrate` usage:**

```bash
npx @soleri/cli agent migrate <agentId>
```

| Flag        | Description                                        |
| ----------- | -------------------------------------------------- |
| `--dry-run` | Preview what would be moved without executing       |

---

### pack

One command to manage hooks, skills, knowledge, and domain packs. See [Creating Packs](/docs/guides/pack-authoring/) for how to build your own and [Domain Packs](/docs/guides/domain-packs/) for community packs.

```bash
npx @soleri/cli pack <subcommand> [options]
```

**Subcommands:**

| Subcommand  | Description                                       |
| ----------- | ------------------------------------------------- |
| `list`      | List installed packs                              |
| `install`   | Install a pack from local path or npm              |
| `remove`    | Remove an installed pack                          |
| `info`      | Show detailed info about an installed pack        |
| `outdated`  | Check for packs with available updates on npm     |
| `update`    | Update installed packs to latest compatible version |
| `search`    | Search for packs on the npm registry              |
| `available` | List available knowledge packs                    |
| `registry`  | List packs from the Soleri pack registry          |
| `add`       | Install a pack from the registry by name          |
| `create`    | Scaffold a new pack project (interactive wizard)  |
| `validate`  | Validate a pack before publishing                 |
| `publish`   | Publish pack to npm registry                      |

**`pack list` options:**

| Flag             | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| `--type <type>`  | Filter by pack type: `hooks`, `skills`, `knowledge`, `domain`, `bundle` |
| `--tier <tier>`  | Filter by tier: `default`, `community`, `premium`              |

**`pack install` options:**

| Flag                | Description                                    |
| ------------------- | ---------------------------------------------- |
| `--type <type>`     | Expected pack type                             |
| `--version <ver>`   | Specific version to install                    |
| `--frozen`          | Fail if pack is not in lockfile (CI mode)      |

**`pack update` options:**

| Flag       | Description                                     |
| ---------- | ----------------------------------------------- |
| `--check`  | Show outdated packs without updating (dry run)  |
| `--force`  | Force update even if version is incompatible    |

**`pack publish` options:**

| Flag        | Description                                       |
| ----------- | ------------------------------------------------- |
| `--dry-run` | Show what would be published without publishing   |

**Example:**

```bash
npx @soleri/cli pack list
npx @soleri/cli pack install react-patterns --version 2.0.0
npx @soleri/cli pack info react-patterns
npx @soleri/cli pack outdated
npx @soleri/cli pack update
npx @soleri/cli pack search react
npx @soleri/cli pack create
npx @soleri/cli pack validate ./my-pack
npx @soleri/cli pack publish ./my-pack --dry-run
npx @soleri/cli pack remove react-patterns
```

---

### skills

Convenience wrapper for `pack --type skills`. See [Skills Catalog](/docs/guides/skills-catalog/) for what's available.

```bash
npx @soleri/cli skills <subcommand>
```

**Subcommands:**

| Subcommand  | Description                      |
| ----------- | -------------------------------- |
| `list`      | List installed skill packs       |
| `install`   | Install a skill pack             |
| `remove`    | Remove a skill pack              |
| `info`      | Show info about a skill pack     |

**`skills list` options:**

| Flag      | Description                                                |
| --------- | ---------------------------------------------------------- |
| `--trust` | Show trust level, source, and compatibility for each pack  |

**`skills install` options:**

| Flag               | Description                     |
| ------------------ | ------------------------------- |
| `--version <ver>`  | Specific version to install     |

**Example:**

```bash
npx @soleri/cli skills list --trust
npx @soleri/cli skills install my-skills --version 1.0.0
npx @soleri/cli skills info my-skills
npx @soleri/cli skills remove my-skills
```

---

### hooks

Manage editor hooks, hook packs, and convert skills into hooks.

```bash
# Editor hooks
npx @soleri/cli hooks add <editor>
npx @soleri/cli hooks remove <editor>
npx @soleri/cli hooks list

# Hook packs
npx @soleri/cli hooks add-pack <pack>
npx @soleri/cli hooks remove-pack <pack>
npx @soleri/cli hooks upgrade-pack <pack>
npx @soleri/cli hooks list-packs

# Skill-to-hook conversion
npx @soleri/cli hooks convert <name> --event <event> --message <text> [options]
npx @soleri/cli hooks test <pack>
npx @soleri/cli hooks promote <pack>
npx @soleri/cli hooks demote <pack>
```

**Editors:** `claude-code`, `cursor`, `vscode`, `neovim`

**Hook Packs:**

| Pack                 | Description                                                          |
| -------------------- | -------------------------------------------------------------------- |
| `safety`             | Anti-deletion staging: backs up files before rm, blocks force push/reset |
| `flock-guard`        | Parallel agent lock, prevents lockfile corruption in worktrees       |
| `clean-commits`      | No AI attribution in git commits                                     |
| `typescript-safety`  | Block `any` types and console.log                                    |
| `css-discipline`     | No `!important`, no inline styles                                    |
| `a11y`               | Accessibility: semantic HTML, focus rings, touch targets             |
| `rtk`                | RTK token compression: rewrites shell commands through [RTK](https://github.com/rtk-ai/rtk) to cut LLM token usage by 60-90% |
| `yolo-safety`        | Safety guardrails for YOLO mode, composes from `safety`              |
| `oxlint`             | Runs oxlint on edited TS/JS files after every Edit/Write             |
| `terse-auto`         | Auto-activates terse mode on session start for token-efficient output |
| `worktree-cleanup`   | Cleans stale worktree dirs on session start, orphaned branches after subagent completion |
| `marketing-research` | Example: auto-research for marketing files                           |
| `full`               | All quality + safety hooks combined                                  |

**Convert Options:**

| Flag               | Description                                                         | Required |
| ------------------ | ------------------------------------------------------------------- | -------- |
| `--event <event>`  | Hook event: PreToolUse, PostToolUse, PreCompact, Notification, Stop | Yes      |
| `--message <text>` | Context message when hook fires                                     | Yes      |
| `--matcher <tools>`| Tool name matcher (e.g., "Write\|Edit")                             | No       |
| `--pattern <globs...>` | File glob patterns to match                                     | No       |
| `--action <level>` | Action level: remind (default), warn, block                         | No       |
| `--project`        | Output to project dir instead of built-in                           | No       |

Hooks start at `remind` and graduate to `warn`, then `block` once you've confirmed zero false positives.

---

### governance

View or set vault governance policies.

```bash
npx @soleri/cli governance [options]
```

**Options:**

| Flag              | Description                                        |
| ----------------- | -------------------------------------------------- |
| `--preset <name>` | Apply a preset: `strict`, `moderate`, `permissive` |
| `--show`          | Display current governance settings                |

Shows quotas (max entries total, per category, per type), retention settings, auto-capture policy, and current quota usage.

---

### yolo

Launch Claude Code in YOLO mode with safety guardrails. See [YOLO Mode](/docs/guides/yolo-mode/) for the full guide.

```bash
npx @soleri/cli yolo [options]
```

Installs the `yolo-safety` hook pack if needed, then launches Claude Code with `--dangerously-skip-permissions`. The safety hooks intercept destructive commands like `rm`, `git push --force`, `git reset --hard`, `drop table`, and `docker rm`.

**Options:**

| Flag        | Description                                                |
| ----------- | ---------------------------------------------------------- |
| `--dry-run` | Show what would happen without launching Claude            |
| `--project` | Install safety hooks to project `.claude/` instead of global `~/.claude/` |

**Example:**

```bash
npx @soleri/cli yolo
npx @soleri/cli yolo --dry-run
npx @soleri/cli yolo --project
```

---

### telegram

Manage Telegram transport for the current agent. See [Telegram Integration](/docs/guides/telegram/) for full guide.

```bash
npx @soleri/cli telegram <subcommand>
```

**Subcommands:**

| Subcommand | Description                                      |
| ---------- | ------------------------------------------------ |
| `enable`   | Add Telegram transport files to the current agent |
| `disable`  | Remove Telegram transport from the current agent  |
| `setup`    | Interactive configuration wizard (bot token, API key, model) |
| `status`   | Check Telegram configuration status               |

Typical workflow:

1. `soleri telegram enable` generates source files, adds the grammy dependency, and wires up npm scripts
2. `soleri telegram setup` walks you through bot token, LLM provider/key, passphrase, and model
3. `npm run telegram:start` or `npm run telegram:dev` to run the bot

**Example:**

```bash
npx @soleri/cli telegram enable
npx @soleri/cli telegram setup
npx @soleri/cli telegram status
npx @soleri/cli telegram disable
```

---

### vault

Vault management from the command line.

```bash
npx @soleri/cli vault <subcommand>
```

**Subcommands:**

| Subcommand | Description                                 |
| ---------- | ------------------------------------------- |
| `export`   | Export vault entries as browsable markdown files |

**`vault export` options:**

| Flag              | Description                                  |
| ----------------- | -------------------------------------------- |
| `--path <dir>`    | Output directory (default: `./knowledge/`)   |
| `--domain <name>` | Filter by domain                             |

**Example:**

```bash
npx @soleri/cli vault export
npx @soleri/cli vault export --path ~/obsidian
npx @soleri/cli vault export --domain architecture
```

---

### staging

Manage the anti-deletion staging folder where the `safety` hook pack backs up files before destructive operations.

```bash
npx @soleri/cli staging <subcommand>
```

**Subcommands:**

| Subcommand | Description                                           |
| ---------- | ----------------------------------------------------- |
| `list`     | Show staged files with timestamps                     |
| `restore`  | Restore files from a staging snapshot to their original locations |
| `clean`    | Remove staging backups older than 7 days (or `--all`) |
| `cleanup`  | Check for and remove stale staging backups            |

**`staging restore` usage:**

```bash
npx @soleri/cli staging restore <id>
```

**`staging clean` options:**

| Flag                      | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `--older-than <duration>` | Only remove snapshots older than duration (default: `7d`) |
| `--all`                   | Remove all snapshots regardless of age              |
| `--dry-run`               | Show what would be removed without deleting         |

**`staging cleanup` options:**

| Flag                      | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `--older-than <duration>` | Max age for stale entries (default: `7d`)        |
| `--yes`                   | Skip confirmation prompt                         |

Duration format: `7d` (days), `24h` (hours), `30m` (minutes).

**Example:**

```bash
npx @soleri/cli staging list
npx @soleri/cli staging restore 1711900000000
npx @soleri/cli staging clean --older-than 3d
npx @soleri/cli staging clean --all --dry-run
npx @soleri/cli staging cleanup --yes
```

---

### extend

:::caution[File-tree agents only need files]
The `extend` subcommands (`init`, `add-op`, `add-facade`, `add-middleware`) were for the legacy TypeScript agent format and are **no longer supported**.

File-tree agents extend through plain files: `.md` files in `instructions/`, folders in `workflows/`, JSON bundles in `knowledge/`, `SKILL.md` files in `skills/`, or `npx @soleri/cli add-domain <name>` for new domains.

See [Extending Your Agent](/docs/extending/) for details.
:::

---

### upgrade

Check for and perform CLI upgrades.

```bash
npx @soleri/cli upgrade [options]
```

**Options:**

| Flag      | Description                          |
| --------- | ------------------------------------ |
| `--check` | Check for updates without installing |

---

### brain

Clean up orphaned brain sessions that were started but never completed.

```bash
npx @soleri/cli brain <subcommand>
```

**Subcommands:**

| Subcommand      | Description                                          |
| --------------- | ---------------------------------------------------- |
| `close-orphans` | Close orphaned brain sessions that were never completed |

**`brain close-orphans` options:**

| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `--max-age <duration>`| Close sessions older than this age (default: `1h`). Format: `1h`, `30m`, `90s` |

**Example:**

```bash
npx @soleri/cli brain close-orphans
npx @soleri/cli brain close-orphans --max-age 2h
```

---

### dream

Vault memory consolidation: deduplication, stale entry archival, and contradiction detection.

```bash
npx @soleri/cli dream [subcommand]
```

Running `soleri dream` with no subcommand triggers an immediate pass.

**Subcommands:**

| Subcommand   | Description                                  |
| ------------ | -------------------------------------------- |
| `run`        | Run a dream pass immediately (default)       |
| `schedule`   | Schedule a daily dream cron job              |
| `unschedule` | Remove the dream cron entry                  |
| `status`     | Show dream status and cron info              |

**`dream schedule` options:**

| Flag              | Description                                    |
| ----------------- | ---------------------------------------------- |
| `--time <HH:MM>`  | Time to run in 24h format (default: `22:00`)   |

**Example:**

```bash
npx @soleri/cli dream
npx @soleri/cli dream schedule --time 03:00
npx @soleri/cli dream unschedule
npx @soleri/cli dream status
```

---

### chat

Start an interactive terminal chat with your agent. Spawns the MCP server, connects via stdio, and runs a REPL using the Claude API.

```bash
npx @soleri/cli chat [options]
```

Requires `ANTHROPIC_API_KEY` environment variable or a key stored in `~/.soleri/<agentId>/keys.json`.

**Options:**

| Flag              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `--model <model>` | Claude model to use (default: `claude-sonnet-4-20250514`) |
| `--no-tools`      | Disable MCP tools (plain conversation)               |

**Example:**

```bash
npx @soleri/cli chat
npx @soleri/cli chat --model claude-sonnet-4-20250514
npx @soleri/cli chat --no-tools
```

---

### schedule

Manage scheduled agent tasks. Each task runs on a cron schedule and executes a prompt via `claude -p` when it fires.

```bash
npx @soleri/cli schedule <subcommand>
```

**Subcommands:**

| Subcommand | Description                                 |
| ---------- | ------------------------------------------- |
| `create`   | Create a new scheduled task                 |
| `list`     | List all scheduled tasks                    |
| `delete`   | Delete a scheduled task                     |
| `pause`    | Pause a scheduled task without deleting it  |
| `resume`   | Resume a paused scheduled task              |

**`schedule create` options:**

| Flag                    | Description                                                     | Required |
| ----------------------- | --------------------------------------------------------------- | -------- |
| `--name <name>`         | Task name (unique per agent)                                    | Yes      |
| `--cron <expr>`         | Cron expression (5-field, minimum 1-hour interval)              | Yes      |
| `--prompt <text>`       | Prompt passed to `claude -p` when task fires                    | Yes      |
| `--project-dir <path>`  | Agent project directory (default: current directory)            | No       |

**`schedule delete` / `pause` / `resume` options:**

| Flag         | Description      | Required |
| ------------ | ---------------- | -------- |
| `--id <id>`  | Task ID          | Yes      |

**Example:**

```bash
npx @soleri/cli schedule create --name nightly-dream --cron "0 2 * * *" --prompt "run dream"
npx @soleri/cli schedule list
npx @soleri/cli schedule pause --id abc123
npx @soleri/cli schedule resume --id abc123
npx @soleri/cli schedule delete --id abc123
```

---

### knowledge

Export vault entries as portable knowledge bundle JSON.

```bash
npx @soleri/cli knowledge <subcommand>
```

**Subcommands:**

| Subcommand | Description                                               |
| ---------- | --------------------------------------------------------- |
| `export`   | Export vault entries to knowledge bundle JSON files        |

**`knowledge export` options:**

| Flag                  | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `--domain <name>`     | Export a specific domain                                   |
| `--all`               | Export all domains                                         |
| `--min-score <number>`| Minimum quality score threshold, 0-1 (default: `0`)       |
| `--output <dir>`      | Output directory (default: `./knowledge/`)                 |

Either `--domain` or `--all` is required.

**Example:**

```bash
npx @soleri/cli knowledge export --domain architecture
npx @soleri/cli knowledge export --all
npx @soleri/cli knowledge export --all --min-score 0.5 --output ~/bundles
```

---

### validate-skills

Validate `SKILL.md` op-call examples against the engine's Zod schemas. Scans skill files, extracts inline op-call examples, and checks params against facade schemas. Exits with code 1 on mismatches.

```bash
npx @soleri/cli validate-skills [options]
```

**Options:**

| Flag                    | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `--skills-dir <path>`   | Path to skills directory (default: `~/.claude/skills`) |

**Example:**

```bash
npx @soleri/cli validate-skills
npx @soleri/cli validate-skills --skills-dir ./my-skills
```

---

### add-pack

:::caution[Deprecated]
The `add-pack` command is deprecated. Use these commands instead:

- `soleri pack install <pack>` for knowledge and domain packs
- `soleri hooks add-pack <pack>` for hook packs
:::

---

### update

Update the Soleri CLI to the latest version from npm.

```bash
npx @soleri/cli update
```

Compares your installed version against the latest on npm and runs `npm install -g @soleri/cli@latest` if an update is available.

---

See also: [Customizing Your Agent](/docs/guides/customizing/), [API Reference](/docs/api-reference/), [Capabilities](/docs/capabilities/), [Troubleshooting](/docs/troubleshooting/).
