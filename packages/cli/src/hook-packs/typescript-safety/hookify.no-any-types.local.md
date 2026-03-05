---
# Soleri Hook Pack: typescript-safety
# Version: 1.0.0
# Rule: no-any-types
name: no-any-types
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.(tsx?|jsx?)$
  - field: content
    operator: regex_match
    pattern: (:\s*any(?![a-zA-Z])|as\s+any(?![a-zA-Z])|<any>|Record<string,\s*any>)
---

🚫 **Type bypass blocked.** Replace `:any` with specific type or `unknown`. Fix `as any` at the source.
