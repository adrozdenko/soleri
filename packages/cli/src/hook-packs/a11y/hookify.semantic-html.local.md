---
# Soleri Hook Pack: a11y
# Version: 1.0.0
# Rule: semantic-html
name: semantic-html
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: src/components/.*\.tsx$
  - field: content
    operator: regex_match
    pattern: (<div\s+onClick(?!=)|<span\s+onClick(?!=))
---

⚠️ **A11y:** Use `<button>` instead of `<div onClick>`. Semantic HTML provides keyboard support.
