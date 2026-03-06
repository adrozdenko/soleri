---
title: Getting Started
description: Install Soleri, create your first agent, and connect it to Claude Code in under 5 minutes.
---

## Prerequisites

- **Node.js 20+** — check with `node -v`
- **Claude Code** or **Cursor** — your AI-powered editor
- **npm 9+** — ships with Node.js

## Create Your Agent

One command to scaffold a fully functional agent:

```bash
npm create soleri my-agent
```

The interactive wizard asks for:

| Prompt | What it means |
|--------|---------------|
| **Agent name** | Your agent's identity (e.g., "sentinel", "architect") |
| **Role** | One-line description of what it does |
| **Domains** | Knowledge areas — `frontend`, `backend`, `security`, or custom |
| **Persona voice** | How the agent communicates — professional, casual, technical |

This generates a complete project:

```
my-agent/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── identity/persona.ts   # Agent personality
│   ├── activation/           # Claude Code integration
│   └── intelligence/data/    # Starter knowledge
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

- **[Your Agent](/docs/your-agent/)** — learn how the vault, brain, and memory work day-to-day
- **[Capabilities](/docs/capabilities/)** — see everything your agent can do
- **[Extending](/docs/extending/)** — add domains, knowledge packs, and hooks
