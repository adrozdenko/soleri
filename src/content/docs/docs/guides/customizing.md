---
title: 'Customizing Your Agent'
description: 'Shape your agent''s identity, add domains, configure hooks, upgrade, and set governance policies.'
---

Your agent ships with a default personality and starter knowledge. But the real power comes from making it yours — tuning its identity, adding domains that match your work, and setting up hooks that enforce your standards automatically.

## Identity and persona

Your agent has a persona — a name, role, and communication style. This isn't cosmetic. The persona shapes how the agent frames its responses, what it emphasizes, and how it communicates.

> **You:** "What's your identity?"
>
> **Agent:** _Name: sentinel. Role: security-focused code review assistant. Voice: direct, technical, no-nonsense._

You set the persona during scaffold, but you can change it anytime:

> **You:** "Update your role to: full-stack development assistant focused on React and Node.js"
>
> **Agent:** _Identity updated. Role changed._

### Behavioral guidelines

Guidelines are rules the agent follows in every interaction. They shape behavior beyond the persona:

> **You:** "Add this guideline: always suggest TypeScript strict mode when reviewing tsconfig changes"
>
> **Agent:** _Guideline added._

Guidelines stack with vault knowledge. The vault has what to do; guidelines control how the agent approaches work.

## Adding domains

Domains are expertise areas. Each domain gets its own search partition and a domain facade with 5 operations (`get_patterns`, `search`, `get_entry`, `capture`, `remove`). Start with what you need and add more as your work evolves:

```bash
npx @soleri/cli add-domain infrastructure
npx @soleri/cli add-domain testing
npx @soleri/cli add-domain performance
```

After adding a domain, seed it with knowledge:

```bash
npx @soleri/cli install-knowledge ./bundles/infrastructure-patterns
```

Or capture knowledge interactively:

> **You:** "Capture a critical pattern in the infrastructure domain: always set CPU and memory limits on Kubernetes pods."
>
> **Agent:** _Captured in infrastructure domain._

### Choosing domains

Good domains are knowledge areas where you accumulate reusable patterns:

| Good domains | Why |
|-------------|-----|
| `security` | Clear rules, critical patterns, compliance requirements |
| `frontend` | Component conventions, accessibility standards |
| `api-design` | Endpoint conventions, error formats, versioning rules |
| `testing` | Test patterns, coverage standards, mocking approaches |
| `infrastructure` | Deployment, scaling, monitoring patterns |

Avoid domains that are too broad ("coding") or too narrow ("button-styles"). You want enough specificity that searches return relevant results, but enough breadth that the domain accumulates useful knowledge.

## Hooks

Hooks are quality gates that run automatically during development. They catch common mistakes in real time — before they reach your codebase.

### Installing hooks

```bash
npx @soleri/cli hooks add-pack full
```

This installs all available hooks:

| Hook | What it catches |
|------|----------------|
| `no-console-log` | Leftover debug statements |
| `no-any-types` | TypeScript `any` usage |
| `no-important` | CSS `!important` declarations |
| `no-inline-styles` | Inline `style=` attributes |
| `semantic-html` | Non-semantic HTML elements |
| `focus-ring-required` | Missing keyboard focus indicators |
| `ux-touch-targets` | Touch targets smaller than 44px |
| `no-ai-attribution` | AI attribution in commit messages |

### Editor integration

```bash
npx @soleri/cli hooks add claude-code    # Claude Code
npx @soleri/cli hooks add cursor         # Cursor
npx @soleri/cli hooks add vscode         # VS Code
```

Hooks run as pre-tool-use checks in your editor. When the agent is about to write code that violates a hook, the hook blocks it and explains why.

## Knowledge packs

Knowledge packs are bundles of pre-built expertise you can install:

```bash
npx @soleri/cli install-knowledge <path-or-package>
```

Packs can be a local directory with JSON knowledge entries or an npm package following the Soleri knowledge pack format.

### What's in a pack

A knowledge pack contains typed entries — patterns, anti-patterns, principles, workflows — organized by domain:

```
my-pack/
├── patterns/           # Proven approaches (JSON files)
│   ├── error-handling.json
│   └── retry-strategy.json
├── anti-patterns/      # What to avoid
│   └── silent-catches.json
├── principles/         # Guiding rules
├── workflows/          # Step-by-step procedures
└── manifest.json       # Pack metadata
```

Each entry file contains a single knowledge entry:

```json
{
  "title": "Consistent API Error Format",
  "description": "All API errors must return { error, code, details }.",
  "type": "pattern",
  "severity": "critical",
  "domain": "backend",
  "tags": ["api", "error-handling"]
}
```

The `manifest.json` declares the pack:

```json
{
  "name": "my-backend-patterns",
  "version": "1.0.0",
  "description": "Backend patterns for API development",
  "domains": ["backend", "security"],
  "entryCount": 15
}
```

### Available tiers

| Tier | Source | Cost |
|------|--------|------|
| **Starter** | Ships with every agent | Free |
| **Community** | npm registry | Free |

The starter pack gives your agent useful knowledge from day one. Community packs extend it with domain-specific expertise contributed by other developers.

## Upgrading

### Check for updates

```bash
npx @soleri/cli upgrade --check
```

### Upgrade the CLI

```bash
npx @soleri/cli upgrade
```

### Upgrade @soleri/core

In your agent's directory:

```bash
npm update @soleri/core
npm run build
npm test
```

Core upgrades are backward-compatible within the same major version. Your agent's custom code, persona, and vault data are preserved.

## Governance policies

Control how strictly knowledge enters your vault:

```bash
npx @soleri/cli governance --preset strict      # All captures require approval
npx @soleri/cli governance --preset moderate    # Auto-approve suggestions, review critical
npx @soleri/cli governance --preset permissive  # Auto-approve everything
```

### Preset defaults

| Preset | Suggestions | Warnings | Critical | Quota |
|--------|------------|----------|----------|-------|
| **permissive** | Auto-approve | Auto-approve | Auto-approve | No limit |
| **moderate** | Auto-approve | Propose for review | Propose for review | 50/domain |
| **strict** | Propose for review | Propose for review | Propose for review | 30/domain |

### What governance controls

- **Quotas** — maximum entries per domain or type, prevents unbounded vault growth
- **Retention** — how long unused entries survive before decay candidates are flagged
- **Auto-capture** — which severity levels auto-approve vs. require proposal review
- **Duplicate detection** — similar entries are rejected or proposed for merging

Start with `moderate` — it balances quality with convenience. Move to `strict` if your team has many contributors and you want to review every new pattern before it becomes active.

### View current policy

```bash
npx @soleri/cli governance --show
```

## Project linking

Link related projects to share knowledge across them:

> **You:** "Link this project to ../api-server as related"

Link types:

| Type | Meaning | Direction |
|------|---------|-----------|
| `related` | Same domain or team — both projects can search each other | Bidirectional |
| `parent` | This project derives from another | Unidirectional |
| `child` | Another project derives from this one | Unidirectional |
| `fork` | Code fork | Unidirectional |

Linked projects are included in cross-project searches with weighted relevance. See [Cross-Project Knowledge](/docs/guides/cross-project-knowledge/) for the full guide.

---

_Next: [Cognee Integration](/docs/guides/cognee/) — add vector search and knowledge graphs for deeper intelligence. See also [CLI Reference](/docs/cli-reference/) for all command details._
