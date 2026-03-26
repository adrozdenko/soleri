#!/bin/sh
# Marketing Research Hook for Claude Code (Soleri Hook Pack: marketing-research)
# PreToolUse -> Write|Edit: reminds to check brand guidelines, A/B testing data,
# and audience segmentation before editing marketing content.
#
# Matched file patterns:
#   - **/marketing/**
#   - **/*marketing*
#   - **/campaign*/**
#
# Dependencies: jq (required)
# POSIX sh compatible — no bash-specific features.

set -eu

INPUT=$(cat)

# Extract tool name
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

# Only act on Write or Edit
case "$TOOL_NAME" in
  Write|Edit) ;;
  *) exit 0 ;;
esac

# Extract file_path from tool_input
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# No file path — let it through
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Check if file matches marketing patterns
IS_MARKETING=false

# Pattern: **/marketing/** — file is inside a marketing directory
case "$FILE_PATH" in
  */marketing/*) IS_MARKETING=true ;;
esac

# Pattern: **/*marketing* — filename or path component contains "marketing"
if [ "$IS_MARKETING" = false ]; then
  BASENAME=$(basename "$FILE_PATH")
  case "$BASENAME" in
    *marketing*) IS_MARKETING=true ;;
  esac
fi

# Pattern: **/campaign*/** — file is inside a campaign* directory
if [ "$IS_MARKETING" = false ]; then
  # Check if any path component starts with "campaign"
  if printf '%s' "$FILE_PATH" | grep -qE '/(campaign[^/]*)/'; then
    IS_MARKETING=true
  fi
fi

# Not a marketing file — let it through
if [ "$IS_MARKETING" = false ]; then
  exit 0
fi

# Output remind JSON
jq -n \
  --arg file "$FILE_PATH" \
  '{
    continue: true,
    message: ("Marketing file detected: " + $file + "\n\nBefore editing, consider checking:\n- Brand guidelines — tone, voice, approved terminology\n- A/B testing data — what messaging has performed well\n- Audience segmentation — who is the target for this content\n- Campaign calendar — timing and coordination with other assets")
  }'
