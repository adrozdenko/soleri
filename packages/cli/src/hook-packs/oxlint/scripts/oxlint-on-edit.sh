#!/bin/sh
# Oxlint Hook Pack — PostToolUse lint check
# Runs oxlint on edited TS/JS files after every Edit/Write.
# Silent on success; prints findings to Claude's context when issues exist.
# Dependencies: oxlint (via npx)
# POSIX sh compatible.

set -eu

# Read the hook JSON payload from stdin.
INPUT=$(cat)

# Extract the edited file path. Fall back to grep if jq is absent.
if command -v jq >/dev/null 2>&1; then
    FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
else
    FILE=$(printf '%s' "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

# Bail if we couldn't parse a path.
[ -n "${FILE:-}" ] || exit 0

# Only lint TypeScript / JavaScript sources.
case "$FILE" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
    *) exit 0 ;;
esac

# Skip generated / vendored files.
case "$FILE" in
    */node_modules/*|*/dist/*|*/build/*|*/.next/*|*/coverage/*) exit 0 ;;
esac

# File must still exist (Edit might have deleted it).
[ -f "$FILE" ] || exit 0

# Resolve repo root so we run oxlint with the right config.
ROOT=$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null || echo "")
[ -n "$ROOT" ] || exit 0

# Run oxlint scoped to the single file. Capture both stdout and stderr.
OUTPUT=$(cd "$ROOT" && npx --no-install oxlint "$FILE" 2>&1 || true)

# oxlint exits non-zero on findings; detect via the summary line.
if printf '%s' "$OUTPUT" | grep -qE 'Found [1-9][0-9]* (warning|error)'; then
    printf 'oxlint findings in %s:\n%s\n' "$FILE" "$OUTPUT"
fi

exit 0
