#!/bin/bash
# terse-auto — statusline badge script
# Reads the terse mode flag file and outputs a colored badge.
#
# Usage in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "bash ~/.claude/hooks/terse-statusline.sh" }

FLAG="$HOME/.soleri/.terse-active"
[ ! -f "$FLAG" ] && exit 0

MODE=$(cat "$FLAG" 2>/dev/null)
if [ "$MODE" = "full" ] || [ -z "$MODE" ]; then
  printf '\033[38;5;39m[TERSE]\033[0m'
else
  SUFFIX=$(echo "$MODE" | tr '[:lower:]' '[:upper:]')
  printf '\033[38;5;39m[TERSE:%s]\033[0m' "$SUFFIX"
fi
