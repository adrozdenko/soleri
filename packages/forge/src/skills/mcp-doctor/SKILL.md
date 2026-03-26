---
name: mcp-doctor
description: >
  Use when MCP servers fail to connect, tools are missing, or the user says "check MCP",
  "MCP not working", "server not connecting", "tools missing", "heal MCP", "fix MCP",
  "mcp doctor", "mcp status". Diagnoses and repairs MCP server connectivity issues.
---

# MCP Doctor — Diagnose and Heal MCP Connections

Systematically diagnose why MCP servers are not connecting and attempt to repair them.

## Phase 1: Inventory

Read the `.mcp.json` in the project root to get the list of configured servers.

```bash
cat .mcp.json
```

For each server entry, record:

- Server name
- Command (`command` field)
- Arguments (`args` field)
- Working directory (`cwd` field, defaults to `.`)
- Environment variables (`env` field, if any)

## Phase 2: Diagnose Each Server

For each configured server, run these checks in order:

### 2a. Binary exists?

```bash
which <command>
# e.g. which node, which uvx, which npx
```

If the binary is missing, report it and suggest installation.

### 2b. Entry point exists?

For `node` commands, check the script file exists:

```bash
ls -la <args[0]>
```

For `npx`/`uvx` commands, check the package resolves:

```bash
npx --yes <package> --help 2>&1 | head -5
# or
uvx --from <source> <command> --help 2>&1 | head -5
```

### 2c. Server starts?

Attempt to start the server with a timeout to verify it initializes:

```bash
timeout 10 <full command> 2>&1 &
sleep 3
kill %1 2>/dev/null
```

Look for:

- Startup success messages (e.g. "Starting MCP server", "tools loaded")
- Error messages (missing dependencies, port conflicts, config errors)
- Crash/exit codes

### 2d. Port conflicts?

If the server binds to a port, check for conflicts:

```bash
lsof -i :<port>
```

If a stale process holds the port, report the PID and suggest killing it.

### 2e. Dependencies met?

For Node.js servers, check if `node_modules` exist:

```bash
ls <cwd>/node_modules/.package-lock.json 2>/dev/null
```

If missing, suggest `npm install`.

For Python (uvx) servers, the virtual env is managed by uvx — check if the package installs cleanly.

## Phase 3: Repair

For each issue found, apply the appropriate fix:

| Issue                         | Fix                                    |
| ----------------------------- | -------------------------------------- |
| Binary not found              | Suggest install command                |
| Entry point missing           | `npm run build` or check path          |
| Port conflict (stale process) | `kill <PID>` (ask user first)          |
| Missing node_modules          | `npm install` in the right directory   |
| Config error in .mcp.json     | Show the fix, apply with user approval |
| Package resolution failure    | Clear cache, retry install             |
| Server crashes on start       | Show error log, diagnose root cause    |

**IMPORTANT:** Never kill processes without user confirmation. Always show the PID and process name first.

## Phase 4: Verify

After repairs, instruct the user:

> Repairs complete. Please restart MCP connections:
>
> 1. Type `/mcp` in the prompt
> 2. Toggle the repaired server(s) off and back on
> 3. Verify tools appear with a ToolSearch

Note: Claude Code does not support programmatic MCP restarts. The user must use `/mcp` to reconnect.

## Phase 5: Report

Present findings as a table:

```
## MCP Doctor Report

| Server | Binary | Entry Point | Starts | Port | Status |
|--------|--------|-------------|--------|------|--------|
| soleri | node OK | dist/index.js OK | OK | — | Healthy |
| serena | uvx OK | git+... OK | OK | 24285 OK | Healthy |

### Issues Found
| Server | Issue | Fix Applied |
|--------|-------|-------------|
| serena | Stale process on :24285 | Killed PID 1234 |

### Action Required
- [ ] Run `/mcp` and reconnect repaired servers
```

## Common Issues

- **uvx servers**: Often fail due to network issues when pulling from git. Check connectivity.
- **Node servers**: Often fail because `dist/` hasn't been built. Run the build command.
- **Port conflicts**: Previous server instances that didn't shut down cleanly. Kill and restart.
- **cwd issues**: Relative `cwd: "."` resolves from where Claude Code launched, not the .mcp.json location.

## Quick Reference

| Check          | Command            | What it tells you               |
| -------------- | ------------------ | ------------------------------- |
| Binary exists  | `which <cmd>`      | Is the runtime installed?       |
| Script exists  | `ls <path>`        | Is the entry point built?       |
| Port free      | `lsof -i :<port>`  | Is something blocking the port? |
| Deps installed | `ls node_modules`  | Are npm packages present?       |
| Server starts  | `timeout 10 <cmd>` | Does initialization succeed?    |
