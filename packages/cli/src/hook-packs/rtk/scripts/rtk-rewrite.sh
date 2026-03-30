#!/bin/sh
# RTK Rewrite — PreToolUse command rewriter (Soleri Hook Pack: rtk)
# Intercepts Bash commands and rewrites them through RTK proxy for token compression.
# RTK (https://github.com/rtk-ai/rtk) reduces LLM token usage by 60-90%.
# Dependencies: jq, rtk (>= 0.23.0)
# POSIX sh compatible.

set -eu

# ── Dependency checks ──────────────────────────────────────────────

WARN_FLAG="${HOME}/.soleri/.rtk-warned"

warn_once() {
  # Warn at most once per day (86400 seconds)
  if [ -f "$WARN_FLAG" ]; then
    # Get file mtime — try macOS stat, then Linux stat, fallback to 0
    FILE_MTIME=0
    if stat -f %m "$WARN_FLAG" >/dev/null 2>&1; then
      FILE_MTIME=$(stat -f %m "$WARN_FLAG")
    elif stat -c %Y "$WARN_FLAG" >/dev/null 2>&1; then
      FILE_MTIME=$(stat -c %Y "$WARN_FLAG")
    fi
    NOW=$(date +%s)
    WARN_AGE=$(( NOW - FILE_MTIME ))
    [ "$WARN_AGE" -lt 86400 ] && return
  fi
  mkdir -p "$(dirname "$WARN_FLAG")"
  echo "$1" >&2
  touch "$WARN_FLAG"
}

if ! command -v jq >/dev/null 2>&1; then
  warn_once "[soleri:rtk] jq not found — RTK hook disabled. Install: https://stedolan.github.io/jq/"
  exit 0
fi

if ! command -v rtk >/dev/null 2>&1; then
  warn_once "[soleri:rtk] rtk not found — RTK hook disabled. Install: https://github.com/rtk-ai/rtk"
  exit 0
fi

# ── Read stdin JSON ────────────────────────────────────────────────

INPUT=$(cat)

# Extract command from Claude Code PreToolUse JSON
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [ -z "$CMD" ]; then
  exit 0
fi

# ── Rewrite via RTK ────────────────────────────────────────────────

# Ask RTK if it can compress this command.
# Exit codes: 0 = rewritten, 1 = no match (pass through), 2+ = error
REWRITTEN=$(rtk rewrite "$CMD" 2>/dev/null) || exit 0

# If RTK returned empty or same command, pass through
if [ -z "$REWRITTEN" ] || [ "$REWRITTEN" = "$CMD" ]; then
  exit 0
fi

# ── Return rewritten command ───────────────────────────────────────

# Build updatedInput from original tool_input with rewritten command
UPDATED_INPUT=$(printf '%s' "$INPUT" | jq -c --arg cmd "$REWRITTEN" '.tool_input | .command = $cmd')

# Output Claude Code hookSpecificOutput contract
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"RTK token compression","updatedInput":%s}}' "$UPDATED_INPUT"
