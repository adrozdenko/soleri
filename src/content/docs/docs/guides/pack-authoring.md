---
title: 'Creating Packs'
description: 'Build your own extension packs (knowledge, skills, hooks, or bundles) and share them with others.'
---

Packs are the extension system for Soleri agents. A pack bundles knowledge entries, skill workflows, editor hooks, or all three into a single installable unit. Create packs for your team, publish them to npm for the community, or keep them local. For background on the agent file tree and how packs fit into it, see [Your Agent](/docs/your-agent/).

## Pack types

| Type          | What it contains                                    | Use case                                        |
| ------------- | --------------------------------------------------- | ----------------------------------------------- |
| knowledge | Vault entries: patterns, anti-patterns, principles | Domain expertise (React patterns, API standards) |
| skills    | SKILL.md workflow files                             | Reusable workflows (review, deploy, debug)      |
| hooks     | Editor hook scripts                                 | Quality gates (no-console-log, semantic-html)   |
| bundle    | Multiple content types combined                     | Complete capability packages                    |

## Scaffolding a new pack

```bash
npx @soleri/cli pack create
```

The wizard asks for:

1. Pack name, e.g. `my-react-patterns`
2. Pack type: knowledge, skills, hooks, or bundle
3. Description of what the pack provides
4. Tier: community (free, published to npm) or premium (Soleri platform, coming soon)
5. Author: your name or handle

This creates a directory with the pack structure:

```
my-react-patterns/
├── soleri-pack.json        # Pack manifest (required)
├── vault/                  # Knowledge entries (if knowledge or bundle)
│   └── patterns.json
├── skills/                 # Skill files (if skills or bundle)
│   └── example.md
└── hooks/                  # Hook files (if hooks or bundle)
    └── example.md
```

## The manifest

Every pack requires a `soleri-pack.json` at its root:

```json
{
  "id": "my-react-patterns",
  "version": "1.0.0",
  "description": "React patterns for hooks and state management",
  "tier": "community",
  "author": "@username",
  "license": "MIT",
  "soleri": ">=2.0.0",
  "vault": { "dir": "vault" },
  "skills": { "dir": "skills" },
  "hooks": { "dir": "hooks" }
}
```

| Field       | Required | Description                                         |
| ----------- | -------- | --------------------------------------------------- |
| `id`        | Yes      | Unique pack identifier                              |
| `version`   | Yes      | Semver version string                               |
| `description` | No     | What the pack provides                              |
| `tier`      | No       | `community` (default) or `premium`                  |
| `soleri`    | No       | Engine compatibility range                          |
| `vault`     | No       | Points to the vault entries directory                |
| `skills`    | No       | Points to the skills directory                      |
| `hooks`     | No       | Points to the hooks directory                       |

Only include the content sections (`vault`, `skills`, `hooks`) that your pack provides.

## Adding knowledge entries

Place JSON files in the vault directory. Each file contains an array of knowledge entries:

```json
[
  {
    "title": "Use useCallback for event handlers passed as props",
    "description": "Wrap event handler functions in useCallback when passing them to child components to prevent unnecessary re-renders.",
    "type": "pattern",
    "severity": "warning",
    "domain": "react",
    "tags": ["hooks", "performance", "memoization"]
  },
  {
    "title": "Avoid useEffect for derived state",
    "description": "If a value can be computed from existing state or props, compute it during rendering instead of using useEffect to sync it.",
    "type": "anti-pattern",
    "severity": "critical",
    "domain": "react",
    "tags": ["hooks", "state-management"]
  }
]
```

Supported entry types: `pattern`, `anti-pattern`, `principle`, `workflow`, `decision`, `reference`.

## Adding skills

Place markdown files in the skills directory. Each `.md` file is a skill workflow:

```markdown
# React Component Review

Review a React component for hooks best practices, accessibility, and performance.

## Steps

1. Check for missing useCallback/useMemo on expensive computations
2. Verify all useEffect dependencies are correct
3. Check for accessibility: semantic HTML, ARIA attributes, keyboard navigation
4. Look for unnecessary re-renders from inline object/function creation
```

## Validating a pack

Before publishing, validate your pack:

```bash
npx @soleri/cli pack validate ./my-react-patterns
```

The validator checks:

- `soleri-pack.json` exists and contains valid JSON
- Required fields (`id`, `version`) are present
- Version follows semver format
- Referenced content directories exist
- Pack naming conventions are followed

## Publishing to npm

```bash
npx @soleri/cli pack publish ./my-react-patterns
```

This auto-generates a `package.json` from your manifest (if one does not exist) and runs `npm publish --access public`. Use `--dry-run` to preview without publishing.

The generated npm package name follows the convention `soleri-pack-{id}` (or uses the `id` directly if it already has an `@` scope).

## Installing packs

Others install your pack with:

```bash
npx @soleri/cli pack install my-react-patterns
```

Resolution order: local path, then built-in packs, then npm registry.

### Other pack commands

| Command                          | What it does                               |
| -------------------------------- | ------------------------------------------ |
| `npx @soleri/cli pack list`               | List installed packs                       |
| `npx @soleri/cli pack list --type skills` | Filter by type                             |
| `npx @soleri/cli pack info <id>`          | Show detailed pack info                    |
| `npx @soleri/cli pack remove <id>`        | Remove a pack (vault entries are preserved) |
| `npx @soleri/cli pack outdated`           | Check for npm updates                      |
| `npx @soleri/cli pack update`             | Update all packs to latest                 |
| `npx @soleri/cli pack search <query>`     | Search npm for packs                       |
| `npx @soleri/cli pack available`          | List available knowledge packs             |

## Lockfile

Installed packs are tracked in `soleri.lock` at the agent root. This file records pack versions, sources, integrity hashes, and content counts. Commit it to version control for reproducible setups across your team.

Use `--frozen` mode in CI to ensure only lockfile-pinned versions are installed:

```bash
npx @soleri/cli pack install my-react-patterns --frozen
```

---

_Next: [Skills Catalog](/docs/guides/skills-catalog/) for all available skills. See also [Domain Packs](/docs/guides/domain-packs/) for specialized intelligence modules, [Extending Your Agent](/docs/extending/) for custom ops and facades, and the [CLI Reference](/docs/cli-reference/) for all `npx @soleri/cli pack` subcommands._
