---
title: 'Your First 10 Minutes'
description: 'Scaffold your agent, have your first conversation, and see it remember things across sessions.'
---

This tutorial walks you through creating an agent, teaching it something, and watching it remember across sessions.

## Step 1: Create your agent

Open your terminal and run:

```bash
npm create soleri my-agent
```

The wizard asks for a name, a description, and some knowledge areas. Don't overthink it, you can change everything later.

Your agent is just a folder, ready instantly with no build step:

```
my-agent/
├── agent.yaml          # Identity + config
├── .mcp.json           # Connects to engine (Claude Code)
├── opencode.json       # Connects to engine (OpenCode)
├── CLAUDE.md           # Auto-generated (never edit)
├── instructions/       # Behavioral rules
├── workflows/          # Step-by-step playbooks
├── knowledge/          # Domain intelligence
├── skills/             # SKILL.md files
└── hooks/              # AI editor hooks
```

## Step 2: Connect to your AI editor

Register and start the engine:

```bash
cd my-agent
npx @soleri/cli install           # Register MCP server
npx @soleri/cli dev               # Start engine + watch files
```

Restart your AI editor. Your agent is now running.

## Step 3: Ask it something

Your agent comes with starter knowledge. Try asking it something:

> **You:** "What do you know about error handling?"
>
> **Agent:** _Found 3 relevant entries._ Here are patterns for error handling:
> Use error boundaries at the route level to prevent full-page crashes...

It already has useful things to say without you teaching it anything. That's the starter knowledge that ships with every agent.

## Step 4: Teach it something new

Now teach your agent something specific to your project. Say you just decided that all API errors should return a consistent format:

> **You:** "Capture this pattern: all API errors must return { error: string, code: number, details?: object }. This keeps our frontend error handling simple and predictable."
>
> **Agent:** _Captured pattern: "Consistent API Error Format"_

Your agent now knows this rule. It's stored in the vault, not in your head, not in a doc somewhere.

## Step 5: Find it again

Verify it stuck:

> **You:** "Search for API error patterns"
>
> **Agent:** _Found: "Consistent API Error Format" — all API errors must return { error: string, code: number, details?: object }..._

Your pattern shows up right away. The more patterns you capture, the smarter searches get because the agent learns which ones matter most based on how often you use them.

## Step 6: Close and reopen

Close your AI editor completely. Open it again. Ask the same question:

> **You:** "What do we know about API errors?"
>
> **Agent:** _Found: "Consistent API Error Format"..._

It remembered. Not because it has a conversation history, but because the knowledge lives in the vault permanently. Next week, next month, it'll still know this.

## How it works under the hood

Your agent folder contains instructions that your AI editor reads natively. The Knowledge Engine (running via `.mcp.json`) provides tools that your AI editor can call. When you said "capture this pattern," your AI editor called the engine's `capture_knowledge` tool. When you searched, it called `search_intelligent`.

The agent doesn't proactively surface knowledge on its own. Instead, your AI editor decides when to call the engine's search tools based on your conversation. When you ask about API errors, your AI editor recognizes this is relevant to your knowledge base and calls the search tool. The engine returns ranked results, and your AI editor uses them in its response.

The vault isn't a passive document. It's a searchable, ranked knowledge store that your AI editor consults whenever your conversation touches a relevant topic.

## What just happened

In about 10 minutes, you created an agent with starter knowledge, taught it something specific to your project, searched and found it instantly, then closed the session and confirmed it still remembered.

Now that you've seen the basics, learn the workflow that ties it all together.

---

_Next: [The Development Workflow](/docs/guides/workflow/), the five-step rhythm for working with your agent. Then [Building a Knowledge Base](/docs/guides/knowledge-base/) to learn what to capture and how to organize it._
