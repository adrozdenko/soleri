---
title: Extending Your Agent
description: Add domains, install knowledge packs, configure hooks, and upgrade your Soleri agent.
---

Your agent is designed to grow. Here's how to extend it beyond the initial scaffold.

## Add a Knowledge Domain

Domains are expertise areas. Each domain gets its own facade with 5 operations (search, capture, get, list, remove) and its own knowledge partition in the vault.

```bash
npx @soleri/cli add-domain security
```

This:
1. Creates a domain facade registered with the MCP server
2. Adds the domain to your agent's configuration
3. Rebuilds the facade registry

You can add as many domains as you need:

```bash
npx @soleri/cli add-domain infrastructure
npx @soleri/cli add-domain testing
npx @soleri/cli add-domain performance
```

### Custom Domain Knowledge

After adding a domain, seed it with knowledge:

```bash
npx @soleri/cli install-knowledge ./bundles/security-patterns
```

Or capture knowledge interactively through your agent:

```
"Capture a critical security pattern:
  Title: Always sanitize user input before database queries
  Tags: sql-injection, input-validation"
```

## Knowledge Packs

Knowledge packs are bundles of pre-built expertise you can install into your agent.

### Installing a Pack

```bash
npx @soleri/cli install-knowledge <path-or-package>
```

Packs can be:
- A local directory with JSON/markdown knowledge entries
- An npm package following the Soleri knowledge pack format

### What's in a Pack

A knowledge pack contains typed entries:

```
my-pack/
├── patterns/          # Proven approaches
├── anti-patterns/     # What to avoid
├── principles/        # Guiding rules
├── workflows/         # Step-by-step procedures
└── manifest.json      # Pack metadata
```

### Available Tiers

| Tier | Source | Cost |
|------|--------|------|
| **Starter** | Ships with every agent | Free |
| **Community** | npm registry | Free |

## Hook Packs

Hooks are quality gates that run automatically during development. They catch common mistakes before they reach your codebase.

### Install All Hooks

```bash
npx @soleri/cli hooks add-pack full
```

### Available Hooks

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

### Editor Integration

```bash
npx @soleri/cli hooks add claude-code    # Claude Code
npx @soleri/cli hooks add cursor         # Cursor
npx @soleri/cli hooks add vscode         # VS Code
```

## Upgrading

### Check for Updates

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

## Governance Policies

Control how knowledge enters your agent's vault.

### Presets

```bash
npx @soleri/cli governance --preset strict     # All captures require approval
npx @soleri/cli governance --preset moderate   # Auto-approve suggestions, review critical
npx @soleri/cli governance --preset permissive # Auto-approve everything
```

### View Current Policy

```bash
npx @soleri/cli governance --show
```

Governance controls:
- **Quotas** — max entries per domain, per type
- **Retention** — how long unused entries survive before decay
- **Auto-capture** — which severity levels auto-approve

## Project Linking

Link related projects to share knowledge across them:

```
"Link this project to ../api-server as related"
"Link this project to ../shared-lib as parent"
```

Link types:

| Type | Meaning | Direction |
|------|---------|-----------|
| `related` | Same domain | Bidirectional |
| `parent` | Derives from another | Unidirectional |
| `child` | Another derives from this | Unidirectional |
| `fork` | Code fork | Unidirectional |

Linked projects are included in cross-project searches with weighted relevance.
