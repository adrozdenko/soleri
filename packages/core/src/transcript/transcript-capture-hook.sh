#!/bin/sh
# transcript-capture-hook.sh — PreCompact + Stop hook for Claude Code
#
# Reads transcript_path and session_id from stdin JSON (provided by Claude Code)
# and calls the Node.js capture script to persist the transcript in Soleri's vault.
#
# Hook registration (in .claude/settings.json):
#   {
#     "hooks": {
#       "PreCompact": [{ "matcher": "", "command": "sh /path/to/transcript-capture-hook.sh", "timeout": 10000 }],
#       "Stop":       [{ "matcher": "", "command": "sh /path/to/transcript-capture-hook.sh", "timeout": 10000 }]
#     }
#   }
#
# Requirements:
#   - jq must be on PATH (for JSON parsing)
#   - Node.js >= 18
#   - @soleri/core must be built (capture-hook.js in dist/)
#
# Exit behavior:
#   Always exits 0 — hooks must never block Claude Code.

# Read the full stdin JSON payload from Claude Code
INPUT=$(cat)

# Parse fields — jq -r outputs "null" for missing keys, // empty converts to ""
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# Exit silently if no transcript path or file doesn't exist
[ -z "$TRANSCRIPT_PATH" ] && exit 0
[ ! -f "$TRANSCRIPT_PATH" ] && exit 0

# Resolve vault path: env override → default ~/.soleri/vault.db
VAULT_PATH="${SOLERI_VAULT_PATH:-$HOME/.soleri/vault.db}"

# Resolve project path: prefer cwd from hook payload, fall back to PWD
PROJECT_PATH="${CWD:-$PWD}"

# Resolve the capture script path relative to this shell script
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
CAPTURE_SCRIPT="$SCRIPT_DIR/capture-hook.js"

# If running from source tree, the .js lives in dist/
if [ ! -f "$CAPTURE_SCRIPT" ]; then
  # Try dist/ path (when installed as package)
  CAPTURE_SCRIPT="$SCRIPT_DIR/../../../dist/transcript/capture-hook.js"
fi

if [ ! -f "$CAPTURE_SCRIPT" ]; then
  # Cannot find capture script — exit silently
  exit 0
fi

# Run the capture script — redirect stderr to stdout for hook logging
node "$CAPTURE_SCRIPT" \
  --session-id "$SESSION_ID" \
  --transcript-path "$TRANSCRIPT_PATH" \
  --project-path "$PROJECT_PATH" \
  --vault-path "$VAULT_PATH" 2>&1 || true

# Always exit 0 — never block the hook
exit 0
