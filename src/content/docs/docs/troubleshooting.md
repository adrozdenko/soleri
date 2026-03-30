---
title: Troubleshooting
description: Common issues and solutions for Soleri agents.
---

## Installation issues

### `command not found` after `npm create soleri`

Stale npx cache. Clear it and retry:

```bash
rm -rf ~/.npm/_npx
npm create soleri@latest my-agent
```

### `better-sqlite3` compilation fails

`better-sqlite3` is an optional dependency — scaffolding works even if it fails to compile. You only need it when running the knowledge engine.

If you need it:
- **macOS:** `xcode-select --install`
- **Linux:** `sudo apt-get install -y build-essential python3`
- **Windows:** Install Visual Studio Build Tools or use WSL

### Agent created in the wrong directory

Agents scaffold in your current working directory. Use `--dir <path>` to override:

```bash
npm create soleri my-agent --dir ~/projects
```

## Agent not appearing in your AI editor

You connected your agent but your AI editor doesn't see it.

- **Restart your AI editor** — MCP servers are loaded at startup
- **Check `.mcp.json` path** — must point to the correct agent location
- **Run `npx @soleri/cli install --target claude`** to re-register
- **Run `npx @soleri/cli doctor`** for a full diagnostic

## Searches return no results

Your vault has entries but search returns empty.

- The vault might be empty — check with "Show me vault stats"
- Search uses TF-IDF — very short queries (1-2 words) may not match well. Try more specific queries
- Domain filter might be too narrow — try searching without a domain restriction
- Run "Rebuild brain intelligence" to reindex the TF-IDF vocabulary after bulk imports

## Knowledge not persisting between sessions

Captured patterns disappear after restarting your AI editor.

- Verify the agent's data directory exists and is writable
- Check that `vault.db` exists in your agent's data directory
- If using development mode (`npx @soleri/cli dev`), ensure the data directory isn't inside a temp folder
- Run `npx @soleri/cli doctor` to check vault health

## Hooks not running

Quality gates aren't blocking violations.

- Verify hooks are installed: `npx @soleri/cli hooks list`
- Check editor integration: `npx @soleri/cli hooks add claude-code`
- Hooks require the agent to be running — they're checked via MCP tool calls
- Some hooks only apply to specific file types (e.g., `no-any-types` only checks `.ts` files)

## Plan stuck in executing state

A plan shows "executing" but you've finished the work.

- Plans need explicit completion: ask your agent "Complete the plan" or "Reconcile the plan"
- If the plan ID is lost, ask "List plans" to find it
- Plans in `executing` state don't expire — they wait for you to come back
- You can also ask "What plans are in progress?" to see stuck plans

## Vault growing too large

Your vault has hundreds of entries, searches are slow or noisy.

- Run a vault health audit: "Run a vault health audit"
- Enable governance if not already set: `npx @soleri/cli governance --preset moderate`
- The curator can identify duplicates: "Find duplicate entries in the vault"
- Remove unused entries: check the vault age report with "Show vault age report"

## Cross-project search not finding entries

Linked projects exist but their entries don't appear in searches.

- Verify the link exists: "Show project links"
- Links are path-based — if you moved a project, the link may be broken. Re-link it
- Cross-project search must be explicitly requested: "Search across all projects for..."
- The other project's vault must contain entries — an empty linked vault returns nothing

## Still stuck?

Run the full diagnostic:

```bash
npx @soleri/cli doctor
```

This checks Node.js version, npm status, agent context, vault health, CLAUDE.md status, and hook configuration.

If nothing above resolves your issue, reach out at [hello@soleri.ai](mailto:hello@soleri.ai) or open an issue on [GitHub](https://github.com/adrozdenko/soleri/issues).

---

_Back to [Getting Started](/docs/getting-started/) or see [CLI Reference](/docs/cli-reference/) for all available commands._
