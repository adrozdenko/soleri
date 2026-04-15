#!/bin/sh
# PostToolUse:Agent — nuke orphaned worktree-agent-* branches
# Soleri Hook Pack: worktree-cleanup
root=$(git rev-parse --show-toplevel 2>/dev/null || exit 0)
active_worktrees=$(git -C "$root" worktree list --porcelain 2>/dev/null | grep '^worktree ' | sed 's/^worktree //')
count=0
for branch in $(git -C "$root" branch --list 'worktree-agent-*' 2>/dev/null | tr -d ' '); do
  has_worktree=false
  for wt in $active_worktrees; do
    wt_branch=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)
    [ "$wt_branch" = "$branch" ] && has_worktree=true && break
  done
  [ "$has_worktree" = "false" ] && git -C "$root" branch -D "$branch" 2>/dev/null && count=$((count + 1))
done
[ "$count" -gt 0 ] && echo "Cleaned $count orphaned worktree branch(es)"
exit 0
