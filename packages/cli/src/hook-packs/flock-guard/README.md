# flock-guard

Parallel agent lock guard for Soleri. Prevents lockfile corruption when multiple agents run concurrently in worktrees of the same repository.

## What it protects

Intercepts commands that modify package manager lockfiles:

| Package Manager | Commands                      |
| --------------- | ----------------------------- |
| npm             | `npm install`, `npm ci`       |
| yarn            | `yarn`, `yarn install`        |
| pnpm            | `pnpm install`                |
| cargo           | `cargo build`, `cargo update` |
| pip             | `pip install`, `pip3 install` |

## How locking works

1. **PreToolUse** hook fires before any Bash command
2. If the command matches a lockfile-modifying pattern, the hook acquires a lock via `mkdir` (atomic on POSIX)
3. Lock state is written to a JSON file inside the lock directory: agent ID, timestamp, command
4. If another agent already holds the lock, the command is **blocked** with a descriptive error
5. **PostToolUse** hook fires after the command completes and releases the lock

### Lock path

```
/tmp/soleri-guard-<project-hash>.lock/lock.json
```

The project hash is derived from the git repository root path, so all worktrees of the same repository share the same lock. This is intentional — lockfile writes in any worktree can conflict at the npm/yarn cache level.

### Reentrant locking

If the same agent (identified by `CLAUDE_SESSION_ID` or PID) already holds the lock, the hook refreshes the timestamp and allows the command through. This prevents self-deadlock when chaining multiple install commands.

### Stale lock detection

Locks older than **30 seconds** are considered stale and automatically cleaned up. This handles the case where an agent crashes mid-install without releasing the lock.

## Installation

```bash
soleri hooks add-pack flock-guard
```

## Troubleshooting

### Stuck lock

If a lock is stuck (agent crashed, machine rebooted mid-install), clear it manually:

```bash
rm -rf /tmp/soleri-guard-*.lock
```

### Checking lock status

```bash
cat /tmp/soleri-guard-*.lock/lock.json 2>/dev/null || echo "No active locks"
```

### Dependencies

Requires `jq` to be installed and available on PATH.
