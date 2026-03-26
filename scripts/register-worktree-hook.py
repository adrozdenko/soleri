#!/usr/bin/env python3
"""Register clean-worktrees.sh as a SessionStart hook in Claude Code settings."""

import json
import os

settings_path = os.path.expanduser("~/.claude/settings.json")

with open(settings_path) as f:
    settings = json.load(f)

hook_entry = {
    "hooks": [
        {
            "type": "command",
            "command": "bash ~/.claude/hooks/clean-worktrees.sh",
            "timeout": 10,
            "statusMessage": "Cleaning stale worktrees...",
        }
    ]
}

# Check if already registered
existing = settings.get("hooks", {}).get("SessionStart", [])
already = any(
    h.get("command", "").endswith("clean-worktrees.sh")
    for entry in existing
    for h in entry.get("hooks", [])
)

if already:
    print("Hook already registered — nothing to do")
else:
    settings.setdefault("hooks", {}).setdefault("SessionStart", []).append(hook_entry)
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=4)
    print("Registered clean-worktrees.sh as SessionStart hook")
