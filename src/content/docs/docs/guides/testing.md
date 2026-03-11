---
title: Testing
description: How to run and write tests for Soleri — unit tests, E2E integration tests, and smoke tests.
---

Soleri uses three layers of testing to ensure every engine feature works correctly — from individual modules to full cross-package integration.

## Quick Reference

```bash
npm test              # Unit tests (core, forge, CLI)
npm run test:e2e      # E2E integration tests (124 tests, 10 files)
```

## Test Layers

| Layer | Command | Scope | Speed |
|-------|---------|-------|-------|
| **Unit** | `npm test` | Individual modules within each package | Fast (~10s) |
| **E2E** | `npm run test:e2e` | Cross-package integration, real databases, real transports | Medium (~70s) |
| **Smoke** | Manual | Full scaffold → build → run cycle with a real agent | Slow (~2min) |

### When to run what

| Changed | Unit | E2E | Smoke |
|---------|------|-----|-------|
| `@soleri/core` engine module | Yes | Yes | — |
| `@soleri/core` facade | Yes | Yes | — |
| `@soleri/forge` template | Yes | Yes | Yes |
| `@soleri/cli` command | Yes | Yes | — |
| Transport layer | — | Yes | — |
| Before a release | Yes | Yes | Yes |

## Unit Tests

Each package has its own test suite:

```bash
npm test                                    # All packages
npm run test --workspace=@soleri/core       # Core engine only
npm run test --workspace=@soleri/forge      # Forge templates only
npm run test --workspace=@soleri/cli        # CLI commands only
```

Unit tests verify individual modules in isolation — vault operations, brain scoring, plan state machine, scaffold output, CLI argument parsing.

## E2E Tests

The E2E suite (`e2e/`) tests cross-package integration with real SQLite databases, real MCP transport, and real scaffolded agents.

```bash
npm run test:e2e
```

### What's covered

| Test File | Tests | What it verifies |
|-----------|-------|------------------|
| `scaffold-and-build` | 7 | Template generates → npm install → TypeScript compiles |
| `full-pipeline` | 20 | All 13+ engine facades through the dispatch layer |
| `mcp-transport` | 7 | Over-the-wire MCP via real stdio subprocess |
| `scaffold-edge-cases` | 10 | Many domains, telegram, tones, skills filter, duplicates |
| `persistence` | 4 | Vault/brain/plan data survives runtime close/reopen |
| `curator-brain-governance` | 25 | Health audits, learning loop, policy lifecycle, orchestrate |
| `concurrent-and-performance` | 10 | Parallel facade calls, 500-entry bulk ops, latency bounds |
| `cli-commands` | 12 | Non-interactive create, list, doctor, add-domain, governance |
| `transports` | 15 | SessionManager, RateLimiter, HTTP/SSE, WebSocket |
| `skills-and-domains` | 14 | SKILL.md frontmatter validation, domain data integrity |

### How E2E tests work

E2E tests use two patterns depending on what they're testing:

**In-process facade testing** — Creates a real `AgentRuntime` with an in-memory vault, captures facade handlers via a mock MCP server, and calls ops directly. Fast (~30ms for 25 tests) and exercises the full engine stack without subprocess overhead.

```ts
const runtime = createAgentRuntime({
  agentId: 'test',
  vaultPath: ':memory:',
});
const facades = createSemanticFacades(runtime, 'test');
```

**Over-the-wire MCP testing** — Scaffolds a real agent, builds it, spawns it as a child process, and communicates via MCP stdio transport. Verifies the complete pipeline from scaffold through production runtime.

### Writing new E2E tests

E2E tests live in the `e2e/` directory and use [Vitest](https://vitest.dev/). The E2E config (`e2e/vitest.config.ts`) sets a 120-second timeout and runs tests in a single fork.

**Adding a test file:**

1. Create `e2e/your-feature.test.ts`
2. Import from `@soleri/core` or `@soleri/forge/lib` — path aliases are configured
3. Use `createAgentRuntime({ vaultPath: ':memory:' })` for in-process tests
4. Clean up temp directories in `afterAll`

**Tips:**
- Use `:memory:` vaultPath for fast in-process tests
- Use `tmpdir()` for file-backed tests that verify persistence
- Set generous timeouts for scaffold tests (60s+ for `beforeAll`)
- Random port allocation for transport tests to avoid conflicts

## Smoke Tests

After any change to `@soleri/forge` templates, manually scaffold a real agent and verify it works end-to-end:

```bash
npx @soleri/cli create smoke-test
cd smoke-test-mcp
npm install
npm run build
npm test
```

This catches issues that E2E tests might miss — like template syntax errors that only surface during a full build, or generated test failures.

## CI

All unit and E2E tests run in CI on every push and pull request. The GitHub Actions workflow is at `.github/workflows/ci.yml`.

---

_Next: [Under the Hood](/docs/guides/under-the-hood/) — how the vault, brain, and memory actually work._
