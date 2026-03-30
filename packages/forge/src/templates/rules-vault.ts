/**
 * Engine rules: vault — included when agent uses vault.
 * Part of the modular shared-rules system.
 */
export function getRulesVault(): string {
  return `
<!-- soleri:vault-protocol -->
## Vault as Source of Truth (Zettelkasten)

The vault is a **Zettelkasten** — a connected knowledge graph. Every knowledge operation follows Zettelkasten principles: atomic entries, typed links, dense connections.

- **MANDATORY**: Consult the vault BEFORE every decision — search + traverse the link graph.
- Lookup order: 1) VAULT search → 2) VAULT traverse (follow links 2 hops) → 3) MEMORY → 4) CODEBASE → 5) WEB/TRAINING.
- **Search + Traverse**: Don't just search — traverse from the best result to discover connected knowledge and anti-patterns.
- Check \`contradicts\` links to know what to avoid. Check \`sequences\` links for ordering dependencies.
- Persist lessons: capture + link. An unlinked entry is incomplete.
- Exceptions: runtime errors with stack traces → codebase first; user explicitly asks to search web.

### Vault Search Strategy

Default to **two-pass search** — scan first, load only what's relevant. This saves tokens and keeps context lean.

| Situation | Strategy |
|-----------|----------|
| Broad/exploratory query | \`mode: "scan"\` → triage by score → \`op:load_entries\` for top matches |
| Specific known entry | \`mode: "full"\` directly |
| Work task (need vault context before coding) | Scan → pick relevant → load |
| Existence check ("do we have X?") | \`mode: "scan"\` only, no load needed |

**Never load all scan results.** Pick the top 2-4 by relevance score and skip entries below 0.30 unless the query is very specific.
<!-- /soleri:vault-protocol -->

<!-- soleri:knowledge-capture -->
## Knowledge Capture

**MANDATORY**: Persist lessons, don't just promise them. **Always link after capturing.**

When you learn something that should persist:
1. **DON'T** just say "I will remember this"
2. **DO** call \`op:capture_knowledge\` to persist to vault
3. **DO** review \`suggestedLinks\` in the capture response
4. **DO** create links for relevant suggestions: \`op:link_entries\`
5. **DO** update relevant files if it's a behavioral change

An unlinked entry is an orphan — it adds noise, not knowledge.

| Type | Op | Persists To |
|------|-----|-------------|
| Patterns/Anti-patterns | \`op:capture_knowledge\` | vault |
| Links between entries | \`op:link_entries\` | vault_links table |
| Quick capture | \`op:capture_quick\` | vault |
| Session summaries | \`op:session_capture\` | memory |
<!-- /soleri:knowledge-capture -->

<!-- soleri:tool-advocacy -->
## Tool Advocacy

**MANDATORY**: When you detect a user doing something manually that a dedicated tool handles better, suggest the tool. Once per task — not repeatedly.

The agent's purpose-built tools are more reliable than freeform LLM responses because they search indexed knowledge, persist state, and follow proven workflows. Never let a user struggle with a raw prompt when a tool exists.

### Intent → Tool Mapping

| User Intent | Signal Phrases | Suggest |
|-------------|---------------|---------|
| Remember/save something | "remember this", "save this", "note this" | \`op:capture_knowledge\` — persists to vault with tags, searchable forever |
| Search for knowledge | "do we have", "any patterns for", "best practice" | \`op:search_intelligent\` — searches indexed vault, not LLM training data |
| Plan work | "let me think about", "how should we", "I want to build" | \`op:orchestrate_plan\` — vault + brain context, graded plans |
| Recall past work | "what did we do", "last time", "have we seen this" | \`op:memory_search\` — structured session history, works cross-project |
| Check quality | "is this working", "health check", "status" | \`op:admin_health\` — real-time subsystem status |
| Debug a problem | "this is broken", "why is this failing" | \`op:search_intelligent\` — check vault for known bugs first |
| Learn from patterns | "what works for", "recommendations" | \`op:strengths\` + \`op:recommend\` — brain-learned patterns from real usage |
| Clean up knowledge | "duplicates", "clean vault", "consolidate" | \`op:curator_consolidate\` — automated dedup, grooming, contradiction resolution |
| Summarize session | "what did we accomplish", "wrap up" | \`op:session_capture\` — structured capture with knowledge extraction |
| Explore capabilities | "what can you do", "help", "features" | List capabilities by category, not raw op names |

### How to Suggest

> I notice you're [what user is doing]. I have \`op:[name]\` for this — it [specific advantage]. Want me to use it?

**Do NOT suggest tools when:** the user is having a conversation (not a task), already declined, or explicitly says "just tell me".
<!-- /soleri:tool-advocacy -->
`.trim();
}
