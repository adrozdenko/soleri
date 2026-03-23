# Version Compatibility Contract

Soleri packages version independently but must remain compatible. This document defines what breaks, what's safe, and how to verify.

## Packages

| Package            | Role             | Versioning                                               |
| ------------------ | ---------------- | -------------------------------------------------------- |
| `@soleri/core`     | Engine runtime   | Semver — breaking changes = major bump                   |
| `@soleri/forge`    | Agent scaffolder | Follows core major version                               |
| `@soleri/cli`      | Developer CLI    | Follows core major version                               |
| `@soleri/domain-*` | Domain packs     | Independent semver, declares `@soleri/core` peer dep     |
| Knowledge packs    | Local packs      | `soleri-pack.json` manifest with optional `engine` field |

## Compatibility Rules

### Rule 1: All first-party packages share a major version

`@soleri/core`, `@soleri/forge`, and `@soleri/cli` are released together. A major version bump in core means a major bump in forge and cli.

### Rule 2: Domain packs declare peer dependency on core

Every `@soleri/domain-*` package must declare:

```json
"peerDependencies": {
  "@soleri/core": "^8.0.0"
}
```

The caret range (`^`) allows minor/patch updates. A new core major version requires domain packs to release a compatible version.

### Rule 3: Vault format is versioned

The vault database tracks its schema version via SQLite `PRAGMA user_version`. The engine checks this on startup:

- **Fresh database** — stamped with current format version
- **Compatible version** — proceeds normally
- **Newer than engine** — throws error with upgrade guidance
- **Older than engine** — future: run migration scripts

Current format version: **1** (introduced in v8.0.0)

### Rule 4: Knowledge packs can declare engine requirement

The `engine` field in `soleri-pack.json` specifies the minimum engine version:

```json
{
  "engine": ">=8.0.0"
}
```

This is validated at install time. Packs without `engine` are assumed compatible.

## What Constitutes a Breaking Change

### Major version bump required

- Vault schema changes (new required columns, removed tables, renamed fields)
- `PackRuntime` interface changes (added required methods, removed methods)
- `DomainPack` interface changes (changed `onActivate` signature)
- Engine module suffix changes (tool names change)
- Removed ops from semantic facades

### Minor version bump (non-breaking)

- New optional fields on existing types
- New ops added to existing facades
- New engine modules (new MCP tools)
- New `PackRuntime` optional methods
- Performance improvements to FTS/brain

### Patch version bump

- Bug fixes
- Documentation updates
- Internal refactors with no API changes

## Compatibility Matrix

| Core | Forge | CLI | Domain Packs   | Vault Format |
| ---- | ----- | --- | -------------- | ------------ |
| 8.x  | 8.x   | 8.x | peer: `^8.0.0` | 1            |

## Verification

```bash
# Check all package versions
soleri agent status

# Validate installed packs against engine
soleri pack list

# Check vault format
# (automatic on engine start — errors if incompatible)
```
