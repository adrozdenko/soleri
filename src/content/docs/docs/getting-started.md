---
title: Getting Started
description: Install Soleri, create your first agent, and connect it to your AI editor in under 5 minutes.
---

## Prerequisites

- **Node.js 18+** — check with `node -v`
- **An MCP-compatible AI editor** — Claude Code, OpenCode, and Codex are supported today.
- **npm** — ships with Node.js

:::note[Build tools are optional]
Soleri uses `better-sqlite3` for its knowledge engine. It ships as an optional dependency — if native compilation fails during install, scaffolding still works. You'll only need build tools when running the agent's knowledge engine.

If you hit compilation errors later:
- **macOS:** `xcode-select --install`
- **Linux:** `sudo apt-get install -y build-essential python3`
- **Windows:** Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) or use WSL
:::

## Create Your Agent

One command to scaffold a file-tree agent in your current directory:

```bash
npm create soleri my-agent
```

This creates `./my-agent/` in whatever directory you run it from.

The interactive wizard asks for:

| Prompt         | What it means                                                  |
| -------------- | -------------------------------------------------------------- |
| **Agent name** | Your agent's identity (e.g., "sentinel", "architect")          |
| **Role**       | One-line description of what it does                           |
| **Domains**    | Knowledge areas — `frontend`, `backend`, `security`, or custom |
| **Tone**       | How the agent communicates — precise, mentor, pragmatic        |

This generates a folder — no TypeScript, no build step:

```
my-agent/
├── agent.yaml              # Identity + engine config
├── .mcp.json               # Connects to Knowledge Engine (Claude Code)
├── opencode.json           # Connects to Knowledge Engine (OpenCode)
├── .gitignore              # Excludes auto-generated files
├── CLAUDE.md               # Auto-generated (never edit)
├── instructions/           # Behavioral rules
│   ├── _engine.md          # Engine rules (auto-generated)
│   └── domain.md           # Your domain-specific rules
├── workflows/              # Step-by-step playbooks
│   ├── feature-dev/
│   ├── bug-fix/
│   ├── code-review/
│   └── context-handoff/
├── knowledge/              # Domain intelligence bundles
├── skills/                 # SKILL.md files
├── hooks/                  # Your AI editor hooks
├── data/                   # Agent runtime data
└── workspaces/             # Workspace contexts
```

Your agent is ready to use immediately. No `npm install`, no `npm run build`.

## Register and Start

From inside the agent folder, register the MCP server and start:

```bash
cd my-agent
soleri install --target claude    # Claude Code (default)
soleri install --target opencode  # OpenCode
soleri install --target codex     # Codex
soleri install --target all       # All editors
soleri dev                        # Start engine + watch for changes
```

`soleri install` registers the Soleri Knowledge Engine in your editor's MCP config. `soleri dev` starts the engine and watches your agent folder — CLAUDE.md is regenerated automatically when you edit `agent.yaml` or `instructions/`.

:::tip[Non-interactive setup]
For CI pipelines or scripted setups, pass a config file to skip the interactive wizard:

```bash
npm create soleri my-agent -- --config agent-config.json --yes
```

Other useful flags:
- `--setup-target <editor>` — choose your editor during create (`claude`, `opencode`, `codex`, `all`)
- `--no-git` — skip `git init`
- `--dir <path>` — custom parent directory for the agent folder
:::

## Connect to your AI editor

After running `soleri install`, restart your AI editor. Your agent is available as a tool. The `.mcp.json` in your agent folder looks like:

```json
{
  "mcpServers": {
    "soleri-engine": {
      "command": "npx",
      "args": ["@soleri/engine", "--agent", "./agent.yaml"]
    }
  }
}
```

## First Conversation

Once connected, try these in your AI editor:

```
# Activate the persona
"Hello, My Agent!"

# Search your agent's knowledge
"Search for patterns about error handling"

# Capture something you learned
"Capture this pattern: always use error boundaries at route level"

# Check agent health
"Run a health check"
```

Your agent starts with starter knowledge and learns from every session.

## Updating Soleri

```bash
# Check for updates
soleri agent status

# Update engine to latest version
npx @soleri/cli@latest upgrade

# Regenerate CLAUDE.md with latest engine rules
soleri agent refresh
```

To re-scaffold from scratch (e.g., after a major version bump):

```bash
rm -rf ~/.npm/_npx              # clear stale npx cache
npm create soleri@latest my-agent
```

## Customize Your Agent

Edit files directly — no rebuild needed:

- **Add rules:** Create a new `.md` file in `instructions/`
- **Add workflows:** Create a new folder in `workflows/` with `prompt.md` + `gates.yaml`
- **Add knowledge:** Drop a JSON bundle in `knowledge/`
- **Change identity:** Edit `agent.yaml`

Run `soleri dev` and CLAUDE.md regenerates automatically on save.

## Health Check

If something isn't working:

```bash
npx @soleri/cli doctor
```

Reports Node version, npm status, agent context, vault health, and engine connectivity.

## What's Next

- **[Your First 10 Minutes](/docs/guides/first-10-minutes/)** — a hands-on tutorial to see your agent in action
- **[The Development Workflow](/docs/guides/workflow/)** — learn the five-step rhythm: Search, Plan, Work, Capture, Complete
- **[CLI Reference](/docs/cli-reference/)** — every CLI command with options and examples
- **[Extending Your Agent](/docs/extending/)** — add instructions, workflows, knowledge, and packs
