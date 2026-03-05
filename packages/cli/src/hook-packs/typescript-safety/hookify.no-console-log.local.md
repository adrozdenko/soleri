---
# Soleri Hook Pack: typescript-safety
# Version: 1.0.0
# Rule: no-console-log
name: no-console-log
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: src/.*\.(tsx?|jsx?)$
  - field: file_path
    operator: not_regex_match
    pattern: (\.test\.|\.spec\.|\.stories\.)
  - field: content
    operator: regex_match
    pattern: console\.(log|debug|info)\(
---

⚠️ **Debug code detected.** Remove `console.log/debug/info` before commit. `console.error/warn` allowed.
