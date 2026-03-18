# Contributing to Soleri

## Contribution Types

| Type | Review | Where |
|------|--------|-------|
| Bug fixes, typos | Standard PR | Anywhere |
| Engine features | RFC issue first, 2 maintainer reviews | `packages/core/` |
| Domain packs | Architecture review | `packages/domain-*/` |
| Knowledge packs | Domain expert review | `knowledge-packs/community/` |
| Skills & hooks | Quality review | Pack directories |

## Quick Start

```bash
git clone https://github.com/adrozdenko/soleri.git
cd soleri
npm install
npm run build
npm test
```

## Testing Requirements

All PRs must pass the full test suite. Do not submit a PR with failing tests.

### Test Layers

| Layer | Command | Count | What it covers |
|-------|---------|-------|----------------|
| Unit | `npm test` | ~2000 | Package-level tests (core, forge, CLI, domains, tokens) |
| E2E | `npm run test:e2e` | ~120 | Cross-package: facades, transports, scaffold, persistence, concurrency |
| Deadcode | `npm run deadcode:knip` | — | Unused files, exports, dependencies |

### What to Test by Contribution Type

**Engine changes** (`packages/core/`):
- Unit tests required for all new ops and modules
- E2E test if the change affects facades, transport, or pack loading
- Run `npm run deadcode:knip` to verify no dead exports introduced
- Vault search relevance: if changing FTS, run `vault-scaling.test.ts`

**Domain pack changes** (`packages/domain-*/`):
- Unit tests for algorithmic ops (contrast checking, code validation)
- Verify pack loads without error: `npm run build && npm test`
- Test graceful degradation: ops must work when `PackRuntime` has no project registered

**Knowledge contributions** (`knowledge-packs/`):
- Each entry needs: id, type, domain, title, description, severity, tags
- At least one of: example, counter_example, why, context
- Run pack validation: `soleri pack validate ./your-pack`

**Forge template changes** (`packages/forge/`):
- Scaffold test verifies generated output compiles
- Run full forge suite: `npm test --workspace=@soleri/forge`

### Brain & Probabilistic Testing

Brain intelligence produces probabilistic results (TF-IDF scoring, recency weighting). Tests should:
- Assert ranking order, not exact scores
- Use `toBeGreaterThan`/`toBeLessThan` for scores
- Seed deterministic test data (fixed timestamps, known vocabulary)
- Test at scale with `vault-scaling.test.ts` (10K entries, sub-50ms search)

## Code Standards

- TypeScript strict mode — no `any` types
- No protocol dependencies in `core/` — pure logic only
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- Branch naming: `feat/description`, `fix/description`, `docs/description`
- No AI attribution in commits

## Architecture Rules

- `@soleri/core` has zero MCP dependency in runtime logic (transport-agnostic)
- Domain packs receive `PackRuntime` (narrowed), not full `AgentRuntime`
- LLM calls use the model router — never hardcode provider or model
- Vault format changes require `FORMAT_VERSION` bump (see `version-compatibility.md`)
- All engine module names come from `ENGINE_MODULE_MANIFEST` (single source of truth)

## Contribution Flow

### Engine Features

1. Open an RFC issue describing the feature, motivation, and approach
2. Discuss with maintainers — get approval before coding
3. Submit PR with tests
4. Two maintainer reviews required

### Domain Packs

1. Implement the `DomainPack` interface (see `packages/domain-design/` for reference)
2. Declare `@soleri/core` peer dependency with correct major version
3. Include unit tests for all ops
4. Architecture review required

### Knowledge Packs

1. Create `soleri-pack.json` manifest
2. Add intelligence entries in `vault/` directory
3. Community packs go in `knowledge-packs/community/`
4. Domain expert review required
5. Can be promoted to starter pack after quality review

## Questions?

Open a [Discussion](https://github.com/adrozdenko/soleri/discussions) or file an [Issue](https://github.com/adrozdenko/soleri/issues).
