---
name: soleri-build-skill
tier: default
description: >
  Use when creating a new skill, updating an existing skill, or scaffolding a skill
  template for a Soleri agent. Triggers on "create a skill", "new skill", "build skill",
  "add a skill", "write a skill", "skill template", "scaffold skill".
---

# Build Skill — Create Skills for Soleri Agents

Create well-structured skills that follow Soleri conventions. Skills are SKILL.md files in the forge that get synced to agents as slash commands.

## Skill Anatomy

Skills live in two places:

| Location                                           | Purpose                    |
| -------------------------------------------------- | -------------------------- |
| `packages/forge/src/skills/soleri-{name}/SKILL.md` | Source — ships with Soleri |
| `~/.claude/skills/{agent}-soleri-{name}/SKILL.md`  | Runtime — synced per agent |

### File Structure

```yaml
---
name: soleri-{skill-name}
tier: default
description: >
  Use when the user says "trigger1", "trigger2", "trigger3",
  or wants to [brief purpose]. [One sentence about what the skill does].
---

# Skill Title — Short Purpose

[Core workflow instructions with numbered steps]

## Agent Tools Reference

| Op | When to Use |
|----|-------------|
| `search_intelligent` | Check vault before starting |
| `capture_knowledge` | Persist patterns worth remembering |
```

## Creation Process

### Step 1: Search Vault for Prior Art

Before creating anything, check if a similar skill or pattern exists:

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<skill topic>" }
```

List existing skills to avoid duplication:

```bash
ls packages/forge/src/skills/
```

### Step 2: Check Trigger Keywords

Every skill needs 4-8 unique trigger phrases in the `description:` field. Before choosing triggers, check ALL existing skills to avoid overlap:

```bash
grep -h "description:" packages/forge/src/skills/soleri-*/SKILL.md
```

Rules:

- No trigger phrase may appear in more than one skill
- Use quoted phrases: `"exact trigger words"`
- Cover the full intent range — think about how users naturally ask for this
- Avoid generic words that overlap with other skills (e.g., "review" is used by deep-review)

### Step 3: Design the Workflow

Identify 3-5 concrete scenarios. Ask the user if unclear:

- "What exact phrases should trigger this skill?"
- "Walk me through one example end-to-end"
- "What should this skill NOT do?"

### Step 4: Wire In Engine Ops

Every Soleri skill should use the engine where applicable. Use the `YOUR_AGENT_core` placeholder — it gets replaced with the agent's actual facade name at sync time.

Common integration points:

| When                 | Op                            | Why                               |
| -------------------- | ----------------------------- | --------------------------------- |
| Before starting work | `search_intelligent`          | Check vault for prior art         |
| Before starting work | `memory_search`               | Check session history             |
| During execution     | `brain_recommend`             | Get brain recommendations         |
| After completion     | `capture_knowledge`           | Persist patterns learned          |
| After completion     | `capture_quick`               | Fast capture for simple learnings |
| Quality checks       | `admin_health`                | Verify system health              |
| Iteration tracking   | `loop_start` / `loop_iterate` | Track multi-step work             |

### Available Facades

All ops use the `YOUR_AGENT_core` placeholder:

| Domain                 | Key Ops                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Vault search & capture | `search_intelligent`, `search`, `capture_knowledge`, `capture_quick`, `vault_tags`, `vault_domains` |
| Admin & health         | `admin_health`, `admin_diagnostic`, `admin_tool_list`, `admin_vault_analytics`                      |
| Curator & quality      | `curator_health_audit`, `curator_detect_duplicates`, `curator_contradictions`, `curator_groom_all`  |
| Brain & learning       | `brain_stats`, `brain_strengths`, `brain_recommend`, `brain_build_intelligence`                     |
| Memory & sessions      | `memory_search`, `memory_stats`, `session_capture`, `memory_cross_project_search`                   |
| Planning               | `create_plan`, `approve_plan`, `plan_split`, `plan_reconcile`, `plan_complete_lifecycle`            |
| Loops & validation     | `loop_start`, `loop_iterate`, `loop_complete`, `loop_status`                                        |

### Step 5: Write the Skill

Follow these rules:

**Naming:**

- Folder: `packages/forge/src/skills/soleri-{name}/SKILL.md`
- `name:` field must be `soleri-{name}` — matching the folder
- All Soleri skills use the `soleri-` prefix

**Frontmatter:**

- `description:` must include specific trigger phrases in quotes
- Use `>` for multi-line YAML folded scalar descriptions

**Body (target 1,500-2,000 words):**

- Imperative form ("Search the vault", not "You should search")
- Numbered steps with concrete op examples including params
- Agent Tools Reference table at the end
- Common Mistakes section if applicable

**Op References:**

- Always use `YOUR_AGENT_core op:xxx` — never hardcode agent names
- Include example params where helpful
- Only reference ops that actually exist (verify with `admin_tool_list`)

### Step 6: Validate

Checklist before committing:

- [ ] Folder is `soleri-{name}/SKILL.md` in `packages/forge/src/skills/`
- [ ] `name:` matches folder name
- [ ] `description:` has 4-8 specific trigger phrases in quotes
- [ ] No trigger overlap with existing skills
- [ ] All ops use `YOUR_AGENT_core` placeholder
- [ ] No hardcoded agent names (`ernesto_core`, `salvador_core`, etc.)
- [ ] Imperative writing style throughout
- [ ] Agent Tools Reference table at the end
- [ ] Under 3,000 words (ideally 1,500-2,000)
- [ ] TypeScript compiles: `npx tsc --noEmit` in packages/forge

### Step 7: Copy to Reference Agent

If the skill should appear in the reference agent:

```bash
cp -r packages/forge/src/skills/soleri-{name} examples/reference-agent/skills/
```

### Step 8: Register in Scaffold Pipeline

Add the skill to `SKILLS_REGISTRY` in `packages/forge/src/scaffold-filetree.ts` and `SKILL_CATEGORIES` in `packages/forge/src/compose-claude-md.ts` so it gets included in new scaffolds.

### Step 9: Capture the Decision

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "New skill: soleri-{name} — {purpose}",
    description: "Created skill for {what it does}. Triggers: {triggers}.",
    type: "workflow",
    domain: "tooling",
    tags: ["skill", "workflow", "{domain}"]
  }
```

## Updating Existing Skills

1. Read the current file first
2. Search vault for related patterns or feedback
3. Make targeted changes — don't rewrite the whole skill
4. Verify all ops still use `YOUR_AGENT_core` placeholder
5. Update `description:` if triggers changed
6. Check for trigger overlap after changes
7. Update reference agent copy if it exists

## Common Mistakes

- **Vague descriptions** — "Use for project management" vs "Use when creating GitHub issues or tracking milestones"
- **Trigger overlap** — Using "review" when `soleri-deep-review` already owns it
- **Hardcoded agent names** — `ernesto_core` instead of `YOUR_AGENT_core`
- **Missing engine wiring** — A skill that never checks the vault is a missed opportunity
- **Second person** — "You should search" instead of "Search the vault"
- **Too long** — Over 3,000 words bloats context. Extract details into separate files if needed
- **No prefix** — Forgetting the `soleri-` prefix on the folder and name

## Agent Tools Reference

| Op                   | When to Use                            |
| -------------------- | -------------------------------------- |
| `search_intelligent` | Check for existing skills and patterns |
| `capture_knowledge`  | Capture skill creation decision        |
| `admin_tool_list`    | Verify available ops                   |
| `vault_domains`      | Check domain categories                |
| `memory_search`      | Find related past work                 |
