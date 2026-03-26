#!/bin/sh
# Anti-Deletion Staging Hook for Claude Code (Soleri Hook Pack: safety)
# PreToolUse -> Bash: intercepts destructive commands, stages files, blocks execution.
#
# Intercepted patterns:
#   - rm / rmdir          (files/dirs — stages first, then blocks)
#   - git push --force    (blocks outright)
#   - git reset --hard    (blocks outright)
#   - git clean           (blocks outright)
#   - git checkout -- .   (blocks outright)
#   - git restore .       (blocks outright)
#   - mv ~/projects/...   (blocks outright)
#   - drop table          (SQL — blocks outright)
#   - docker rm / rmi     (blocks outright)
#
# Catastrophic commands (rm -rf /, rm -rf ~) should stay in deny rules —
# this hook handles targeted deletes only.
#
# Dependencies: jq (required)
# POSIX sh compatible — no bash-specific features.

set -eu

STAGING_ROOT="$HOME/.soleri/staging"

# --- Auto-cleanup: remove staging backups older than 7 days ---
if [ -d "$STAGING_ROOT" ]; then
  find "$STAGING_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
fi

INPUT=$(cat)

# Extract the command from stdin JSON
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# No command found — let it through
if [ -z "$CMD" ]; then
  exit 0
fi

# --- Strip heredocs and quoted strings to avoid false positives ---
# Commands like: gh issue comment --body "$(cat <<'EOF' ... rmdir ... EOF)"
# contain destructive keywords in text, not as actual commands.

# Remove heredoc blocks (best-effort with sed)
STRIPPED=$(printf '%s' "$CMD" | sed -e "s/<<'[A-Za-z_]*'.*//g" -e 's/<<[A-Za-z_]*.*//g' 2>/dev/null || printf '%s' "$CMD")
# Remove double-quoted strings
STRIPPED=$(printf '%s' "$STRIPPED" | sed 's/"[^"]*"//g' 2>/dev/null || printf '%s' "$STRIPPED")
# Remove single-quoted strings
STRIPPED=$(printf '%s' "$STRIPPED" | sed "s/'[^']*'//g" 2>/dev/null || printf '%s' "$STRIPPED")

# --- Helper: check if pattern matches stripped command ---
matches() {
  printf '%s' "$STRIPPED" | grep -qE "$1"
}

# --- Detect destructive commands (on stripped command only) ---

IS_RM=false
IS_RMDIR=false
IS_MV_PROJECT=false
IS_GIT_CLEAN=false
IS_RESET_HARD=false
IS_GIT_CHECKOUT_DOT=false
IS_GIT_RESTORE_DOT=false
IS_GIT_PUSH_FORCE=false
IS_DROP_TABLE=false
IS_DOCKER_RM=false

# rm (but not git rm which stages, doesn't destroy)
if matches '(^|\s|;|&&|\|\|)rm\s'; then
  if ! matches '(^|\s)git\s+rm\s'; then
    IS_RM=true
  fi
fi

# rmdir
if matches '(^|\s|;|&&|\|\|)rmdir\s'; then
  IS_RMDIR=true
fi

# mv of project directories or git repos
if matches '(^|\s|;|&&|\|\|)mv\s'; then
  MV_TAIL=$(printf '%s' "$STRIPPED" | sed 's/^.*\bmv //' | sed 's/-[finv] //g')
  if printf '%s' "$MV_TAIL" | grep -qE '(~/projects|\.git)'; then
    IS_MV_PROJECT=true
  fi
fi

# git clean
if matches '(^|\s|;|&&|\|\|)git\s+clean\b'; then
  IS_GIT_CLEAN=true
fi

# git reset --hard
if matches '(^|\s|;|&&|\|\|)git\s+reset\s+--hard'; then
  IS_RESET_HARD=true
fi

# git checkout -- .
if matches '(^|\s|;|&&|\|\|)git\s+checkout\s+--\s+\.'; then
  IS_GIT_CHECKOUT_DOT=true
fi

# git restore .
if matches '(^|\s|;|&&|\|\|)git\s+restore\s+\.'; then
  IS_GIT_RESTORE_DOT=true
fi

# git push --force / -f (but not --force-with-lease which is safer)
if matches '(^|\s|;|&&|\|\|)git\s+push\s'; then
  if matches 'git\s+push\s.*--force([^-]|$)' || matches 'git\s+push\s+-f(\s|$)' || matches 'git\s+push\s.*\s-f(\s|$)'; then
    IS_GIT_PUSH_FORCE=true
  fi
fi

# SQL drop table (case-insensitive)
if printf '%s' "$STRIPPED" | grep -qiE '(^|\s|;)drop\s+table'; then
  IS_DROP_TABLE=true
fi

# docker rm / docker rmi
if matches '(^|\s|;|&&|\|\|)docker\s+(rm|rmi)\b'; then
  IS_DOCKER_RM=true
fi

# --- Not a destructive command — let it through ---

if [ "$IS_RM" = false ] && [ "$IS_RMDIR" = false ] && [ "$IS_MV_PROJECT" = false ] && \
   [ "$IS_GIT_CLEAN" = false ] && [ "$IS_RESET_HARD" = false ] && \
   [ "$IS_GIT_CHECKOUT_DOT" = false ] && [ "$IS_GIT_RESTORE_DOT" = false ] && \
   [ "$IS_GIT_PUSH_FORCE" = false ] && [ "$IS_DROP_TABLE" = false ] && \
   [ "$IS_DOCKER_RM" = false ]; then
  exit 0
fi

# --- Block: git clean ---
if [ "$IS_GIT_CLEAN" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: git clean would remove untracked files. Use git stash --include-untracked to save them first, or ask the user to run git clean manually."
  }'
  exit 0
fi

# --- Block: git reset --hard ---
if [ "$IS_RESET_HARD" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: git reset --hard would discard uncommitted changes. Use git stash to save them first, or ask the user to run this manually."
  }'
  exit 0
fi

# --- Block: git checkout -- . ---
if [ "$IS_GIT_CHECKOUT_DOT" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: git checkout -- . would discard all uncommitted changes. Use git stash to save them first, or ask the user to run this manually."
  }'
  exit 0
fi

# --- Block: git restore . ---
if [ "$IS_GIT_RESTORE_DOT" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: git restore . would discard all uncommitted changes. Use git stash to save them first, or ask the user to run this manually."
  }'
  exit 0
fi

# --- Block: git push --force ---
if [ "$IS_GIT_PUSH_FORCE" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: git push --force can overwrite remote history and cause data loss for collaborators. Use --force-with-lease instead, or ask the user to run this manually."
  }'
  exit 0
fi

# --- Block: mv of project directories ---
if [ "$IS_MV_PROJECT" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: mv of a project directory or git repo detected. Moving project directories can cause data loss if the operation fails midway. Ask the user to run this manually, or use cp + verify + rm instead."
  }'
  exit 0
fi

# --- Block: rmdir ---
if [ "$IS_RMDIR" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: rmdir detected. Removing directories can break project structure. Ask the user to confirm this operation manually."
  }'
  exit 0
fi

# --- Block: drop table ---
if [ "$IS_DROP_TABLE" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: DROP TABLE detected. This would permanently destroy database data. Ask the user to run this SQL statement manually after confirming intent."
  }'
  exit 0
fi

# --- Block: docker rm / rmi ---
if [ "$IS_DOCKER_RM" = true ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: docker rm/rmi detected. Removing containers or images can cause data loss. Ask the user to run this manually."
  }'
  exit 0
fi

# --- Handle rm commands — copy to staging, then block ---

# Create timestamped staging directory
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
STAGE_DIR="$STAGING_ROOT/$TIMESTAMP"

# Extract file paths from the rm command
# Strip rm and its flags, keeping only the file arguments
FILES=$(printf '%s' "$CMD" | sed 's/^.*\brm //' | sed 's/-[rRfivd]* //g' | tr ' ' '\n' | grep -v '^-' | grep -v '^$' || true)

if [ -z "$FILES" ]; then
  jq -n '{
    continue: false,
    stopReason: "BLOCKED: rm command detected but could not parse file targets. Please specify files explicitly."
  }'
  exit 0
fi

STAGED_COUNT=0
STAGED_LIST=""
MISSING_COUNT=0

mkdir -p "$STAGE_DIR"

printf '%s\n' "$FILES" | while IFS= read -r filepath; do
  # Expand path (handle ~, relative paths)
  expanded=$(eval printf '%s' "$filepath" 2>/dev/null || printf '%s' "$filepath")

  if [ -e "$expanded" ]; then
    # Preserve directory structure in staging
    target_dir="$STAGE_DIR/$(dirname "$expanded")"
    mkdir -p "$target_dir"
    # COPY instead of MOVE — originals stay intact, staging is a backup
    if [ -d "$expanded" ]; then
      # Use rsync if available (excludes node_modules/dist/.git), fall back to cp
      if command -v rsync >/dev/null 2>&1; then
        rsync -a --exclude='node_modules' --exclude='dist' --exclude='.git' "$expanded/" "$target_dir/$(basename "$expanded")/" 2>/dev/null
      else
        cp -R "$expanded" "$target_dir/" 2>/dev/null
      fi
    else
      cp "$expanded" "$target_dir/" 2>/dev/null
    fi
  fi
done

# Count what was staged (check if staging dir has content)
if [ -d "$STAGE_DIR" ] && [ "$(ls -A "$STAGE_DIR" 2>/dev/null)" ]; then
  STAGED_COUNT=$(find "$STAGE_DIR" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')
fi

if [ "$STAGED_COUNT" -eq 0 ]; then
  # All files were missing — let the rm fail naturally
  rmdir "$STAGE_DIR" 2>/dev/null || true
  exit 0
fi

jq -n \
  --arg dir "$STAGE_DIR" \
  '{
    continue: false,
    stopReason: ("BLOCKED & BACKED UP: Files copied to " + $dir + ". The originals are untouched. To proceed with deletion, ask the user to run the rm command manually.")
  }'
