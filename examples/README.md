# Soleri Starter Agents

Pick the one that matches your work. Clone it, customize it, run it.

| Agent | Role | Best For |
|-------|------|----------|
| [Muse](muse-content-creator/) | Content Creator | Writers, YouTubers, social media |
| [Atlas](atlas-freelancer/) | Freelancer | Client work, proposals, scoping |
| [Forge](forge-developer/) | Developer | Code, architecture, testing |
| [Sage](sage-researcher/) | Researcher | Academic writing, data analysis |
| [Compass](compass-business/) | Business Operator | Ops, comms, planning |

## Quick Start

1. Copy the agent folder to your project:
   ```bash
   cp -r examples/forge-developer/ my-project/.soleri/
   ```

2. Edit `agent.yaml` — change the name, role, and principles to fit you.

3. Customize the instruction files in `instructions/` — these shape how the agent behaves.

4. Run it:
   ```bash
   npx soleri dev
   ```

## What's in Each Agent

```
agent-name/
  agent.yaml          # Identity, domains, principles, tone
  instructions/       # Behavioral rules (2 files per agent)
  .mcp.json           # Engine connection config
  .gitignore          # Excludes auto-generated files
```

`CLAUDE.md` is auto-generated from `agent.yaml` + `instructions/` — never edit it directly.

## Customization

- **Add domains**: Edit the `domains` list in `agent.yaml`
- **Change personality**: Edit `tone`, `principles`, and `greeting` in `agent.yaml`
- **Add rules**: Create new `.md` files in `instructions/` — they're composed alphabetically
- **Add workspaces**: Define folder structure in `agent.yaml` under `workspaces`

## Also See

- [reference-agent/](reference-agent/) — Full-featured reference (Salvador design system agent)
- [minimal-agent/](minimal-agent/) — Bare minimum viable agent
