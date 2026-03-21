#!/usr/bin/env bash
# Anti-Deletion Staging Hook for Claude Code (Soleri Hook Pack: yolo-safety)
# PreToolUse -> Bash: intercepts rm, rmdir, mv (of project dirs), git clean, reset --hard
# Copies target files to ~/.soleri/staging/<timestamp>/ then blocks the command.
#
# Catastrophic commands (rm -rf /, rm -rf ~) should stay in deny rules —
# this hook handles targeted deletes only.
#
# Dependencies: jq (required), perl (optional, for heredoc stripping)

set -euo pipefail

STAGING_ROOT="$HOME/.soleri/staging"
PROJECTS_DIR="$HOME/projects"
INPUT=$(cat)

# Extract the command from stdin JSON
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# No command found — let it through
if [ -z "$CMD" ]; then
  exit 0
fi

# --- Strip heredocs and quoted strings to avoid false positives ---
# Commands like: gh issue comment --body "$(cat <<'EOF' ... rmdir ... EOF)"
# contain destructive keywords in text, not as actual commands.

# Remove heredoc blocks: <<'EOF'...EOF and <<EOF...EOF (multiline)
STRIPPED=$(echo "$CMD" | perl -0777 -pe "s/<<'?\\w+'?.*?^\\w+$//gms" 2>/dev/null || echo "$CMD")
# Remove double-quoted strings (greedy but good enough for this check)
STRIPPED=$(echo "$STRIPPED" | sed -E 's/"[^"]*"//g' 2>/dev/null || echo "$STRIPPED")
# Remove single-quoted strings
STRIPPED=$(echo "$STRIPPED" | sed -E "s/'[^']*'//g" 2>/dev/null || echo "$STRIPPED")

# --- Detect destructive commands (on stripped command only) ---

IS_RM=false
IS_RMDIR=false
IS_MV_PROJECT=false
IS_GIT_CLEAN=false
IS_RESET_HARD=false
IS_GIT_CHECKOUT_DOT=false
IS_GIT_RESTORE_DOT=false

# Check for rm commands (but not git rm which is safe — it stages, doesn't destroy)
if echo "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)rm\s'; then
  if ! echo "$STRIPPED" | grep -qE '(^|\s)git\s+rm\s'; then
    IS_RM=true
  fi
fi

# Check for rmdir commands
if echo "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)rmdir\s'; then
  IS_RMDIR=true
fi

# Check for mv commands that move project directories or git repos
if echo "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)mv\s'; then
  MV_SOURCES=$(echo "$STRIPPED" | sed -E 's/^.*\bmv\s+//' | sed -E 's/-(f|i|n|v)\s+//g')
  if echo "$MV_SOURCES" | grep -qE "(~/projects|$HOME/projects|\\\$HOME/projects|\\.git)"; then
    IS_MV_PROJECT=true
  fi
fi

# Check for git clean
if echo "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)git\s+clean\b'; then
  IS_GIT_CLEAN=true
fi

# Check for git reset --hard
if echo "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)git\s+reset\s+--hard'; then
  IS_RESET_HARD=true
fi

# Check for git checkout -- . (restores all files, discards changes)
if echo "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)git\s+checkout\s+--\s+\.'; then
  IS_GIT_CHECKOUT_DOT=true
fi

# Check for git restore . (restores all files, discards changes)
if echo "$STRIPPED" | grep -qE '(^|\s|;|&&|\|\|)git\s+restore\s+\.'; then
  IS_GIT_RESTORE_DOT=true
fi

# Not a destructive command — let it through
if [ "$IS_RM" = false ] && [ "$IS_RMDIR" = false ] && [ "$IS_MV_PROJECT" = false ] && \
   [ "$IS_GIT_CLEAN" = false ] && [ "$IS_RESET_HARD" = false ] && \
   [ "$IS_GIT_CHECKOUT_DOT" = false ] && [ "$IS_GIT_RESTORE_DOT" = false ]; then
  exit 0
fi

# --- Handle git clean (block outright) ---

if [ "$IS_GIT_CLEAN" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: git clean would remove untracked files. Use git stash --include-untracked to save them first, or ask the user to run git clean manually."
  }'
  exit 0
fi

# --- Handle git reset --hard (block outright) ---

if [ "$IS_RESET_HARD" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: git reset --hard would discard uncommitted changes. Use git stash to save them first, or ask the user to run this manually."
  }'
  exit 0
fi

# --- Handle git checkout -- . (block outright) ---

if [ "$IS_GIT_CHECKOUT_DOT" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: git checkout -- . would discard all uncommitted changes. Use git stash to save them first, or ask the user to run this manually."
  }'
  exit 0
fi

# --- Handle git restore . (block outright) ---

if [ "$IS_GIT_RESTORE_DOT" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: git restore . would discard all uncommitted changes. Use git stash to save them first, or ask the user to run this manually."
  }'
  exit 0
fi

# --- Handle mv of project directories (block outright) ---

if [ "$IS_MV_PROJECT" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: mv of a project directory or git repo detected. Moving project directories can cause data loss if the operation fails midway. Ask the user to run this manually, or use cp + verify + rm instead."
  }'
  exit 0
fi

# --- Handle rmdir (block outright) ---

if [ "$IS_RMDIR" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: rmdir detected. Removing directories can break project structure. Ask the user to confirm this operation manually."
  }'
  exit 0
fi

# --- Handle rm commands — copy to staging, then block ---

# Create timestamped staging directory
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
STAGE_DIR="$STAGING_ROOT/$TIMESTAMP"

# Extract file paths from the rm command
# Strip rm and its flags, keeping only the file arguments
FILES=$(echo "$CMD" | sed -E 's/^.*\brm\s+//' | sed -E 's/-(r|f|rf|fr|v|i|rv|fv|rfv|frv)\s+//g' | tr ' ' '\n' | grep -v '^-' | grep -v '^$')

if [ -z "$FILES" ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: rm command detected but could not parse file targets. Please specify files explicitly."
  }'
  exit 0
fi

STAGED=()
MISSING=()

mkdir -p "$STAGE_DIR"

while IFS= read -r filepath; do
  # Expand path (handle ~, relative paths)
  expanded=$(eval echo "$filepath" 2>/dev/null || echo "$filepath")

  if [ -e "$expanded" ]; then
    # Preserve directory structure in staging
    target_dir="$STAGE_DIR/$(dirname "$expanded")"
    mkdir -p "$target_dir"
    # COPY instead of MOVE — originals stay intact, staging is a backup
    if [ -d "$expanded" ]; then
      cp -R "$expanded" "$target_dir/" 2>/dev/null && STAGED+=("$expanded") || MISSING+=("$expanded")
    else
      cp "$expanded" "$target_dir/" 2>/dev/null && STAGED+=("$expanded") || MISSING+=("$expanded")
    fi
  else
    MISSING+=("$expanded")
  fi
done <<< "$FILES"

# Build response
STAGED_COUNT=${#STAGED[@]}
MISSING_COUNT=${#MISSING[@]}

if [ "$STAGED_COUNT" -eq 0 ] && [ "$MISSING_COUNT" -gt 0 ]; then
  # All files were missing — let the rm fail naturally
  rmdir "$STAGE_DIR" 2>/dev/null || true
  exit 0
fi

STAGED_LIST=$(printf '%s, ' "${STAGED[@]}" | sed 's/, $//')

jq -n \
  --arg staged "$STAGED_LIST" \
  --arg dir "$STAGE_DIR" \
  --argjson count "$STAGED_COUNT" \
  '{
    continue: false,
    stopReason: ("BLOCKED & BACKED UP: " + ($count | tostring) + " item(s) copied to " + $dir + " — files: " + $staged + ". The originals are untouched. To proceed with deletion, ask the user to run the rm command manually.")
  }'
