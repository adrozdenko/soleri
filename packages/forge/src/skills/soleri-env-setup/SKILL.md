---
name: soleri-env-setup
tier: default
description: 'Triggers: "setup environment", "post-clone setup", "broken build", "missing dependencies", "MODULE_NOT_FOUND". Detects project needs, diagnoses gaps, produces setup checklist.'
---

# Environment Setup

Detect what a project needs, diagnose what's missing, and produce an actionable setup checklist.

## Overview

Scan the project root for configuration files, detect the tech stack and dependencies, identify gaps between what's required and what's present, then generate ordered setup steps. Offer to execute each step.

## When to Use

- Just cloned a repo and need to get it running
- Getting errors after pulling changes (missing deps, env vars, DB migrations)
- Onboarding to an unfamiliar project
- Setting up a project on a new machine
- Docker/container environment not starting
- Missing `.env` file or environment variables

## Check Vault for Known Setup Patterns

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<tech stack> setup gotchas" }

YOUR_AGENT_core op:memory_search
  params: { query: "environment setup <project>" }
```

## Detection Phase

Scan the project root and identify:

### Package Managers & Dependencies

| File               | Stack   | Install Command                                              |
| ------------------ | ------- | ------------------------------------------------------------ |
| `package.json`     | Node.js | `npm install` / `yarn` / `pnpm install` (check for lockfile) |
| `requirements.txt` | Python  | `pip install -r requirements.txt`                            |
| `pyproject.toml`   | Python  | `pip install -e .` or `poetry install` or `uv sync`          |
| `Pipfile`          | Python  | `pipenv install`                                             |
| `Cargo.toml`       | Rust    | `cargo build`                                                |
| `go.mod`           | Go      | `go mod download`                                            |
| `Gemfile`          | Ruby    | `bundle install`                                             |
| `composer.json`    | PHP     | `composer install`                                           |

**Lockfile priority:** If a lockfile exists (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Pipfile.lock`, `poetry.lock`), use the matching package manager. Don't mix.

### Environment Variables

1. Check for `.env.example`, `.env.sample`, `.env.template`
2. Check for existing `.env` — if missing, copy from template
3. Parse template for required variables (lines without defaults or with placeholder values)
4. Flag variables that need real values (API keys, secrets, database URLs)
5. **If no template exists:** grep source for `process.env.`, `os.environ`, `env::var`, `os.Getenv` to discover env vars the project actually uses.

### Native Dependencies

| Indicator                                | What It Means                          |
| ---------------------------------------- | -------------------------------------- |
| `better-sqlite3`, `sqlite3` in deps      | Needs C++ compiler                     |
| `node-gyp` in deps or scripts            | Needs Python 3 + C++ toolchain         |
| `sharp` in deps                          | Needs `libvips`                        |
| `Cargo.toml` with `[build-dependencies]` | Needs Rust toolchain for build scripts |
| `setup.py` with `ext_modules`            | Needs C compiler for Python extensions |

### Databases

| File/Config                              | Database         | Setup Needed                 |
| ---------------------------------------- | ---------------- | ---------------------------- |
| `docker-compose.yml` with postgres/mysql | PostgreSQL/MySQL | Container + migrations       |
| `prisma/schema.prisma`                   | Prisma-managed   | `npx prisma migrate dev`     |
| `drizzle.config.*`                       | Drizzle-managed  | `npx drizzle-kit push`       |
| `alembic.ini`                            | SQLAlchemy       | `alembic upgrade head`       |
| `config/database.yml`                    | Rails            | `rails db:create db:migrate` |

### Infrastructure

| File                                          | What It Means                               |
| --------------------------------------------- | ------------------------------------------- |
| `docker-compose.yml`                          | Services to start with `docker compose up`  |
| `Dockerfile`                                  | Can build container locally                 |
| `Makefile`                                    | Check for `setup`, `install`, `dev` targets |
| `.tool-versions` / `.node-version` / `.nvmrc` | Required runtime version                    |
| `turbo.json` / `nx.json` / `lerna.json`       | Monorepo setup                              |

### IDE & Tool Integration

| File                     | Integration                  |
| ------------------------ | ---------------------------- |
| `.vscode/`               | VS Code settings, extensions |
| `.mcp.json` / `mcp.json` | MCP server config            |
| `.editorconfig`          | Cross-editor formatting      |

## Diagnosis Phase

After detection, check what's present vs needed:

1. **Runtime version** — does installed version match version files?
2. **Dependencies installed?** — does `node_modules/`, `venv/`, `vendor/` exist?
3. **Native build tools?** — are compilers available?
4. **Env file present?** — does `.env` exist when a template does?
5. **Database reachable?** — can the configured DB URL connect?
6. **Docker running?** — is Docker daemon running if needed?
7. **Build artifacts** — does the project need an initial build step?

## Checklist Generation

Produce steps in dependency order:

```
## Setup Checklist

1. [ ] Install runtime (Node 20.x via nvm)
2. [ ] Install dependencies (pnpm install)
3. [ ] Copy environment file (cp .env.example .env)
4. [ ] Fill in required env vars: DATABASE_URL, API_KEY
5. [ ] Start Docker services (docker compose up -d)
6. [ ] Run database migrations (npx prisma migrate dev)
7. [ ] Build the project (pnpm build)
8. [ ] Start dev server (pnpm dev)
```

**Order matters:** runtime -> deps -> env -> infrastructure -> migrations -> build -> run.

After presenting the checklist, offer: "Want me to run these steps for you?"

## Execution Phase

If the user says yes, execute steps sequentially. Stop and ask if:

- A step fails
- A step requires manual input (API keys, passwords)
- A step would modify system-level config (global installs, PATH changes)

## Monorepo Handling

If monorepo detected (turbo.json, nx.json, pnpm-workspace.yaml):

1. Install root dependencies first
2. Ask which package/app the user wants to work on
3. Check for package-specific setup
4. Run package-specific setup after root

## Common Mistakes

- **Wrong package manager** — using `npm install` when `yarn.lock` exists. Always check lockfiles first.
- **Skipping env file** — project crashes on first API call. Always check for templates.
- **Missing native build tools** — `npm install` fails with gyp errors. Check before installing.
- **Missing runtime version** — subtle bugs from wrong Node/Python version.
- **Docker not running** — cryptic "connection refused" errors.
- **Stale dependencies** — after `git pull`, always re-install if lockfile changed.

## Capture Setup Learnings

If any non-obvious steps or workarounds were needed:

```
YOUR_AGENT_core op:capture_knowledge
  params: { title: "<gotcha>", description: "<what happened and the fix>", type: "anti-pattern", tags: ["env-setup", "<tech-stack>"] }
```

## Agent Tools Reference

| Op                   | When to Use                        |
| -------------------- | ---------------------------------- |
| `search_intelligent` | Check vault before starting        |
| `memory_search`      | Find similar past experiences      |
| `capture_knowledge`  | Persist patterns worth remembering |
