---
title: Getting Started
description: Install Soleri, create your first agent, and connect it to your AI editor in under 5 minutes.
---

## Prerequisites

- **Node.js 18+** — check with `node -v`
- **An MCP-compatible AI editor** — OpenCode, Claude Code, Cursor, or similar
- **npm** — ships with Node.js
- **Build tools** (Linux only) — Soleri uses `better-sqlite3` which requires native compilation:

  ```bash
  # Ubuntu / Debian
  sudo apt-get install -y build-essential python3

  # Fedora / RHEL
  sudo dnf group install "Development Tools" && sudo dnf install python3

  # Alpine
  apk add build-base python3
  ```

  macOS and Windows users: Xcode Command Line Tools and Visual Studio Build Tools are typically already installed.

## Create Your Agent

One command to scaffold a file-tree agent:

```bash
npx @soleri/cli create my-agent
```

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
├── .mcp.json               # Connects to Knowledge Engine
├── CLAUDE.md               # Auto-generated (never edit)
├── instructions/           # Behavioral rules
│   ├── _engine.md          # Engine rules (auto-generated)
│   └── domain.md           # Your domain-specific rules
├── workflows/              # Step-by-step playbooks
│   ├── feature-dev/
│   ├── bug-fix/
│   └── code-review/
├── knowledge/              # Domain intelligence bundles
├── skills/                 # SKILL.md files
└── hooks/                  # your AI editor hooks
```

Your agent is ready to use immediately. No `npm install`, no `npm run build`.

## Register and Start

```bash
cd my-agent
soleri install              # Register MCP server in your editor
soleri dev                  # Start engine + watch for file changes
```

`soleri install` registers the Soleri Knowledge Engine in your editor's MCP config. `soleri dev` starts the engine and watches your agent folder — CLAUDE.md is regenerated automatically when you edit `agent.yaml` or `instructions/`.

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

- **[The Development Workflow](/docs/guides/workflow/)** — learn the five-step rhythm: Search, Plan, Work, Capture, Complete
- **[Your First 10 Minutes](/docs/guides/first-10-minutes/)** — a hands-on tutorial to see your agent in action
