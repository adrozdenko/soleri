---
title: 'Your First 10 Minutes'
description: 'Scaffold your agent, have your first conversation, and see it remember things across sessions.'
---

By the end of this tutorial, you'll have an agent that knows things, learns from you, and remembers everything between sessions.

## Step 1: Create your agent

Open your terminal and run:

```bash
npm create soleri my-agent
```

The wizard will ask you a few things — pick a name, describe what your agent does, choose some knowledge areas. Don't overthink it, you can change everything later.

Once it's done, build it:

```bash
cd my-agent
npm install
npm run build
```

## Step 2: Connect to Claude Code

Add your agent to `.mcp.json` in your project root:

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

Restart Claude Code. Your agent is now running.

## Step 3: Ask it something

Your agent comes with starter knowledge out of the box. Try asking it something:

> **You:** "What do you know about error handling?"
> **Agent:** _Found 3 relevant entries._ Here are patterns for error handling:
> Use error boundaries at the route level to prevent full-page crashes...

It already has useful things to say — you didn't have to teach it anything yet. This is the starter knowledge that ships with every agent.

## Step 4: Teach it something new

Now teach your agent something specific to your project. Say you just decided that all API errors should return a consistent format:

> **You:** "Capture this pattern: all API errors must return { error: string, code: number, details?: object }. This keeps our frontend error handling simple and predictable."
> **Agent:** _Captured pattern: "Consistent API Error Format"_

That's it. Your agent now knows this rule. It's stored in the vault — not in your head, not in a doc somewhere.

## Step 5: Find it again

Let's make sure it stuck:

> **You:** "Search for API error patterns"
> **Agent:** _Found: "Consistent API Error Format" — all API errors must return { error: string, code: number, details?: object }..._

Your pattern shows up right away. The more patterns you capture, the smarter searches get — the agent learns which ones matter most based on how often you use them.

## Step 6: Close and reopen

Here's where it clicks. Close Claude Code completely. Open it again. Ask the same question:

> **You:** "What do we know about API errors?"
> **Agent:** _Found: "Consistent API Error Format"..._

It remembered. Not because it has a conversation history — because the knowledge lives in the vault, permanently. Next week, next month, it'll still know this.

## What just happened

In 10 minutes, you:

- Created an agent that already knows useful things
- Taught it something specific to your project
- Searched and found it instantly
- Closed the session and it still remembered

This is the foundation. Every tutorial from here builds on this — capturing more knowledge, organizing it, and using it to catch mistakes before they ship.

---

_Next: [Building a Knowledge Base](/docs/guides/knowledge-base/) — learn what to capture, how to organize it, and how to make your agent genuinely useful._
