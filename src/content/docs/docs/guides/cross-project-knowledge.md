---
title: 'Cross-Project Knowledge'
description: 'Share patterns across projects, promote knowledge to the global pool, and search across your entire portfolio.'
---

Most developers work on more than one project. A security pattern you captured in your API server is just as relevant to your frontend app. Cross-project knowledge lets you share what you've learned across everything you build.

## Linking projects

When two projects are related, link them so they can search each other's vaults:

> **You:** "Link this project to ../api-server as related"
>
> **Agent:** _Linked: current project ↔ api-server (related, bidirectional)_

Link types describe the relationship:

| Type        | Meaning                               | Direction      |
| ----------- | ------------------------------------- | -------------- |
| **related** | Same domain or team                   | Bidirectional  |
| **parent**  | This project derives from another     | Unidirectional |
| **child**   | Another project derives from this one | Unidirectional |
| **fork**    | Code fork                             | Unidirectional |

Once linked, cross-project search becomes available.

## Searching across projects

When you search in a linked project, results from other projects can surface — weighted by relevance and link strength:

> **You:** "Search across all projects for deployment patterns"
>
> **Agent:** _Found 7 results across 3 projects:_
>
> 1. **Always Set K8s Resource Limits** (from: api-server, critical) — score: 0.91
> 2. **Blue-Green Deployment Checklist** (from: current project, warning) — score: 0.85
> 3. **Database Migration Before Deploy** (from: api-server, critical) — score: 0.78
> 4. **Cache Invalidation on Deploy** (from: shared-lib, suggestion) — score: 0.62

Results from the current project rank higher by default. Results from linked projects get a relevance boost based on link type — `related` projects score higher than distant `fork` links.

## The global pool

Some patterns are universal — they apply to every project you work on. Promote these to the global pool:

> **You:** "Promote the 'Never Store JWTs in localStorage' pattern to global"
>
> **Agent:** _Promoted to global pool. This pattern will now surface in searches across all projects._

Global patterns work by adding a `_global` tag to the entry. Any project can find them in cross-project searches, regardless of whether the projects are linked.

Good candidates for global promotion:

- Security patterns that apply everywhere
- Team conventions for code style, naming, commit messages
- Infrastructure patterns shared across all services
- Anti-patterns you never want to repeat in any project

## How data stays separate

Cross-project search reads from other projects' vaults — it doesn't copy or sync data. Each project keeps its own vault, its own brain state, and its own plans. Linking creates a read-only bridge for search, nothing more.

If you unlink a project, its knowledge stops appearing in cross-project searches immediately. No data is deleted from either side.

## Setting up for a team

When multiple people work on linked projects:

1. **Version-control your agent** — include the vault and brain state in your repo so everyone shares the same knowledge base
2. **Link shared projects** — each team member links the same set of projects
3. **Promote team-wide patterns to global** — security standards, coding conventions, architecture decisions
4. **Use domains** — keep domain-specific knowledge organized so cross-project search results stay relevant

The result: when anyone on the team captures a pattern, it's available to everyone through cross-project search. Knowledge stops being trapped in individual heads.

---

_Next: [Validation Loops](/docs/guides/loops/) — how your agent iterates toward quality targets automatically._
