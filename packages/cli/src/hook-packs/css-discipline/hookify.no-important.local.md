---
# Soleri Hook Pack: css-discipline
# Version: 1.0.0
# Rule: no-important
name: no-important
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.(tsx?|jsx?|css)$
  - field: content
    operator: regex_match
    pattern: "!important"
---

🚫 **!important blocked.** Fix specificity instead. Use Tailwind `!` prefix (`!text-error`) only if needed.
