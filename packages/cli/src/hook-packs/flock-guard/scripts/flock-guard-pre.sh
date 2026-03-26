#!/bin/sh
# Flock Guard — PreToolUse lock acquisition (Soleri Hook Pack: flock-guard)
# Acquires atomic mkdir-based lock before lockfile-modifying commands.
# Dependencies: jq
# POSIX sh compatible.

set -eu

INPUT=$(cat)

# Extract command from stdin JSON
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [ -z "$CMD" ]; then
  exit 0
fi

# Strip quoted strings to avoid false positives (same as anti-deletion.sh)
STRIPPED=$(printf '%s' "$CMD" | sed -e "s/<<'[A-Za-z_]*'.*//g" -e 's/<<[A-Za-z_]*.*//g' 2>/dev/null || printf '%s' "$CMD")
STRIPPED=$(printf '%s' "$STRIPPED" | sed 's/"[^"]*"//g' 2>/dev/null || printf '%s' "$STRIPPED")
STRIPPED=$(printf '%s' "$STRIPPED" | sed "s/'[^']*'//g" 2>/dev/null || printf '%s' "$STRIPPED")

# Check if command modifies lockfiles
IS_LOCKFILE_CMD=false
# npm install (but not npm run, npm test, etc.)
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)npm\s+install(\s|$|;)' && IS_LOCKFILE_CMD=true
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)npm\s+ci(\s|$|;)' && IS_LOCKFILE_CMD=true
# yarn (bare yarn or yarn install)
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)yarn(\s+install)?(\s|$|;)' && IS_LOCKFILE_CMD=true
# pnpm install
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)pnpm\s+install(\s|$|;)' && IS_LOCKFILE_CMD=true
# cargo build / cargo update
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)cargo\s+(build|update)(\s|$|;)' && IS_LOCKFILE_CMD=true
# pip install
printf '%s' "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)pip[3]?\s+install(\s|$|;)' && IS_LOCKFILE_CMD=true

if [ "$IS_LOCKFILE_CMD" = false ]; then
  exit 0
fi

# Compute project-specific lock path
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
PROJECT_HASH=$(printf '%s' "$PROJECT_ROOT" | shasum | cut -c1-8)
LOCK_DIR="${TMPDIR:-${TEMP:-/tmp}}/soleri-guard-${PROJECT_HASH}.lock"
LOCK_JSON="$LOCK_DIR/lock.json"
STALE_TIMEOUT=30
SESSION_ID="${CLAUDE_SESSION_ID:-$$}"

# Try to acquire lock (mkdir is atomic on POSIX)
if mkdir "$LOCK_DIR" 2>/dev/null; then
  # Lock acquired — write state
  printf '{"agentId":"%s","timestamp":%d,"command":"%s"}' "$SESSION_ID" "$(date +%s)" "$CMD" > "$LOCK_JSON"
  exit 0
fi

# Lock held — check staleness
if [ -f "$LOCK_JSON" ]; then
  LOCK_TIME=$(jq -r '.timestamp // 0' "$LOCK_JSON" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AGE=$((NOW - LOCK_TIME))

  LOCK_AGENT=$(jq -r '.agentId // "unknown"' "$LOCK_JSON" 2>/dev/null || echo "unknown")

  # Same agent — allow reentry
  if [ "$LOCK_AGENT" = "$SESSION_ID" ]; then
    # Refresh timestamp
    printf '{"agentId":"%s","timestamp":%d,"command":"%s"}' "$SESSION_ID" "$NOW" "$CMD" > "$LOCK_JSON"
    exit 0
  fi

  # Stale lock — clean and retry
  if [ "$AGE" -gt "$STALE_TIMEOUT" ]; then
    rm -rf "$LOCK_DIR"
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      printf '{"agentId":"%s","timestamp":%d,"command":"%s"}' "$SESSION_ID" "$NOW" "$CMD" > "$LOCK_JSON"
      exit 0
    fi
  fi
fi

# Lock held by another active agent — block
LOCK_AGENT=$(jq -r '.agentId // "another agent"' "$LOCK_JSON" 2>/dev/null || echo "another agent")
jq -n --arg agent "$LOCK_AGENT" '{
  continue: false,
  stopReason: ("BLOCKED: Another agent (" + $agent + ") is modifying lockfiles. Wait for it to finish, then retry. Lock auto-expires after 30s if the agent crashes.")
}'
