---
# Soleri Hook Pack: a11y
# Version: 1.0.0
# Rule: ux-touch-targets
name: ux-touch-targets
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: src/components/.*\.tsx$
  - field: content
    operator: regex_match
    pattern: (<button[^>]*className="[^"]*(?:p-1|p-2|h-6|h-7|h-8|w-6|w-7|w-8)[^"]*"[^>]*>|className="[^"]*(?:p-1|p-2)[^"]*"[^>]*onClick)
---

⚠️ **Touch target too small.** Min 44x44px required. Add `min-h-11 min-w-11` to small interactive elements.
