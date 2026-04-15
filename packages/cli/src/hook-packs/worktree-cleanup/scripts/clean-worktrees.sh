#!/bin/sh
# SessionStart — prune stale worktree directories
# Soleri Hook Pack: worktree-cleanup
root=$(git rev-parse --show-toplevel 2>/dev/null || exit 0)
wt_dir="$root/.claude/worktrees"
git -C "$root" worktree prune 2>/dev/null
if [ -d "$wt_dir" ]; then
  count=0
  for dir in "$wt_dir"/*/; do
    [ -d "$dir" ] || continue
    abs=$(cd "$dir" && pwd 2>/dev/null) || continue
    if ! git -C "$root" worktree list --porcelain 2>/dev/null | grep -q "worktree $abs"; then
      rm -rf "$dir"
      count=$((count + 1))
    fi
  done
  rmdir "$wt_dir" 2>/dev/null || true
  [ "$count" -gt 0 ] && echo "Cleaned $count stale worktree(s)"
fi
exit 0
