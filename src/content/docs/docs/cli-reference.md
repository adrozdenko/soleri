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

| Flag     | Description                      |
| -------- | -------------------------------- |
| `[name]` | Agent name (prompted if omitted) |

**Interactive wizard prompts for:** agent name, role, domains, persona voice.

**Example:**

```bash
npx @soleri/cli create sentinel
# or use the npm create shorthand:
npm create soleri sentinel
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
npx @soleri/cli install-knowledge <path>
```

Accepts a directory or JSON file containing knowledge entries.

**Example:**

```bash
npx @soleri/cli install-knowledge ./bundles/react-patterns
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

### install

Register your agent as an MCP server in your AI editor.

```bash
npx @soleri/cli install
```

Adds the agent to `~/.claude.json` so your AI editor discovers it on startup. Run from inside your agent directory.

---

### uninstall

Remove your agent's MCP server registration.

```bash
npx @soleri/cli uninstall
```

Removes the entry from `~/.claude.json`.

---

### pack

Unified pack manager for hooks, skills, knowledge, and domains.

```bash
npx @soleri/cli pack <subcommand> [options]
```

**Subcommands:**

| Subcommand  | Description                       |
| ----------- | --------------------------------- |
| `list`      | List available packs              |
| `install`   | Install a pack                    |
| `uninstall` | Remove a pack                     |
| `validate`  | Validate a pack before installing |

**Options:**

| Flag            | Description                                          |
| --------------- | ---------------------------------------------------- |
| `--type <type>` | Pack type: `hooks`, `skills`, `knowledge`, `domains` |

---

### skills

Manage agent skills (convenience wrapper for `pack --type skills`).

```bash
npx @soleri/cli skills [subcommand]
```

Lists, installs, or removes skill packs for your agent.

---

### agent

Agent lifecycle management.

```bash
npx @soleri/cli agent <subcommand>
```

**Subcommands:**

| Subcommand | Description                           |
| ---------- | ------------------------------------- |
| `status`   | Show agent status and configuration   |
| `update`   | Update agent to latest engine         |
| `diff`     | Show differences from latest scaffold |

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
