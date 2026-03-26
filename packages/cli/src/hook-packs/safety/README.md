# Safety Hook Pack

Anti-deletion safety net for Claude Code. Intercepts destructive commands, stages files before deletion, and blocks dangerous operations.

## Install

```bash
soleri hooks add-pack safety
```

## What It Intercepts

| Command                    | Action                                       |
| -------------------------- | -------------------------------------------- |
| `rm` / `rmdir`             | Copies files to staging, then blocks         |
| `git push --force`         | Blocks (use `--force-with-lease` instead)    |
| `git reset --hard`         | Blocks (use `git stash` first)               |
| `git clean`                | Blocks (use `git stash --include-untracked`) |
| `git checkout -- .`        | Blocks                                       |
| `git restore .`            | Blocks                                       |
| `mv ~/projects/...`        | Blocks                                       |
| `DROP TABLE`               | Blocks                                       |
| `docker rm` / `docker rmi` | Blocks                                       |

## Where Backups Go

Staged files are saved to `~/.soleri/staging/<timestamp>/` with directory structure preserved.

Backups use rsync (excludes `node_modules`, `dist`, `.git`) when available, falls back to `cp -R`.

## Restore

```bash
soleri staging list       # see available backups
soleri staging restore    # restore from a backup
soleri staging clean      # manually clean old backups
```

## Auto-Cleanup

Backups older than 7 days are automatically deleted on each hook invocation. No manual cleanup needed for normal usage.

## Dependencies

- `jq` (required for JSON parsing)
- POSIX sh compatible — works on macOS and Linux

## False Positive Prevention

The hook strips here-documents and quoted strings before pattern matching. Commands like `gh issue comment --body "rm -rf explanation"` will not trigger a false positive.
