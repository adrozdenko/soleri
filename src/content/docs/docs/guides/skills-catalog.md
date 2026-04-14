---
title: 'Skills Catalog'
description: 'All available skills (essential and optional) with descriptions and installation instructions.'
---

Skills are workflow scripts that teach your agent how to handle specific situations. When you say "debug this" or "create a plan", the agent matches your intent to a skill and follows its steps.

Every scaffolded agent ships with 7 essential skills. Another 29 optional skills are available to install on demand (36 total).

## Essential skills (included by default)

These ship with every scaffolded agent:

| Skill                    | What it does                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| **agent-guide**          | Responds to "what can you do" — lists capabilities, tools, and how to use them                      |
| **agent-persona**        | Activates the agent's persona on greeting. Maintains character through the session and compaction    |
| **vault-navigator**      | Searches the knowledge base for patterns, prior art, and best practices                             |
| **vault-capture**        | Persists a single known pattern, decision, or principle to the vault                                |
| **systematic-debugging** | First response to any bug — diagnoses root cause before proposing fixes                             |
| **writing-plans**        | Creates structured implementation plans from clear requirements                                     |
| **context-resume**       | Rebuilds working context on session start — "where did I leave off?"                                |

## Optional skills

Install any of these to extend your agent's capabilities:

| Skill                             | What it does                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| **agent-dev**                     | Extends the agent itself — adding facades, tools, vault ops, or new skills                 |
| **agent-issues**                  | Creates GitHub issues, bugs, tasks, and milestones structured for AI agent execution       |
| **brain-debrief**                 | Explores brain-learned patterns — strength scores, intelligence reports                    |
| **brainstorming**                 | Open-ended creative exploration when requirements are not yet clear                        |
| **code-patrol**                   | Reviews code against the project's own vault patterns and conventions                      |
| **deep-review**                   | In-depth code review — architecture fitness, code smells, optimization opportunities       |
| **deliver-and-ship**              | Pre-delivery quality gates — stability, knowledge capture, code quality checks             |
| **discovery-phase**               | Structured exploration before committing to a plan — options, tradeoffs, recommendations   |
| **env-setup**                     | Sets up, fixes, or restores local dev environments across languages and tools              |
| **executing-plans**               | Executes an approved plan step by step with review checkpoints                             |
| **finishing-a-development-branch**| Finalizes a branch for merge — PR preparation, cleanup, final checks                      |
| **fix-and-learn**                 | Applies a fix after root cause is found, then captures the learning in the vault           |
| **health-check**                  | Read-only health assessment of the knowledge base — scoring, diagnostics, issues           |
| **knowledge-harvest**             | Extracts multiple patterns from a source — code, docs, PRs, articles                      |
| **mcp-doctor**                    | Diagnoses and repairs MCP server connectivity issues                                       |
| **onboard-me**                    | Instant project orientation for newcomers — patterns, conventions, architecture overview    |
| **parallel-execute**              | Executes independent plan tasks concurrently using subagents                               |
| **release**                       | Bumps all monorepo package versions, commits, tags, and pushes to trigger CI/CD release    |
| **retrospective**                 | Time-bound reflection — sprint retros, weekly summaries, actionable improvements           |
| **second-opinion**                | Decision support from all sources — vault, brain, cross-project experience, web research   |
| **subagent-driven-development**   | Decomposes tasks into independent units for parallel isolated execution                    |
| **test-driven-development**       | Write failing tests before implementation — RED/GREEN/REFACTOR cycle                      |
| **using-git-worktrees**           | Safe parallel branch work using git worktrees — create, work, merge, clean up              |
| **vault-curate**                  | Knowledge maintenance — deduplicate, merge, resolve contradictions, groom                  |
| **vault-smells**                  | Deep knowledge quality analysis — contradictions, stale patterns, orphans, decay           |
| **verification-before-completion**| Internal quality gate before claiming a task is done — run tests, check output             |
| **terse**                         | Token-efficient responses — compress output while keeping technical accuracy               |
| **compress**                      | Compresses natural language files (CLAUDE.md, memory) to reduce input tokens               |
| **yolo-mode**                     | Autonomous execution — skip approval gates while preserving safety invariants              |

## Installing optional skills

Install a single skill:

```bash
npx @soleri/cli skills install deep-review
```

Install a skill pack (group of related skills):

```bash
npx @soleri/cli pack install my-skills-pack
```

List installed skills:

```bash
npx @soleri/cli skills list
```

## Choosing a skills filter

When scaffolding an agent, you can control which skills are included:

| Filter        | What it includes                   |
| ------------- | ---------------------------------- |
| `essential`   | 7 core skills (default)            |
| `all`         | All 36 skills                      |
| Custom array  | Only the skills you list           |

Set this in your [`agent.yaml`](/docs/your-agent/):

```yaml
engine:
  skillsFilter: essential    # or 'all', or ['vault-navigator', 'deep-review', ...]
```

## Skill trust levels

Every skill gets a trust level based on what files it contains. The trust classifier walks the skill directory, looks at each file's extension, and picks the highest-risk category it finds.

| Trust level | What it means | Triggered by |
| ----------- | ------------- | ------------ |
| `markdown_only` | Pure documentation, no executable code | Only `.md` / `.mdx` files |
| `assets` | Contains non-markdown files but no scripts | Images, JSON, configs (no code) |
| `scripts` | Contains executable code | `.sh`, `.ts`, `.js`, `.mjs`, `.cjs`, `.py`, `.rb`, `.bash` files |

The classifier escalates: if a skill directory has even one `.ts` file that isn't a declaration file (`.d.ts`), the whole skill is classified as `scripts`. Declaration files are treated as references, not executable code.

Each file in the skill also gets a per-file kind:

| Kind | Examples |
| ---- | ------- |
| `skill` | `SKILL.md` (the primary skill definition) |
| `reference` | `.md` files, `.d.ts` declaration files |
| `script` | `.ts`, `.js`, `.sh`, `.py`, etc. |
| `asset` | Everything else (images, JSON, configs) |

To see the trust level for your installed skill packs, use the `--trust` flag:

```bash
npx @soleri/cli skills list --trust
```

This shows the trust classification, source, and engine compatibility for each pack. The output looks something like:

```
  my-skills@1.0.0
    skills: deep-review, code-patrol
    trust: markdown_only  source: npm  compat: compatible
```

Trust levels help you understand what a skill pack can do before you install it. A `markdown_only` skill is just workflow instructions for your AI editor. A `scripts` skill can run code on your machine. That distinction matters when you're installing packs from third-party sources.

## How skills work

Skills are markdown files installed to `~/.claude/skills/<name>/SKILL.md` (see [Your Agent](/docs/your-agent/) for the full file-tree layout). Each skill has:

- Trigger conditions: phrases and intents that activate it
- Steps: a structured workflow the agent follows
- Tool references: which agent tools to use at each step

When the agent detects a matching intent, it loads the skill and follows the workflow. Skills compose with other agent capabilities. A skill can search the vault, create plans, capture knowledge, and use any tool available to the agent.

---

_Next: [Domain Packs](/docs/guides/domain-packs/). See also [Creating Packs](/docs/guides/pack-authoring/) to build your own, [Your Agent](/docs/your-agent/) for the agent anatomy overview, [Extending Your Agent](/docs/extending/) for custom ops, and the [CLI Reference](/docs/cli-reference/) for `soleri skills` and `soleri pack` commands._
