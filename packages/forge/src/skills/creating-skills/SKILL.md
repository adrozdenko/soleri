---
name: creating-skills
description: Use when the user wants to create a new skill, teach the agent a new workflow, add a reusable technique, or says "create a skill", "add a skill", "teach me how to", "make a skill for"
---

# Creating Skills for Your Agent

## Overview

Skills are reusable techniques, patterns, and workflows stored as markdown files in your agent's `skills/` directory. They teach your agent proven approaches that trigger automatically when relevant.

**Skills are:** Reusable techniques, decision guides, validated workflows
**Skills are NOT:** One-off solutions, project-specific config (use CLAUDE.md), or things enforceable with automation

## Skill Structure

```
skills/
  skill-name/
    SKILL.md              # Main reference (required)
    supporting-file.*     # Only if needed (heavy reference, scripts)
```

### SKILL.md Format

```markdown
---
name: skill-name-with-hyphens
description: Use when [specific triggering conditions and symptoms]
---

# Skill Name

## Overview
Core principle in 1-2 sentences.

## When to Use
- Specific symptoms and situations
- When NOT to use

## Core Pattern
Before/after comparison or step-by-step

## Quick Reference
Table or bullets for scanning

## Common Mistakes
What goes wrong + fixes
```

### Frontmatter Rules

- Only `name` and `description` fields (max 1024 chars total)
- `name`: letters, numbers, hyphens only
- `description`: starts with "Use when..." — describes WHEN to trigger, NOT what the skill does
- Never summarize the workflow in the description — the agent may follow the summary instead of reading the full skill

```yaml
# ❌ BAD: Summarizes workflow
description: Reviews code then captures patterns to vault

# ✅ GOOD: Triggering conditions only
description: Use when reviewing code for quality issues and pattern compliance
```

## When to Create a Skill

**Create when:**
- You'd reference this technique again across projects
- The pattern applies broadly, not just this project
- You found yourself explaining the same approach twice
- A workflow has steps the agent keeps getting wrong

**Don't create for:**
- One-off solutions
- Project-specific conventions (put in CLAUDE.md or vault instead)
- Things enforceable with hooks/automation

## Creating a New Skill

1. **Create the directory:** `skills/my-skill/SKILL.md`
2. **Write the frontmatter** with triggering conditions
3. **Write the content** — overview, when to use, pattern, quick reference
4. **Test it** — start a new conversation, describe the triggering situation, verify the skill activates
5. **Iterate** — if the agent doesn't follow it, strengthen the instructions

## Tips for Effective Skills

- **Keep it short** — under 500 words. Agents have limited context.
- **One excellent example** beats five mediocre ones
- **Use flowcharts only for non-obvious decisions** — not for linear steps
- **Cross-reference other skills** by name: "Use vault-navigator skill for search"
- **Include common mistakes** — agents learn from anti-patterns
- **Name by what you DO:** `creating-skills` not `skill-creation`

## Skill vs Vault Knowledge

| Use Skills for | Use Vault for |
|---------------|---------------|
| Reusable workflows | Specific patterns/anti-patterns |
| Decision guides | Project decisions |
| How to approach X | What we learned about X |
| Techniques | Facts and rules |

Skills teach process. Vault stores knowledge. Both inform the agent.
