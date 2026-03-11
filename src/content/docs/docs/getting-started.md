---
title: Getting Started
description: Install Soleri, create your first agent, and connect it to Claude Code in under 5 minutes.
---

## Prerequisites

- **Node.js 18+** — check with `node -v`
- **Claude Code** or **Cursor** — your AI-powered editor
- **npm** — ships with Node.js

## Create Your Agent

One command to scaffold a fully functional agent:

```bash
npm create soleri my-agent
```

The interactive wizard asks for:

| Prompt            | What it means                                                  |
| ----------------- | -------------------------------------------------------------- |
| **Agent name**    | Your agent's identity (e.g., "sentinel", "architect")          |
| **Role**          | One-line description of what it does                           |
| **Domains**       | Knowledge areas — `frontend`, `backend`, `security`, or custom |
| **Persona voice** | How the agent communicates — professional, casual, technical   |

This generates a complete project:

```
my-agent/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── identity/persona.ts   # Agent personality
│   ├── activation/           # Claude Code integration
│   ├── extensions/           # Your custom ops, facades, middleware
│   └── intelligence/data/    # Starter knowledge
├── skills/                    # 17 built-in skills
├── scripts/setup.sh           # One-command install + register
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Build and Run

```bash
cd my-agent
npm install
npm run build
```

Test that it works:

```bash
npm test
```

For the full Soleri test suite (unit + E2E integration), see [Testing](/docs/guides/testing/).

## Connect to Claude Code

Add your agent to Claude Code's MCP configuration. Create or edit `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "my-agent": {
      "command": "node",
      "args": ["./my-agent/dist/index.js"]
    }
  }
}
```

Restart Claude Code. Your agent is now available as a tool.

## First Conversation

Once connected, try these in Claude Code:

```
# Search your agent's knowledge
"Search for patterns about error handling"

# Capture something you learned
"Capture this pattern: always use error boundaries at route level"

# Check agent health
"Run a health check"
```

Your agent starts with starter knowledge and learns from every session.

## Development Mode

For active development with auto-rebuild:

```bash
npx @soleri/cli dev
```

This watches for changes and restarts the MCP server automatically.

## Health Check

If something isn't working:

```bash
npx @soleri/cli doctor
```

Reports Node version, npm status, agent context, vault health, and CLAUDE.md status.

## What's Next

- **[The Development Workflow](/docs/guides/workflow/)** — learn the five-step rhythm: Search → Plan → Work → Capture → Complete
- **[Your First 10 Minutes](/docs/guides/first-10-minutes/)** — a hands-on tutorial to see your agent in action
- **[Your Agent](/docs/your-agent/)** — reference for vault, brain, memory, and playbooks
- **[Security & Privacy](/docs/guides/security/)** — your data stays local, zero network calls by default
