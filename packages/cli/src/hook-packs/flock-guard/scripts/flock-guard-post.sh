#!/bin/sh
# Flock Guard — PostToolUse lock release (Soleri Hook Pack: flock-guard)
# Releases the lock after a lockfile-modifying command completes.
# Dependencies: jq
# POSIX sh compatible.

set -eu

INPUT=$(cat)

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [ -z "$CMD" ]; then
  exit 0
fi

# Strip quoted strings (same logic as pre script)
STRIPPED=$(printf '%s' "$CMD" | sed -e "s/<<'[A-Za-z_]*'.*//g" -e 's/<<[A-Za-z_]*.*//g' 2>/dev/null || printf '%s' "$CMD")
STRIPPED=$(printf '%s' "$STRIPPED" | sed 's/"[^"]*"//g' 2>/dev/null || printf '%s' "$STRIPPED")
STRIPPED=$(printf '%s' "$STRIPPED" | sed "s/'[^']*'//g" 2>/dev/null || printf '%s' "$STRIPPED")

# Check if command modifies lockfiles (same patterns as pre)
IS_LOCKFILE_CMD=false
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)npm\s+(install|ci)(\s|$|;)' && IS_LOCKFILE_CMD=true
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)yarn(\s+install)?(\s|$|;)' && IS_LOCKFILE_CMD=true
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)pnpm\s+install(\s|$|;)' && IS_LOCKFILE_CMD=true
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)cargo\s+(build|update)(\s|$|;)' && IS_LOCKFILE_CMD=true
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)pip[3]?\s+install(\s|$|;)' && IS_LOCKFILE_CMD=true

if [ "$IS_LOCKFILE_CMD" = false ]; then
  exit 0
fi

# Release lock
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
PROJECT_HASH=$(printf '%s' "$PROJECT_ROOT" | shasum | cut -c1-8)
LOCK_DIR="/tmp/soleri-guard-${PROJECT_HASH}.lock"

# Only release if we own it
SESSION_ID="${CLAUDE_SESSION_ID:-$$}"
if [ -f "$LOCK_DIR/lock.json" ]; then
  LOCK_AGENT=$(jq -r '.agentId // ""' "$LOCK_DIR/lock.json" 2>/dev/null || echo "")
  if [ "$LOCK_AGENT" = "$SESSION_ID" ]; then
    rm -rf "$LOCK_DIR"
  fi
fi

# PostToolUse never blocks
exit 0
