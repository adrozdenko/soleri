---
title: Troubleshooting
description: Common issues and solutions for Soleri agents.
---

## Installation issues

### `command not found` after `npm create soleri`

This usually means a stale npx cache. Clear it and retry:

```bash
rm -rf ~/.npm/_npx
npm create soleri@latest my-agent
```

### `better-sqlite3` compilation fails

`better-sqlite3` is an optional dependency, so scaffolding works even if it fails to compile. You only need it when running the knowledge engine.

If you do need it:

| Platform | Fix |
|----------|-----|
| macOS | `xcode-select --install` |
| Linux | `sudo apt-get install -y build-essential python3` |
| Windows | Install Visual Studio Build Tools, or use WSL |

### `Cannot write to ~/.soleri` on first install

You're likely running a cached older version. Clear the npx cache and pin the latest version:

```bash
rm -rf ~/.npm/_npx
npm create soleri@latest my-agent
```

If the error persists, create the directory manually and retry:

```bash
mkdir -p ~/.soleri
npm create soleri my-agent
```

### Agent created in the wrong directory

Agents scaffold in your current working directory. Pass `--dir <path>` to override:

```bash
npm create soleri my-agent --dir ~/projects
```

## Agent not appearing in your AI editor

You connected your agent but your AI editor doesn't see it. A few things to check:

1. **Restart your AI editor.** MCP servers are loaded at startup.
2. **Check the `.mcp.json` path.** It must point to the correct agent location.
3. **Re-register** with `npx @soleri/cli install --target claude`.
4. **Run `npx @soleri/cli doctor`** for a full diagnostic.

## Searches return no results

Your vault has entries but search returns empty.

The vault might actually be empty. Check with "Show me vault stats" first. If entries exist, the issue is likely one of these: TF-IDF doesn't match well on very short queries (1-2 words), so try more specific terms. Your domain filter might be too narrow, so try searching without a domain restriction. After bulk imports, run "Rebuild brain intelligence" to reindex the TF-IDF vocabulary.

## Knowledge not persisting between sessions

Captured patterns disappear after restarting your AI editor.

Verify the agent's data directory exists and is writable, and check that `vault.db` exists inside it. If you're using development mode (`npx @soleri/cli dev`), make sure the data directory isn't inside a temp folder. Run `npx @soleri/cli doctor` to check vault health.

## Hooks not running

Quality gates aren't blocking violations.

First, verify hooks are installed with `npx @soleri/cli hooks list`. Then check editor integration with `npx @soleri/cli hooks add claude-code`. Hooks require the agent to be running since they're checked via MCP tool calls. Also note that some hooks only apply to specific file types (e.g., `no-any-types` only checks `.ts` files).

## Plan stuck in executing state

A plan shows "executing" but you've already finished the work.

Plans need explicit completion. Ask your agent "Complete the plan" or "Reconcile the plan". If the plan ID is lost, ask "List plans" to find it. Plans in `executing` state don't expire on their own; they wait for you to come back. You can also ask "What plans are in progress?" to see stuck plans.

## Vault growing too large

Your vault has hundreds of entries and searches are slow or noisy.

Run a vault health audit by asking "Run a vault health audit". If governance isn't enabled yet, set it with `npx @soleri/cli governance --preset moderate`. The curator can identify duplicates ("Find duplicate entries in the vault"), and you can check the vault age report to find unused entries worth removing ("Show vault age report").

## Cross-project search not finding entries

Linked projects exist but their entries don't appear in searches.

Verify the link exists with "Show project links". Links are path-based, so if you moved a project, the link may be broken and needs to be re-created. Cross-project search must be explicitly requested ("Search across all projects for..."). And of course, the other project's vault must actually contain entries; an empty linked vault returns nothing.

## Still stuck?

Run the full diagnostic:

```bash
npx @soleri/cli doctor
```

This checks Node.js version, npm status, agent context, vault health, CLAUDE.md status, and hook configuration.

If nothing above resolves your issue, reach out at [hello@soleri.ai](mailto:hello@soleri.ai) or open an issue on [GitHub](https://github.com/adrozdenko/soleri/issues).

---

_Back to [Getting Started](/docs/getting-started/) or see [CLI Reference](/docs/cli-reference/) for all available commands._
