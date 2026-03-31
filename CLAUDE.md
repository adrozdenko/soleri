# Soleri

## Quick Reference

| Action | Command |
| ------ | ------- |
| Build | `npm run build` |
| Test (unit) | `npm test` |
| Test (e2e) | `npm run test:e2e` |
| Lint | Pre-commit hooks (oxlint, oxfmt, cspell, secretlint) |

## Critical Rules

- Agent CLAUDE.md files are **auto-generated** — never edit manually. Edit `shared-rules.ts` or `instructions/*.md` instead.
- Zero new npm dependencies in `@soleri/core` — use Node.js built-ins.
- When changing user-facing behavior, update `packages/forge/src/templates/shared-rules.ts` so scaffolded agents know about it.
- Skills install to `~/.claude/skills/<name>/SKILL.md` (not legacy `~/.claude/commands/`).
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`.

## Architecture

Two-layer split: file-tree agents (shell) + `@soleri/core` knowledge engine (brain).
Consult the vault for full architecture docs, package map, testing protocol, and conventions.

## Packages

| Package | Path | Role |
| ------- | ---- | ---- |
| `@soleri/core` | `packages/core/` | Knowledge Engine |
| `@soleri/forge` | `packages/forge/` | Agent scaffolder |
| `@soleri/cli` | `packages/cli/` | Developer CLI |
| `create-soleri` | `packages/create-soleri/` | npm create shorthand |
| `@soleri/domain-*` | `packages/domain-*/` | Domain packs |

## Testing

Three layers — all must pass before merge: unit (`npm test`), e2e (`npm run test:e2e`), smoke (manual scaffold + run).
Run e2e after any change to core facades, forge templates, or CLI commands.
