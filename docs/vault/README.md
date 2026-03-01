# Project Knowledge Vault

A collection of patterns and anti-patterns specific to this codebase, designed to help developers and AI agents understand project-specific best practices.

## Purpose

This vault serves as:
1. **Documentation** - Human-readable guides for developers
2. **Training Data** - Machine-parseable patterns for AI agents
3. **Rule Source** - Foundation for automated linting rules and hooks

## Structure

```
docs/vault/
├── patterns/              # What TO do
│   └── {category}/
└── anti-patterns/         # What NOT to do
    └── {category}/
```

## Severity Levels

| Severity | Meaning |
|----------|---------|
| `critical` | Will cause build failures or runtime errors |
| `warning` | May cause subtle bugs or maintenance issues |
| `suggestion` | Recommended for consistency or performance |

## Categories

- prisma, typescript, react, express, monorepo
- testing, styling, accessibility, performance, security
