---
title: Extending Your Agent
description: Quick links for adding domains, knowledge packs, hooks, and upgrades.
---

This page consolidates the key extension commands. For detailed explanations and configuration options, see [Customizing Your Agent](/docs/guides/customizing/).

## Quick reference

### Add a domain

```bash
npx @soleri/cli add-domain <name>
```

Creates a domain facade with 5 operations and adds the domain to your agent. [Details →](/docs/guides/customizing/#adding-domains)

### Install knowledge

```bash
npx @soleri/cli install-knowledge <path-or-package>
```

Imports a knowledge bundle (local directory or npm package) into your vault. [Details →](/docs/guides/customizing/#knowledge-packs)

### Install hooks

```bash
npx @soleri/cli hooks add-pack full
npx @soleri/cli hooks add claude-code
```

Adds quality gate hooks and editor integration. [Details →](/docs/guides/customizing/#hooks)

### Set governance

```bash
npx @soleri/cli governance --preset moderate
```

Controls how knowledge enters your vault. [Details →](/docs/guides/customizing/#governance-policies)

### Upgrade

```bash
npx @soleri/cli upgrade --check    # Check for updates
npx @soleri/cli upgrade            # Upgrade CLI
npm update @soleri/core            # Upgrade engine
```

[Details →](/docs/guides/customizing/#upgrading)

### Link projects

```
"Link this project to ../api-server as related"
```

Share knowledge across related codebases. [Details →](/docs/guides/customizing/#project-linking)

---

_For full command documentation, see [CLI Reference](/docs/cli-reference/). For configuration details, see [Customizing Your Agent](/docs/guides/customizing/)._
