---
title: 'Example Agents'
description: 'Pre-built starter agents that show how to set up Soleri for different types of work.'
---

Soleri ships with six example agents in the `examples/` directory. Each one is a complete, working agent you can copy and customize. They exist so you don't have to start from scratch or guess at the YAML format.

Every example includes an `agent.yaml` (identity, domains, principles, tone), an `instructions/` folder (behavioral rules), and the `.mcp.json` wiring that connects to the engine. Some also define `workspaces` that set up a folder structure for the kind of work the agent handles.

## The examples

| Agent | Role | Domains | Good for |
|-------|------|---------|----------|
| Gaudi (minimal-agent) | Full-Stack Dev Advisor | TypeScript, React, architecture | The bare minimum. Uses `profile: minimal` in the engine config, so it's a good starting point if you want to build up from nothing. |
| Forge | Software Dev Assistant | Architecture, code review, testing, DevOps | Developers who want an agent that learns their stack conventions, review standards, and definition of "done." Ships with workspaces for planning, src, docs, and ops. |
| Atlas | Freelance Business Assistant | Client management, proposals, project scoping | Freelancers juggling multiple clients. Sets up workspaces to isolate client context, track templates, and manage your pipeline. |
| Muse | Content Creation Assistant | Writing, editing, SEO, social media | Writers, YouTubers, social creators. Learns your voice, editorial preferences, and publishing workflows over time. |
| Sage | Research & Academic Assistant | Literature review, methodology, data analysis, academic writing | Researchers and academics. Tracks sources, methodology decisions, and citation patterns. Workspaces for sources, analysis, writing, and admin. |
| Compass | Small Business Ops Assistant | Operations, customer relations, planning, communications | Small business owners. Tracks communication patterns, client relationships, and operational routines. |

## What's inside each one

Every agent follows the same structure:

```
agent-name/
  agent.yaml          # Identity, domains, principles, tone
  instructions/       # Behavioral rules (markdown files, composed alphabetically)
  .mcp.json           # Engine connection config
  .gitignore          # Excludes auto-generated files
```

The `agent.yaml` is where the personality lives. It defines the agent's name, role, greeting, domains of expertise, guiding principles, and tone. The fuller examples (everything except minimal-agent) also define `workspaces`, which are named directories the agent knows about and uses to organize work.

The `instructions/` folder contains markdown files with behavioral rules. Forge has `code-conventions.md` and `review-standards.md`. Atlas has `client-rules.md` and `proposal-workflow.md`. You can add as many files as you want here. They get composed into the agent's system prompt alphabetically.

## How to try one

The quickest way is to copy the folder directly:

```bash
cp -r examples/forge-developer/ my-project/.soleri/
```

Then edit `agent.yaml` to fit your needs (change the name, add or remove domains, adjust the principles) and run:

```bash
npx soleri dev
```

You can also use the scaffolding command to create a fresh agent from scratch:

```bash
npm create soleri my-agent
```

This runs a wizard that asks for a name, description, and knowledge areas. The examples are useful as reference when you're deciding how to structure the result.

## Customization tips

The examples are starting points, not templates you need to follow exactly. A few things worth knowing:

`CLAUDE.md` gets auto-generated from `agent.yaml` plus everything in `instructions/`. Don't edit it directly, it will get overwritten.

To add new behavioral rules, create a new `.md` file in `instructions/`. The file name doesn't matter beyond sort order.

Workspaces are optional. The minimal-agent doesn't use them at all. If your agent doesn't need to organize files into specific directories, skip them.

The `engine` section in `agent.yaml` controls what capabilities your agent has. Setting `learning: true` means it captures knowledge to the vault. Setting `agency: true` enables agentic behaviors like planning and subagent dispatch. The minimal-agent uses `profile: minimal` to keep things stripped down.

All examples use `claude-code-sonnet-4` as the model, but you can change this in the `setup` section.
