---
title: 'Migrating from Claude Code'
description: 'Already using Claude Code? Adopt Soleri incrementally without disrupting your existing setup. Your CLAUDE.md, settings, and MCP servers all stay.'
---

If you're already using Claude Code, Soleri doesn't replace it. It builds on top of it. Your CLAUDE.md files, your settings, your MCP servers, your hooks: all of that stays where it is.

Nothing breaks, nothing gets overwritten, and you can remove it just as easily as you added it.

## What Soleri adds to Claude Code

Claude Code follows instructions you put in CLAUDE.md. But those instructions live in flat files. They don't learn, they don't rank by usefulness, and they reset every session. Soleri adds a persistent layer on top:

| What you get | What it does |
|---|---|
| **Knowledge vault** | A searchable, ranked knowledge store. Patterns, anti-patterns, conventions, all indexed and scored by how often they actually help. |
| **Brain learning** | The agent tracks which patterns work. Useful ones get stronger, unused ones decay. Search results improve over time. |
| **Skills** | Reusable SKILL.md files that teach the agent specific workflows: code review, debugging, planning, shipping. |
| **Hook packs** | Quality gates that run automatically (no-console-log, no-any-types, AI attribution blocking, inline linting). Install with one command. |
| **Personas** | A named identity with a communication style. Not cosmetic: it shapes how the agent frames responses and what it emphasizes. |
| **Planning** | Structured task planning with grading, drift detection, and reconciliation. Plans live in the vault, not in your head. |
| **Cross-session memory** | Knowledge persists between sessions. Close your editor, open it next week, and the agent still knows what you taught it. |

Claude Code gives you an assistant that follows instructions. Soleri gives that assistant long-term memory and the ability to get better at its job over time.

## What stays the same

If you're cautious about adding complexity, this is what matters:

- Your CLAUDE.md still works. Soleri generates its own CLAUDE.md in the agent folder, but your project-level CLAUDE.md is untouched.
- Your settings stay. `settings.json`, `settings.local.json` are untouched unless you explicitly install hooks.
- Your MCP servers stay. Soleri adds its own MCP server entry (the Knowledge Engine). Your existing servers are not touched.
- Claude Code still works without Soleri. Remove the agent folder and you're back where you started.

Soleri is additive. It scaffolds a folder, registers one MCP server, and generates instruction files. That's it.

## Step 1: Install

You don't need to install anything globally. Just run:

```bash
npx --yes soleri create my-agent
```

Or use the npm create shorthand:

```bash
npx create-soleri@latest my-agent
```

The wizard asks for a name, role, domains, and tone. Don't overthink it. You can change everything later in `agent.yaml`.

## Step 2: Scaffold in your project

After the wizard finishes, you get a folder:

```
my-agent/
├── agent.yaml              # Identity + engine config
├── .mcp.json               # Connects to Knowledge Engine
├── CLAUDE.md               # Auto-generated (never edit this one)
├── settings.local.json     # Hooks + pre-approved permissions
├── instructions/
│   ├── _engine.md          # Engine rules (auto-generated)
│   └── domain.md           # Your domain-specific rules
├── workflows/              # Step-by-step playbooks
├── knowledge/              # Domain intelligence bundles
├── skills/                 # SKILL.md files
└── hooks/                  # AI editor hooks
```

Then register the MCP server and start the engine:

```bash
cd my-agent
soleri install --target claude
soleri dev
```

Restart Claude Code. The Knowledge Engine is now available as an MCP tool alongside whatever else you already have running.

**What changed in your environment:** One new MCP server entry in `.mcp.json`. That's the only integration point. Your existing project files, CLAUDE.md, and Claude Code config are untouched.

## Step 3: Bring your CLAUDE.md

If you already have a project-level CLAUDE.md with rules, conventions, and patterns, you have two options:

### Option A: Keep them separate

Your project CLAUDE.md continues to work exactly as before. Claude Code reads it natively. Soleri's generated CLAUDE.md lives in the agent folder and adds engine behavior on top.

Lowest friction. Change nothing about your existing setup.

### Option B: Move rules into the agent

If your CLAUDE.md has grown into a large file of conventions and patterns, consider moving those into the vault where they become searchable and ranked:

1. Project-specific rules go in `instructions/user.md`. This file survives engine updates and gets priority placement in the generated CLAUDE.md:

```markdown
## Project Rules

- This project uses React with Tailwind, never suggest inline styles
- All API endpoints must follow the /v1/ prefix convention
- Never add npm dependencies without checking first
```

1. Reusable patterns go into the vault where the brain can learn from them:

```
"Capture this pattern: all API errors must return { error: string, code: number, details?: object }"
```

You don't have to do this all at once. Move things over gradually as you encounter them in your workflow.

## Step 4: Start capturing knowledge

Instead of keeping conventions in a CLAUDE.md that the agent reads once per session, put them in the vault where they're searchable, ranked, and persistent.

Start with the patterns you find yourself repeating:

```
"Capture this pattern: always use error boundaries at the route level"
"Capture this anti-pattern: never catch errors silently in API handlers"
"Capture this convention: test files live next to source files, named *.test.ts"
```

Each capture goes into the vault with metadata (type, domain, severity, tags). When you search later, the brain ranks results by how useful they've been.

The difference from CLAUDE.md: patterns that help you show up first. Patterns you never use decay. The agent learns what actually matters for your project.

## Step 5: Add hooks

If you've been manually enforcing code quality rules ("don't leave console.logs", "don't use `any` types"), hooks automate that:

```bash
npx @soleri/cli hooks add-pack full
```

This installs quality gates that run automatically when the agent writes code:

| Hook | What it catches |
|---|---|
| `no-console-log` | Leftover debug statements |
| `no-any-types` | TypeScript `any` usage |
| `no-important` | CSS `!important` declarations |
| `no-ai-attribution` | AI attribution in commit messages |

You can also add packs individually:

```bash
npx @soleri/cli hooks add-pack oxlint     # Inline linting on every edit
npx @soleri/cli hooks add-pack terse-auto  # Compress agent output, save tokens
npx @soleri/cli hooks add-pack rtk         # Compress shell output, save tokens
```

Hooks are optional. Skip this step entirely if you prefer to add them later.

## What to expect

Once you've scaffolded and started capturing knowledge, a few things change:

The agent remembers things between sessions. Close Claude Code, open it tomorrow, and the agent still knows your API error format convention. That knowledge lives in the vault, not in conversation history.

Search gets better over time. The brain tracks which patterns actually help. After a few weeks, searching "error handling" returns your most useful patterns first, not just keyword matches.

Your conventions are enforced without reminding. Between vault patterns, instruction files, and hooks, the agent follows your project's rules every session.

The workflow has structure. Search the vault, plan the work, execute, capture what you learned, complete. Repeat.

None of this requires you to change how you use Claude Code. Same CLI, same way of writing code. The agent just gets smarter about your project over time.

## Common questions

**Can I go back to plain Claude Code?**

Yes. Delete the agent folder and remove the MCP server entry from `.mcp.json`. You're back to exactly where you started. Your project CLAUDE.md, settings, and other MCP servers were never modified.

**Does Soleri change my Claude Code settings?**

No. Soleri creates its own `settings.local.json` inside the agent folder. Your global or project-level Claude Code settings are not touched.

**Can I use Soleri on some projects but not others?**

Absolutely. Soleri is per-project scaffolding. Each project gets its own agent folder (or not). Projects without an agent folder work exactly as before.

**What about my existing MCP servers?**

They stay. Soleri adds one MCP server (the Knowledge Engine) alongside whatever you already have. There's no conflict.

**Do I need to learn new commands?**

Not really. You talk to the agent in natural language, same as before. The difference is the agent now has tools it can call (vault search, knowledge capture, planning). You don't invoke these directly; the agent decides when to use them based on your conversation.

**What if I have a team?**

Each team member scaffolds their own agent. Knowledge can be shared through vault export/import, knowledge packs, or cross-project linking. See [Team Workflows](/docs/guides/team-workflows/) for the full picture.

**Is my data safe?**

Everything runs locally. The vault is a SQLite database on your machine. No data leaves your environment. See [Security & Privacy](/docs/guides/security/) for details.

---

_Next: [Your First 10 Minutes](/docs/guides/first-10-minutes/), a hands-on tutorial to see your agent in action. Then explore [The Development Workflow](/docs/guides/workflow/) and [Building a Knowledge Base](/docs/guides/knowledge-base/)._
