#!/bin/sh
# PostToolUse:Agent — nuke orphaned worktree-agent-* branches
# Soleri Hook Pack: worktree-cleanup
root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$root" ] && exit 0
active_worktrees=$(git -C "$root" worktree list --porcelain 2>/dev/null | grep '^worktree ' | sed 's/^worktree //')
count=0
for branch in $(git -C "$root" branch --list 'worktree-agent-*' 2>/dev/null | tr -d ' '); do
  has_worktree=false
  while IFS= read -r wt; do
    [ -z "$wt" ] && continue
    wt_branch=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ "$wt_branch" = "$branch" ]; then
      has_worktree=true
      break
    fi
  done <<EOF
$active_worktrees
EOF
  [ "$has_worktree" = "false" ] && git -C "$root" branch -D "$branch" 2>/dev/null && count=$((count + 1))
done
[ "$count" -gt 0 ] && echo "Cleaned $count orphaned worktree branch(es)"
exit 0
