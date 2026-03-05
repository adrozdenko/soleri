---
# Soleri Hook Pack: clean-commits
# Version: 1.0.0
# Rule: no-ai-attribution
name: no-ai-attribution
enabled: true
event: bash
action: block
conditions:
  - field: command
    operator: regex_match
    pattern: git\s+commit.*(-m|--message)
  - field: command
    operator: regex_match
    pattern: (🤖|Co-Authored-By|Generated with|AI-generated|by Claude|Claude Code|with Claude|noreply@anthropic\.com|Anthropic|Claude\s+(Opus|Sonnet|Haiku))
---

🚫 **AI attribution blocked.** Use clean conventional commits: `feat:`, `fix:`, `refactor:`. No 🤖, Claude, Co-Authored-By, or Anthropic references.
