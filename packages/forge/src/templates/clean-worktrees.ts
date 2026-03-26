/**
 * Generate a POSIX sh script that cleans up stale Claude Code worktrees.
 * Registered as a SessionStart hook in scaffolded agents.
 */
export function generateCleanWorktreesScript(): string {
  return `#!/bin/sh
# Clean stale Claude Code worktrees on session start.
# Registered as a SessionStart hook by Soleri scaffolding.
# Safe: skips active worktrees, checks for unpushed commits.

WORKTREE_DIR=".claude/worktrees"

# Exit silently if no worktrees directory
[ -d "$WORKTREE_DIR" ] || exit 0

# Prune worktrees whose branches have been deleted
git worktree prune 2>/dev/null

# Get list of active worktrees (skip the main one)
active_worktrees="$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | sed 's/^worktree //')"

cleaned=0
skipped=0

for dir in "$WORKTREE_DIR"/*/; do
  [ -d "$dir" ] || continue

  # Resolve to absolute path for comparison
  abs_dir="$(cd "$dir" 2>/dev/null && pwd)" || continue

  # Skip if still in git worktree list (active)
  if echo "$active_worktrees" | grep -qF "$abs_dir"; then
    skipped=$((skipped + 1))
    continue
  fi

  # Safety: check for unpushed commits before removing
  branch="$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null)" || branch=""
  if [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
    upstream="$(git -C "$dir" rev-parse --abbrev-ref "@{upstream}" 2>/dev/null)" || upstream=""
    if [ -n "$upstream" ]; then
      unpushed="$(git -C "$dir" log "$upstream..$branch" --oneline 2>/dev/null)"
      if [ -n "$unpushed" ]; then
        skipped=$((skipped + 1))
        continue
      fi
    fi
  fi

  rm -rf "$dir" 2>/dev/null && cleaned=$((cleaned + 1))
done

# Silent unless something was cleaned
if [ "$cleaned" -gt 0 ]; then
  echo "Cleaned $cleaned stale worktree(s), $skipped active/protected"
fi
`;
}
