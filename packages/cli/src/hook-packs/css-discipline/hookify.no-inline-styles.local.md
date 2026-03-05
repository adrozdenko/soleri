---
# Soleri Hook Pack: css-discipline
# Version: 1.0.0
# Rule: no-inline-styles
name: no-inline-styles
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: src/components/.*\.tsx$
  - field: file_path
    operator: not_contains
    pattern: .stories.tsx
  - field: content
    operator: regex_match
    pattern: style=\{\{[^}]*(padding|margin|width|height|fontSize|color|background)[^}]*\}\}
---

⚠️ **Inline style detected.** Use Tailwind: `p-4` not `style={{ padding: '16px' }}`. Exception: CSS variables.
