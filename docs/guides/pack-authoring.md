# Pack Authoring Guide

Create and publish Soleri packs — reusable bundles of knowledge, ops, and skills that any agent can install.

## Pack Types

| Type | Contains | Example |
|------|----------|---------|
| **domain** | Ops, facades, knowledge, lifecycle hooks | `@soleri/domain-design` |
| **knowledge** | Vault entries only | `@soleri/knowledge-react` |
| **skills** | Skill markdown files | `@soleri/skills-tdd` |
| **hooks** | Lifecycle scripts + settings.json hooks | `@soleri/hooks-notification` |

## Quick Start

### 1. Create the pack

```bash
mkdir my-pack && cd my-pack
npm init -y
```

### 2. Add the manifest

Create `soleri-pack.json`:

```json
{
  "name": "my-pack",
  "version": "1.0.0",
  "type": "knowledge",
  "tier": "community",
  "description": "What this pack provides",
  "domains": ["my-domain"],
  "vault": {
    "path": "vault/"
  }
}
```

### 3. Add knowledge entries

Create `vault/patterns.json`:

```json
[
  {
    "type": "pattern",
    "domain": "my-domain",
    "title": "My Pattern Title",
    "severity": "critical",
    "description": "What to do and why.",
    "tags": ["my-domain", "best-practice"]
  }
]
```

### 4. Publish

```bash
npm publish --access public
```

### 5. Install in any agent

```bash
soleri pack add my-pack
```

## Domain Packs (with ops)

Domain packs add custom operations to the agent's MCP tool surface.

### Package structure

```
my-domain-pack/
  package.json          # npm package with @soleri/core as peerDependency
  src/
    index.ts            # Default export: DomainPack object
  soleri-pack.json      # Pack manifest
  vault/                # Optional knowledge bundle
    patterns.json
```

### Defining ops

```typescript
import type { DomainPack, PackRuntime } from '@soleri/core';

const pack: DomainPack = {
  name: 'my-domain',
  version: '1.0.0',
  domains: ['my-domain'],
  ops: [
    {
      name: 'my_op',
      description: 'What this op does',
      auth: 'read',
      handler: async (params, runtime) => {
        return { success: true, data: { result: 'hello' } };
      },
    },
  ],
  onActivate: async (packRuntime: PackRuntime) => {
    // Optional: run setup when pack loads
  },
};

export default pack;
```

### Schema validation

Ops can define a schema using any library with `.parse()` and `.safeParse()` methods (Zod works, but is not required):

```typescript
{
  name: 'search',
  description: 'Search my domain',
  auth: 'read',
  schema: {
    parse: (input: unknown) => { /* validate and return */ },
    safeParse: (input: unknown) => { /* return { success, data } or { success, error } */ },
  },
  handler: async (params) => { /* ... */ },
}
```

## Pack Tiers

| Tier | Description |
|------|-------------|
| `default` | Ships with the engine |
| `community` | Free, published to npm (default for new packs) |
| `premium` | Gated (future — all unlocked today) |

## CLI Commands

```bash
soleri pack list                    # All available packs
soleri pack list --installed        # Installed packs
soleri pack list --type domain      # Filter by type
soleri pack list --tier community   # Filter by tier
soleri pack add <name>              # Install a pack
soleri pack remove <name>           # Uninstall a pack
soleri pack info <name>             # Pack details
soleri pack seed <topic>            # LLM-generate a knowledge pack
```

## Testing Your Pack

```bash
# Validate the manifest
node -e "
  const pack = require('./soleri-pack.json');
  console.log('Name:', pack.name);
  console.log('Type:', pack.type);
  console.log('Domains:', pack.domains);
"

# For domain packs, run the engine with your pack configured in agent.yaml:
# packs:
#   - name: my-pack
#     package: ./path/to/my-pack
```

## Best Practices

- **One domain per pack** — keeps packs focused and composable
- **Tag everything** — vault entries need good tags for search and linking
- **Use severity levels** — `critical` for must-follow rules, `suggestion` for nice-to-haves
- **Include anti-patterns** — what NOT to do is as valuable as what to do
- **Keep packs small** — 10-50 vault entries per pack is ideal
- **Declare dependencies** — use `requires` in your DomainPack if you depend on another pack
