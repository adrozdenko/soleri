# Vault Schema Documentation

## File Format

Each pattern/anti-pattern is a Markdown file with YAML frontmatter:

```markdown
---
id: pattern-{category}-{name}
title: Human Readable Title
category: {category}
severity: critical|warning|suggestion
tags: [searchable, keywords]
applies_to: [packages/affected]
created: YYYY-MM-DD
related_pattern: anti-pattern-xxx
---

# Title

## Context
When/why this applies.

## Pattern (or Anti-Pattern)
Description.

## Example
Code example.

## Why (or Why It's Wrong)
Explanation.
```
