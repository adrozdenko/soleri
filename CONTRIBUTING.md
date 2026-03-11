# Contributing to Soleri

Thank you for your interest in contributing to Soleri! This guide explains how to contribute depending on the type of change you're making.

## Quick Fixes

Bug fixes, typos, documentation improvements — standard PR process:

1. Fork the repo
2. Create a branch (`fix/description`)
3. Make your change
4. Ensure tests pass: `npm test`
5. Submit a PR

## Engine Features

For new features in the core engine (vault, brain, planning, memory, sessions):

1. **Open an RFC issue first** — describe the feature, motivation, and proposed approach
2. Discuss with maintainers
3. Once approved, submit a PR
4. Two maintainer reviews required

## Domain Modules

To contribute a new domain module (e.g., `devops`, `data-science`):

1. Review existing domains in `domains/official/` for patterns
2. New community domains go in `domains/community/`
3. Must implement the `DomainModule` interface
4. Include tests and documentation
5. Architecture review required

Community domains can be promoted to official after sustained quality and adoption.

## Persona Templates

To contribute a new persona template:

1. Review existing personas in `personas/official/` for structure
2. New community personas go in `personas/community/`
3. Must include `persona.yaml` with identity, voice, domains, intent rules
4. Include a starter vault with at least 10 patterns
5. Quality and voice review required

## Knowledge Entries

To contribute knowledge to a knowledge pack:

1. Review the submission format in `knowledge-packs/CONTRIBUTING.md`
2. Community knowledge goes in `knowledge-packs/community/`
3. Each entry must include: title, description, at least one example, a "why" explanation
4. Domain expert review required
5. Community packs can be promoted to official after editorial review

**Note:** Official knowledge packs are curated by maintainers only. Community contributions go through the community namespace first.

## Development Setup

```bash
git clone https://github.com/adrozdenko/soleri.git
cd soleri
npm install
npm run build
npm test              # Unit tests
npm run test:e2e      # E2E tests (124 tests across 10 files)
```

## Testing

All PRs must pass both unit and E2E tests.

| Layer | Command | What it covers |
|-------|---------|----------------|
| Unit | `npm test` | Package-level tests in core, forge, CLI |
| E2E | `npm run test:e2e` | Cross-package integration — facades, transports, CLI, scaffold, persistence, concurrency |

Run E2E tests after changes to `@soleri/core` (engine), `@soleri/forge` (templates), or `@soleri/cli` (commands).

## Code Standards

- TypeScript strict mode
- No protocol dependencies in `core/` — pure logic only
- Tests required for all new functionality
- Conventional commit messages: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`

## Branch Naming

- `feat/description` — new features
- `fix/description` — bug fixes
- `docs/description` — documentation
- `refactor/description` — code refactoring

## Questions?

Visit [soleri.ai](https://soleri.ai), open a [Discussion](https://github.com/adrozdenko/soleri/discussions), or file an [Issue](https://github.com/adrozdenko/soleri/issues).
