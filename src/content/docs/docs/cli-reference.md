---
title: CLI Reference
description: Every Soleri CLI command with usage, options, and examples.
---

The Soleri CLI (`@soleri/cli`) manages agent creation, development, and maintenance.

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
| `--filetree`               | Create a file-tree agent (v7 — no TypeScript, no build step, default) |
| `--legacy`                 | Create a legacy TypeScript agent (v6 — requires npm install + build)  |
| `--no-git`                 | Skip git repository initialization                            |

**Interactive wizard prompts for:** agent name, role, domains, persona voice, hook packs, git remote setup.

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

Scans for agent projects and displays ID, domains, and build status.

---

### dev

Run agent locally in development mode with auto-rebuild.

```bash
npx @soleri/cli dev
```

Starts the MCP server via stdio transport. Watches for file changes and restarts automatically.

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

Runs vitest under the hood. For the monorepo-level E2E test suite, use `npm run test:e2e` from the project root. See [Testing](/docs/guides/testing/) for full details.

---

### add-domain

Add a knowledge domain to your agent.

```bash
npx @soleri/cli add-domain <domain>
```

Creates a new domain facade with 5 ops (get_patterns, search, get_entry, capture, remove) and regenerates the agent's facade registry.

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

Accepts a local path, directory, or npm package name. Resolves npm packages as `@soleri/knowledge-{name}`.

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

Reports:

- Node.js version compatibility
- npm status
- Agent context (detected project)
- Vault health
- CLAUDE.md status
- Recommendations for fixes

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

Also creates a global launcher script so the agent can be invoked by name from any directory.

**Example:**

```bash
npx @soleri/cli install
npx @soleri/cli install ernesto --target all
npx @soleri/cli install ./my-agent --target opencode
```

---

### uninstall

Remove your agent's MCP server registration.

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
| `--target <target>` | Registration target: `claude`, `opencode`, `codex`, `both`, `all` (default: `opencode`) |

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

Unified pack manager for hooks, skills, knowledge, and domains. See [Creating Packs](/docs/guides/pack-authoring/) for authoring guide and [Domain Packs](/docs/guides/domain-packs/) for available community packs.

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

Manage skill packs (convenience wrapper for `pack --type skills`). See [Skills Catalog](/docs/guides/skills-catalog/) for all available skills.

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

Manage editor hooks, hook packs, and skill-to-hook conversion.

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
| `safety`             | Anti-deletion staging — backs up files before rm, blocks force push/reset |
| `flock-guard`        | Parallel agent lock — prevents lockfile corruption in worktrees      |
| `clean-commits`      | No AI attribution in git commits                                     |
| `typescript-safety`  | Block `any` types and console.log                                    |
| `css-discipline`     | No `!important`, no inline styles                                    |
| `a11y`               | Accessibility: semantic HTML, focus rings, touch targets             |
| `rtk`                | RTK token compression — rewrites shell commands through [RTK](https://github.com/rtk-ai/rtk) to reduce LLM token usage by 60-90% |
| `yolo-safety`        | Safety guardrails for YOLO mode (composes from `safety`)             |
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

**Graduation:** Hooks start at `remind`, graduate to `warn` then `block` after validation proves zero false positives.

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

Shows quotas (max entries total, per category, per type), retention settings (archive/delete thresholds), auto-capture policy, and current quota usage.

---

### yolo

Launch Claude Code in YOLO mode with safety guardrails. See [YOLO Mode](/docs/guides/yolo-mode/) for full guide.

```bash
npx @soleri/cli yolo [options]
```

Automatically installs the `yolo-safety` hook pack (if not already installed), then launches Claude Code with `--dangerously-skip-permissions`. Safety hooks intercept destructive commands (rm, git push --force, git reset --hard, drop table, docker rm).

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

**Workflow:**

1. `soleri telegram enable` — generates 4 source files, adds grammy dependency, adds npm scripts
2. `soleri telegram setup` — interactive wizard for bot token, LLM provider/key, passphrase, model
3. `npm run telegram:start` or `npm run telegram:dev` — run the bot

**Example:**

```bash
npx @soleri/cli telegram enable
npx @soleri/cli telegram setup
npx @soleri/cli telegram status
npx @soleri/cli telegram disable
```

---

### vault

Vault knowledge management.

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

Manage the anti-deletion staging folder. The `safety` hook pack backs up files here before destructive operations.

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
The `extend` subcommands (`init`, `add-op`, `add-facade`, `add-middleware`) applied to the legacy TypeScript agent format and are **no longer supported**.

File-tree agents extend through plain files:
- **Instructions** → add `.md` files to `instructions/`
- **Workflows** → add folders to `workflows/`
- **Knowledge** → drop JSON bundles in `knowledge/`
- **Skills** → add `SKILL.md` files to `skills/`
- **Domains** → use `npx @soleri/cli add-domain <name>`

See [Extending Your Agent](/docs/extending/) for full documentation.
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

_See [Customizing Your Agent](/docs/guides/customizing/) for detailed configuration guides. For API operations, see [API Reference](/docs/api-reference/) and [Capabilities](/docs/capabilities/). If something isn't working, check [Troubleshooting](/docs/troubleshooting/)._
