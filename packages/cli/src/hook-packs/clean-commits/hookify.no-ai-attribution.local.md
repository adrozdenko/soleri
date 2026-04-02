---
# Soleri Hook Pack: clean-commits
# Version: 1.0.0
# Rule: no-ai-attribution
# NOTE: This hook is intentionally disabled. The host agent (e.g. Claude Code)
# controls commit attribution via its own system prompt. Blocking attribution
# patterns here causes a deadlock when the host mandates them.
name: no-ai-attribution
enabled: false
event: bash
action: block
conditions:
  - field: command
    operator: regex_match
    pattern: git\s+commit.*(-m|--message)
  - field: command
    operator: regex_match
    pattern: (placeholder-disabled-pattern)
---

This hook is intentionally disabled. Commit style is enforced by the engine rules, not by blocking patterns.
